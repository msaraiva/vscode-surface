import * as path from 'path';
import * as fs from 'fs';
import { Uri, workspace, Disposable, FileSystemWatcher, WorkspaceFolder, RelativePattern } from 'vscode';

const COMMON_FILE = 'common.json';
const COMPONENTS_FILE = 'components.json';
const COMPONENTS_BY_NAME_FILE = 'components_by_name.json';

type CommonSpec = { doc: string, type: 'expression' | 'event' | 'any', reference?: {label: string, link: string} };
type CommonSpecs = { [key: string]: CommonSpec; };
type Common = {
	directives_specs: CommonSpecs | {},
	tag_attributes_specs: CommonSpecs | {},
	slot_props_specs: CommonSpecs | {},
	tag_directives: Array<string> | [],
	component_directives: Array<string> | [],
	macro_component_directives: Array<string> | [],
	slot_entry_directives: Array<string> | [],
	slot_directives: Array<string> | [],
};

const emptyCommon = {
	directives_specs: {},
	tag_attributes_specs: {},
	slot_props_specs: {},
	tag_directives: [],
	component_directives: [],
	macro_component_directives: [],
	slot_entry_directives: [],
	slot_directives: []
};

export class SurfaceDefinitions implements Disposable {
	private workspaceFolder: WorkspaceFolder;
	private definitionsFolder: string | undefined;
	private components: Array<{alias: string, name: string}>;
	private componentsByName: { [key: string]: ComponentSpec; };
	private common: Common;
	private watcher: FileSystemWatcher;

	constructor(workspaceFolder: WorkspaceFolder, definitionsFolder: string | undefined) {
		this.workspaceFolder = workspaceFolder;
		this.definitionsFolder = definitionsFolder;
		this.setup();
	}

	private setup() {
		this.components = [];
		this.componentsByName = {};
		this.common = emptyCommon;

		if (this.watcher) {
			this.watcher.dispose();
		}

		if (this.definitionsFolder && this.definitionsFolder != '') {
			console.log('Surface:', 'tracking definitions at ', this.definitionsFolder);

			this.updateCommon();
			this.updateComponents();
			this.updateComponentsByName();
			const pattern = path.join(this.definitionsFolder, `{${COMPONENTS_FILE},${COMPONENTS_BY_NAME_FILE},${COMMON_FILE}}`)
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

	getCommon() {
		return this.common;
	}

	getDirectivesForComponent(): Array<{ name: string, doc: string, type: 'expression' | 'event' | 'any' }> {
    const specs = this.common.directives_specs;
    return this.common.component_directives.map((name: string) => {
      const spec = specs[name];
      return {name: name, doc: formatDoc(spec), type: spec.type};
    });
	}

	getDirectiveDoc(name: string): string {
    return formatDoc(this.common.directives_specs[name]);
	}

	getTagAttributeDoc(name: string): string {
    return formatDoc(this.common.tag_attributes_specs[name]);
	}

	getDirectivesForTag(): Array<{ name: string, doc: string, type: 'expression' | 'event' | 'any' }> {
    const specs = this.common.directives_specs;
    return this.common.tag_directives.map((name: string) => {
      const spec = specs[name];
      return {name: name, doc: formatDoc(spec), type: spec.type};
    });
	}

	getAttributesForTag(): Array<{ name: string, doc: string, type: 'expression' | 'event' | 'any' }> {
    let items = [];
    for (const [attr, spec] of Object.entries(this.common.tag_attributes_specs)) {
      items.push({name: attr, doc: formatDoc(spec), type: spec.type});
    }
		return items;
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

	private updateCommon() {
		const file = path.join(this.workspaceFolder.uri.fsPath, this.definitionsFolder, COMMON_FILE);
		this.common = readJSONFile(file, emptyCommon);
	}

	private onDefinitionsChanged(uri: Uri): void {
		if (uri.fsPath.endsWith('common.json')) {
			this.updateCommon();
		}

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

const formatDoc = (spec: CommonSpec) => {
	if (spec.reference) {
		return spec.doc + `\n### Reference\n\n$(arrow-small-right) [${spec.reference.label}](${spec.reference.link})`;
	}
	return spec.doc;
}
