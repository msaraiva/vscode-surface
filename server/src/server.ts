import * as path from 'path';
import Parser = require('web-tree-sitter');

import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	InitializeParams,
	CompletionItem,
	InitializeResult,
	Hover,
	MarkupKind,
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import { getComponentSpecByName } from './components';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// The workspace folder this server is operating on
let workspaceFolder: string | undefined;

connection.onInitialize((params: InitializeParams) => {
	if (params.workspaceFolders && params.workspaceFolders.length > 0) {
		// TODO: find a better way to do this. What about when having multiple workspaces
		workspaceFolder = params.workspaceFolders[0].uri.replace(/^file:\/\//, '');
	}

	const result: InitializeResult = {
		capabilities: {
			hoverProvider: true,
			definitionProvider: true,
			completionProvider: {
				resolveProvider: true,
			}
		}
	};
	return result;
});

connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		if (item.detail?.startsWith('__surface_component__:')) {
			return resolveComponentCompletion(item);
		}

		// Fix docs that may come from the HTML language service as `{}`
		const doc: any = item.documentation;
		if (typeof doc == 'object' && Object.keys(doc).length == 0) {
			item.documentation = undefined;
		}

		return item;
	}
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

const resolveComponentCompletion = (item: CompletionItem) => {
	const component = item.detail?.replace(/^__surface_component__:/, '');

	if (workspaceFolder && component) {
		const spec = getComponentSpecByName(component, workspaceFolder);
		if (spec) {
			const alias = component.split('.').pop();
			item.detail = `Surface component <${alias}/>`;
			if (spec.docs) {
				item.documentation = {kind: MarkupKind.Markdown, value: spec.docs};
			}
		}
	}
	return item;
}
