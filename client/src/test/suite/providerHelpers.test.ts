import * as assert from 'assert';
import * as vscode from 'vscode';
import { initParser } from '../../parserHelpers';
import { toEmbeddedCode } from '../../providersHelpers';

suite('toEmbeddedCode', () => {
	test('replace all content outside the tag body with white spaces', async () => {
		const parser = await getParser('surface');

		const code = [
			'1',
			'<div></div>',
			'2',
			'<style>',
			'	.a {};',
			'	.b {};',
			'</style>',
			'3',
			'<div>',
			'</div>',
			'4',
			'  <style></style>',
			'5',
			'<style> .c {} </style>',
			'6'
		].join('\n');

		const embeddedCode = toEmbeddedCode(parser.parse(code), code, 'style');

		assert.equal(embeddedCode, [
			'',
			'',
			'',
			'',
			'	.a {};',
			'	.b {};',
			'',
			'',
			'',
			'',
			'',
			'',
			'',
			'        .c {}'
		].join('\n'))
	});
});

const getParser = async (lang) => {
	// TODO: Try to make this work
	// const ext = vscode.extensions.getExtension("msaraiva.surface");
	// return await initParser(ext.uri);
	return initParser(vscode.Uri.joinPath(vscode.Uri.parse(__dirname), '../../../../'), lang)
}
