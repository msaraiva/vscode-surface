import { Position, Range, Uri } from "vscode";
import * as fs from 'fs';
import Parser = require("web-tree-sitter")

const findFirstModuleChildren = (node: Parser.SyntaxNode) => {
  return node.children[0]?.lastChild?.children || [];
}

const resolveAlias = (component: string, codeAliases: Object, compiledAliases: Object) => {
  compiledAliases = compiledAliases || {};
  const [alias, ...rest] = component.split('.');
  return [(codeAliases[alias] || compiledAliases[alias] || alias)].concat(rest).join('.');
}

export const resolveComponent = (component: string, codeAliases: Object, compiledAliases: Object, compiledImports: Object) => {
  compiledImports = compiledImports || {};

  if (component.startsWith('.')) {
    const func = component.slice(1);
    return compiledImports[func];
  } else {
    return resolveAlias(component, codeAliases, compiledAliases);
  }
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

const isNodeTagOrComponentName = (node: Parser.SyntaxNode) => {
  return ['tag_name', 'component_name', 'function_component_name', 'macro_component_name'].includes(node.type);
}

const isNodeStartTagOrComponent = (node: Parser.SyntaxNode) => {
  return ['start_tag', 'start_component', 'start_function_component', 'start_macro_component'].includes(node.type);
}

const isSelfClosing = (node: Parser.SyntaxNode) => {
  return ['self_closing_tag', 'self_closing_component', 'self_closing_function_component', 'self_closing_macro_component'].includes(node.type);
}

export const isComponent = (name: string) => {
  return ['component', 'function_component', 'macro_component'].includes(name);
}

export const isSurfaceComponent = (name: string) => {
  return ['component', 'macro_component'].includes(name);
}

export const isFunctionComponent = (name: string) => {
  return name == 'function_component';
}

export const isHTMLtag = (name: string) => {
  return name == 'tag';
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

  // `<div|>` OR `<div attr|>` OR `<.link |/>`
  if (node.type == '>' || node.type == '/>') {
    return node.parent;
  }

  return node;
}

// TODO: should we change kind to 'html_tag' | 'module_component' | 'function_component' | 'macro_component'?;
type TagType =
  'tag'
  | 'component'
  | 'function_component'
  | 'macro_component';

export interface EmbeddedContent {
  type: 'EmbeddedContent';
  lang: 'css' | 'javascript';
}

export interface Tag {
  type: 'Tag';
  kind: TagType;
  isSelfClosing: boolean;
  openingTagName: TagName;
  closingTagName?: TagName;
}

export interface TagName {
  type: 'TagName';
  value: string;
  parentTag: Tag;
  range: Range;
}

export interface TagBody {
  type: 'TagBody';
  parentTag: Tag;
}

export interface InsertAttributes {
  type: 'InsertAttributes';
  parentTag: Tag;
}

export interface Attribute {
  type: 'Attribute'
  parentTag: Tag;
  // value: QuotedValue | Expression
}

export interface AttributeName {
  type: 'AttributeName';
  parentAttribute: Attribute;
  value: string;
}

export interface Expression {
  type: 'Expression';
  value: string;
  // parent: Attribute | TagBody | Tag
}

// interface QuotedValue {
//   type: 'QuotedValue';
//   value: string;
// }

export type CursorSurfaceInfo = TagName | AttributeName | InsertAttributes | TagBody | Expression;

export type CursorInfo = EmbeddedContent | CursorSurfaceInfo | undefined;

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

export const getCursorInfo = (tree: Parser.Tree, offset: number): CursorInfo => {
  const node = nodeOnCursor(tree, offset);
  return buildCursorInfo(node)
}

const buildTag = (node: Parser.SyntaxNode): Tag => {
  let kind: TagType;
  let isSelfClosing = false;

  if (node.type.startsWith('self_closing_')) {
    isSelfClosing = true;
    kind = node.type.split('self_closing_')[1] as TagType;
  } else if (node.type.startsWith('start_')) {
    kind = node.type.split('start_')[1] as TagType;
  } else if (node.type.startsWith('end_')) {
    kind = node.type.split('end_')[1] as TagType;
  } else {
    throw `unexpected node of type ${node.type}`
  }

  const tag: Tag = {
    type: 'Tag',
    kind: kind,
    isSelfClosing: isSelfClosing,
    openingTagName: undefined,
    closingTagName: undefined
  }

  const tagName = `${kind}_name`;

  tag.openingTagName = buildTagName(node.parent.firstChild.descendantsOfType(tagName)[0], tag);

  if (!isSelfClosing) {
    tag.closingTagName = buildTagName(node.parent.lastChild.descendantsOfType(tagName)[0], tag);
  }

  return tag;
}

const buildTagName = (node: Parser.SyntaxNode, tag: Tag): TagName => {
  return {
    type: 'TagName',
    value: node.text,
    range: asRange(node.startPosition, node.endPosition),
    parentTag: tag,
  }
}

const buildCursorInfo = (node: Parser.SyntaxNode): CursorInfo => {

  /* TagName */

  if (isNodeTagOrComponentName(node)) {
    const tag = buildTag(node.parent);
    if (node.parent.type.startsWith('end_')) {
      return tag.closingTagName;
    } else {
      return tag.openingTagName;
    }
  }

  /* AttributeName */

  if (node.type == 'attribute_name') {
    const tag = buildTag(node.parent.parent);
    const attibute: Attribute = {
      type: 'Attribute',
      parentTag: tag
    }

    return {
      type: 'AttributeName',
      value: node.text,
      parentAttribute: attibute
    } as AttributeName;
  }

  /* InsertAttributes */

  if (isNodeStartTagOrComponent(node) || isSelfClosing(node)) {
    const tag = buildTag(node);

    return {
      type: 'InsertAttributes',
      parentTag: tag
    };
  }

  const rootTag = getRootTag(node);
  const rootTagName = rootTag && rootTag.descendantsOfType('tag_name')[0].text;

  // EmbeddedContent (CSS)

  if (rootTagName == 'style') {
    return {
      type: 'EmbeddedContent',
      lang: 'css',
    };
  }

  // EmbeddedContent (JavaScript)

  if (rootTagName == 'script') {
    return {
      type: 'EmbeddedContent',
      lang: 'javascript',
    };
  }

  // TagBody

  if (node.type == 'tag' || node.type == 'component') {
    const tag = buildTag(node.firstNamedChild);
    return {
      type: 'TagBody',
      parentTag: tag,
    };
  }

  if (node.type == 'text' && node.parent && (node.parent.type == 'tag' || node.parent.type == 'component')) {
    const tag = buildTag(node.parent.firstNamedChild);
    return {
      type: 'TagBody',
      parentTag: tag
    };
  }

  // expression

  if (node.type == 'expression_value') {
    return {
      type: 'Expression',
      value: node.text,
    };
  }

  // anything else

  console.log(`unhandled node of type '${node.type}', node: ${node.toString}`)
  return undefined;
}
