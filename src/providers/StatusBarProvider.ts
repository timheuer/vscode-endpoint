import * as vscode from 'vscode';
import { StorageService } from '../storage';

/**
 * Status bar item showing the active environment.
 * Clicking it opens a quick pick to switch environments.
 */
export class StatusBarProvider {
    private statusBarItem: vscode.StatusBarItem;
    private storageService: StorageService;
    private disposables: vscode.Disposable[] = [];

    constructor(storageService: StorageService) {
        this.storageService = storageService;

        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'endpoint.quickSwitchEnvironment';
        this.statusBarItem.tooltip = vscode.l10n.t('Click to switch environment');
        this.statusBarItem.show();

        this.update();
    }

    /**
     * Update the status bar text with the current active environment
     */
    async update(): Promise<void> {
        const activeEnv = await this.storageService.getActiveEnvironment();

        if (activeEnv) {
            this.statusBarItem.text = `$(globe) ${activeEnv.name}`;
            this.statusBarItem.tooltip = vscode.l10n.t('Active environment: {0}\nClick to switch', activeEnv.name);
        } else {
            this.statusBarItem.text = '$(globe) No Environment';
            this.statusBarItem.tooltip = vscode.l10n.t('No active environment\nClick to select one');
        }
    }

    /**
     * Show quick pick to switch environments
     */
    async showEnvironmentPicker(): Promise<void> {
        const environments = await this.storageService.getEnvironments();
        const activeId = this.storageService.getActiveEnvironmentId();

        if (environments.length === 0) {
            const create = await vscode.window.showInformationMessage(
                vscode.l10n.t('No environments found. Create one first?'),
                vscode.l10n.t('Create Environment')
            );
            if (create) {
                await vscode.commands.executeCommand('endpoint.addEnvironment');
            }
            return;
        }

        const items: (vscode.QuickPickItem & { envId: string | undefined })[] = environments.map(env => ({
            label: env.name,
            description: env.id === activeId ? vscode.l10n.t('(active)') : undefined,
            detail: vscode.l10n.t('{0} variables', env.variables.length),
            envId: env.id,
            picked: env.id === activeId,
        }));

        // Add option to clear active environment
        items.push({
            label: vscode.l10n.t('$(close) None'),
            description: vscode.l10n.t('Clear active environment'),
            envId: undefined,
        });

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: vscode.l10n.t('Select an environment'),
            title: vscode.l10n.t('Switch Environment'),
        });

        if (selected) {
            await this.storageService.setActiveEnvironmentId(selected.envId);
            await this.update();
            vscode.commands.executeCommand('endpoint.refreshEnvironments');

            if (selected.envId) {
                const env = environments.find(e => e.id === selected.envId);
                if (env) {
                    vscode.window.showInformationMessage(
                        vscode.l10n.t('Active environment: {0}', env.name)
                    );
                }
            } else {
                vscode.window.showInformationMessage(
                    vscode.l10n.t('Active environment cleared')
                );
            }
        }
    }

    dispose(): void {
        this.statusBarItem.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
