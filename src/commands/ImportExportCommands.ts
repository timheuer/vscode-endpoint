import * as vscode from 'vscode';
import { StorageService } from '../storage/StorageService';
import { parseHttpFile, serializeToHttpFile, parsedRequestToRequest, ParsedRequest } from '../parser/HttpParser';
import { createCollection, Collection } from '../models/Collection';

/**
 * Import a .http file and create a new collection from it
 */
export async function importHttpFile(
    context: vscode.ExtensionContext,
    storageService: StorageService
): Promise<void> {
    // Open file picker for .http files
    const fileUris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
            'HTTP Files': ['http', 'rest'],
            'All Files': ['*']
        },
        title: 'Import HTTP File'
    });

    if (!fileUris || fileUris.length === 0) {
        return;
    }

    const fileUri = fileUris[0];

    try {
        // Read the file content
        const fileContent = await vscode.workspace.fs.readFile(fileUri);
        const content = Buffer.from(fileContent).toString('utf-8');

        // Parse the .http file
        const parsed = parseHttpFile(content);

        if (parsed.requests.length === 0) {
            vscode.window.showWarningMessage('No requests found in the file.');
            return;
        }

        // Get filename without extension for default collection name
        const fileName = fileUri.path.split('/').pop() || 'Imported Collection';
        const baseName = fileName.replace(/\.(http|rest)$/i, '');

        // Prompt for collection name
        const collectionName = await vscode.window.showInputBox({
            prompt: 'Enter name for the new collection',
            value: baseName,
            validateInput: (value) => {
                if (!value || value.trim() === '') {
                    return 'Collection name is required';
                }
                return undefined;
            }
        });

        if (!collectionName) {
            return;
        }

        // Create collection
        const collection = createCollection(collectionName.trim());

        // Add variables if any
        if (Object.keys(parsed.variables).length > 0) {
            collection.variables = parsed.variables;
        }

        // Convert parsed requests to Request objects
        for (const parsedRequest of parsed.requests) {
            const request = parsedRequestToRequest(parsedRequest);
            collection.requests.push(request);
        }

        // Save the collection
        await storageService.saveCollection(collection);

        vscode.window.showInformationMessage(
            `Imported ${collection.requests.length} request(s) into collection "${collectionName}"`
        );

        // Refresh collections view
        vscode.commands.executeCommand('endpoint.refreshCollections');

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to import HTTP file: ${message}`);
    }
}

/**
 * Export a single collection to a .http file
 */
export async function exportCollectionToHttpFile(
    collectionId: string,
    storageService: StorageService
): Promise<void> {
    const collection = storageService.getCollection(collectionId);
    if (!collection) {
        vscode.window.showErrorMessage('Collection not found.');
        return;
    }

    if (collection.requests.length === 0) {
        vscode.window.showWarningMessage('Collection has no requests to export.');
        return;
    }

    // Show save dialog
    const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${collection.name.replace(/[^a-zA-Z0-9]/g, '_')}.http`),
        filters: {
            'HTTP Files': ['http'],
            'REST Files': ['rest']
        },
        title: 'Export Collection'
    });

    if (!saveUri) {
        return;
    }

    try {
        // Serialize collection to .http format
        const content = serializeToHttpFile(collection.requests, collection.variables);

        // Write to file
        await vscode.workspace.fs.writeFile(saveUri, Buffer.from(content, 'utf-8'));

        vscode.window.showInformationMessage(
            `Exported ${collection.requests.length} request(s) to ${saveUri.fsPath}`
        );

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to export collection: ${message}`);
    }
}

/**
 * Export all collections to a single .http file with separators
 */
export async function exportAllCollectionsToHttpFile(
    storageService: StorageService
): Promise<void> {
    const collections = storageService.getCollections();

    if (collections.length === 0) {
        vscode.window.showWarningMessage('No collections to export.');
        return;
    }

    // Let user select which collections to export
    const items = collections.map(c => ({
        label: c.name,
        description: `${c.requests.length} request(s)`,
        picked: true,
        collection: c
    }));

    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: 'Select collections to export',
        title: 'Export Collections'
    });

    if (!selected || selected.length === 0) {
        return;
    }

    // Show save dialog
    const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('collections.http'),
        filters: {
            'HTTP Files': ['http'],
            'REST Files': ['rest']
        },
        title: 'Export Collections'
    });

    if (!saveUri) {
        return;
    }

    try {
        const lines: string[] = [];
        let totalRequests = 0;

        for (let i = 0; i < selected.length; i++) {
            const collection = selected[i].collection;

            // Add collection header comment
            lines.push(`###############################################`);
            lines.push(`### Collection: ${collection.name}`);
            if (collection.description) {
                lines.push(`### ${collection.description}`);
            }
            lines.push(`###############################################`);
            lines.push('');

            // Add collection variables if any
            if (collection.variables && Object.keys(collection.variables).length > 0) {
                for (const [name, value] of Object.entries(collection.variables)) {
                    lines.push(`@${name} = ${value}`);
                }
                lines.push('');
            }

            // Serialize requests
            const content = serializeToHttpFile(collection.requests);
            lines.push(content);

            totalRequests += collection.requests.length;

            // Add separator between collections
            if (i < selected.length - 1) {
                lines.push('');
                lines.push('');
            }
        }

        // Write to file
        await vscode.workspace.fs.writeFile(saveUri, Buffer.from(lines.join('\n'), 'utf-8'));

        vscode.window.showInformationMessage(
            `Exported ${totalRequests} request(s) from ${selected.length} collection(s) to ${saveUri.fsPath}`
        );

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to export collections: ${message}`);
    }
}

/**
 * Create import/export commands for registration
 */
export function createImportExportCommands(
    context: vscode.ExtensionContext,
    storageService: StorageService
): { command: string; callback: (...args: any[]) => any }[] {
    return [
        {
            command: 'endpoint.import',
            callback: () => importHttpFile(context, storageService)
        },
        {
            command: 'endpoint.export',
            callback: () => exportAllCollectionsToHttpFile(storageService)
        },
        {
            command: 'endpoint.exportCollection',
            callback: (arg?: string | { collection?: { id: string } }) => {
                // Handle both direct collection ID and CollectionItem from tree view
                let collectionId: string | undefined;

                if (typeof arg === 'string') {
                    collectionId = arg;
                } else if (arg && typeof arg === 'object' && 'collection' in arg && arg.collection) {
                    collectionId = arg.collection.id;
                }

                if (collectionId) {
                    return exportCollectionToHttpFile(collectionId, storageService);
                }

                // If no collection ID provided, show picker
                const collections = storageService.getCollections();
                if (collections.length === 0) {
                    vscode.window.showWarningMessage('No collections to export.');
                    return;
                }
                vscode.window.showQuickPick(
                    collections.map(c => ({
                        label: c.name,
                        description: `${c.requests.length} request(s)`,
                        collectionId: c.id
                    })),
                    { placeHolder: 'Select a collection to export' }
                ).then(selected => {
                    if (selected) {
                        exportCollectionToHttpFile(selected.collectionId, storageService);
                    }
                });
            }
        }
    ];
}
