import * as path from 'path';
import * as fs from 'fs';
import { Uri, workspace, Disposable, FileSystemWatcher, WorkspaceFolder, RelativePattern } from 'vscode';

const COMPONENTS_FILE = 'components.json';
const COMPONENTS_BY_NAME_FILE = 'components_by_name.json';

export class SurfaceDefinitions implements Disposable {
	private workspaceFolder: WorkspaceFolder;
	private definitionsFolder: string | undefined;
	private components: Array<{alias: string, name: string}>;
	private componentsByName: { [key: string]: ComponentSpec; };
	private watcher: FileSystemWatcher;

	constructor(workspaceFolder: WorkspaceFolder, definitionsFolder: string | undefined) {
		this.workspaceFolder = workspaceFolder;
		this.definitionsFolder = definitionsFolder;
		this.setup();
	}

	private setup() {
		this.components = [];
		this.componentsByName = {};

		if (this.watcher) {
			this.watcher.dispose();
		}

		if (this.definitionsFolder && this.definitionsFolder != '') {
			console.log('Surface:', 'tracking definitions at ', this.definitionsFolder);

			this.updateComponents();
			this.updateComponentsByName();
			const pattern = path.join(this.definitionsFolder, `{${COMPONENTS_FILE},${COMPONENTS_BY_NAME_FILE}}`)
			this.watcher = workspace.createFileSystemWatcher(
				new RelativePattern(this.workspaceFolder, pattern)
			);
			this.watcher.onDidChange((uri: Uri) => this.onDefinitionsChanged(uri));
		}
	}

	// To be used by the extension client when the related configuration change
	updateDefinitionsFolder(definitionsFolder: string | undefined) {
		this.definitionsFolder = definitionsFolder;
		this.setup()
	}

	getComponents() {
		return this.components;
	}

	getComponentSpecByName(name: string): ComponentSpec | undefined {
		return this.componentsByName[name];
	}

	getComponentSpecByEntity(entity: string, hostModule: string, hostModuleAliases: Object): ComponentSpec | undefined {
		const component = this.resolveComponent(entity, hostModule, hostModuleAliases);
		return this.componentsByName[component];
	}

	resolveComponent(entity: string, hostModule: string, hostModuleAliases: Object): string {
		const hostModuleSpec = this.getComponentSpecByName(hostModule);
		return resolveComponent(entity, hostModuleAliases, hostModuleSpec.aliases, hostModuleSpec.imports);
	}

	getComponentsForAlias(moduleAlias: string): Array<string> {
		const modules = [];
		for (const component of this.getComponents()) {
			if (component.alias == moduleAlias) {
				modules.push(component.name);
			}
		}
		return modules;
	}

	private updateComponents() {
		const file = path.join(this.workspaceFolder.uri.fsPath, this.definitionsFolder, COMPONENTS_FILE);
		this.components = readJSONFile(file, []);
		console.log('Surface:', `${this.components.length} definitions updated`);
	}

	private updateComponentsByName() {
		const file = path.join(this.workspaceFolder.uri.fsPath, this.definitionsFolder, COMPONENTS_BY_NAME_FILE);
		this.componentsByName = readJSONFile(file, {});
	}

	private onDefinitionsChanged(uri: Uri): void {
		if (uri.fsPath.endsWith('components.json')) {
			this.updateComponents();
		}

		if (uri.fsPath.endsWith('components_by_name.json')) {
			this.updateComponentsByName();
		}
	}

	dispose(): void {
		this.watcher.dispose();
	}
}

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
	module: string,
	line?: number,
	// TODO: 'defmodule' | 'def' | 'defp',
	type: 'surface' | 'def' | 'defp',
  // TODO: rename to `doc`
  docs: string;
	source: string;
  props?: Array<PropSpec>;
  attrs?: Array<AttrSpec>;
  imports?: Object;
  aliases?: Object;
}

const readJSONFile = (filePath: string, defaultValue: any) => {
	if (fs.existsSync(filePath)) {
		try {
			return JSON.parse(fs.readFileSync(filePath).toString());
		} catch (e) {
			console.error(e);
		}
	}
	return defaultValue;
};

const resolveAlias = (component: string, codeAliases: Object, compiledAliases: Object) => {
  compiledAliases = compiledAliases || {};
  const [alias, ...rest] = component.split('.');
  return [(codeAliases[alias] || compiledAliases[alias] || alias)].concat(rest).join('.');
}

const resolveComponent = (entity: string, codeAliases: Object, compiledAliases: Object, compiledImports: Object) => {
  compiledImports = compiledImports || {};

  if (entity[0] == entity[0].toLowerCase()) {
    return compiledImports[entity];
  } else {
    return resolveAlias(entity, codeAliases, compiledAliases);
  }
}
