import * as path from 'path';
import * as fs from 'fs';
import { Uri, workspace } from 'vscode';

export interface PropSpec {
  name: string;
  type: string;
  opts: string;
  doc: string;
	line: number;
}

export interface AttrSpec {
  name: string;
  type: string;
  opts: string;
  doc: string;
  line: number;
  required: boolean;
}

export interface ComponentSpec {
  // TODO: rename to `doc`
	module: string,
	line?: number,
	type: 'surface' | 'def' | 'defp',
  docs: string;
	source: string;
  props?: Array<PropSpec>;
  attrs?: Array<AttrSpec>;
  imports?: Object;
  aliases?: Object;
}

const resolveAlias = (component: string, codeAliases: Object, compiledAliases: Object) => {
  compiledAliases = compiledAliases || {};
  const [alias, ...rest] = component.split('.');
  return [(codeAliases[alias] || compiledAliases[alias] || alias)].concat(rest).join('.');
}

export const resolveComponent = (entity: string, codeAliases: Object, compiledAliases: Object, compiledImports: Object) => {
  compiledImports = compiledImports || {};

  if (entity[0] == entity[0].toLowerCase()) {
    return compiledImports[entity];
  } else {
    return resolveAlias(entity, codeAliases, compiledAliases);
  }
}

// TODO: instead of reading the file many times, watch for changes, and reload it
export const findComponentsForAlias = (documentUri: Uri, alias: string): Array<string> => {
  // TODO: Try to read ElixirLS's folder first (`.elixir_ls/build/test/definitions/`),
  // if it's not available, try this one.
	const components_file = path.join(workspace.getWorkspaceFolder(documentUri).uri.fsPath, '_build/dev/definitions/components.json')
	let components = [];
	if (fs.existsSync(components_file)) {
		try {
			components = JSON.parse(fs.readFileSync(components_file).toString());
		} catch (e) {
			console.error(e);
		}
	}

	const modules = [];
	for (const component of components) {
		if (component.alias == alias) {
			modules.push(component.name);
		}
	}
	return modules;
};

// TODO: instead of reading the file many times, watch for changes, and reload it
export const getComponents = (documentUri: Uri): Array<{alias: string, name: string}> => {
  // TODO: Try to read ElixirLS's folder first (`.elixir_ls/build/test/definitions/`),
  // if it's not available, try this one.
	const components_file = path.join(workspace.getWorkspaceFolder(documentUri).uri.fsPath, '_build/dev/definitions/components.json')
	let components = [];
	if (fs.existsSync(components_file)) {
		try {
			components = JSON.parse(fs.readFileSync(components_file).toString());
		} catch (e) {
			console.error(e);
		}
	}
	return components;
};

// TODO: instead of reading the file many times, watch for changes, and reload it
const readComponentByName = (documentUri: Uri) => {
  // TODO: Try to read ElixirLS's folder first (`.elixir_ls/build/test/definitions/`),
  // if it's not available, try this one.
	const components_file = path.join(workspace.getWorkspaceFolder(documentUri).uri.fsPath, '_build/dev/definitions/components_by_name.json')

	if (fs.existsSync(components_file)) {
		try {
			return JSON.parse(fs.readFileSync(components_file).toString());
		} catch (e) {
			console.error(e);
		}
	}
	return {};
};

export const getComponentSpecByName = (name: string, documentUri: Uri): ComponentSpec | undefined => {
	const componentsByName = readComponentByName(documentUri);
	return componentsByName[name];
};
