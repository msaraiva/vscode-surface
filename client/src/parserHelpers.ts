import { Position, Range, Uri } from "vscode";
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

export const asPoint = (position: Position): Parser.Point => {
  return { row: position.line, column: position.character };
}

export const asPosition = (point: Parser.Point): Position => {
  return new Position(point.row, point.column);
}

export const asRange = (start: Parser.Point, end: Parser.Point): Range => {
  return new Range(asPosition(start), asPosition(end));
}

export const getRootTag = (node: Parser.SyntaxNode): Parser.SyntaxNode | null => {
  let lastTag = null;

  while (node) {
    if (node.type == 'tag') {
      lastTag = node;
    }
    node = node.parent;
  }

  return lastTag;
}

export const closestParentOfType = (node: Parser.SyntaxNode, types: string | Array<String>) => {
  if (typeof types === 'string') types = [types];

  while (node) {
    if (node.parent && types.indexOf(node.parent.type) > -1) {
      return node.parent;
    }
    node = node.parent;
  }
}

export const isNodeTagOrComponentName = (node: Parser.SyntaxNode) => {
  return ['tag_name', 'component_name', 'function_component_name', 'macro_component_name'].includes(node.type);
}

export const isNodeStartTagOrComponent = (node: Parser.SyntaxNode) => {
  return ['start_tag', 'start_component', 'start_function_component', 'start_macro_component'].includes(node.type);
}

export const isNodeSelfClosing = (node: Parser.SyntaxNode) => {
  return ['self_closing_tag', 'self_closing_component', 'self_closing_function_component', 'self_closing_macro_component'].includes(node.type);
}

/*
  This function handles cases where we need the node right before
  the offset instead of the one right after the offset (the default).
*/
export const getAdjustedNodeForCursor = (tree: Parser.Tree, offset: number) => {
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

export const initParser = async (extensionUri: Uri, lang: string) => {
	await Parser.init();
	const wasmUri = Uri.joinPath(extensionUri, `./resources/tree-sitter-${lang}.wasm`).fsPath;
	const language = await Parser.Language.load(wasmUri);
	const parser = new Parser();
	parser.setLanguage(language);

  return parser;
}
