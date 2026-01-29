import * as vscode from 'vscode';
import { CollectionsProvider, CollectionItem, RequestItem } from './providers/CollectionsProvider';
import { EnvironmentsProvider, EnvironmentItem, VariableItem } from './providers/EnvironmentsProvider';
import { HistoryProvider, HistoryTreeItem } from './providers/HistoryProvider';
import { DirtyStateProvider } from './providers/DirtyStateProvider';
import { StatusBarProvider } from './providers/StatusBarProvider';
import { EnvironmentDiagnosticsProvider } from './providers/EnvironmentDiagnosticsProvider';
import { RequestPanel } from './webview/RequestPanel';
import { HistoryPanel } from './webview/HistoryPanel';
import { CollectionSettingsPanel } from './webview/CollectionSettingsPanel';
import { registerResponseContentProvider } from './http/ResponseContentProvider';
import { StorageService, VariableService, RepoCollectionService } from './storage';
import { Collection } from './models/Collection';
import { createImportExportCommands, createCopyAsCodeCommand } from './commands';
import { initializeLogger, disposeLogger, getLogger } from './logger';

export function activate(context: vscode.ExtensionContext) {
	// Initialize logger first
	const logger = initializeLogger(context);
	logger.info('Endpoint extension activating');

	// Register the response content provider for virtual documents
	registerResponseContentProvider(context);

	// Initialize storage and variable services
	const storageService = new StorageService(context);
	const variableService = new VariableService(storageService);
	logger.debug('Storage and variable services initialized');

	// Enable Settings Sync for collections and environments
	// Collections: all data (requests, headers, auth, etc.) will sync
	// Environments: names and variable metadata will sync (values are in SecretStorage which VS Code syncs automatically)
	// Active environment ID and history are intentionally excluded (machine-specific)
	context.globalState.setKeysForSync([
		'endpoint.collections',
		'endpoint.environments'
	]);
	logger.debug('Settings Sync enabled for collections and environments');

	// Initialize RequestPanel with services
	RequestPanel.initialize(storageService, variableService);

	// Initialize HistoryPanel with services
	HistoryPanel.initialize(storageService);

	// Initialize providers with StorageService
	const collectionsProvider = new CollectionsProvider(storageService);
	const environmentsProvider = new EnvironmentsProvider(storageService);
	const historyProvider = new HistoryProvider(storageService, context);
	logger.debug('Tree data providers initialized');

	// Create tree views with collapse all button
	const collectionsTreeView = vscode.window.createTreeView('endpointCollections', {
		treeDataProvider: collectionsProvider,
		showCollapseAll: true

	});

	const environmentsTreeView = vscode.window.createTreeView('endpointEnvironments', {
		treeDataProvider: environmentsProvider,
		showCollapseAll: true
	});
	const historyTreeView = vscode.window.createTreeView('endpointHistory', {
		treeDataProvider: historyProvider,
		showCollapseAll: true
	});
	context.subscriptions.push(collectionsTreeView, environmentsTreeView, historyTreeView);

	// Register FileDecorationProvider for dirty state indicators
	context.subscriptions.push(
		vscode.window.registerFileDecorationProvider(DirtyStateProvider.getInstance())
	);
	logger.debug('Dirty state decoration provider registered');

	// Initialize and register status bar provider
	const statusBarProvider = new StatusBarProvider(storageService);
	context.subscriptions.push(statusBarProvider);
	logger.debug('Status bar provider initialized');

	// Initialize environment diagnostics provider
	const envDiagnosticsProvider = new EnvironmentDiagnosticsProvider(storageService);
	context.subscriptions.push(envDiagnosticsProvider);
	envDiagnosticsProvider.refresh();
	logger.debug('Environment diagnostics provider initialized');

	// Set context for welcome views based on data presence
	const updateWelcomeViewContext = async () => {
		const collections = await storageService.getCollectionsAsync();
		const environments = await storageService.getEnvironments();
		await vscode.commands.executeCommand('setContext', 'endpoint.hasCollections', collections.length > 0);
		await vscode.commands.executeCommand('setContext', 'endpoint.hasEnvironments', environments.length > 0);
	};
	updateWelcomeViewContext();

	// Set up file watcher for repo-based collections
	const repoCollectionService = new RepoCollectionService();
	const watchPattern = repoCollectionService.getWatchPattern();
	if (watchPattern) {
		const watcher = vscode.workspace.createFileSystemWatcher(watchPattern);

		const handleRepoFileChange = async (uri: vscode.Uri) => {
			// Skip if this change was triggered by an internal save
			if (RepoCollectionService.isInternalSave(uri)) {
				logger.debug(`Repo collection file changed (internal save, skipping prompt): ${uri.path}`);
				return;
			}

			const filename = uri.path.split('/').pop() || 'unknown';
			logger.debug(`Repo collection file changed externally: ${filename}`);

			const choice = await vscode.window.showInformationMessage(
				vscode.l10n.t('The collection file "{0}" has changed on disk.', filename),
				vscode.l10n.t('Reload'),
				vscode.l10n.t('Ignore')
			);

			if (choice === vscode.l10n.t('Reload')) {
				collectionsProvider.refresh();
				envDiagnosticsProvider.refresh();
			}
		};

		watcher.onDidChange(handleRepoFileChange);
		watcher.onDidCreate(() => {
			logger.debug('Repo collection file created');
			collectionsProvider.refresh();
			envDiagnosticsProvider.refresh();
		});
		watcher.onDidDelete(() => {
			logger.debug('Repo collection file deleted');
			collectionsProvider.refresh();
			envDiagnosticsProvider.refresh();
		});

		context.subscriptions.push(watcher);
		logger.debug('Repo collection file watcher registered');
	}

	// Collection commands
	context.subscriptions.push(
		vscode.commands.registerCommand('endpoint.refreshCollections', () => {
			collectionsProvider.refresh();
			envDiagnosticsProvider.refresh();
			updateWelcomeViewContext();
		}),
		vscode.commands.registerCommand('endpoint.addCollection', async () => {
			await collectionsProvider.addCollection();
			envDiagnosticsProvider.refresh();
			updateWelcomeViewContext();
		}),
		vscode.commands.registerCommand('endpoint.editCollection', (item: CollectionItem) => {
			collectionsProvider.editCollection(item);
		}),
		vscode.commands.registerCommand('endpoint.deleteCollection', async (item: CollectionItem) => {
			await collectionsProvider.deleteCollection(item);
			envDiagnosticsProvider.refresh();
			updateWelcomeViewContext();
		}),
		vscode.commands.registerCommand('endpoint.duplicateCollection', (item: CollectionItem) => {
			collectionsProvider.duplicateCollection(item);
		}),
		vscode.commands.registerCommand('endpoint.collectionSettings', (item: CollectionItem) => {
			CollectionSettingsPanel.createOrShow(context.extensionUri, storageService, item.collection);
		}),
		vscode.commands.registerCommand('endpoint.convertToRepoCollection', async (item: CollectionItem) => {
			if (!repoCollectionService.hasWorkspace()) {
				vscode.window.showErrorMessage(vscode.l10n.t('No workspace folder available. Open a folder to use repo-based collections.'));
				return;
			}

			if (item.collection.storageType === 'repo') {
				vscode.window.showInformationMessage(vscode.l10n.t('Collection "{0}" is already stored in the repository.', item.collection.name));
				return;
			}

			const confirm = await vscode.window.showWarningMessage(
				vscode.l10n.t('Convert "{0}" to a repo-based collection?', item.collection.name),
				{
					modal: true,
					detail: vscode.l10n.t('Sensitive authentication data (passwords, tokens, API keys) will be stored locally and NOT included in the repository file. Team members will need to configure their own credentials.')
				},
				vscode.l10n.t('Convert')
			);

			if (confirm === vscode.l10n.t('Convert')) {
				try {
					await storageService.convertToRepoCollection(item.collection);
					collectionsProvider.refresh();
					vscode.window.showInformationMessage(vscode.l10n.t('Collection "{0}" is now stored in .endpoint/collections/', item.collection.name));
				} catch (error) {
					vscode.window.showErrorMessage(vscode.l10n.t('Failed to convert collection: {0}', String(error)));
				}
			}
		})
	);

	// Request commands
	context.subscriptions.push(
		vscode.commands.registerCommand('endpoint.newRequest', () => {
			RequestPanel.createOrShow(context.extensionUri);
		}),
		vscode.commands.registerCommand('endpoint.addRequest', (item: CollectionItem) => {
			collectionsProvider.addRequest(item);
			envDiagnosticsProvider.refresh();
		}),
		vscode.commands.registerCommand('endpoint.editRequest', (item: RequestItem) => {
			collectionsProvider.editRequest(item);
		}),
		vscode.commands.registerCommand('endpoint.deleteRequest', (item: RequestItem) => {
			collectionsProvider.deleteRequest(item);
			envDiagnosticsProvider.refresh();
		}),
		vscode.commands.registerCommand('endpoint.duplicateRequest', (item: RequestItem) => {
			collectionsProvider.duplicateRequest(item);
			envDiagnosticsProvider.refresh();
		}),
		vscode.commands.registerCommand('endpoint.openRequest', (item: RequestItem) => {
			RequestPanel.openRequest(context.extensionUri, item.request, item.collectionId);
		}),
		vscode.commands.registerCommand('endpoint.sendRequest', (item: RequestItem) => {
			const panel = RequestPanel.openRequest(context.extensionUri, item.request, item.collectionId);
			panel.sendImmediately();
		})
	);

	// Environment commands
	context.subscriptions.push(
		vscode.commands.registerCommand('endpoint.refreshEnvironments', () => {
			environmentsProvider.refresh();
			statusBarProvider.update();
			updateWelcomeViewContext();
		}),
		vscode.commands.registerCommand('endpoint.addEnvironment', async () => {
			await environmentsProvider.addEnvironment();
			updateWelcomeViewContext();
		}),
		vscode.commands.registerCommand('endpoint.editEnvironment', (item: EnvironmentItem) => {
			environmentsProvider.editEnvironment(item);
		}),
		vscode.commands.registerCommand('endpoint.deleteEnvironment', async (item: EnvironmentItem) => {
			await environmentsProvider.deleteEnvironment(item);
			statusBarProvider.update();
			updateWelcomeViewContext();
		}),
		vscode.commands.registerCommand('endpoint.duplicateEnvironment', (item: EnvironmentItem) => {
			environmentsProvider.duplicateEnvironment(item);
		}),
		vscode.commands.registerCommand('endpoint.setActiveEnvironment', (item: EnvironmentItem) => {
			environmentsProvider.setActiveEnvironment(item);
			statusBarProvider.update();
			envDiagnosticsProvider.refresh();
		}),
		vscode.commands.registerCommand('endpoint.quickSwitchEnvironment', async () => {
			await statusBarProvider.showEnvironmentPicker();
			envDiagnosticsProvider.refresh();
			updateWelcomeViewContext();
		})
	);

	// Variable commands
	context.subscriptions.push(
		vscode.commands.registerCommand('endpoint.addVariable', (item: EnvironmentItem) => {
			environmentsProvider.addVariable(item);
			envDiagnosticsProvider.refresh();
		}),
		vscode.commands.registerCommand('endpoint.editVariable', (item: VariableItem) => {
			environmentsProvider.editVariable(item);
			envDiagnosticsProvider.refresh();
		}),
		vscode.commands.registerCommand('endpoint.deleteVariable', (item: VariableItem) => {
			environmentsProvider.deleteVariable(item);
			envDiagnosticsProvider.refresh();
		}),
		vscode.commands.registerCommand('endpoint.toggleVariable', (item: VariableItem) => {
			environmentsProvider.toggleVariable(item);
			envDiagnosticsProvider.refresh();
		})
	);

	// History commands
	context.subscriptions.push(
		vscode.commands.registerCommand('endpoint.refreshHistory', () => {
			historyProvider.refresh();
		}),
		vscode.commands.registerCommand('endpoint.clearHistory', () => {
			historyProvider.clearHistory();
		}),
		vscode.commands.registerCommand('endpoint.deleteHistoryItem', (item: HistoryTreeItem) => {
			historyProvider.deleteHistoryItem(item);
		}),
		vscode.commands.registerCommand('endpoint.openHistoryItem', (item: HistoryTreeItem) => {
			HistoryPanel.createOrShow(context.extensionUri, item.historyItem.id);
		}),
		vscode.commands.registerCommand('endpoint.saveHistoryToCollection', async (historyItem) => {
			// Get list of collections
			const collections = collectionsProvider.getCollections();
			if (collections.length === 0) {
				const create = await vscode.window.showInformationMessage(
					vscode.l10n.t('No collections found. Create one first?'),
					vscode.l10n.t('Create Collection')
				);
				if (create) {
					await collectionsProvider.addCollection();
				}
				return;
			}

			// Let user pick a collection
			const items: { label: string; description: string; collection: Collection }[] = collections.map(c => ({
				label: c.name,
				description: vscode.l10n.t('{0} requests', c.requests.length),
				collection: c
			}));

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: vscode.l10n.t('Select a collection to save the request to')
			});

			if (selected) {
				// Create a new request from history item
				const name = await vscode.window.showInputBox({
					prompt: vscode.l10n.t('Enter request name'),
					value: `${historyItem.method} ${new URL(historyItem.url).pathname}`,
				});

				if (name) {
					const collection = selected.collection;
					const request = {
						id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
						name: name,
						method: historyItem.method,
						url: historyItem.url,
						headers: historyItem.headers || [],
						body: historyItem.body || { type: 'none' as const, content: '' },
						createdAt: Date.now(),
						updatedAt: Date.now(),
					};
					collection.requests.push(request);
					collection.updatedAt = Date.now();
					await collectionsProvider.updateCollection(collection);
					vscode.window.showInformationMessage(vscode.l10n.t('Request saved to "{0}"', collection.name));
				}
			}
		})
	);

	// Import/Export commands
	const importExportCommands = createImportExportCommands(context, storageService);
	for (const { command, callback } of importExportCommands) {
		context.subscriptions.push(
			vscode.commands.registerCommand(command, callback)
		);
	}

	// Code generation command
	context.subscriptions.push(
		vscode.commands.registerCommand('endpoint.copyAsCode', createCopyAsCodeCommand(storageService, variableService))
	);

	logger.info('Endpoint extension activated');
}

export function deactivate() {
	const logger = getLogger();
	logger.info('Endpoint extension deactivating');
	disposeLogger();
}

