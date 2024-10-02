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

export interface ComponentSpec {
  // TODO: rename to `doc`
  docs: string;
  props: Array<PropSpec>;
	source: string;
}

// TODO: instead of reading the file many times, watch for changes, and reload it
export const getComponents = (documentUri: Uri) => {
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
