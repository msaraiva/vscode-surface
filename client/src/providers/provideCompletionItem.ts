import { Position, TextDocument, CancellationToken, CompletionContext, CompletionItem, CompletionList, CompletionItemKind, Range } from 'vscode';
import { asRange, getCursorInfo, getInsertAliasPosition, getRelatedExFilePath, isComponent, isComponentAttributes, resolveComponent, toEmbeddedCode } from '../parserHelpers';
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

const maybeReplaceClosing = (item: CompletionItem, node, replaceText: string) => {
  if ((node.scope == 'tag_name' || node.scope == 'component_name') && node.closingRange) {
    item.additionalTextEdits = [
      {
        newText: replaceText,
        range: node.closingRange
      }
    ]
  }
}

export const provideCompletionItem = async (document: TextDocument, position: Position, _token: CancellationToken, completionContext: CompletionContext, context: Context): Promise<CompletionList<CompletionItem> | CompletionItem[]> => {
  const tree = context.tree;
  const elixirTree = context.elixirTree;
  const node = getCursorInfo(tree, document.offsetAt(position))
  const originalUri = document.uri.toString(true);
  const aliases = context.aliases;
  const module = context.module;
  const virtualDocumentContents = context.virtualDocumentContents;

  console.debug('provideCompletionItem for node:', JSON.stringify(node, null, 2));

  // Inside <style> (CSS)

  if (node.lang == 'css') {
    const cssContent = toEmbeddedCode(tree, document.getText(), 'style');
    return await forwardToLanguageService('css', originalUri, cssContent, position, completionContext, virtualDocumentContents);
  }

  // Inside <script> (Javascript)

  if (node.lang == 'javascript') {
    const jsContent = toEmbeddedCode(tree, document.getText(), 'script');
    return await forwardToLanguageService('js', originalUri, jsContent, position, completionContext, virtualDocumentContents);
  }

  // Expression inside Surface (Elixir)

  if (node.lang == 'surface' && node.scope == 'expression') {
    // TODO: should use something like `toEmbeddedCode` too?
    return await forwardToLanguageService('ex', originalUri, document.getText(), position, completionContext, virtualDocumentContents);
  }

  // Inside tag body (Surface + HTML)

  if (node.lang == 'surface' && (node.scope == 'tag_body') || node.scope == 'tag_name' || node.scope == 'component_name') {
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

  // Inside component head (Surface)

  // TODO: simplify this condition. Suggestions:
  // * Add properties to `node`, e.g. `node.isComponent`, `node.isFunctionComponent`, `node.isModuleComponent`, etc.
  // * Rename all '*_attributes' into just `attributes` and then add a propertty, `parentTag` to both, `attributes` and `attribute_name`
  // so we can handle the conditions:
  //   Example: if (node.scope == 'attibutes' && node.parentTag.isComponent)
  if (node.lang == 'surface' && (isComponentAttributes(node.scope) || (node.scope == 'attribute_name' && isComponent(node.type)))) {
    const moduleSpec = getComponentSpecByName(module, document.uri);
    // TODO: rename `node.tag` to `node.alias` or `node.tagAlias`, `node.name`?
    const component = resolveComponent(node.tag, aliases, moduleSpec.aliases, moduleSpec.imports);

    if (component) {
      const spec = getComponentSpecByName(component, document.uri);
      // TODO: Rename spec.type's "surface" value to "defmodule" to make it consistent with "defp" and "def"?
      if (spec && spec.type == 'surface') {
        const items = spec.props.map(prop => {
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
        return items;
      } else if (spec && spec.type == 'def' || spec.type == 'defp') {
        const items = spec.attrs.map(attr => {
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
        return items;
      }
    }

    return [];
  }

  // Inside tag head (Surface + HTML)

  if (node.lang == 'surface' && node.scope == 'tag_attributes') {
    const htmlItems = await forwardToLanguageService('html', originalUri, document.getText(), position, completionContext, virtualDocumentContents);

    // TODO: let the surface compiler generate the list of events and create the items from it
    const surfaceItems = [
       new CompletionItem(':on-click', CompletionItemKind.Event),
       new CompletionItem(':on-focus', CompletionItemKind.Event),
       new CompletionItem(':on-blur', CompletionItemKind.Event)
    ]

    return surfaceItems.concat(htmlItems.items);
  }

  return [];
};
