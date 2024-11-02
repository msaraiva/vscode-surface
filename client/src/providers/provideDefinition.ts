import { Uri, Position, TextDocument, MarkdownString, ProviderResult, Hover, CancellationToken, commands, Definition, DefinitionLink, Range, workspace, LocationLink, Location } from 'vscode';
import { asRange, getCursorInfo, resolveAlias, toEmbeddedCode } from '../parserHelpers';
import { getComponentSpecByName } from '../components';
import Parser = require('web-tree-sitter');
import path = require('path');

interface Context {
  tree: Parser.Tree;
  module: string;
  aliases: Object;
  virtualDocumentContents: Map<string, string>;
  workspaceFolder: Uri
}

// Copied/pasted from TextDocument
// TODO: remove it when start using tree-sitter-elixir
const positionAt = (content: string, offset:number) : Position => {
  offset = Math.max(Math.min(offset, content.length), 0);

  var lineOffsets = getLineOffsets(content);
  var low = 0, high = lineOffsets.length;
  if (high == 0)
      return new Position(0, offset);
  while (low < high) {
      var mid = Math.trunc((low + high) / 2);
      if (lineOffsets[mid] > offset)
          high = mid;
      else
          low = mid + 1;
  }
  var line = low - 1;
  return new Position(line, offset - lineOffsets[line]);
}

// Copied/pasted from TextDocument
const getLineOffsets = (content: string) => {
  let offsets = [];
  let text = content;
  let isLineStart = true;
  let i = 0;
  while (i < text.length) {
      if (isLineStart) {
          offsets.push(i);
          isLineStart = false;
      }
      let ch = text.charCodeAt(i);
      isLineStart = (ch == 13 || ch == 10);
      if (ch == 13 && i + 1 < text.length && text.charCodeAt(i + 1) == 10)
          i++;
      i++;
  }
  if (isLineStart && text.length > 0)
      offsets.push(text.length);
  return offsets;
}

export const provideDefinition = async (document: TextDocument, position: Position, _token: CancellationToken, context: Context): Promise<Definition | DefinitionLink[]> => {
  const tree = context.tree;
  const node = getCursorInfo(tree, document.offsetAt(position))
  const aliases = context.aliases;
  const module = context.module;
  const workspaceFolder = context.workspaceFolder;

  // console.log('provideDefinition for node:', JSON.stringify(node, null, 2));

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

  // Expression inside Surface (Elixir)

  if (node.lang == 'surface' && node.scope == 'expression') {
    // Get the content of the related .ex file
    const relatedExFileUri = document.uri.path.split('.').slice(0, -1).join('.') + '.ex';
    const relatedExFileBuffer = await workspace.fs.readFile(Uri.parse(relatedExFileUri));
    const relatedExFileContent = new TextDecoder('utf-8').decode(relatedExFileBuffer);

    // Inject/append the surface code into the elixir code as a fake function
    const prefix = '\ndefp __fake_surface_render__() do\n~F"""\n';
    const contentBefore = relatedExFileContent.replace(/\send\s*$/s, prefix)
    const updatedContent = contentBefore + document.getText() + '\n"""\nend\nend';
    const lastPosition = positionAt(contentBefore, contentBefore.length);
    const updatedPosition = lastPosition.translate(position.line, position.character);

    // Forward the command to the Elixir LS so it can properly find the definition
    const virtualDocumentContents = context.virtualDocumentContents;
    const originalUri = document.uri.toString(true);
    virtualDocumentContents.set(originalUri, updatedContent);
    const vdocUriString = `embedded-content://ex/${encodeURIComponent(originalUri)}.ex`;
    const vdocUri = Uri.parse(vdocUriString);

    const result: Definition | LocationLink[] = await commands.executeCommand(
      "vscode.executeDefinitionProvider",
      vdocUri,
      updatedPosition
    );

    // TODO: check all possible result types, `Definition` and `LocationLink[]`
    if (Array.isArray(result)) {
      return result.map(item => {
        if (item.uri.scheme == 'embedded-content') {
          return new Location(Uri.parse(relatedExFileUri), item.range);
        }
        return item;
      });
    }

    return [];
  }

  // Click on component's name

  if (node.scope == 'component_name' || node.scope == 'macro_component_name') {
    const moduleSpec = getComponentSpecByName(module, document.uri);
    const compiledAliases = moduleSpec?.aliases || {};
    const component = resolveAlias(node.value, aliases, compiledAliases);

		const spec = getComponentSpecByName(component, document.uri);
		if (spec) {
      let uri: Uri;
      if (path.isAbsolute(spec.source)) {
        uri = Uri.parse(spec.source);
      } else {
        uri = Uri.joinPath(workspaceFolder, spec.source);
      }
			return [{originSelectionRange: node.range, targetUri: uri, targetRange: new Range(0, 0, 0, 0)}];
		}
	}

  // Click on function component's name

  if (node.scope == 'function_component_name' && node.value?.startsWith('.')) {
    const func = node.value.slice(1);
    const moduleSpec = getComponentSpecByName(module, document.uri);
    const spec = getComponentSpecByName(moduleSpec?.imports[func], document.uri);

    if (spec) {
      const uri = Uri.joinPath(workspaceFolder, spec.source);
      return { uri: uri, range: new Range(spec.line - 1, 0, spec.line - 1, 0) };
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
