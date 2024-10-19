import { Position, Range, Uri } from "vscode";
import * as fs from 'fs';
import Parser = require("web-tree-sitter")

const findFirstModuleChildren = (node: Parser.SyntaxNode) => {
  return node.children[0]?.lastChild?.children || [];
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

const getFirstParentTagOrComponent = (node: Parser.SyntaxNode) => {
  if (node.type == '<') {
    node = node.parent && node.parent.parent && node.parent.parent.parent;
  } else {
    node = node.parent;
  }

  while (node) {
    if (node.type == 'tag' || node.type == 'component') {
      return node;
    }
    node = node.parent;
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
  let node = tree.rootNode.descendantForIndex(offset);
  // console.log('Tree:', tree.rootNode.toString())

  // TODO: missing types to handle: end_component,
  // self_closing_component, self_closing_tag, `|=`, `=|`, `|<`, `|</`, `>|`,
  // and constructs (blocks)

  // TODO: handle when node is ERROR (syntax issues), for instance, when the tag is not closed:
  // <span |

  /* tag_name */

  // <d|iv>
  if (node.type == 'tag_name') {
    const closingNameNode = node.parent.parent.lastChild.descendantsOfType('tag_name')[0];

    return {
      lang: 'surface',
      scope: 'tag_name',
      value: node.text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString(),
      range: asRange(node.startPosition, node.endPosition),
      closingRange: asRange(closingNameNode.startPosition, closingNameNode.endPosition)
    };
  }

  // <div| >
  if (node.type == 'start_tag' && node.descendantsOfType('tag_name')[0].endIndex == offset) {
    const nameNode = node.descendantsOfType('tag_name')[0];
    const closingNameNode = nameNode.parent.parent.lastChild.descendantsOfType('tag_name')[0];

    return {
      lang: 'surface',
      scope: 'tag_name',
      value: nameNode.text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString(),
      range: asRange(nameNode.startPosition, nameNode.endPosition),
      closingRange: asRange(closingNameNode.startPosition, closingNameNode.endPosition)
    };
  }

  // <div|>
  if (node.type == '>' && node.previousSibling.type == 'tag_name' && node.previousSibling.endIndex == node.startIndex) {
    const nameNode = node.previousSibling;
    const closingNameNode = node.parent.parent.lastChild.descendantsOfType('tag_name')[0];

    return {
      lang: 'surface',
      scope: 'tag_name',
      value: nameNode.text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString(),
      range: asRange(nameNode.startPosition, nameNode.endPosition),
      closingRange: asRange(closingNameNode.startPosition, closingNameNode.endPosition)
    };
  }

  /* attribute_name */

  // <div cla|ss>
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

  // <div class|>
  if (node.type == '>' && node.previousSibling.type == 'attribute' && node.previousSibling.lastChild.type == 'attribute_name' && node.previousSibling.lastChild.endIndex == node.startIndex) {
    return {
      lang: 'surface',
      scope: 'attribute_name',
      value: node.previousSibling.lastChild.text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
    };
  }

  // <div class| >
  if (node.type == 'start_tag' && node.firstChildForIndex(offset - 1).type == 'attribute' && node.firstChildForIndex(offset - 1).lastChild.type == 'attribute_name') {
    return {
      lang: 'surface',
      scope: 'attribute_name',
      value: node.firstChildForIndex(offset - 1).lastChild.text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
    };
  }

  /* component_name */

  // <For|m>
  if (node.type == 'component_name') {
    const closingNameNode = node.parent.parent.lastChild.descendantsOfType('component_name')[0];

    return {
      lang: 'surface',
      scope: 'component_name',
      value: node.text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString(),
      range: asRange(node.startPosition, node.endPosition),
      closingRange: asRange(closingNameNode.startPosition, closingNameNode.endPosition)
    };
  }

  // <Form|>
  if (node.type == '>' && node.previousSibling.type == 'component_name' && node.previousSibling.endIndex == node.startIndex) {
    const nameNode = node.previousSibling;
    const closingNameNode = node.parent.parent.lastChild.descendantsOfType('component_name')[0];

    return {
      lang: 'surface',
      scope: 'component_name',
      value: nameNode.text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString(),
      range: asRange(nameNode.startPosition, nameNode.endPosition),
      closingRange: asRange(closingNameNode.startPosition, closingNameNode.endPosition)
    };
  }

  // <Form| >
  if (node.type == 'start_component' && node.descendantsOfType('component_name')[0].endIndex == offset) {
    const nameNode = node.descendantsOfType('component_name')[0];
    const closingNameNode = nameNode.parent.parent.lastChild.descendantsOfType('component_name')[0];

    return {
      lang: 'surface',
      scope: 'component_name',
      value: nameNode.text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString(),
      range: asRange(nameNode.startPosition, nameNode.endPosition),
      closingRange: asRange(closingNameNode.startPosition, closingNameNode.endPosition)
    };
  }

  /* tag_attibutes */

  // <div | >
  if (node.type == 'start_tag') {
    return {
      lang: 'surface',
      scope: 'tag_attributes',
      tag: node.parent.descendantsOfType('tag_name')[0].text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
    };
  }

  // <div |>
  if (node.type == '>' && node.previousSibling.endIndex < node.startIndex && node.parent.type == 'start_tag') {
    return {
      lang: 'surface',
      scope: 'tag_attributes',
      tag: node.parent.descendantsOfType('tag_name')[0].text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
    };
  }

  /* component_attibutes */

  // <Form | >
  if (node.type == 'start_component') {
    return {
      lang: 'surface',
      scope: 'component_attributes',
      tag: node.parent.descendantsOfType('component_name')[0].text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
    };
  }

  // <Form |>
  if (node.type == '>' && node.previousSibling.endIndex < node.startIndex && node.parent.type == 'start_component') {
    return {
      lang: 'surface',
      scope: 'component_attributes',
      tag: node.parent.descendantsOfType('component_name')[0].text,
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

  if (node.type == '<' || node.type == '</' || node.type == '{') {
    const parentTag = getFirstParentTagOrComponent(node);

    if (parentTag) {
      return {
        lang: 'surface',
        scope: 'tag_body',
        tag: parentTag.descendantsOfType(`${parentTag.type}_name`)[0].text,
        type: parentTag.type,
        details: {text: node.text, type: node.type},
        node: node.toString(),
        parent: node.parent.toString()
      };
    }
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

  if (node.type == '}' && node.parent.type == 'expression') {
    return {
      lang: 'surface',
      scope: 'expression',
      value: node.previousSibling.text,
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
