import * as path from 'path';
import { ExtensionContext, workspace, TextDocument, TextDocumentChangeEvent, Position, TextDocumentContentChangeEvent } from 'vscode';
import { initParser, extractElixirAliases } from './parserHelpers';
import { provideHover } from './providers/provideHover';
import { provideDefinition } from './providers/provideDefinition';
import { provideCompletionItem } from './providers/provideCompletionItem';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';

import Parser = require('web-tree-sitter');

let client: LanguageClient;

// Build, store and return the parser tree.
// We're keeping only the tree of the latest required file
// TODO: move this whole thing some place else
let lastDocumentKey: string;
let lastDocumentVersion: number;
let parser: Parser;
let tree: Parser.Tree;

const getTree = (document: TextDocument): Parser.Tree => {
	if (document.uri.toString() != lastDocumentKey || document.version != lastDocumentVersion) {
		console.debug('Building tree for ' + document.uri)
		tree = parser.parse(document.getText());
		lastDocumentKey = document.uri.toString();
		lastDocumentVersion = document.version;
	}
	return tree;
};

export async function activate(extensionContext: ExtensionContext) {

	// The language server
	const serverModule = extensionContext.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);

	// Language server options
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc }
	};

	// The Surface parser
	parser = await initParser(extensionContext.extensionUri)

	// Storage for embedded content
	const virtualDocumentContents = new Map<string, string>();

	// TODO: check how virtualDocumentContents is cleaned up. If it's not, do it.
	workspace.registerTextDocumentContentProvider('embedded-content', {
		provideTextDocumentContent: uri => {
			const originalUri = uri.path.slice(1).split('.').slice(0, -1).join('.');
			const decodedUri = decodeURIComponent(originalUri);
			return virtualDocumentContents.get(decodedUri);
		}
	});

  workspace.onDidChangeTextDocument(({ document, contentChanges }) => {
    if (document.uri.toString() == lastDocumentKey) {
      console.log('contentChanges', contentChanges);
      tree = updateTree(document, contentChanges);
    }
	});

  const updateTree = (document: TextDocument, contentChanges: readonly TextDocumentContentChangeEvent[]) => {
	  if (!tree) return tree;

    for (const change of contentChanges) {
      const startIndex = change.rangeOffset;
      const oldEndIndex = change.rangeOffset + change.rangeLength;
      const newEndIndex = change.rangeOffset + change.text.length;
      const startPosition = asPoint(document.positionAt(startIndex));
      const oldEndPosition = asPoint(document.positionAt(oldEndIndex));
      const newEndPosition = asPoint(document.positionAt(newEndIndex));
      tree.edit({ startIndex, oldEndIndex, newEndIndex, startPosition, oldEndPosition, newEndPosition });
    }

    return parser.parse(document.getText(), tree);
  }

  const asPoint = (position: Position): Parser.Point => {
    return { row: position.line, column: position.character };
  }

  //TODO: clean up tree and friends
  // workspace.onDidCloseTextDocument((document) => {

  // });

	// Language client options
	const clientOptions: LanguageClientOptions = {
		documentSelector: [
			{ scheme: 'file', language: 'surface' }
		],
		middleware: {
			provideDefinition: async (document, position, token, _next) => {
				// TODO: watch the .ex file and update the value when it changes
				const aliases = extractElixirAliases(document)

				return provideDefinition(document, position, token, {
					tree: getTree(document),
					aliases: aliases,
					virtualDocumentContents: virtualDocumentContents,
					workspaceFolder: workspace.getWorkspaceFolder(document.uri).uri
				});
			},
			provideCompletionItem: async (document, position, context, token, _next) => {
				// TODO: watch the .ex file and update the value when it changes
				const aliases = extractElixirAliases(document)

				return provideCompletionItem(document, position, token, context, {
					tree: getTree(document),
					aliases: aliases,
					virtualDocumentContents: virtualDocumentContents
				})
			},
			provideHover: async (document, position, token, _next) => {
				// TODO: watch the .ex file and update the value when it changes
				const aliases = extractElixirAliases(document)

				return provideHover(document, position, token, {
					tree: getTree(document),
					aliases: aliases,
					virtualDocumentContents: virtualDocumentContents
				});
			}
		}
	};

	// Create and start the language client
	client = new LanguageClient(
		'surfaceLanguageServer',
		'Surface Language Server',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
