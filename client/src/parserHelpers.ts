import { Position, Range, Uri } from "vscode";
import * as fs from 'fs';
import Parser = require("web-tree-sitter")

const findFirstModuleChildren = (node: Parser.SyntaxNode) => {
  return node.children[0]?.lastChild?.children || [];
}

export const findFirstModule = (node: Parser.SyntaxNode) => {
  return node.children[0]?.descendantsOfType('alias')[0]?.text;
}

const isAlias = (node: Parser.SyntaxNode): boolean => {
  return (node.type == 'call' && node.firstChild.type == 'identifier' && node.firstChild.text == 'alias');
}

const isImport = (node: Parser.SyntaxNode): boolean => {
  return (node.type == 'call' && node.firstChild.type == 'identifier' && node.firstChild.text == 'import');
}

const isUse = (node: Parser.SyntaxNode): boolean => {
  return (node.type == 'call' && node.firstChild.type == 'identifier' && node.firstChild.text == 'use');
}

const extractAliases = (node: Parser.SyntaxNode): Object => {
  const subModules = node.firstChild.nextSibling?.children[0]?.children[2]?.namedChildren;
  const asModule = node.firstChild.nextSibling?.children[2]?.children[0]?.children[0]?.text == 'as: ';

  const aliases = {};

  if (subModules) {
    for (const modNode of subModules) {
      aliases[modNode.text] = node.firstChild.nextSibling.children[0].children[0].text + '.' + modNode.text;
    }
  } else if (asModule) {
    const alias = node.firstChild.nextSibling.children[2].children[0].children[1].text;
    aliases[alias] = node.firstChild.nextSibling.children[0].text;
  } else {
    const module = node.firstChild.nextSibling.text;
    aliases[module.split('.').pop()] = module;
  }
  return aliases;
}

export const extractElixirModuleAliases = (node: Parser.SyntaxNode) => {
  const children = findFirstModuleChildren(node);
  const aliases = {};
  for (let child of children) {
    if (isAlias(child)) {
      Object.assign(aliases, extractAliases(child));
    }
  }
  return aliases;
}

export const getLastModuleAliasPosition = (node: Parser.SyntaxNode): Position | undefined => {
  const children = findFirstModuleChildren(node);
  let pos = undefined;
  for (let child of children) {
    if (isAlias(child)) {
      pos = asPosition(child.endPosition);
    }
  }
  return pos;
}

export const getLastModuleImportPosition = (node: Parser.SyntaxNode): Position | undefined => {
  const children = findFirstModuleChildren(node);
  let pos = undefined;
  for (let child of children) {
    if (isImport(child)) {
      pos = asPosition(child.endPosition);
    }
  }
  return pos;
}

export const getLastModuleUsePosition = (node: Parser.SyntaxNode): Position | undefined => {
  const children = findFirstModuleChildren(node);
  let pos = undefined;
  for (let child of children) {
    if (isUse(child)) {
      pos = asPosition(child.endPosition);
    }
  }
  return pos;
}

export const getInsertAliasPosition = (node: Parser.SyntaxNode): Position | undefined => {
  return getLastModuleAliasPosition(node) || getLastModuleImportPosition(node) || getLastModuleUsePosition(node);
}

export const getRelatedExFilePath = (uri: Uri): string => {
	const baseName = uri.path.slice(1).split('.').slice(0, -1).join('.');
	return baseName + '.ex';
}

export const readRelatedExFile = (uri: Uri) => {
	const exFile = getRelatedExFilePath(uri)

	// TODO: use `workspace.fs` instead of `fs`.
  // See: https://code.visualstudio.com/updates/v1_37#_vscodeworkspacefs
	if (fs.existsSync(exFile)) {
		try {
			return fs.readFileSync(exFile).toString();
		} catch (e) {
			console.error(e);
		}
	}
};

export const asPoint = (position: Position): Parser.Point => {
  return { row: position.line, column: position.character };
}

export const asPosition = (point: Parser.Point): Position => {
  return new Position(point.row, point.column);
}

export const asRange = (start: Parser.Point, end: Parser.Point): Range => {
  return new Range(asPosition(start), asPosition(end));
}

const getRootTag = (node: Parser.SyntaxNode): Parser.SyntaxNode | null => {
  let lastTag = null;

  while (node) {
    if (node.type == 'tag') {
      lastTag = node;
    }
    node = node.parent;
  }

  return lastTag;
}

const closestParentOfType = (node: Parser.SyntaxNode, types: string | Array<String>) => {
  if (typeof types === 'string') types = [types];

  while (node) {
    if (node.parent && types.indexOf(node.parent.type) > -1) {
      return node.parent;
    }
    node = node.parent;
  }
}

const isNodeTagOrComponent = (node: Parser.SyntaxNode) => {
  return ['tag_name', 'component_name', 'function_component_name', 'macro_component_name'].indexOf(node.type) > -1;
}

const isNodeStartTagOrComponent = (node: Parser.SyntaxNode) => {
  return ['start_tag', 'start_component', 'start_function_component', 'start_macro_component'].indexOf(node.type) > -1;
}

