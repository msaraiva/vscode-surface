import { Uri, Position, TextDocument, MarkdownString, ProviderResult, Hover, CancellationToken, commands, Definition, DefinitionLink, Range } from 'vscode';
import { getCursorInfo, toEmbeddedCode } from '../parserHelpers';
import { getComponentSpecByName } from '../components';
import Parser = require('web-tree-sitter');

interface Context {
  tree: Parser.Tree;
  aliases: Object;
  virtualDocumentContents: Map<string, string>;
  workspaceFolder: Uri
}

export const provideDefinition = async (document: TextDocument, position: Position, _token: CancellationToken, context: Context): Promise<Definition | DefinitionLink[]> => {
  const tree = context.tree;
  const node = getCursorInfo(tree, document.offsetAt(position))
  const aliases = context.aliases;
  const workspaceFolder = context.workspaceFolder;

  console.debug('provideDefinition for node:', JSON.stringify(node, null, 2));

  // Inside <script> (Javascript)

  if (node.lang == 'javascript') {
    const virtualDocumentContents = context.virtualDocumentContents;
    const originalUri = document.uri.toString(true);
    const jsContent = toEmbeddedCode(tree, document.getText(), 'script');
    virtualDocumentContents.set(originalUri, jsContent);
    const vdocUriString = `embedded-content://js/${encodeURIComponent(originalUri)}.js`;
    const vdocUri = Uri.parse(vdocUriString);

    return await commands.executeCommand(
      "vscode.executeDefinitionProvider",
      vdocUri,
      position
    );
  }

  // Click on component (tag) name

	if (node.scope == 'component_name') {
    const component = aliases[node.value];
		const spec = getComponentSpecByName(component, document.uri);
		if (spec) {
      const uri = Uri.joinPath(workspaceFolder, spec.source);
			return {uri: uri, range: new Range(0, 0, 0, 0)};
		}
	}

  // Click on component prop name

	if (node.scope == 'attribute_name' && node.type == 'component') {
    const component = aliases[node.tag];
		const spec = getComponentSpecByName(component, document.uri);
		const prop = spec.props.find(prop => prop.name == node.value);
		if (spec && prop) {
      const uri = Uri.joinPath(workspaceFolder, spec.source);
			return {uri: uri, range: new Range(prop.line - 1, 0, prop.line, 0)};
		}
	}
};
