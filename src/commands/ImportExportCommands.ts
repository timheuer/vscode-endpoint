import * as vscode from 'vscode';
import { StorageService } from '../storage/StorageService';
import { parseHttpFile, serializeToHttpFile, parsedRequestToRequest, ParsedRequest } from '../parser/HttpParser';
import { createCollection, Collection, Request } from '../models/Collection';
import { Environment } from '../models/Environment';

/**
 * Extract all variable names from a text string (matches {{VARIABLE_NAME}})
 * Excludes built-in variables (starting with $) and request chaining (contains .)
 */
function extractVariableNames(text: string): Set<string> {
    const variables = new Set<string>();
    const regex = /\{\{([^}]+)\}\}/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const varName = match[1].trim();
        // Skip built-in variables and request chaining
        if (!varName.startsWith('$') && !varName.includes('.')) {
            variables.add(varName);
        }
    }
    return variables;
}

/**
 * Extract all variable names from a collection's requests
 */
function extractVariablesFromRequests(requests: Request[]): Set<string> {
    const variables = new Set<string>();

    for (const request of requests) {
        // Check URL
        extractVariableNames(request.url).forEach(v => variables.add(v));

        // Check headers
        for (const header of request.headers) {
            extractVariableNames(header.name).forEach(v => variables.add(v));
            extractVariableNames(header.value).forEach(v => variables.add(v));
        }

        // Check body
        if (request.body?.content) {
            extractVariableNames(request.body.content).forEach(v => variables.add(v));
        }
    }

    return variables;
}

/**
 * Get all variable names defined across all environments
 */
function getDefinedVariables(environments: Environment[]): Set<string> {
    const defined = new Set<string>();
    for (const env of environments) {
        for (const variable of env.variables) {
            defined.add(variable.name);
        }
    }
    return defined;
}

/**
 * Import summary result
 */
interface ImportSummary {
    collectionName: string;
    requestCount: number;
    collectionVariables: string[];
    usedVariables: string[];
    definedInEnvironments: string[];
    definedInCollection: string[];
    missingVariables: string[];
    hasActiveEnvironment: boolean;
    activeEnvironmentName?: string;
}

/**
 * Show import summary in a temporary markdown document
 */
async function showImportSummary(summary: ImportSummary): Promise<void> {
    const lines: string[] = [];

    lines.push(`# Import Summary: "${summary.collectionName}"`);
    lines.push('');
    lines.push(`✅ **Imported ${summary.requestCount} request(s)**`);
    lines.push('');

    // Variables section
    if (summary.usedVariables.length > 0) {
        lines.push('## Variables Analysis');
        lines.push('');

        lines.push(`**Variables found in requests:** ${summary.usedVariables.length}`);
        lines.push('');
        summary.usedVariables.forEach(v => lines.push(`- \`{{${v}}}\``));
        lines.push('');

        if (summary.definedInCollection.length > 0) {
            lines.push(`### ✅ Defined in collection (\`@variable\`): ${summary.definedInCollection.length}`);
            lines.push('');
            summary.definedInCollection.forEach(v => lines.push(`- \`${v}\``));
            lines.push('');
        }

        if (summary.definedInEnvironments.length > 0) {
            lines.push(`### ✅ Available in environments: ${summary.definedInEnvironments.length}`);
            lines.push('');
            summary.definedInEnvironments.forEach(v => lines.push(`- \`${v}\``));
            lines.push('');
        }

        if (summary.missingVariables.length > 0) {
            lines.push(`### ⚠️ Missing - Not defined anywhere: ${summary.missingVariables.length}`);
            lines.push('');
            summary.missingVariables.forEach(v => lines.push(`- \`{{${v}}}\``));
            lines.push('');
        }
    } else {
        lines.push('*No variables found in requests.*');
        lines.push('');
    }

    // Active environment status
    lines.push('## Environment Status');
    lines.push('');

    if (summary.hasActiveEnvironment) {
        lines.push(`✅ **Active environment:** "${summary.activeEnvironmentName}"`);
    } else {
        lines.push('⚠️ **No active environment selected**');
        lines.push('');
        lines.push('> 💡 Select an environment to resolve variables at runtime');
    }
    lines.push('');

    // Next steps
    if (summary.missingVariables.length > 0 || !summary.hasActiveEnvironment) {
        lines.push('## Recommended Next Steps');
        lines.push('');

        let step = 1;
        if (summary.missingVariables.length > 0) {
            lines.push(`### ${step}. Create or update an environment with missing variables`);
            lines.push('');
            lines.push('1. Open the **Environments** view in the sidebar');
            lines.push('2. Add or edit an environment');
            lines.push('3. Add the following variables:');
            lines.push('');
            lines.push('| Variable | Value |');
            lines.push('|----------|-------|');
            summary.missingVariables.forEach(v => lines.push(`| \`${v}\` | *your value* |`));
            lines.push('');
            step++;
        }

        if (!summary.hasActiveEnvironment) {
            lines.push(`### ${step}. Activate an environment`);
            lines.push('');
            lines.push('1. Right-click an environment in the sidebar');
            lines.push('2. Select **"Set as Active"**');
            lines.push('');
        }
    }

    // Create and show the document
    const content = lines.join('\n');
    const doc = await vscode.workspace.openTextDocument({
        content,
        language: 'markdown'
    });
    await vscode.window.showTextDocument(doc, { preview: true });
}

