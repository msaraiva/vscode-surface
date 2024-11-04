import * as assert from 'assert';
import * as vscode from 'vscode';
import { initParser, toEmbeddedCode, getCursorInfo, extractElixirModuleAliases, getLastModuleAliasPosition, getLastModuleImportPosition, getLastModuleUsePosition, getInsertAliasPosition, EmbeddedContent, TagName, AttributeName, InsertAttributes, TagBody, Expression } from '../../parserHelpers';
import { Position, Range } from 'vscode';

suite('extractElixirModuleAliases', () => {
	test('extract all aliases from elixir code', async () => {
		const parser = await getParser('elixir');

		const code =`
		defmodule TestModule do
  		use Surface.Component

			defmodule MyInnerModule do
				alias Surface.Components.ShouldNotBeListed
			end

  		alias Surface.Components.Form
  		alias Surface.Components.Field
  		alias Surface.Components.Form.ColorInput, as: MyColorInput
  		alias Surface.Components.Form.{TextInput, Checkbox}

			def func do
				alias Surface.Components.ShouldNotBeListed
			end
		end
		`;

		const aliases = extractElixirModuleAliases(parser.parse(code).rootNode)

		assert.deepEqual(aliases, {
      "Checkbox": "Surface.Components.Form.Checkbox",
      "Field": "Surface.Components.Field",
      "Form": "Surface.Components.Form",
      "MyColorInput": "Surface.Components.Form.ColorInput",
      "TextInput": "Surface.Components.Form.TextInput"
    });
	});
});

suite('getLastModuleAliasPosition', () => {
	test('get the last module alias position, if any', async () => {
		const parser = await getParser('elixir');

		const code =`
		defmodule TestModule do
  		use Surface.Component

      alias Surface.Components.Form
      alias Surface.Components.Field
      alias Surface.Components.Form.{TextInput, Checkbox}

		end
		`;

		const position = getLastModuleAliasPosition(parser.parse(code).rootNode)

		assert.deepEqual(position, new Position(6, 57));
	});
});

suite('getLastModuleImportPosition', () => {
	test('get the last module import position, if any', async () => {
		const parser = await getParser('elixir');

		const code =`
		defmodule TestModule do
  		use Surface.Component

      import Surface.Components.Utils, only: [opts_to_phx_opts: 1]
      import Surface.Components.Form.Utils

		end
		`;

		const position = getLastModuleImportPosition(parser.parse(code).rootNode)

		assert.deepEqual(position, new Position(5, 42));
	});
});

suite('getLastModuleUsePosition', () => {
	test('get the last module use position, if any', async () => {
		const parser = await getParser('elixir');

		const code =`
		defmodule TestModule do
      @moduledoc "doc"
      use DynamicSupervisor
      use SimplePricing.Logger

		end
		`;

		const position = getLastModuleUsePosition(parser.parse(code).rootNode)

		assert.deepEqual(position, new Position(4, 30));
	});
});

suite('getLastModuleUsePosition', () => {
	test('after use', async () => {
		const parser = await getParser('elixir');

		const code =`
		defmodule TestModule do
      @moduledoc "doc"
      use Surface.Component

		end
		`;

		const position = getInsertAliasPosition(parser.parse(code).rootNode)

		assert.deepEqual(position, new Position(3, 27));
	});

	test('after import', async () => {
		const parser = await getParser('elixir');

		const code =`
		defmodule TestModule do
      @moduledoc "doc"
			use Surface.Component
      import Surface.Components.Form.Utils

		end
		`;

		const position = getInsertAliasPosition(parser.parse(code).rootNode)

		assert.deepEqual(position, new Position(4, 42));
	});

	test('after alias', async () => {
		const parser = await getParser('elixir');

		const code =`
		defmodule TestModule do
      @moduledoc "doc"
			use Surface.Component
      import Surface.Components.Form.Utils
      alias Surface.Components.Form

		end
		`;

		const position = getInsertAliasPosition(parser.parse(code).rootNode)

		assert.deepEqual(position, new Position(5, 35));
	});
});

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

		const {type, value, range, parentTag} = getCursorInfo(parser.parse(code), offset) as TagName;
		assert.equal(type, 'TagName')
		assert.equal(value, 'Form')
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
