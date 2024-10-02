import { trace } from "console";
import { ExtensionContext, TextDocument, Uri } from "vscode";
import * as fs from 'fs';
import Parser = require("web-tree-sitter")

// TODO: handle `alias x as y` and `alias a.{b, c}`
// TODO: try to use tree-sitter-elixir instead
export const extractElixirAliases = (document: TextDocument) => {
	const baseName = document.uri.path.slice(1).split('.').slice(0, -1).join('.');
	const exFile = baseName + '.ex';
	const aliases = {};

	// TODO: should we use `workspace.fs` instead of `fs`?
	if (fs.existsSync(exFile)) {
		try {
			const exContent = fs.readFileSync(exFile).toString();
			const matches = [...exContent.matchAll(/^\s*alias\s*([A-Z][a-zA-Z_\d\.]+)$/gm)];

			for (const match of matches) {
				aliases[match[1].split('.').pop()] = match[1];
			}
		} catch (e) {
			console.error(e);
		}
	}

	return aliases;
};

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

export const initParser = async (extensionUri: Uri) => {
	await Parser.init();
	const wasmUri = Uri.joinPath(extensionUri, "./resources/tree-sitter-surface.wasm").fsPath;
	const Surface = await Parser.Language.load(wasmUri);
	const surfaceParser = new Parser();
	surfaceParser.setLanguage(Surface);

  return surfaceParser;
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
    return {
      lang: 'surface',
      scope: 'tag_name',
      value: node.text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
    };
  }

  // <div| >
  if (node.type == 'start_tag' && node.descendantsOfType('tag_name')[0].endIndex == offset) {
    return {
      lang: 'surface',
      scope: 'tag_name',
      value: node.descendantsOfType('tag_name')[0].text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
    };
  }

  // <div|>
  if (node.type == '>' && node.previousSibling.type == 'tag_name' && node.previousSibling.endIndex == node.startIndex) {
    return {
      lang: 'surface',
      scope: 'tag_name',
      value: node.previousSibling.text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
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
    return {
      lang: 'surface',
      scope: 'component_name',
      value: node.text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
    };
  }

  // <Form|>
  if (node.type == '>' && node.previousSibling.type == 'component_name' && node.previousSibling.endIndex == node.startIndex) {
    return {
      lang: 'surface',
      scope: 'component_name',
      value: node.previousSibling.text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
    };
  }

  // <Form| >
  if (node.type == 'start_component' && node.descendantsOfType('component_name')[0].endIndex == offset) {
    return {
      lang: 'surface',
      scope: 'component_name',
      value: node.descendantsOfType('component_name')[0].text,
      details: {text: node.text, type: node.type},
      node: node.toString(),
      parent: node.parent.toString()
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
