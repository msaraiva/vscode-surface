import { CancellationToken, CodeAction, CodeActionContext, CodeActionKind, Diagnostic, Range, Selection, TextDocument } from "vscode";
import { findComponentsForAlias } from '../components';

export const provideCodeActions = (document: TextDocument, range: Range | Selection, actionContext: CodeActionContext, token: CancellationToken, context: {aliases: Object}): CodeAction[] => {
	const actions = [];
	for (const diagnostic of actionContext.diagnostics) {
		handleModuleCouldNotBeLoaded(diagnostic, document, context, actions);
	}
	return actions;
}

const handleModuleCouldNotBeLoaded = (diagnostic: Diagnostic, document: TextDocument, context, actions: Array<CodeAction>) => {
	const match = diagnostic.message.match(/cannot render <(.+?)> \(module .+? could not be loaded\)/i)

	if (match && !context.aliases[match[1]]) {
		const components = findComponentsForAlias(document.uri, match[1]);
		for (const component of components) {
			const action = new CodeAction(`Add "alias ${component}"`, CodeActionKind.QuickFix);
			action.command = {
				command: 'surface.addAlias',
				title: 'Add alias',
				arguments: [document.uri.fsPath, component]
			};
			action.diagnostics = [diagnostic];
			action.isPreferred = true;
			actions.push(action);
		}
	}
}
