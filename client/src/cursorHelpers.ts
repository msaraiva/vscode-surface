import { Range } from "vscode";
import Parser = require("web-tree-sitter")
import { asRange, getRootTag, isNodeSelfClosing, isNodeStartTagOrComponent, isNodeTagOrComponentName, getAdjustedNodeForCursor } from "./parserHelpers";

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
  entity: string;
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

export const getCursorInfo = (tree: Parser.Tree, offset: number): CursorInfo => {
  const adjustedNode = getAdjustedNodeForCursor(tree, offset);
  return buildCursorInfo(adjustedNode);
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
    tag.closingTagName = buildTagName(node.parent.lastChild.firstNamedChild, tag);
  }

  return tag;
}

const buildTagName = (node: Parser.SyntaxNode, tag: Tag): TagName => {
  return {
    type: 'TagName',
    value: node.text,
    range: asRange(node.startPosition, node.endPosition),
    parentTag: tag,
    entity: node.text.replace(/^[\#\.]/, '')
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

  if (node.type == 'attribute_name' || node.type == 'directive_name') {
    const tag = buildTag(node.parent.parent);
    const attibute: Attribute = {
      type: 'Attribute',
      parentTag: tag
    }

    return {
      type: 'AttributeName',
      value: node.text,
      parentAttribute: attibute
    };
  }

  /* InsertAttributes */

  if (isNodeStartTagOrComponent(node) || isNodeSelfClosing(node)) {
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

  // Expression

  if (node.type == 'expression_value') {
    return {
      type: 'Expression',
      value: node.text,
    };
  }

  // anything else

  return undefined;
}
