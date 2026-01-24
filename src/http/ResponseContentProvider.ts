import * as vscode from 'vscode';

/**
 * HTTP Response interface
 */
export interface HttpResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    time: number;  // milliseconds
    size: number;  // bytes
}

/**
 * Content provider for the 'endpoint-response' URI scheme.
 * Provides response content for virtual documents with proper syntax highlighting.
 */
export class ResponseContentProvider implements vscode.TextDocumentContentProvider {
    private static instance: ResponseContentProvider;
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    private _responses: Map<string, string> = new Map();

    public readonly onDidChange = this._onDidChange.event;

    public static getInstance(): ResponseContentProvider {
        if (!ResponseContentProvider.instance) {
            ResponseContentProvider.instance = new ResponseContentProvider();
        }
        return ResponseContentProvider.instance;
    }

    /**
     * Store response content for a URI
     */
    public setContent(uri: vscode.Uri, content: string): void {
        this._responses.set(uri.toString(), content);
        this._onDidChange.fire(uri);
    }

    /**
     * Remove response content for a URI
     */
    public deleteContent(uri: vscode.Uri): void {
        this._responses.delete(uri.toString());
    }

    /**
     * Clear all stored responses
     */
    public clear(): void {
        this._responses.clear();
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this._responses.get(uri.toString()) || '';
    }
}

/**
 * Register the response content provider
 */
export function registerResponseContentProvider(context: vscode.ExtensionContext): ResponseContentProvider {
    const provider = ResponseContentProvider.getInstance();
    const registration = vscode.workspace.registerTextDocumentContentProvider('endpoint-response', provider);
    context.subscriptions.push(registration);
    return provider;
}
