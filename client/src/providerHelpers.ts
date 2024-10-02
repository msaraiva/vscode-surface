import { Uri, Position, commands, CompletionContext, CompletionList } from 'vscode';

// TODO: either make it work for all types of commands or extract the common parts os it can be reused by all providers
export const forwardToLanguageService = (lang: 'html' | 'ex' | 'css' | 'js', originalUri: string, code: string, position: Position, context: CompletionContext, virtualDocumentContents: Map<string, string>) => {
	virtualDocumentContents.set(originalUri, code);
	const vdocUriString = `embedded-content://${lang}/${encodeURIComponent(originalUri)}.${lang}`;
	const vdocUri = Uri.parse(vdocUriString);

	return commands.executeCommand<CompletionList>(
		'vscode.executeCompletionItemProvider',
		vdocUri,
		position,
		context.triggerCharacter
	);
}
