import * as vscode from 'vscode';
import { HistoryItem, createHistoryItem } from '../models/HistoryItem';
import { HttpMethod, RequestHeader, RequestBody } from '../models/Collection';
import { StorageService } from '../storage/StorageService';

const COLLAPSED_STATE_KEY = 'endpoint.historyGroups.collapsed';

type DateGroupName =
    | 'Today'
    | 'Yesterday'
    | 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
    | 'Last Week'
    | 'Two Weeks Ago'
    | 'Three Weeks Ago'
    | 'Last Month'
    | 'Older';

/**
 * Tree item representing a date group
 */
export class DateGroupItem extends vscode.TreeItem {
    constructor(
        public readonly groupName: DateGroupName,
        public readonly itemCount: number,
        collapsed: boolean
    ) {
        super(
            vscode.l10n.t(groupName),
            collapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded
        );
        this.contextValue = 'dateGroup';
        this.iconPath = new vscode.ThemeIcon('calendar');
        this.description = `${itemCount}`;
    }
}

export class HistoryTreeItem extends vscode.TreeItem {
    constructor(
        public readonly historyItem: HistoryItem
    ) {
        super(`${historyItem.method} ${historyItem.url}`, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'historyItem';
        this.iconPath = this.getMethodIcon(historyItem.method);
        this.tooltip = this.buildTooltip();
        this.description = this.formatDescription();
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

    /**
     * Format description showing status code and response time (e.g., "200 15ms")
     */
    private formatDescription(): string {
        const parts: string[] = [];

        if (this.historyItem.statusCode !== undefined) {
            parts.push(String(this.historyItem.statusCode));
        }

        if (this.historyItem.responseTime !== undefined) {
            parts.push(`${this.historyItem.responseTime}ms`);
        }

        return parts.join(' ');
    }
}

/**
 * Categorize a history item into a date group based on its timestamp
 */
function getDateGroup(timestamp: number): DateGroupName {
    const itemDate = new Date(timestamp);
    const now = new Date();

    // Reset times to start of day for comparison
    const itemDay = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diffDays = Math.floor((today.getTime() - itemDay.getTime()) / 86400000);

    if (diffDays === 0) {
        return 'Today';
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        // Show day name for days 2-6 days ago (still within current week context)
        const dayNames: DateGroupName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return dayNames[itemDate.getDay()];
    } else if (diffDays < 14) {
        return 'Last Week';
    } else if (diffDays < 21) {
        return 'Two Weeks Ago';
    } else if (diffDays < 28) {
        return 'Three Weeks Ago';
    } else if (diffDays < 60) {
        return 'Last Month';
    } else {
        return 'Older';
    }
}

/**
 * Get the display order for date groups, with day names ordered relative to today
 */
function getGroupOrder(): DateGroupName[] {
    const dayNames: DateGroupName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDayIndex = new Date().getDay();

    // Build day names in reverse chronological order (yesterday-2 through yesterday-6)
    // These represent days 2-6 days ago
    const orderedDays: DateGroupName[] = [];
    for (let i = 2; i <= 6; i++) {
        const dayIndex = (todayDayIndex - i + 7) % 7;
        orderedDays.push(dayNames[dayIndex]);
    }

    return [
        'Today',
        'Yesterday',
        ...orderedDays,
        'Last Week',
        'Two Weeks Ago',
        'Three Weeks Ago',
        'Last Month',
        'Older'
    ];
}

/**
 * Group history items by date category
 */
function groupHistoryByDate(history: HistoryItem[]): Map<DateGroupName, HistoryItem[]> {
    const groups = new Map<DateGroupName, HistoryItem[]>();

    // Initialize all possible groups
    for (const groupName of getGroupOrder()) {
        groups.set(groupName, []);
    }

    for (const item of history) {
        const group = getDateGroup(item.timestamp);
        groups.get(group)!.push(item);
    }

    return groups;
}

export type HistoryTreeNode = DateGroupItem | HistoryTreeItem;

export class HistoryProvider implements vscode.TreeDataProvider<HistoryTreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<HistoryTreeNode | undefined | null | void> = new vscode.EventEmitter<HistoryTreeNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HistoryTreeNode | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private storageService: StorageService, private context: vscode.ExtensionContext) { }

    private get history(): HistoryItem[] {
        return this.storageService.getHistory();
    }

    /**
     * Get the list of collapsed group names from workspace state
     */
    private getCollapsedGroups(): DateGroupName[] {
        return this.context.workspaceState.get<DateGroupName[]>(COLLAPSED_STATE_KEY, []);
    }

    /**
     * Save the collapsed state for a group
     */
    async setGroupCollapsed(groupName: DateGroupName, collapsed: boolean): Promise<void> {
        const collapsedGroups = this.getCollapsedGroups();
        const index = collapsedGroups.indexOf(groupName);

        if (collapsed && index === -1) {
            collapsedGroups.push(groupName);
        } else if (!collapsed && index !== -1) {
            collapsedGroups.splice(index, 1);
        }

        await this.context.workspaceState.update(COLLAPSED_STATE_KEY, collapsedGroups);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: HistoryTreeNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: HistoryTreeNode): Thenable<HistoryTreeNode[]> {
        if (!element) {
            // Return date group nodes at root level
            const sortedHistory = [...this.history].sort((a, b) => b.timestamp - a.timestamp);
            const groups = groupHistoryByDate(sortedHistory);
            const collapsedGroups = this.getCollapsedGroups();
            const dateGroups: DateGroupItem[] = [];

            for (const groupName of getGroupOrder()) {
                const items = groups.get(groupName) || [];
                if (items.length > 0) {
                    const isCollapsed = collapsedGroups.includes(groupName);
                    dateGroups.push(new DateGroupItem(groupName, items.length, isCollapsed));
                }
            }

            return Promise.resolve(dateGroups);
        }

        if (element instanceof DateGroupItem) {
            // Return history items for this date group
            const sortedHistory = [...this.history].sort((a, b) => b.timestamp - a.timestamp);
            const groups = groupHistoryByDate(sortedHistory);
            const items = groups.get(element.groupName) || [];
            return Promise.resolve(items.map(item => new HistoryTreeItem(item)));
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
            vscode.l10n.t('Are you sure you want to delete this history item?'),
            { modal: true },
            vscode.l10n.t('Delete')
        );

        if (confirm === vscode.l10n.t('Delete')) {
            await this.storageService.deleteHistoryItem(item.historyItem.id);
            this.refresh();
        }
    }

    async clearHistory(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            vscode.l10n.t('Are you sure you want to clear all history?'),
            { modal: true },
            vscode.l10n.t('Clear All')
        );

        if (confirm === vscode.l10n.t('Clear All')) {
            await this.storageService.clearHistory();
            this.refresh();
            vscode.window.showInformationMessage(vscode.l10n.t('History cleared.'));
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
