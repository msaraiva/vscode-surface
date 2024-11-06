import * as assert from 'assert';
import * as vscode from 'vscode';
import { initParser } from '../../parserHelpers';
import { Range } from 'vscode';
import { getCursorInfo, EmbeddedContent, TagName, AttributeName, InsertAttributes, TagBody, Expression } from '../../cursorHelpers';

suite('getCursorInfo', () => {

	// lang css

	test('cursor at CSS - inside <style>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
		<style>
			|.a {}
		</style>`);

		const {lang} = getCursorInfo(parser.parse(code), offset) as EmbeddedContent;
		assert.equal(lang, 'css')
	});

	test('cursor at CSS - <style>|</style>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<style>|</style>
		`);

		const {lang} = getCursorInfo(parser.parse(code), offset) as EmbeddedContent;
		assert.equal(lang, 'css')
	});

	// lang javascript

	test('cursor at JS - inside <script>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
		<script>
			if (true) {
			  |return false;
			}
		</script>`);

		const {lang} = getCursorInfo(parser.parse(code), offset) as EmbeddedContent;
		assert.equal(lang, 'javascript')
	});

	test('cursor at JS - <script>|</script>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<script>|</script>
		`);

		const {lang} = getCursorInfo(parser.parse(code), offset) as EmbeddedContent;
		assert.equal(lang, 'javascript')
	});

	// tag_name

	test('cursor at tag_name - <d|iv>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<d|iv></div>`
		);

		const {type, value, range, parentTag} = getCursorInfo(parser.parse(code), offset) as TagName;
		assert.equal(type, 'TagName')
		assert.equal(parentTag.kind, 'tag')
		assert.equal(value, 'div')
		assert.deepEqual(range, new Range(0, 1, 0, 4))
		assert.deepEqual(parentTag.closingTagName.range, new Range(0, 7, 0, 10))
	});

	test('cursor at tag_name - <div| >', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<div| ></div>`
		);

		const {type, value, range, parentTag} = getCursorInfo(parser.parse(code), offset) as TagName;
		assert.equal(type, 'TagName')
		assert.equal(value, 'div')
    assert.equal(parentTag.kind, 'tag')
		assert.deepEqual(range, new Range(0, 1, 0, 4))
		assert.deepEqual(parentTag.closingTagName.range, new Range(0, 8, 0, 11))
	});

	test('cursor at tag_name - <div|>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<div|></div>`
		);

		const {type, value, range, parentTag} = getCursorInfo(parser.parse(code), offset) as TagName;
		assert.equal(type, 'TagName')
		assert.equal(value, 'div')
    assert.equal(parentTag.kind, 'tag')
    assert.equal(parentTag.isSelfClosing, false)
		assert.deepEqual(range, new Range(0, 1, 0, 4))
		assert.deepEqual(parentTag.closingTagName.range, new Range(0, 7, 0, 10))
	});

	// tag_name (self closing)

	test('cursor at self closing tag_name - <d|iv/>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<d|iv/>`
		);

		const {type, value, range, parentTag} = getCursorInfo(parser.parse(code), offset) as TagName;
		assert.equal(type, 'TagName')
		assert.equal(parentTag.kind, 'tag')
		assert.equal(value, 'div')
		assert.deepEqual(range, new Range(0, 1, 0, 4))
		assert.equal(parentTag.isSelfClosing, true)
		assert.equal(parentTag.closingTagName, undefined)
	});

	// attribute_name

	test('cursor at attribute_name - <div cla|ss>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<div cla|ss>`
		);

		const {type, value, parentAttribute} = getCursorInfo(parser.parse(code), offset) as AttributeName;
		assert.equal(type, 'AttributeName')
		assert.equal(value, 'class')
		assert.equal(parentAttribute.parentTag.type, 'Tag')
		assert.equal(parentAttribute.parentTag.openingTagName.value, 'div')
	});

	test('cursor at attribute_name - <div class|>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<div class|>`
		);

		const {type, value, parentAttribute} = getCursorInfo(parser.parse(code), offset) as AttributeName;
		assert.equal(type, 'AttributeName')
		assert.equal(value, 'class')
		assert.equal(parentAttribute.parentTag.type, 'Tag')
		assert.equal(parentAttribute.parentTag.openingTagName.value, 'div')
	});

	test('cursor at attribute_name - <div class| >', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<div class| >`
		);

		const {type, value, parentAttribute} = getCursorInfo(parser.parse(code), offset) as AttributeName;
		assert.equal(type, 'AttributeName')
		assert.equal(value, 'class')
		assert.equal(parentAttribute.parentTag.type, 'Tag')
		assert.equal(parentAttribute.parentTag.openingTagName.value, 'div')
	});

  test('cursor at attribute_name - <div class|="">', async () => {
    const parser = await getParser('surface');
    const { code, offset } = codeWithCursor(
      `<div class|="">`
    );

		const {type, value, parentAttribute} = getCursorInfo(parser.parse(code), offset) as AttributeName;
		assert.equal(type, 'AttributeName')
		assert.equal(value, 'class')
		assert.equal(parentAttribute.parentTag.kind, 'tag')
		assert.equal(parentAttribute.parentTag.openingTagName.value, 'div')
  });

	// component_name

	test('cursor at component_name - <For|m>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<For|m></Form>`
		);

		const {type, value, entity, range, parentTag} = getCursorInfo(parser.parse(code), offset) as TagName;
		assert.equal(type, 'TagName')
		assert.equal(value, 'Form')
		assert.equal(entity, 'Form')
    assert.equal(parentTag.kind, 'component')
		assert.deepEqual(range, new Range(0, 1, 0, 5))
		assert.deepEqual(parentTag.closingTagName.range, new Range(0, 8, 0, 12))
	});

	// component_name (self closing)

	test('cursor at self closing component_name - <For|m>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<For|m/>`
		);

		const {type, value, range, parentTag} = getCursorInfo(parser.parse(code), offset) as TagName;
		assert.equal(type, 'TagName')
		assert.equal(value, 'Form')
    assert.equal(parentTag.kind, 'component')
		assert.deepEqual(range, new Range(0, 1, 0, 5))
		assert.equal(parentTag.isSelfClosing, true)
		assert.equal(parentTag.closingTagName, undefined)
	});

	test('cursor at component_name - <Form|>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<Form|></Form>`
		);

		const {type, value, range, parentTag} = getCursorInfo(parser.parse(code), offset) as TagName;
		assert.equal(type, 'TagName')
		assert.equal(value, 'Form')
    assert.equal(parentTag.kind, 'component')
		assert.deepEqual(range, new Range(0, 1, 0, 5))
		assert.deepEqual(parentTag.closingTagName.range, new Range(0, 8, 0, 12))
	});

	test('cursor at component_name - <Form| >', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<Form| ></Form>`
		);

		const {type, value, range, parentTag} = getCursorInfo(parser.parse(code), offset) as TagName;
		assert.equal(type, 'TagName')
		assert.equal(value, 'Form')
    assert.equal(parentTag.kind, 'component')
		assert.deepEqual(range, new Range(0, 1, 0, 5))
		assert.deepEqual(parentTag.closingTagName.range, new Range(0, 9, 0, 13))
	});

  // macro_component_name

	test('cursor at macro_component_name - <#For|m>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<#For|m></#Form>`
		);

		const {type, value, entity, range, parentTag} = getCursorInfo(parser.parse(code), offset) as TagName;
		assert.equal(type, 'TagName')
		assert.equal(value, '#Form')
		assert.equal(entity, 'Form')
    assert.equal(parentTag.kind, 'macro_component')
		assert.deepEqual(range, new Range(0, 1, 0, 6))
		assert.equal(parentTag.isSelfClosing, false)
		assert.deepEqual(parentTag.closingTagName.range, new Range(0, 9, 0, 14))
	});

  // function_component_name

	test('cursor at function_component_name - <.for|m>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<.for|m></.form>`
		);

		const {type, value, entity, range, parentTag} = getCursorInfo(parser.parse(code), offset) as TagName;
		assert.equal(type, 'TagName')
		assert.equal(value, '.form')
		assert.equal(entity, 'form')
    assert.equal(parentTag.kind, 'function_component')
		assert.deepEqual(range, new Range(0, 1, 0, 6))
		assert.equal(parentTag.isSelfClosing, false)
		assert.deepEqual(parentTag.closingTagName.range, new Range(0, 9, 0, 14))
	});

	// tag_attributes

	test('cursor at tag_attributes - <div | >', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<div | >`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as InsertAttributes;
		assert.equal(type, 'InsertAttributes')
		assert.equal(parentTag.openingTagName.value, 'div')
		assert.equal(parentTag.kind, 'tag')
	});

	test('cursor at tag_attributes - <div |>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<div |>`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as InsertAttributes;
		assert.equal(type, 'InsertAttributes')
		assert.equal(parentTag.openingTagName.value, 'div')
		assert.equal(parentTag.kind, 'tag')
	});

	test('cursor at self closing tag_attributes - <div |>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<div |/>`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as InsertAttributes;
		assert.equal(type, 'InsertAttributes')
		assert.equal(parentTag.openingTagName.value, 'div')
		assert.equal(parentTag.kind, 'tag')
	});

	test('cursor at component_attibutes - <Form | >', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<Form | >`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as InsertAttributes;
		assert.equal(type, 'InsertAttributes')
		assert.equal(parentTag.openingTagName.value, 'Form')
    assert.equal(parentTag.kind, 'component')
	});

	test('cursor at self closing component_attibutes - <Form | >', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<Form | />`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as InsertAttributes;
		assert.equal(type, 'InsertAttributes')
		assert.equal(parentTag.openingTagName.value, 'Form')
    assert.equal(parentTag.kind, 'component')
	});

	test('cursor at component_attibutes - <Form |>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(
			`<Form |>`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as InsertAttributes;
		assert.equal(type, 'InsertAttributes')
		assert.equal(parentTag.openingTagName.value, 'Form')
    assert.equal(parentTag.kind, 'component')
	});

	// tag_body

	test('cursor at tag_body', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<div>
				|
			</div>
			`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as TagBody;
		assert.equal(type, 'TagBody')
		assert.equal(parentTag.openingTagName.value, 'div')
		assert.equal(parentTag.kind, 'tag')
	});

	test('cursor at tag_body (component)', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<Form>
				|
			</Form>
			`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as TagBody;
		assert.equal(type, 'TagBody')
		assert.equal(parentTag.openingTagName.value, 'Form')
		assert.equal(parentTag.kind, 'component')
	});

	test('cursor at tag_body - before tag', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<div>
				|<span></span>
			</div>
			`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as TagBody;
		assert.equal(type, 'TagBody')
		assert.equal(parentTag.openingTagName.value, 'div')
		assert.equal(parentTag.kind, 'tag')
	});

	test('cursor at tag_body - before tag (component)', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<Form>
				|<span></span>
			</Form>
			`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as TagBody;
		assert.equal(type, 'TagBody')
		assert.equal(parentTag.openingTagName.value, 'Form')
		assert.equal(parentTag.kind, 'component')
	});

	test('cursor at tag_body - after tag', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<div>
				<span></span>|
			</div>
			`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as TagBody;
		assert.equal(type, 'TagBody')
		assert.equal(parentTag.openingTagName.value, 'div')
		assert.equal(parentTag.kind, 'tag')
	});

	test('cursor at tag_body - after tag (component)', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<Form>
				<span></span>|
			</Form>
			`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as TagBody;
		assert.equal(type, 'TagBody')
		assert.equal(parentTag.openingTagName.value, 'Form')
		assert.equal(parentTag.kind, 'component')
	});

	test('cursor at tag_body, before text', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<div>
				|Hello!
			</div>
			`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as TagBody;
		assert.equal(type, 'TagBody')
		assert.equal(parentTag.openingTagName.value, 'div')
		assert.equal(parentTag.kind, 'tag')
	});

	test('cursor at tag_body, before text (component)', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<Form>
				|Hello!
			</Form>
			`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as TagBody;
		assert.equal(type, 'TagBody')
		assert.equal(parentTag.openingTagName.value, 'Form')
		assert.equal(parentTag.kind, 'component')
	});

	test('cursor at tag_body, after text', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<div>
				Hello!|
			</div>
			`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as TagBody;
		assert.equal(type, 'TagBody')
		assert.equal(parentTag.openingTagName.value, 'div')
		assert.equal(parentTag.kind, 'tag')
	});

	test('cursor at tag_body, after text (component)', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<Form>
				Hello!|
			</Form>
			`
		);

    const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as TagBody;
		assert.equal(type, 'TagBody')
		assert.equal(parentTag.openingTagName.value, 'Form')
		assert.equal(parentTag.kind, 'component')
	});

	test('cursor at tag_body, before expression', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<div>
				|{@id}
			</div>
			`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as TagBody;
		assert.equal(type, 'TagBody')
		assert.equal(parentTag.openingTagName.value, 'div')
		assert.equal(parentTag.kind, 'tag')
	});

	test('cursor at tag_body, before expression (component)', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<Form>
				|{@id}
			</Form>
			`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as TagBody;
		assert.equal(type, 'TagBody')
		assert.equal(parentTag.openingTagName.value, 'Form')
		assert.equal(parentTag.kind, 'component')
	});

	test('cursor at tag_body, after expression', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<div>
				{@id}|
			</div>
			`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as TagBody;
		assert.equal(type, 'TagBody')
		assert.equal(parentTag.openingTagName.value, 'div')
		assert.equal(parentTag.kind, 'tag')
	});

	test('cursor at tag_body, after expression (component)', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<Form>
				{@id}|
			</Form>
			`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as TagBody;
		assert.equal(type, 'TagBody')
		assert.equal(parentTag.openingTagName.value, 'Form')
		assert.equal(parentTag.kind, 'component')
	});

	test('cursor at tag_body - <div>|</div>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<div>|</div>
			`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as TagBody;
		assert.equal(type, 'TagBody')
		assert.equal(parentTag.openingTagName.value, 'div')
		assert.equal(parentTag.kind, 'tag')

	});

	test('cursor at tag_body - <Form>|</Form>', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<Form>|</Form>
			`
		);

		const {type, parentTag} = getCursorInfo(parser.parse(code), offset) as TagBody;
		assert.equal(type, 'TagBody')
		assert.equal(parentTag.openingTagName.value, 'Form')
		assert.equal(parentTag.kind, 'component')
	});

	// expression

	test('cursor at expression in body', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<div>
				{@us|er}
			</div>
			`
		);

		const {type, value} = getCursorInfo(parser.parse(code), offset) as Expression;
		assert.equal(type, 'Expression')
		assert.equal(value, '@user')
	});

	test('cursor at expression in atrribute value', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<div id={@us|er.id}></div>
			`
		);

		const {type, value} = getCursorInfo(parser.parse(code), offset) as Expression;
		assert.equal(type, 'Expression')
		assert.equal(value, '@user.id')
	});

	test('cursor at the beginning of the expression', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<div>
				{|@user}
			</div>
			`
		);

		const {type, value} = getCursorInfo(parser.parse(code), offset) as Expression;
		assert.equal(type, 'Expression')
		assert.equal(value, '@user')
	});

	test('cursor at the end of the expression', async () => {
		const parser = await getParser('surface');
		const {code, offset} = codeWithCursor(`
			<div>
				{@user + {} |}
			</div>
			`
		);

		const {type, value} = getCursorInfo(parser.parse(code), offset) as Expression;
		assert.equal(type, 'Expression')
		assert.equal(value, '@user + {} ')
	});

});

const getParser = async (lang) => {
	// TODO: Try to make this work
	// const ext = vscode.extensions.getExtension("msaraiva.surface");
	// return await initParser(ext.uri);
	return initParser(vscode.Uri.joinPath(vscode.Uri.parse(__dirname), '../../../../'), lang)
}

const codeWithCursor = (code: string) => {
	const offset = code.indexOf("|");
	return {code: code.replace('|', ''), offset: offset};
}
