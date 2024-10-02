import * as assert from 'assert';
import * as vscode from 'vscode';
import { initParser, toEmbeddedCode, getCursorInfo } from '../../parserHelpers';

suite('toEmbeddedCode', () => {
	test('replace all content outside the tag body with white spaces', async () => {
		const parser = await getParser();

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

suite('getCursorInfo', () => {

	// lang css

	test('cursor at CSS - inside <style>', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
		<style>
			|.a {}
		</style>`);

		const {lang} = getCursorInfo(parser.parse(code), offset);
		assert.equal(lang, 'css')
	});

	test('cursor at CSS - <style>|</style>', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<style>|</style>
		`);

		const {lang} = getCursorInfo(parser.parse(code), offset);
		assert.equal(lang, 'css')
	});

	// lang javascript

	test('cursor at JS - inside <script>', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
		<script>
			if (true) {
			  |return false;
			}
		</script>`);

		const {lang} = getCursorInfo(parser.parse(code), offset);
		assert.equal(lang, 'javascript')
	});

	test('cursor at JS - <script>|</script>', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<script>|</script>
		`);

		const {lang} = getCursorInfo(parser.parse(code), offset);
		assert.equal(lang, 'javascript')
	});

	// tag_name

	test('cursor at tag_name - <d|iv>', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(
			`<d|iv>`
		);

		const {lang, scope, value} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_name')
		assert.equal(value, 'div')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_name - <div| >', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(
			`<div| >`
		);

		const {lang, scope, value} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_name')
		assert.equal(value, 'div')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_name - <div|>', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(
			`<div|>`
		);

		const {lang, scope, value} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_name')
		assert.equal(value, 'div')
		assert.equal(lang, 'surface')
	});

	// attribute_name

	test('cursor at attribute_name - <div cla|ss>', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(
			`<div cla|ss>`
		);

		const {lang, scope, value, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'attribute_name')
		assert.equal(value, 'class')
		assert.equal(tag, 'div')
		assert.equal(type, 'tag')
		assert.equal(lang, 'surface')
	});

	test('cursor at attribute_name - <div class|>', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(
			`<div class|>`
		);

		const {lang, scope, value} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'attribute_name')
		assert.equal(value, 'class')
		assert.equal(lang, 'surface')
	});

	test('cursor at attribute_name - <div class| >', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(
			`<div class| >`
		);

		const {lang, scope, value} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'attribute_name')
		assert.equal(value, 'class')
		assert.equal(lang, 'surface')
	});

	// component_name

	test('cursor at component_name - <For|m>', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(
			`<For|m>`
		);

		const {lang, scope, value} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'component_name')
		assert.equal(value, 'Form')
		assert.equal(lang, 'surface')
	});

	test('cursor at component_name - <Form|>', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(
			`<Form|>`
		);

		const {lang, scope, value} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'component_name')
		assert.equal(value, 'Form')
		assert.equal(lang, 'surface')
	});

	test('cursor at component_name - <Form| >', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(
			`<Form| >`
		);

		const {lang, scope, value} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'component_name')
		assert.equal(value, 'Form')
		assert.equal(lang, 'surface')
	});

	// tag_attributes

	test('cursor at tag_attributes - <div | >', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(
			`<div | >`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_attributes')
		assert.equal(tag, 'div')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_attributes - <div |>', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(
			`<div |>`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_attributes')
		assert.equal(tag, 'div')
		assert.equal(lang, 'surface')
	});

	test('cursor at component_attibutes - <Form | >', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(
			`<Form | >`
		);

		const {lang, scope, tag} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'component_attributes')
		assert.equal(tag, 'Form')
		assert.equal(lang, 'surface')
	});

	test('cursor at component_attibutes - <Form |>', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(
			`<Form |>`
		);

		const {lang, scope, tag} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'component_attributes')
		assert.equal(tag, 'Form')
		assert.equal(lang, 'surface')
	});

	// tag_body

	test('cursor at tag_body', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<div>
				|
			</div>
			`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_body')
		assert.equal(tag, 'div')
		assert.equal(type, 'tag')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_body (component)', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<Form>
				|
			</Form>
			`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_body')
		assert.equal(tag, 'Form')
		assert.equal(type, 'component')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_body - before tag', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<div>
				|<span></span>
			</div>
			`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_body')
		assert.equal(tag, 'div')
		assert.equal(type, 'tag')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_body - before tag (component)', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<Form>
				|<span></span>
			</Form>
			`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_body')
		assert.equal(tag, 'Form')
		assert.equal(type, 'component')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_body - after tag', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<div>
				<span></span>|
			</div>
			`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_body')
		assert.equal(tag, 'div')
		assert.equal(type, 'tag')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_body - after tag (component)', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<Form>
				<span></span>|
			</Form>
			`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_body')
		assert.equal(tag, 'Form')
		assert.equal(type, 'component')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_body, before text', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<div>
				|Hello!
			</div>
			`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_body')
		assert.equal(tag, 'div')
		assert.equal(type, 'tag')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_body, before text (component)', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<Form>
				|Hello!
			</Form>
			`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_body')
		assert.equal(tag, 'Form')
		assert.equal(type, 'component')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_body, after text', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<div>
				Hello!|
			</div>
			`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_body')
		assert.equal(tag, 'div')
		assert.equal(type, 'tag')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_body, after text (component)', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<Form>
				Hello!|
			</Form>
			`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_body')
		assert.equal(tag, 'Form')
		assert.equal(type, 'component')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_body, before expression', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<div>
				|{@id}
			</div>
			`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_body')
		assert.equal(tag, 'div')
		assert.equal(type, 'tag')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_body, before expression (component)', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<Form>
				|{@id}
			</Form>
			`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_body')
		assert.equal(tag, 'Form')
		assert.equal(type, 'component')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_body, after expression', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<div>
				{@id}|
			</div>
			`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_body')
		assert.equal(tag, 'div')
		assert.equal(type, 'tag')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_body, after expression (component)', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<Form>
				{@id}|
			</Form>
			`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_body')
		assert.equal(tag, 'Form')
		assert.equal(type, 'component')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_body - <div>|</div>', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<div>|</div>
			`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_body')
		assert.equal(tag, 'div')
		assert.equal(type, 'tag')
		assert.equal(lang, 'surface')
	});

	test('cursor at tag_body - <Form>|</Form>', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<Form>|</Form>
			`
		);

		const {lang, scope, tag, type} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'tag_body')
		assert.equal(tag, 'Form')
		assert.equal(type, 'component')
		assert.equal(lang, 'surface')
	});

	// expression

	test('cursor at expression in body', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<div>
				{@us|er}
			</div>
			`
		);

		const {lang, scope, value} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'expression')
		assert.equal(value, '@user')
		assert.equal(lang, 'surface')
	});

	test('cursor at expression in atrribute value', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<div id={@us|er.id}></div>
			`
		);

		const {lang, scope, value} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'expression')
		assert.equal(value, '@user.id')
		assert.equal(lang, 'surface')
	});

	test('cursor at the beginning of the expression', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<div>
				{|@user}
			</div>
			`
		);

		const {lang, scope, value} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'expression')
		assert.equal(value, '@user')
		assert.equal(lang, 'surface')
	});

	test('cursor at the end of the expression', async () => {
		const parser = await getParser();
		const {code, offset} = codeWithCursor(`
			<div>
				{@user|}
			</div>
			`
		);

		const {lang, scope, value} = getCursorInfo(parser.parse(code), offset);
		assert.equal(scope, 'expression')
		assert.equal(value, '@user')
		assert.equal(lang, 'surface')
	});

});

const getParser = async () => {
	// TODO: Try to make this work
	// const ext = vscode.extensions.getExtension("msaraiva.surface");
	// return await initParser(ext.uri);
	return initParser(vscode.Uri.joinPath(vscode.Uri.parse(__dirname), '../../../../'))
}

const codeWithCursor = (code: string) => {
	const offset = code.indexOf("|");
	return {code: code.replace('|', ''), offset: offset};
}
