import { Position, TextDocument, CancellationToken, CompletionContext, CompletionItem, CompletionList, CompletionItemKind } from 'vscode';
import { getCursorInfo, toEmbeddedCode } from '../parserHelpers';
import { getComponentSpecByName, getComponents } from '../components';
import { forwardToLanguageService } from '../providerHelpers';
import Parser = require('web-tree-sitter');

interface Context {
  tree: Parser.Tree;
  aliases: Object;
  virtualDocumentContents: Map<string, string>;
}

export const provideCompletionItem = async (document: TextDocument, position: Position, _token: CancellationToken, completionContext: CompletionContext, context: Context): Promise<CompletionList<CompletionItem> | CompletionItem[]> => {
  const tree = context.tree;
  const node = getCursorInfo(tree, document.offsetAt(position))
  const originalUri = document.uri.toString(true);
  const aliases = context.aliases;
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

    const surfaceItems = components.map(component => {
      const item = new CompletionItem({
        label: `${component.alias}`,
        description: component.name}, CompletionItemKind.Class
      );
      item.detail = `__surface_component__:${component.name}`;
      // Always replace the whole tag with the selected item
      // TODO: can we also replace the closing tag? Maybe with `{command: ...}`?
      item.range = document.getWordRangeAtPosition(position);

      return item;
    });

    return surfaceItems.concat(htmlItems.items);
  }

  // Inside component head (Surface)

  if (node.lang == 'surface' && (node.scope == 'component_attributes' || (node.scope == 'attribute_name' && node.type == 'component'))) {
    const component = aliases[node.tag];

    if (component) {
      const spec = getComponentSpecByName(component, document.uri);
      if (spec) {
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
