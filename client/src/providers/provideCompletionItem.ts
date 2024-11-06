import { Position, TextDocument, CancellationToken, CompletionContext, CompletionItem, CompletionList, CompletionItemKind } from 'vscode';
import { CursorSurfaceInfo, getCursorInfo, isFunctionComponent, isHTMLtag, isSurfaceComponent, resolveComponent, toEmbeddedCode } from '../parserHelpers';
import { getComponentSpecByName, getComponents } from '../components';
import { forwardToLanguageService } from '../providerHelpers';
import Parser = require('web-tree-sitter');

interface Context {
  tree: Parser.Tree;
  elixirTree: Parser.Tree;
  aliases: Object;
  module: string,
  virtualDocumentContents: Map<string, string>;
}

const maybeReplaceClosing = (item: CompletionItem, node: CursorSurfaceInfo, replaceText: string) => {
  if (node.type == 'TagName' && !node.parentTag.isSelfClosing) {
    item.additionalTextEdits = [
      {
        newText: replaceText,
        range: node.parentTag.closingTagName.range
      }
    ]
  }
}

export const provideCompletionItem = async (document: TextDocument, position: Position, _token: CancellationToken, completionContext: CompletionContext, context: Context): Promise<CompletionList<CompletionItem> | CompletionItem[]> => {
  const tree = context.tree;
  const node = getCursorInfo(tree, document.offsetAt(position))
  if (!node) return [];
  const originalUri = document.uri.toString(true);
  const virtualDocumentContents = context.virtualDocumentContents;

  // console.debug('provideCompletionItem for node:', JSON.stringify(node, null, 2));

  // Inside <style> (CSS)

  if (node.type == 'EmbeddedContent' && node.lang == 'css') {
    const cssContent = toEmbeddedCode(tree, document.getText(), 'style');
    return await forwardToLanguageService('css', originalUri, cssContent, position, completionContext, virtualDocumentContents);
  }

  // Inside <script> (Javascript)

  if (node.type == 'EmbeddedContent' && node.lang == 'javascript') {
    const jsContent = toEmbeddedCode(tree, document.getText(), 'script');
    return await forwardToLanguageService('js', originalUri, jsContent, position, completionContext, virtualDocumentContents);
  }

  // Expression inside Surface (Elixir)

  if (node.type != 'EmbeddedContent'){
    return handleSurfaceNode(node, originalUri, document, position, completionContext, context);
  }
};

