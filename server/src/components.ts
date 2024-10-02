import * as path from 'path';
import * as fs from 'fs';

export interface PropSpec {
  name: string;
  type: string;
  opts: string;
  doc: string;
}

export interface ComponentSpec {
  // TODO: rename to `doc`
  docs: string;
  props: Array<PropSpec>;
}

// TODO: instead of reading the file many times, watch for changes, and reload it
const readComponentByName = (workspaceFolder: string) => {
	const components_file = path.join(workspaceFolder, '_build/dev/definitions/components_by_name.json')

	if (fs.existsSync(components_file)) {
		try {
			return JSON.parse(fs.readFileSync(components_file).toString());
		} catch (e) {
			console.error(e);
		}
	}
	return {};
};

export const getComponentSpecByName = (name: string, workspaceFolder: string): ComponentSpec | undefined => {
	const componentsByName = readComponentByName(workspaceFolder);
	return componentsByName[name];
};