/*
  This function handles cases where we need the node right before
  the offset instead of the one right after the offset (the default).
*/
const nodeOnCursor = (tree: Parser.Tree, offset: number) => {
  const node = tree.rootNode.descendantForIndex(offset);

  // `<div>|<span>`
  if (node.type == '<') {
    return node?.parent?.parent?.parent;
  }

  // `<div>|</div>`
  if (node.type == '</' || node.type == '{') {
    return node?.parent?.parent;
  }

  // {@user + {} |}
  if (node.type == '}') {
    return node.previousSibling;
  }

  // `<div attr|=` OR `{... |}` OR `|{...}`
  const nodeAtPreviousIndex = tree.rootNode.descendantForIndex(offset - 1);
  if (nodeAtPreviousIndex && nodeAtPreviousIndex.id != node.id && nodeAtPreviousIndex.type.endsWith('_name')) {
    return nodeAtPreviousIndex;
  }

  // `<div|>` OR `<div attr|>`
  if (node.type == '>') {
    return node.parent;
  }

  return node;
}

export const initParser = async (extensionUri: Uri, lang: string) => {
	await Parser.init();
	const wasmUri = Uri.joinPath(extensionUri, `./resources/tree-sitter-${lang}.wasm`).fsPath;
	const language = await Parser.Language.load(wasmUri);
	const parser = new Parser();
	parser.setLanguage(language);

  return parser;
}

export const toEmbeddedCode = (tree: Parser.Tree, code: string, tagName: string) => {
  let result = '';
  let row = 0;

  for (let index = 0; index < tree.rootNode.children.length; index++) {
    const node = tree.rootNode.children[index];

    if (node.type == 'tag' && node.descendantsOfType('tag_name')[0].text == tagName) {
      result = result + '\n'.repeat(node.startPosition.row - row);
      const content = code.slice(node.firstChild.endIndex, node.lastChild.startIndex);

      if (node.startPosition.row == node.children[1].startPosition.row && content.trim() != '') {
        result = result + ' '.repeat(node.firstChild.endPosition.column);
      }
      row = node.endPosition.row;
      result = result + content;
    }
  }
  return result.trimEnd();
}

export const getCursorInfo = (tree: Parser.Tree, offset: number) => {
  const node = nodeOnCursor(tree, offset);

  // TODO: missing types to handle:
  // * ouside any tag (at the root node), e.g. `|<div>` or `</div>|`
  // * `self_closing_component`,
  // * `self_closing_tag`
  // * `=|`
  // constructs (blocks)

  // TODO: handle when node is ERROR (syntax issues), for instance, when the tag is not closed:
  // <span |

  /* tag_name, component_name */

  if (isNodeTagOrComponent(node)) {
    const type = node.type.split('_name')[0];
    const typeName = `${type}_name`;
    const closingNameNode = closestParentOfType(node, ['tag', 'component']).lastChild.descendantsOfType(typeName)[0];

    return {
      lang: 'surface',
      scope: typeName,
      value: node.text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString(),
      range: asRange(node.startPosition, node.endPosition),
      closingRange: asRange(closingNameNode.startPosition, closingNameNode.endPosition)
    };
  }

  /* attribute_name */

  if (node.type == 'attribute_name') {
    const startTagNode = node.parent.parent;
    const tagNameNode = startTagNode.firstChild.nextSibling;

    // handles tags with syntax ERROR, like in `<div |>`, which don't define a `tag` node
    let type = 'tag';
    if (tagNameNode.type == 'component_name') {
      type = 'component';
    }

    return {
      lang: 'surface',
      scope: 'attribute_name',
      value: node.text,
      tag: tagNameNode.text,
      type: type,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
    };
  }

  /* tag_attibutes, component_attibutes */

  if (isNodeStartTagOrComponent(node)) {
    const type = node.type.split('start_')[1];
    const typeName = `${type}_name`;
    const typeAttributes = `${type}_attributes`;

    return {
      lang: 'surface',
      scope: typeAttributes,
      tag: node.parent.descendantsOfType(typeName)[0].text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
    };
  }

  const rootTag = getRootTag(node);
  const rootTagName = rootTag && rootTag.descendantsOfType('tag_name')[0].text;

  // anything inside <style>

  if (rootTagName == 'style') {
    return {
      lang: 'css',
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
    };
  }

  // anything inside <script>

  if (rootTagName == 'script') {
    return {
      lang: 'javascript',
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
    };
  }

  // tag_body

  if (node.type == 'tag' || node.type == 'component') {
    return {
      lang: 'surface',
      scope: 'tag_body',
      tag: node.descendantsOfType(`${node.type}_name`)[0].text,
      type: node.type,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
    };
  }

  if (node.type == 'text' && node.parent && (node.parent.type == 'tag' || node.parent.type == 'component')) {
    return {
      lang: 'surface',
      scope: 'tag_body',
      tag: node.parent.descendantsOfType(`${node.parent.type}_name`)[0].text,
      type: node.parent.type,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
    };
  }

  // expression

  if (node.type == 'expression_value') {
    return {
      lang: 'surface',
      scope: 'expression',
      value: node.text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
    };
  }

  // anything else

  return {
    lang: null,
    details: {text: node.text, type: node.type},
    node: node.toString(),
    parent: node.parent && node.parent.toString()
  }
}
