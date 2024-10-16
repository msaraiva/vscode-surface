import { Uri, Position, TextDocument, MarkdownString, ProviderResult, Hover, CancellationToken, commands } from 'vscode';
import { getCursorInfo, toEmbeddedCode } from '../parserHelpers';
import { getComponentSpecByName } from '../components';
import Parser = require('web-tree-sitter');

interface Context {
  tree: Parser.Tree;
  aliases: Object;
  virtualDocumentContents: Map<string, string>;
}

export const provideHover = async (document: TextDocument, position: Position, _token: CancellationToken, context: Context): Promise<Hover> => {
  const tree = context.tree;
  const node = getCursorInfo(tree, document.offsetAt(position))
  const aliases = context.aliases;

  console.debug('provideHover for node:', JSON.stringify(node, null, 2))

  // Inside <script> (Javascript)

  if (node.lang == 'javascript') {
    const virtualDocumentContents = context.virtualDocumentContents;
    const originalUri = document.uri.toString(true);
    const jsContent = toEmbeddedCode(tree, document.getText(), 'script');
    virtualDocumentContents.set(originalUri, jsContent);
    const vdocUriString = `embedded-content://js/${encodeURIComponent(originalUri)}.js`;
    const vdocUri = Uri.parse(vdocUriString);

    const hover: ProviderResult<Hover[]> = await commands.executeCommand(
      "vscode.executeHoverProvider",
      vdocUri,
      position
    );

    if (hover) return hover[0];
  }

  if (node.lang == 'css') {
    const virtualDocumentContents = context.virtualDocumentContents;
    const originalUri = document.uri.toString(true);
    const jsContent = toEmbeddedCode(tree, document.getText(), 'style');
    virtualDocumentContents.set(originalUri, jsContent);
    const vdocUriString = `embedded-content://css/${encodeURIComponent(originalUri)}.css`;
    const vdocUri = Uri.parse(vdocUriString);

    const hover: ProviderResult<Hover[]> = await commands.executeCommand(
      "vscode.executeHoverProvider",
      vdocUri,
      position
    );

    if (hover) return hover[0];
  }

  // TODO: this will require the same strategy done in `provideDefinition` to provide
  // accurate infomation coming from aliases or imports.
  if (node.lang == 'surface' && node.scope == 'expression') {
    console.log('hover surface/expression')
    const virtualDocumentContents = context.virtualDocumentContents;
    const originalUri = document.uri.toString(true);
    virtualDocumentContents.set(originalUri, document.getText());
    const vdocUriString = `embedded-content://ex/${encodeURIComponent(originalUri)}.ex`;
    const vdocUri = Uri.parse(vdocUriString);

    const hover: ProviderResult<Hover[]> = await commands.executeCommand(
      "vscode.executeHoverProvider",
      vdocUri,
      position
    );

    console.log('hover result: ', hover);

    if (hover) return hover[0];
  }

  // Hover component (tag) name

	if (node.scope == 'component_name') {
    const component = aliases[node.value];
		const spec = getComponentSpecByName(component, document.uri);
		if (spec) {
			const contents = '```elixir\nalias ' + component + '\n```\n##### *use Surface.Component*\n---\n\n' + spec.docs;
			return new Hover(new MarkdownString(contents));
		}
	}

  // Hover component prop name

	if (node.scope == 'attribute_name' && node.type == 'component') {
    const component = aliases[node.tag];
		const spec = getComponentSpecByName(component, document.uri);
		const prop = spec.props.find(prop => prop.name == node.value);
		if (spec && prop) {
			const contents = '```elixir\n' + `prop ${prop.name}, ${prop.opts}` + '\n```\n\n' + prop.doc;
			return new Hover(new MarkdownString(contents));
		}
	}
};
