import * as vscode from 'vscode';
import { Environment, EnvironmentVariable, createEnvironment, createVariable } from '../models/Environment';
import { StorageService } from '../storage/StorageService';

export type EnvironmentTreeItem = EnvironmentItem | VariableItem;

export class EnvironmentItem extends vscode.TreeItem {
    constructor(
        public readonly environment: Environment,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(environment.name, collapsibleState);
        this.contextValue = environment.isActive ? 'environment-active' : 'environment';
        this.iconPath = new vscode.ThemeIcon(
            environment.isActive ? 'check' : 'symbol-namespace'
        );
        this.tooltip = environment.isActive ? `${environment.name} (Active)` : environment.name;
        this.description = environment.isActive ? 'Active' : `${environment.variables.length} variables`;
    }
}

export class VariableItem extends vscode.TreeItem {
    constructor(
        public readonly variable: EnvironmentVariable,
        public readonly environmentId: string
    ) {
        super(variable.name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'variable';
        this.iconPath = new vscode.ThemeIcon(
            variable.enabled ? 'symbol-variable' : 'circle-slash'
        );
        // Mask the value for security
        const maskedValue = '*****';
        this.tooltip = `${variable.name} = ${maskedValue}`;
        this.description = variable.enabled ? maskedValue : `(disabled) ${maskedValue}`;
    }
}

export class EnvironmentsProvider implements vscode.TreeDataProvider<EnvironmentTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<EnvironmentTreeItem | undefined | null | void> = new vscode.EventEmitter<EnvironmentTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<EnvironmentTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private storageService: StorageService) { }

    private getActiveEnvironmentId(): string | undefined {
        return this.storageService.getActiveEnvironmentId();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: EnvironmentTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: EnvironmentTreeItem): Promise<EnvironmentTreeItem[]> {
        if (!element) {
            // Root level: return environments with active status based on stored active ID
            const activeId = this.getActiveEnvironmentId();
            const environments = await this.storageService.getEnvironments();
            return environments.map((e) => {
                // Clone environment with correct isActive based on stored ID
                const envWithActiveState = { ...e, isActive: e.id === activeId };
                return new EnvironmentItem(envWithActiveState, vscode.TreeItemCollapsibleState.Collapsed);
            });
        }

        if (element instanceof EnvironmentItem) {
            // Environment level: return variables
            return element.environment.variables.map(
                (v) => new VariableItem(v, element.environment.id)
            );
        }

        return [];
    }

    // CRUD Operations for Environments
    async addEnvironment(): Promise<Environment | undefined> {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter environment name',
            placeHolder: 'Development',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Environment name is required';
                }
                return null;
            },
        });

        if (name) {
            const environment = createEnvironment(name.trim());
            await this.storageService.saveEnvironment(environment);
            this.refresh();
            return environment;
        }
        return undefined;
    }

    async editEnvironment(item: EnvironmentItem): Promise<void> {
        const newName = await vscode.window.showInputBox({
            prompt: 'Enter new environment name',
            value: item.environment.name,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Environment name is required';
                }
                return null;
            },
        });

        if (newName) {
            const environment = await this.storageService.getEnvironment(item.environment.id);
            if (environment) {
                environment.name = newName.trim();
                environment.updatedAt = Date.now();
                await this.storageService.saveEnvironment(environment);
                this.refresh();
            }
        }
    }

    async deleteEnvironment(item: EnvironmentItem): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete environment "${item.environment.name}"?`,
            { modal: true },
            'Delete'
        );

        if (confirm === 'Delete') {
            await this.storageService.deleteEnvironment(item.environment.id);
            this.refresh();
        }
    }

    async duplicateEnvironment(item: EnvironmentItem): Promise<void> {
        const newEnvironment = createEnvironment(`${item.environment.name} (Copy)`);
        newEnvironment.variables = item.environment.variables.map((v) => ({ ...v }));
        newEnvironment.isActive = false;
        await this.storageService.saveEnvironment(newEnvironment);
        this.refresh();
    }

    async setActiveEnvironment(item: EnvironmentItem): Promise<void> {
        await this.storageService.setActiveEnvironmentId(item.environment.id);
        this.refresh();
        vscode.window.showInformationMessage(`Environment "${item.environment.name}" is now active.`);
    }

    // CRUD Operations for Variables
    async addVariable(envItem: EnvironmentItem): Promise<EnvironmentVariable | undefined> {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter variable name',
            placeHolder: 'API_KEY',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Variable name is required';
                }
                return null;
            },
        });

        if (!name) {
            return undefined;
        }

        const value = await vscode.window.showInputBox({
            prompt: `Enter value for ${name}`,
            placeHolder: 'Value',
        });

        if (value !== undefined) {
            const variable = createVariable(name.trim(), value);
            const environment = await this.storageService.getEnvironment(envItem.environment.id);
            if (environment) {
                environment.variables.push(variable);
                environment.updatedAt = Date.now();
                await this.storageService.saveEnvironment(environment);
                this.refresh();
                return variable;
            }
        }
        return undefined;
    }

    async editVariable(item: VariableItem): Promise<void> {
        const environment = await this.storageService.getEnvironment(item.environmentId);
        if (!environment) {
            return;
        }

        const variable = environment.variables.find((v) => v.name === item.variable.name);
        if (!variable) {
            return;
        }

        const name = await vscode.window.showInputBox({
            prompt: 'Enter variable name',
            value: variable.name,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Variable name is required';
                }
                return null;
            },
        });

        if (!name) {
            return;
        }

        const value = await vscode.window.showInputBox({
            prompt: `Enter value for ${name}`,
            value: variable.value,
        });

        if (value !== undefined) {
            variable.name = name.trim();
            variable.value = value;
            environment.updatedAt = Date.now();
            await this.storageService.saveEnvironment(environment);
            this.refresh();
        }
    }

    async deleteVariable(item: VariableItem): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete variable "${item.variable.name}"?`,
            { modal: true },
            'Delete'
        );

        if (confirm === 'Delete') {
            const environment = await this.storageService.getEnvironment(item.environmentId);
            if (environment) {
                environment.variables = environment.variables.filter(
                    (v) => v.name !== item.variable.name
                );
                environment.updatedAt = Date.now();
                await this.storageService.saveEnvironment(environment);
                this.refresh();
            }
        }
    }

    async toggleVariable(item: VariableItem): Promise<void> {
        const environment = await this.storageService.getEnvironment(item.environmentId);
        if (environment) {
            const variable = environment.variables.find((v) => v.name === item.variable.name);
            if (variable) {
                variable.enabled = !variable.enabled;
                environment.updatedAt = Date.now();
                await this.storageService.saveEnvironment(environment);
                this.refresh();
            }
        }
    }

    async getActiveEnvironment(): Promise<Environment | undefined> {
        return this.storageService.getActiveEnvironment();
    }

    async getEnvironments(): Promise<Environment[]> {
        return this.storageService.getEnvironments();
    }

    async resolveVariable(variableName: string): Promise<string | undefined> {
        const activeEnv = await this.getActiveEnvironment();
        if (activeEnv) {
            const variable = activeEnv.variables.find(
                (v) => v.name === variableName && v.enabled
            );
            return variable?.value;
        }
        return undefined;
    }
}
