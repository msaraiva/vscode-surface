import { CancellationToken, CodeAction, CodeActionContext, CodeActionKind, CodeActionProvider, Range, Selection, TextDocument } from "vscode";
import { findComponentsForAlias } from '../components';

export const provideCodeActions = (document: TextDocument, range: Range | Selection, actionContext: CodeActionContext, token: CancellationToken, context: {aliases: Object}): CodeAction[] => {
	const aliases = context.aliases;
	const actions = [];
	for (const diagnostic of actionContext.diagnostics) {
		const match = diagnostic.message.match(/^cannot render <(.+?)> \(module .+? could not be loaded\)/i)

		console.log('match', match);
		console.log('aliases', aliases);

		const alias = match[1];
		if (alias && !aliases[alias]) {
			const components = findComponentsForAlias(document.uri, alias);
			for (const component of components) {
				const action = new CodeAction(`Add "alias ${component}"`, CodeActionKind.QuickFix);
				action.command = {
					command: 'surface.insertModuleAlias',
					title: 'Add alias',
					arguments: [document.uri.fsPath, component]
				};
				action.diagnostics = [diagnostic];
				action.isPreferred = true;
				actions.push(action);
			}
		}
	}
	return actions;
}
