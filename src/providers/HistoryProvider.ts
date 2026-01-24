import * as vscode from 'vscode';
import { HistoryItem, createHistoryItem } from '../models/HistoryItem';
import { HttpMethod, RequestHeader, RequestBody } from '../models/Collection';
import { StorageService } from '../storage/StorageService';

export class HistoryTreeItem extends vscode.TreeItem {
    constructor(
        public readonly historyItem: HistoryItem
    ) {
        super(`${historyItem.method} ${historyItem.url}`, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'historyItem';
        this.iconPath = this.getMethodIcon(historyItem.method);
        this.tooltip = this.buildTooltip();
        this.description = this.formatTimestamp();
        this.command = {
            command: 'endpoint.openHistoryItem',
            title: 'Open History Item',
            arguments: [this],
        };
    }

    private getMethodIcon(method: string): vscode.ThemeIcon {
        const methodColors: Record<string, string> = {
            'GET': 'symbolMethod',
            'POST': 'symbolFunction',
            'PUT': 'symbolProperty',
            'PATCH': 'symbolEvent',
            'DELETE': 'symbolOperator',
            'HEAD': 'symbolInterface',
            'OPTIONS': 'symbolTypeParameter',
        };
        return new vscode.ThemeIcon(methodColors[method] || 'circle-outline');
    }

    private buildTooltip(): string {
        const lines = [
            `${this.historyItem.method} ${this.historyItem.url}`,
            `Time: ${new Date(this.historyItem.timestamp).toLocaleString()}`,
        ];

        if (this.historyItem.statusCode !== undefined) {
            lines.push(`Status: ${this.historyItem.statusCode} ${this.historyItem.statusText || ''}`);
        }

        if (this.historyItem.responseTime !== undefined) {
            lines.push(`Response Time: ${this.historyItem.responseTime}ms`);
        }

        return lines.join('\n');
    }

    private formatTimestamp(): string {
        const date = new Date(this.historyItem.timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) {
            return 'Just now';
        } else if (diffMins < 60) {
            return `${diffMins}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else if (diffDays < 7) {
            return `${diffDays}d ago`;
        } else {
            return date.toLocaleDateString();
        }
    }
}

export class HistoryProvider implements vscode.TreeDataProvider<HistoryTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<HistoryTreeItem | undefined | null | void> = new vscode.EventEmitter<HistoryTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HistoryTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private storageService: StorageService) { }

    private get history(): HistoryItem[] {
        return this.storageService.getHistory();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: HistoryTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: HistoryTreeItem): Thenable<HistoryTreeItem[]> {
        if (!element) {
            // Return history items sorted by timestamp (newest first)
            return Promise.resolve(
                [...this.history]
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .map((h) => new HistoryTreeItem(h))
            );
        }
        return Promise.resolve([]);
    }

    // Operations
    async addHistoryItem(
        method: HttpMethod,
        url: string,
        headers: RequestHeader[] = [],
        body: RequestBody = { type: 'none', content: '' },
        statusCode?: number,
        statusText?: string,
        responseTime?: number
    ): Promise<HistoryItem> {
        const item = createHistoryItem(method, url, headers, body);
        item.statusCode = statusCode;
        item.statusText = statusText;
        item.responseTime = responseTime;

        await this.storageService.addHistoryItem(item);
        this.refresh();
        return item;
    }

    async deleteHistoryItem(item: HistoryTreeItem): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete this history item?`,
            { modal: true },
            'Delete'
        );

        if (confirm === 'Delete') {
            await this.storageService.deleteHistoryItem(item.historyItem.id);
            this.refresh();
        }
    }

    async clearHistory(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            'Are you sure you want to clear all history?',
            { modal: true },
            'Clear All'
        );

        if (confirm === 'Clear All') {
            await this.storageService.clearHistory();
            this.refresh();
            vscode.window.showInformationMessage('History cleared.');
        }
    }

    async saveToCollection(item: HistoryTreeItem): Promise<void> {
        // This will be wired up to the collections provider
        vscode.commands.executeCommand('endpoint.saveHistoryToCollection', item.historyItem);
    }

    getHistory(): HistoryItem[] {
        return this.history;
    }

    getHistoryItemById(id: string): HistoryItem | undefined {
        return this.storageService.getHistoryItem(id);
    }
}