/**
 * Transform {{VARIABLE_NAME}} to {{$dotenv VARIABLE_NAME}} for export
 * Skips built-in variables like {{$guid}}, {{$timestamp}}, {{$randomInt}}, etc.
 * Also skips request chaining syntax like {{requestName.response.body.path}}
 */
function transformVariablesForExport(text: string): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (match, content) => {
        const trimmedContent = content.trim();
        // Skip if already a $dotenv or other $ prefixed built-in variable
        if (trimmedContent.startsWith('$')) {
            return match;
        }
        // Skip request chaining syntax (contains dots like requestName.response.body)
        if (trimmedContent.includes('.')) {
            return match;
        }
        return `{{$dotenv ${trimmedContent}}}`;
    });
}

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
        title: vscode.l10n.t('Import HTTP File')
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
            vscode.window.showWarningMessage(vscode.l10n.t('No requests found in the file.'));
            return;
        }

        // Get filename without extension for default collection name
        const fileName = fileUri.path.split('/').pop() || 'Imported Collection';
        const baseName = fileName.replace(/\.(http|rest)$/i, '');

        // Prompt for collection name
        const collectionName = await vscode.window.showInputBox({
            prompt: vscode.l10n.t('Enter name for the new collection'),
            value: baseName,
            validateInput: (value) => {
                if (!value || value.trim() === '') {
                    return vscode.l10n.t('Collection name is required');
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

        // Analyze variables for summary
        const usedVariables = extractVariablesFromRequests(collection.requests);
        const collectionVarNames = new Set(Object.keys(collection.variables || {}));
        const environments = await storageService.getEnvironments();
        const envDefinedVars = getDefinedVariables(environments);
        const activeEnv = await storageService.getActiveEnvironment();

        // Categorize variables
        const definedInCollection: string[] = [];
        const definedInEnvironments: string[] = [];
        const missingVariables: string[] = [];

        for (const varName of usedVariables) {
            if (collectionVarNames.has(varName)) {
                definedInCollection.push(varName);
            } else if (envDefinedVars.has(varName)) {
                definedInEnvironments.push(varName);
            } else {
                missingVariables.push(varName);
            }
        }

        const summary: ImportSummary = {
            collectionName: collectionName,
            requestCount: collection.requests.length,
            collectionVariables: Object.keys(collection.variables || {}),
            usedVariables: Array.from(usedVariables).sort(),
            definedInCollection: definedInCollection.sort(),
            definedInEnvironments: definedInEnvironments.sort(),
            missingVariables: missingVariables.sort(),
            hasActiveEnvironment: !!activeEnv,
            activeEnvironmentName: activeEnv?.name,
        };

        // Refresh collections view
        vscode.commands.executeCommand('endpoint.refreshCollections');

        // Show appropriate message based on results
        if (missingVariables.length > 0) {
            const action = await vscode.window.showWarningMessage(
                vscode.l10n.t(
                    'Imported {0} request(s) into "{1}". {2} variable(s) not found in any environment.',
                    collection.requests.length,
                    collectionName,
                    missingVariables.length
                ),
                vscode.l10n.t('View Details'),
                vscode.l10n.t('Configure Environment')
            );

            if (action === vscode.l10n.t('View Details')) {
                await showImportSummary(summary);
            } else if (action === vscode.l10n.t('Configure Environment')) {
                await showImportSummary(summary);
                vscode.commands.executeCommand('endpoint.addEnvironment');
            }
        } else if (!activeEnv && usedVariables.size > 0) {
            const action = await vscode.window.showInformationMessage(
                vscode.l10n.t(
                    'Imported {0} request(s) into "{1}". No active environment selected.',
                    collection.requests.length,
                    collectionName
                ),
                vscode.l10n.t('View Details'),
                vscode.l10n.t('Select Environment')
            );

            if (action === vscode.l10n.t('View Details')) {
                await showImportSummary(summary);
            } else if (action === vscode.l10n.t('Select Environment')) {
                vscode.commands.executeCommand('endpoint.environments.focus');
            }
        } else {
            const action = await vscode.window.showInformationMessage(
                vscode.l10n.t('Imported {0} request(s) into collection "{1}"', collection.requests.length, collectionName),
                vscode.l10n.t('View Details')
            );

            if (action === vscode.l10n.t('View Details')) {
                await showImportSummary(summary);
            }
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(vscode.l10n.t('Failed to import HTTP file: {0}', message));
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
        vscode.window.showErrorMessage(vscode.l10n.t('Collection not found.'));
        return;
    }

    if (collection.requests.length === 0) {
        vscode.window.showWarningMessage(vscode.l10n.t('Collection has no requests to export.'));
        return;
    }

    // Show save dialog
    const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${collection.name.replace(/[^a-zA-Z0-9]/g, '_')}.http`),
        filters: {
            'HTTP Files': ['http'],
            'REST Files': ['rest']
        },
        title: vscode.l10n.t('Export Collection')
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
            vscode.l10n.t('Exported {0} request(s) to {1}', collection.requests.length, saveUri.fsPath)
        );

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(vscode.l10n.t('Failed to export collection: {0}', message));
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
        vscode.window.showWarningMessage(vscode.l10n.t('No collections to export.'));
        return;
    }

    // Let user select which collections to export
    const items = collections.map(c => ({
        label: c.name,
        description: vscode.l10n.t('{0} request(s)', c.requests.length),
        picked: true,
        collection: c
    }));

    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: vscode.l10n.t('Select collections to export'),
        title: vscode.l10n.t('Export Collections')
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
        title: vscode.l10n.t('Export Collections')
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
                    lines.push(`@${name} = ${transformVariablesForExport(value)}`);
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
            vscode.l10n.t('Exported {0} request(s) from {1} collection(s) to {2}', totalRequests, selected.length, saveUri.fsPath)
        );

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(vscode.l10n.t('Failed to export collections: {0}', message));
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
                    vscode.window.showWarningMessage(vscode.l10n.t('No collections to export.'));
                    return;
                }
                vscode.window.showQuickPick(
                    collections.map(c => ({
                        label: c.name,
                        description: vscode.l10n.t('{0} request(s)', c.requests.length),
                        collectionId: c.id
                    })),
                    { placeHolder: vscode.l10n.t('Select a collection to export') }
                ).then(selected => {
                    if (selected) {
                        exportCollectionToHttpFile(selected.collectionId, storageService);
                    }
                });
            }
        }
    ];
}
