import * as vscode from 'vscode';
import { StorageService, DotEnvService } from '../storage';
import { extractVariableNames } from '../parser/VariableResolver';
import { Collection, Request } from '../models/Collection';

/**
 * Content provider for endpoint-collection virtual documents.
 * Shows collection info when clicking on diagnostics.
 */
class CollectionDocumentProvider implements vscode.TextDocumentContentProvider {
    private storageService: StorageService;

    constructor(storageService: StorageService) {
        this.storageService = storageService;
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        // URI format: endpoint-collection:/collectionId/collectionName
        const parts = uri.path.split('/').filter(p => p);
        const collectionId = parts[0];
        const collectionName = decodeURIComponent(parts[1] || 'Unknown');

        const collection = await this.storageService.getCollectionAsync(collectionId);

        if (!collection) {
            return `Collection "${collectionName}" not found.`;
        }

        // Build a summary document
        const lines: string[] = [
            `# Collection: ${collection.name}`,
            '',
            `Requests: ${collection.requests.length}`,
            '',
            '## Requests with undefined variables:',
            '',
        ];

        // Get defined variables
        const definedVariables = new Set<string>();
        const dotEnvService = DotEnvService.getInstance();
        const dotEnvVars = dotEnvService.getVariables();
        for (const name of Object.keys(dotEnvVars)) {
            definedVariables.add(name);
        }

        const activeEnv = await this.storageService.getActiveEnvironment();
        if (activeEnv) {
            for (const v of activeEnv.variables) {
                if (v.enabled) {
                    definedVariables.add(v.name);
                }
            }
        }

        if (collection.variables) {
            for (const name of Object.keys(collection.variables)) {
                definedVariables.add(name);
            }
        }

        // Find undefined variables per request
        for (const request of collection.requests) {
            const allVars = this.extractAllVariables(request);
            const undefinedVars = allVars.filter(v => !this.isBuiltInOrSpecial(v) && !definedVariables.has(v));

            if (undefinedVars.length > 0) {
                lines.push(`- **${request.name}**: ${undefinedVars.map(v => `\`{{${v}}}\``).join(', ')}`);
            }
        }

        lines.push('');
        lines.push('---');
        lines.push('To fix: Add these variables to your active environment, .env file, or collection variables.');

        return lines.join('\n');
    }

    private extractAllVariables(request: Request): string[] {
        const textsToScan: string[] = [request.url];

        if (request.headers) {
            for (const header of request.headers) {
                textsToScan.push(header.name, header.value);
            }
        }
        if (request.body?.content) {
            textsToScan.push(request.body.content);
        }
        if (request.auth) {
            if (request.auth.token) { textsToScan.push(request.auth.token); }
            if (request.auth.apiKeyValue) { textsToScan.push(request.auth.apiKeyValue); }
            if (request.auth.username) { textsToScan.push(request.auth.username); }
            if (request.auth.password) { textsToScan.push(request.auth.password); }
        }

        const allVars: string[] = [];
        for (const text of textsToScan) {
            allVars.push(...extractVariableNames(text));
        }
        return [...new Set(allVars)];
    }

    private isBuiltInOrSpecial(name: string): boolean {
        const lowerName = name.toLowerCase();
        const builtIns = ['$timestamp', '$datetime', '$timestamp_unix', '$unix', '$date', '$time', '$guid', '$uuid', '$randomint'];
        if (builtIns.includes(lowerName)) { return true; }
        if (name.startsWith('$env:')) { return true; }
        if (name.startsWith('$dotenv ')) { return true; }
        if (/^\w+\.response\.(body|headers|status|statusText)/.test(name)) { return true; }
        return false;
    }
}

/**
 * Provides diagnostics for undefined environment variables in collections.
 * Scans all requests for {{variable}} placeholders and reports those
 * not defined in the active environment or .env file.
 */
export class EnvironmentDiagnosticsProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private storageService: StorageService;
    private contentProviderDisposable: vscode.Disposable;

    constructor(storageService: StorageService) {
        this.storageService = storageService;
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('endpoint-variables');

        // Register content provider for clickable diagnostics
        const contentProvider = new CollectionDocumentProvider(storageService);
        this.contentProviderDisposable = vscode.workspace.registerTextDocumentContentProvider(
            'endpoint-collection',
            contentProvider
        );
    }

    /**
     * Refresh diagnostics by scanning all collections for undefined variables
     */
    async refresh(): Promise<void> {
        this.diagnosticCollection.clear();

        const collections = await this.storageService.getCollectionsAsync();
        const activeEnv = await this.storageService.getActiveEnvironment();

        // Get all defined variable names from all sources
        const definedVariables = new Set<string>();

        // Add variables from .env file
        const dotEnvService = DotEnvService.getInstance();
        const dotEnvVars = dotEnvService.getVariables();
        for (const name of Object.keys(dotEnvVars)) {
            definedVariables.add(name);
        }

        // Add variables from active environment
        if (activeEnv) {
            for (const v of activeEnv.variables) {
                if (v.enabled) {
                    definedVariables.add(v.name);
                }
            }
        }

        // Check each collection (also add collection-level variables)
        for (const collection of collections) {
            // Include collection-level variables
            const collectionDefinedVars = new Set(definedVariables);
            if (collection.variables) {
                for (const name of Object.keys(collection.variables)) {
                    collectionDefinedVars.add(name);
                }
            }

            const issues = this.analyzeCollection(collection, collectionDefinedVars);

            if (issues.length > 0) {
                // Use a virtual URI for the collection
                const uri = vscode.Uri.parse(`endpoint-collection:/${collection.id}/${encodeURIComponent(collection.name)}`);

                const diagnostics = issues.map(issue => {
                    const diagnostic = new vscode.Diagnostic(
                        new vscode.Range(0, 0, 0, 0), // No real range for virtual documents
                        issue.message,
                        issue.severity
                    );
                    diagnostic.source = 'Endpoint';
                    diagnostic.code = issue.code;
                    return diagnostic;
                });

                this.diagnosticCollection.set(uri, diagnostics);
            }
        }
    }

    /**
     * Analyze a collection for undefined variables
     */
    private analyzeCollection(
        collection: Collection,
        definedVariables: Set<string>
    ): Array<{ message: string; severity: vscode.DiagnosticSeverity; code: string }> {
        const issues: Array<{ message: string; severity: vscode.DiagnosticSeverity; code: string }> = [];
        const undefinedByRequest = new Map<string, Set<string>>();

        for (const request of collection.requests) {
            const undefinedVars = this.findUndefinedVariables(request, definedVariables);

            if (undefinedVars.size > 0) {
                undefinedByRequest.set(request.name, undefinedVars);
            }
        }

        // Group undefined variables and create messages
        const allUndefined = new Map<string, string[]>(); // variable -> request names

        for (const [requestName, vars] of undefinedByRequest) {
            for (const varName of vars) {
                if (!allUndefined.has(varName)) {
                    allUndefined.set(varName, []);
                }
                allUndefined.get(varName)!.push(requestName);
            }
        }

        // Create diagnostic for each undefined variable
        for (const [varName, requestNames] of allUndefined) {
            const requestList = requestNames.length <= 3
                ? requestNames.join(', ')
                : `${requestNames.slice(0, 3).join(', ')} and ${requestNames.length - 3} more`;

            issues.push({
                message: vscode.l10n.t(
                    'Variable "{0}" is used in {1} but not defined in environment, .env file, or collection',
                    varName,
                    requestList
                ),
                severity: vscode.DiagnosticSeverity.Warning,
                code: 'undefined-variable'
            });
        }

        return issues;
    }

    /**
     * Find undefined variables in a request
     */
    private findUndefinedVariables(request: Request, definedVariables: Set<string>): Set<string> {
        const undefinedVars = new Set<string>();
        const textsToScan: string[] = [];

        // Collect all text that might contain variables
        textsToScan.push(request.url);

        if (request.headers) {
            for (const header of request.headers) {
                textsToScan.push(header.name);
                textsToScan.push(header.value);
            }
        }

        if (request.body?.content) {
            textsToScan.push(request.body.content);
        }

        // Check auth config for variables
        if (request.auth) {
            if (request.auth.token) {
                textsToScan.push(request.auth.token);
            }
            if (request.auth.apiKeyValue) {
                textsToScan.push(request.auth.apiKeyValue);
            }
            if (request.auth.username) {
                textsToScan.push(request.auth.username);
            }
            if (request.auth.password) {
                textsToScan.push(request.auth.password);
            }
        }

        // Extract and check variables
        for (const text of textsToScan) {
            const varNames = extractVariableNames(text);
            for (const varName of varNames) {
                if (!this.isBuiltInOrSpecial(varName) && !definedVariables.has(varName)) {
                    undefinedVars.add(varName);
                }
            }
        }

        return undefinedVars;
    }

    /**
     * Check if a variable name is a built-in or special variable
     */
    private isBuiltInOrSpecial(name: string): boolean {
        const lowerName = name.toLowerCase();

        // Built-in variables
        const builtIns = [
            '$timestamp', '$datetime', '$timestamp_unix', '$unix',
            '$date', '$time', '$guid', '$uuid', '$randomint'
        ];
        if (builtIns.includes(lowerName)) {
            return true;
        }

        // System environment variables
        if (name.startsWith('$env:')) {
            return true;
        }

        // Dotenv syntax (REST Client compatibility)
        if (name.startsWith('$dotenv ')) {
            return true;
        }

        // Request chaining references
        if (/^\w+\.response\.(body|headers|status|statusText)/.test(name)) {
            return true;
        }

        return false;
    }

    /**
     * Get summary of current diagnostics for display
     */
    getSummary(): { totalIssues: number; collectionsWithIssues: number } {
        let totalIssues = 0;
        let collectionsWithIssues = 0;

        this.diagnosticCollection.forEach((uri, diagnostics) => {
            if (diagnostics.length > 0) {
                collectionsWithIssues++;
                totalIssues += diagnostics.length;
            }
        });

        return { totalIssues, collectionsWithIssues };
    }

    dispose(): void {
        this.diagnosticCollection.dispose();
        this.contentProviderDisposable.dispose();
    }
}
