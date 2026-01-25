import * as vscode from 'vscode';
import { CollectionsProvider, CollectionItem, RequestItem } from './providers/CollectionsProvider';
import { EnvironmentsProvider, EnvironmentItem, VariableItem } from './providers/EnvironmentsProvider';
import { HistoryProvider, HistoryTreeItem } from './providers/HistoryProvider';
import { RequestPanel } from './webview/RequestPanel';
import { CollectionSettingsPanel } from './webview/CollectionSettingsPanel';
import { registerResponseContentProvider } from './http/ResponseContentProvider';
import { StorageService, VariableService } from './storage';
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

	// Initialize providers with StorageService
	const collectionsProvider = new CollectionsProvider(storageService);
	const environmentsProvider = new EnvironmentsProvider(storageService);
	const historyProvider = new HistoryProvider(storageService);
	logger.debug('Tree data providers initialized');

	// Register tree data providers
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('endpointCollections', collectionsProvider),
		vscode.window.registerTreeDataProvider('endpointEnvironments', environmentsProvider),
		vscode.window.registerTreeDataProvider('endpointHistory', historyProvider)
	);

	// Collection commands
	context.subscriptions.push(
		vscode.commands.registerCommand('endpoint.refreshCollections', () => {
			collectionsProvider.refresh();
		}),
		vscode.commands.registerCommand('endpoint.addCollection', () => {
			collectionsProvider.addCollection();
		}),
		vscode.commands.registerCommand('endpoint.editCollection', (item: CollectionItem) => {
			collectionsProvider.editCollection(item);
		}),
		vscode.commands.registerCommand('endpoint.deleteCollection', (item: CollectionItem) => {
			collectionsProvider.deleteCollection(item);
		}),
		vscode.commands.registerCommand('endpoint.duplicateCollection', (item: CollectionItem) => {
			collectionsProvider.duplicateCollection(item);
		}),
		vscode.commands.registerCommand('endpoint.collectionSettings', (item: CollectionItem) => {
			CollectionSettingsPanel.createOrShow(context.extensionUri, storageService, item.collection);
		})
	);

	// Request commands
	context.subscriptions.push(
		vscode.commands.registerCommand('endpoint.newRequest', () => {
			RequestPanel.createOrShow(context.extensionUri);
		}),
		vscode.commands.registerCommand('endpoint.addRequest', (item: CollectionItem) => {
			collectionsProvider.addRequest(item);
		}),
		vscode.commands.registerCommand('endpoint.editRequest', (item: RequestItem) => {
			collectionsProvider.editRequest(item);
		}),
		vscode.commands.registerCommand('endpoint.deleteRequest', (item: RequestItem) => {
			collectionsProvider.deleteRequest(item);
		}),
		vscode.commands.registerCommand('endpoint.duplicateRequest', (item: RequestItem) => {
			collectionsProvider.duplicateRequest(item);
		}),
		vscode.commands.registerCommand('endpoint.openRequest', (item: RequestItem) => {
			RequestPanel.openRequest(context.extensionUri, item.request, item.collectionId);
		})
	);

	// Environment commands
	context.subscriptions.push(
		vscode.commands.registerCommand('endpoint.refreshEnvironments', () => {
			environmentsProvider.refresh();
		}),
		vscode.commands.registerCommand('endpoint.addEnvironment', () => {
			environmentsProvider.addEnvironment();
		}),
		vscode.commands.registerCommand('endpoint.editEnvironment', (item: EnvironmentItem) => {
			environmentsProvider.editEnvironment(item);
		}),
		vscode.commands.registerCommand('endpoint.deleteEnvironment', (item: EnvironmentItem) => {
			environmentsProvider.deleteEnvironment(item);
		}),
		vscode.commands.registerCommand('endpoint.duplicateEnvironment', (item: EnvironmentItem) => {
			environmentsProvider.duplicateEnvironment(item);
		}),
		vscode.commands.registerCommand('endpoint.setActiveEnvironment', (item: EnvironmentItem) => {
			environmentsProvider.setActiveEnvironment(item);
		})
	);

	// Variable commands
	context.subscriptions.push(
		vscode.commands.registerCommand('endpoint.addVariable', (item: EnvironmentItem) => {
			environmentsProvider.addVariable(item);
		}),
		vscode.commands.registerCommand('endpoint.editVariable', (item: VariableItem) => {
			environmentsProvider.editVariable(item);
		}),
		vscode.commands.registerCommand('endpoint.deleteVariable', (item: VariableItem) => {
			environmentsProvider.deleteVariable(item);
		}),
		vscode.commands.registerCommand('endpoint.toggleVariable', (item: VariableItem) => {
			environmentsProvider.toggleVariable(item);
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
			RequestPanel.openHistoryItem(context.extensionUri, item.historyItem);
		}),
		vscode.commands.registerCommand('endpoint.saveHistoryToCollection', async (historyItem) => {
			// Get list of collections
			const collections = collectionsProvider.getCollections();
			if (collections.length === 0) {
				const create = await vscode.window.showInformationMessage(
					'No collections found. Create one first?',
					'Create Collection'
				);
				if (create) {
					await collectionsProvider.addCollection();
				}
				return;
			}

			// Let user pick a collection
			const items: { label: string; description: string; collection: Collection }[] = collections.map(c => ({
				label: c.name,
				description: `${c.requests.length} requests`,
				collection: c
			}));

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: 'Select a collection to save the request to'
			});

			if (selected) {
				// Create a new request from history item
				const name = await vscode.window.showInputBox({
					prompt: 'Enter request name',
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
					vscode.window.showInformationMessage(`Request saved to "${collection.name}"`);
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

