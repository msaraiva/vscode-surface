import { Uri, Position, commands, CompletionContext, CompletionList } from 'vscode';
import Parser = require("web-tree-sitter")

// TODO: either make it work for all types of commands or extract the common parts os it can be reused by all providers
export const forwardToLanguageService = (lang: 'html' | 'ex' | 'css' | 'js', originalUri: string, code: string, position: Position, context: CompletionContext, virtualDocumentContents: Map<string, string>) => {
	virtualDocumentContents.set(originalUri, code);
	const vdocUriString = `embedded-content://${lang}/${encodeURIComponent(originalUri)}.${lang}`;
	const vdocUri = Uri.parse(vdocUriString);

	return commands.executeCommand<CompletionList>(
		'vscode.executeCompletionItemProvider',
		vdocUri,
		position,
		context.triggerCharacter
	);
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
