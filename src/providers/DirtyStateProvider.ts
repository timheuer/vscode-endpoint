import * as vscode from 'vscode';

/**
 * Manages dirty (unsaved changes) state for requests.
 * Provides:
 * - Tracking of which requests have unsaved changes
 * - FileDecorationProvider for tree view indicators
 * - Events for state changes
 */
export class DirtyStateProvider implements vscode.FileDecorationProvider {
    private static _instance: DirtyStateProvider | undefined;

    private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    private readonly _onDidChangeDirtyState = new vscode.EventEmitter<{ requestId: string; isDirty: boolean }>();
    readonly onDidChangeDirtyState = this._onDidChangeDirtyState.event;

    private readonly _dirtyRequests = new Set<string>();

    private constructor() { }

    public static getInstance(): DirtyStateProvider {
        if (!DirtyStateProvider._instance) {
            DirtyStateProvider._instance = new DirtyStateProvider();
        }
        return DirtyStateProvider._instance;
    }

    /**
     * Mark a request as dirty (has unsaved changes)
     */
    public setDirty(requestId: string, isDirty: boolean): void {
        const wasDirty = this._dirtyRequests.has(requestId);

        if (isDirty && !wasDirty) {
            this._dirtyRequests.add(requestId);
            this._fireChange(requestId);
        } else if (!isDirty && wasDirty) {
            this._dirtyRequests.delete(requestId);
            this._fireChange(requestId);
        }
    }

    /**
     * Check if a request has unsaved changes
     */
    public isDirty(requestId: string): boolean {
        return this._dirtyRequests.has(requestId);
    }

    /**
     * Get all dirty request IDs
     */
    public getDirtyRequests(): string[] {
        return Array.from(this._dirtyRequests);
    }

    /**
     * Get count of dirty requests
     */
    public getDirtyCount(): number {
        return this._dirtyRequests.size;
    }

    /**
     * Clear dirty state for a request (e.g., after save)
     */
    public clearDirty(requestId: string): void {
        this.setDirty(requestId, false);
    }

    /**
     * Clear all dirty states
     */
    public clearAll(): void {
        const ids = Array.from(this._dirtyRequests);
        this._dirtyRequests.clear();
        ids.forEach(id => this._fireChange(id));
    }

    private _fireChange(requestId: string): void {
        const uri = this._createUri(requestId);
        this._onDidChangeFileDecorations.fire(uri);
        this._onDidChangeDirtyState.fire({ requestId, isDirty: this._dirtyRequests.has(requestId) });
    }

    private _createUri(requestId: string): vscode.Uri {
        return vscode.Uri.parse(`endpoint-request:/${requestId}`);
    }

    /**
     * FileDecorationProvider implementation
     */
    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        if (uri.scheme !== 'endpoint-request') {
            return undefined;
        }

        const requestId = uri.path.slice(1); // Remove leading /
        if (this._dirtyRequests.has(requestId)) {
            return new vscode.FileDecoration(
                'M',
                'Modified - unsaved changes',
                new vscode.ThemeColor('gitDecoration.modifiedResourceForeground')
            );
        }
        return undefined;
    }
}
