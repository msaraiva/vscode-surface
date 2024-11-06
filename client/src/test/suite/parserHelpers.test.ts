import * as assert from 'assert';
import * as vscode from 'vscode';
import { initParser, extractElixirModuleAliases, getLastModuleAliasPosition, getLastModuleImportPosition, getLastModuleUsePosition, getInsertAliasPosition } from '../../parserHelpers';
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

suite('getInsertAliasPosition', () => {
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

const getParser = async (lang) => {
	// TODO: Try to make this work
	// const ext = vscode.extensions.getExtension("msaraiva.surface");
	// return await initParser(ext.uri);
	return initParser(vscode.Uri.joinPath(vscode.Uri.parse(__dirname), '../../../../'), lang)
}
