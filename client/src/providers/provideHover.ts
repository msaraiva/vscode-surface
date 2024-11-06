import { Uri, Position, TextDocument, MarkdownString, ProviderResult, Hover, CancellationToken, commands } from 'vscode';
import { getComponentSpecByName, resolveComponent } from '../components';
import { CursorSurfaceInfo, getCursorInfo, isFunctionComponent, isSurfaceComponent } from '../cursorHelpers';
import Parser = require('web-tree-sitter');
import { toEmbeddedCode } from '../providersHelpers';

interface Context {
  tree: Parser.Tree;
  aliases: Object;
  module: string;
  virtualDocumentContents: Map<string, string>;
}

export const provideHover = async (document: TextDocument, position: Position, _token: CancellationToken, context: Context): Promise<Hover> => {
  const tree = context.tree;
  const node = getCursorInfo(tree, document.offsetAt(position))
  if (!node) return;

  // console.debug('provideHover for node:', JSON.stringify(node, null, 2))

  // Inside <script> (Javascript)

  if (node.type == 'EmbeddedContent' && node.lang == 'javascript') {
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

  // Inside <style> (CSS)

  if (node.type == 'EmbeddedContent' && node.lang == 'css') {
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

  // Inside Surface template

  if (node.type != 'EmbeddedContent') {
    return handleSurfaceNode(node, document, position, context);
  }
};

const handleSurfaceNode = async (node: CursorSurfaceInfo, document: TextDocument, position: Position, context: Context): Promise<Hover> => {
  const aliases = context.aliases;
  const module = context.module;

  // TODO: this will require the same strategy done in `provideDefinition` to provide
  // accurate infomation coming from aliases or imports.
  if (node.type == 'Expression') {
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

    if (hover) return hover[0];
  }

  // Hover surface component's name

	if (node.type == 'TagName' && isSurfaceComponent(node.parentTag.kind)) {
    const moduleSpec = getComponentSpecByName(module, document.uri);
    const component = resolveComponent(node.entity, aliases, moduleSpec.aliases, moduleSpec.imports);
    const spec = getComponentSpecByName(component, document.uri);
    if (spec) {
      const contents = '```elixir\nalias ' + component + '\n```\n##### *use Surface.Component*\n---\n\n' + spec.docs;
      return new Hover(new MarkdownString(contents));
    }
	}

  // Hover function component's name

	if (node.type == 'TagName' && isFunctionComponent(node.parentTag.kind)) {
    const moduleSpec = getComponentSpecByName(module, document.uri);
    const component = resolveComponent(node.entity, aliases, moduleSpec.aliases, moduleSpec.imports);
    const spec = getComponentSpecByName(component, document.uri);
    if (spec) {
      const contents = '```elixir\n' + component + '/1\n```\n##### *Function Component*\n---\n\n' + spec.docs;
      return new Hover(new MarkdownString(contents));
    }
	}

  // Hover surface component's prop name

	if (node.type == 'AttributeName' && isSurfaceComponent(node.parentAttribute.parentTag.kind)) {
    const moduleSpec = getComponentSpecByName(module, document.uri);
    const componentAlias = node.parentAttribute.parentTag.openingTagName.entity;
    const component = resolveComponent(componentAlias, aliases, moduleSpec.aliases, moduleSpec.imports);
    const prop = getComponentSpecByName(component, document.uri)?.props.find(prop => prop.name == node.value);

    if (prop) {
      const contents = '```elixir\n' + `prop ${prop.name}, ${prop.opts}` + '\n```\n\n' + prop.doc;
      return new Hover(new MarkdownString(contents));
    }
  }

  // Hover function component's prop name

	if (node.type == 'AttributeName' && isFunctionComponent(node.parentAttribute.parentTag.kind)) {
    const moduleSpec = getComponentSpecByName(module, document.uri);
    const componentAlias = node.parentAttribute.parentTag.openingTagName.entity;
    const component = resolveComponent(componentAlias, aliases, moduleSpec.aliases, moduleSpec.imports);
    const attr = getComponentSpecByName(component, document.uri)?.attrs.find(attr => attr.name == node.value);

    if (attr) {
      let contents = '```elixir\n' + `attr :${attr.name}, ${attr.type}`;
      if (attr.doc) {
        contents = contents + '\n```\n\n' + attr.doc;
      }
      return new Hover(new MarkdownString(contents));
    }
	}
}