const handleSurfaceNode = async (node: CursorSurfaceInfo, originalUri: string, document: TextDocument, position: Position, completionContext: CompletionContext, context: Context): Promise<CompletionList<CompletionItem> | CompletionItem[]> => {
  const aliases = context.aliases;
  const module = context.module;
  const virtualDocumentContents = context.virtualDocumentContents;

  if (node.type == 'Expression') {
    // TODO: should use something like `toEmbeddedCode` too?
    return await forwardToLanguageService('ex', originalUri, document.getText(), position, completionContext, virtualDocumentContents);
  }

  // Inside tag body (Surface + HTML)

  // TODO: should separate the implementation for TagBody and TagName?
  if ((node.type == 'TagBody') || node.type == 'TagName') {
    const htmlItems = await forwardToLanguageService('html', originalUri, document.getText(), position, completionContext, virtualDocumentContents);
    const components = getComponents(document.uri);
    const range = document.getWordRangeAtPosition(position, /[a-zA-Z\.][a-zA-Z\._\d]*/);

    // TODO: don't do this if it's a complex snippet/range?
    htmlItems.items = htmlItems.items.map(item => {
      // Always replace the whole tag with the selected item
      item.range = range;
      if (typeof item.label == 'string') {
        maybeReplaceClosing(item, node, item.label);
        item.sortText = 'c-' + item.label;
      }
      return item;
    });

    const surfaceItems = components.map(component => {
      const type = component.alias.startsWith('.') ? 'def' : 'surface';
      let description: string, kind: CompletionItemKind, sortText: string;

      if (type == 'surface') {
        description = component.name;
        kind = CompletionItemKind.Class;
        sortText = 'a-' + component.alias;
      } else {
        description = component.name + '/1';
        kind = CompletionItemKind.Function;
        sortText = 'b-' + component.alias;
      }

      const item = new CompletionItem({label: component.alias, description: description}, kind);

      item.detail = `__surface_component__:${component.name}`;
      item.sortText = sortText;

      // Always replace the whole tag with the selected item
      item.range = range;
      maybeReplaceClosing(item, node, component.alias);

      if (type == 'surface' && !aliases[component.alias]) {
        item.command = {
          command: 'surface.addAlias',
          title: 'Insert module alias',
          arguments: [document.uri.fsPath, component.name]
        }
      }

      return item;
    });

    return surfaceItems.concat(htmlItems.items);
  }

  // Inside HTML tag attributes (list both, Surface and HTML items)

  if (node.type == 'InsertAttributes' && isHTMLtag(node.parentTag.kind)) {
    const htmlItems = await forwardToLanguageService('html', originalUri, document.getText(), position, completionContext, virtualDocumentContents);

    // TODO: let the surface compiler generate the list of events and create the items from it
    const surfaceItems = [
       new CompletionItem(':on-click', CompletionItemKind.Event),
       new CompletionItem(':on-focus', CompletionItemKind.Event),
       new CompletionItem(':on-blur', CompletionItemKind.Event)
    ]

    return surfaceItems.concat(htmlItems.items);
  }

  // Inside surface component's attributes

  if (node.type == 'InsertAttributes' && isSurfaceComponent(node.parentTag.kind)) {
    const moduleSpec = getComponentSpecByName(module, document.uri);
    const componentAlias = node.parentTag.openingTagName.entity;
    const component = resolveComponent(componentAlias, aliases, moduleSpec.aliases, moduleSpec.imports);
    return buildItemsForSurfaceComponents(component, document, position);
  }

  if (node.type == 'AttributeName' && isSurfaceComponent(node.parentAttribute.parentTag.kind)) {
    const moduleSpec = getComponentSpecByName(module, document.uri);
    const componentAlias = node.parentAttribute.parentTag.openingTagName.entity;
    const component = resolveComponent(componentAlias, aliases, moduleSpec.aliases, moduleSpec.imports);
    return buildItemsForSurfaceComponents(component, document, position);
  }

  // Inside function component's attributes

  if (node.type == 'InsertAttributes' && isFunctionComponent(node.parentTag.kind)) {
    const moduleSpec = getComponentSpecByName(module, document.uri);
    const componentAlias = node.parentTag.openingTagName.entity;
    const component = resolveComponent(componentAlias, aliases, moduleSpec.aliases, moduleSpec.imports);
    return buildItemsForFunctionComponents(component, document, position);
  }

  if (node.type == 'AttributeName' && isFunctionComponent(node.parentAttribute.parentTag.kind)) {
    const moduleSpec = getComponentSpecByName(module, document.uri);
    const componentAlias = node.parentAttribute.parentTag.openingTagName.entity;
    const component = resolveComponent(componentAlias, aliases, moduleSpec.aliases, moduleSpec.imports);
    return buildItemsForFunctionComponents(component, document, position);
  }

  return [];
}

const buildItemsForSurfaceComponents = (component: string, document: TextDocument, position: Position) => {
  const spec = getComponentSpecByName(component, document.uri);
  if (!spec) return [];

  return spec.props.map(prop => {
    const kind = prop.type == 'event' ? CompletionItemKind.Event : CompletionItemKind.Field;
    // const item = new CompletionItem({label: prop.name, detail: `, ${prop.opts}`, description: `:${prop.type}`}, kind);
    // const item = new CompletionItem({label: prop.name, detail: ` ${prop.opts}`, description: 'prop'}, kind);
    const isRequired = prop.opts.indexOf('required: true') > -1;
    const description = isRequired ? 'required prop' : 'prop';
    const item = new CompletionItem({label: prop.name, detail: ` :${prop.type}`, description: description}, kind);
    item.detail = `prop :${prop.name}, ${prop.opts}`
    item.documentation = prop.doc;
    item.range = document.getWordRangeAtPosition(position);
    item.sortText = (isRequired ? 'a-' : 'b-') + item.label;

    return item;
  });
}

const buildItemsForFunctionComponents = (component: string, document: TextDocument, position: Position) => {
  const spec = getComponentSpecByName(component, document.uri);
  if (!spec) return [];

  return spec.attrs.map(attr => {
    const kind = CompletionItemKind.Field;
    const isRequired = attr.required;
    const description = isRequired ? 'required attr' : 'attr';
    const item = new CompletionItem({label: attr.name, detail: ` :${attr.type}`, description: description}, kind);
    item.detail = `attr ${attr.name}, ${attr.type}`
    item.documentation = attr.doc;
    item.range = document.getWordRangeAtPosition(position);
    item.sortText = (isRequired ? 'a-' : 'b-') + item.label;
    return item;
  });
}