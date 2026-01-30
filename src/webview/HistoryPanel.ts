import * as vscode from 'vscode';
import { HistoryItem } from '../models/HistoryItem';
import { StorageService } from '../storage/StorageService';
import { SyntaxHighlighter } from '../http/SyntaxHighlighter';
import { getNonce, getVscodeElementsUri, getCodiconsUri, getSharedCssUri, getRequestViewCssUri, getHistoryViewCssUri } from './webviewUtils';
import { RequestPanel } from './RequestPanel';

/**
 * Read-only webview panel for displaying history items.
 * Shows request details, response data, and metadata.
 */
export class HistoryPanel {
    private static panels: Map<string, HistoryPanel> = new Map();
    private static _storageService: StorageService | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _historyId: string;
    private _disposables: vscode.Disposable[] = [];
    private _historyItem: HistoryItem | undefined;

    public static initialize(storageService: StorageService): void {
        HistoryPanel._storageService = storageService;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        historyId: string,
        historyItem: HistoryItem
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._historyId = historyId;
        this._historyItem = historyItem;

        // Set the webview's initial HTML content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this._dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => this._handleMessage(message),
            null,
            this._disposables
        );
    }

    public static async createOrShow(
        extensionUri: vscode.Uri,
        historyId: string
    ): Promise<HistoryPanel | undefined> {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel for this history item, show it
        if (HistoryPanel.panels.has(historyId)) {
            const existingPanel = HistoryPanel.panels.get(historyId)!;
            existingPanel._panel.reveal(column);
            return existingPanel;
        }

        // Load the history item
        if (!HistoryPanel._storageService) {
            vscode.window.showErrorMessage(vscode.l10n.t('Storage not initialized. Please reload the extension.'));
            return undefined;
        }

        const historyItem = HistoryPanel._storageService.getHistoryItem(historyId);
        if (!historyItem) {
            vscode.window.showErrorMessage(vscode.l10n.t('History item not found.'));
            return undefined;
        }

        // Create a new panel
        const title = `${historyItem.method} ${HistoryPanel._truncateUrl(historyItem.url)}`;
        const panel = vscode.window.createWebviewPanel(
            'endpointHistory',
            title,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'dist')
                ]
            }
        );

        // Set tab icon
        panel.iconPath = new vscode.ThemeIcon('history');

        const historyPanel = new HistoryPanel(panel, extensionUri, historyId, historyItem);
        HistoryPanel.panels.set(historyId, historyPanel);

        return historyPanel;
    }

    private static _truncateUrl(url: string, maxLength: number = 40): string {
        if (url.length <= maxLength) {
            return url;
        }
        try {
            const urlObj = new URL(url);
            const path = urlObj.pathname;
            if (path.length > 20) {
                return urlObj.host + '/...' + path.slice(-15);
            }
            return urlObj.host + path;
        } catch {
            return url.substring(0, maxLength) + '...';
        }
    }

    private _handleMessage(message: any): void {
        switch (message.type) {
            case 'saveToCollection':
                this._saveToCollection();
                break;
            case 'copyToClipboard':
                this._copyToClipboard(message.text);
                break;
            case 'navigateToSource':
                this._navigateToSource(message.collectionId, message.requestId);
                break;
        }
    }

    private async _navigateToSource(collectionId: string, requestId: string): Promise<void> {
        if (!HistoryPanel._storageService) {
            return;
        }

        const collection = await HistoryPanel._storageService.getCollectionAsync(collectionId);
        if (!collection) {
            vscode.window.showWarningMessage(vscode.l10n.t('Source collection no longer exists.'));
            return;
        }

        const request = collection.requests.find(r => r.id === requestId);
        if (!request) {
            vscode.window.showWarningMessage(vscode.l10n.t('Source request no longer exists in the collection.'));
            return;
        }

        // Open the request in a RequestPanel
        await RequestPanel.openRequest(this._extensionUri, request, collectionId);
    }

    private async _saveToCollection(): Promise<void> {
        if (!this._historyItem || !HistoryPanel._storageService) {
            return;
        }

        const collections = await HistoryPanel._storageService.getCollectionsAsync();
        if (collections.length === 0) {
            const create = await vscode.window.showInformationMessage(
                vscode.l10n.t('No collections found. Create one first?'),
                vscode.l10n.t('Create Collection')
            );
            if (create) {
                vscode.commands.executeCommand('endpoint.addCollection');
            }
            return;
        }

        // Let user pick a collection
        const items = collections.map(c => ({
            label: c.name,
            description: vscode.l10n.t('{0} requests', c.requests.length),
            collection: c
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: vscode.l10n.t('Select a collection to save the request to')
        });

        if (selected) {
            // Prompt for request name
            const name = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('Enter a name for this request'),
                value: `${this._historyItem.method} ${this._getPathFromUrl(this._historyItem.url)}`,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return vscode.l10n.t('Name cannot be empty');
                    }
                    return undefined;
                }
            });

            if (!name) {
                return;
            }

            const newRequest = {
                id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                name: name.trim(),
                method: this._historyItem.method,
                url: this._historyItem.url,
                headers: this._historyItem.headers.map(h => ({ name: h.name, value: h.value, enabled: h.enabled })),
                body: this._historyItem.body,
                auth: { type: 'none' as const },
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            selected.collection.requests.push(newRequest);
            selected.collection.updatedAt = Date.now();
            await HistoryPanel._storageService.saveCollection(selected.collection);

            vscode.commands.executeCommand('endpoint.refreshCollections');
            vscode.window.showInformationMessage(vscode.l10n.t('Request saved to "{0}".', selected.collection.name));
        }
    }

    private _getPathFromUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.pathname || '/';
        } catch {
            return url;
        }
    }

    private async _copyToClipboard(text: string): Promise<void> {
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage(vscode.l10n.t('Copied to clipboard'));
    }

    private async _update(): Promise<void> {
        this._panel.webview.html = await this._getWebviewContent();
    }

    private async _getWebviewContent(): Promise<string> {
        const webview = this._panel.webview;
        const nonce = getNonce();
        const { bundleUri } = getVscodeElementsUri(webview, this._extensionUri);
        const codiconsUri = getCodiconsUri(webview, this._extensionUri);
        const sharedCssUri = getSharedCssUri(webview, this._extensionUri);
        const requestViewCssUri = getRequestViewCssUri(webview, this._extensionUri);
        const historyViewCssUri = getHistoryViewCssUri(webview, this._extensionUri);

        if (!this._historyItem) {
            return this._getErrorHtml(nonce, bundleUri, codiconsUri, sharedCssUri);
        }

        const item = this._historyItem;

        // Format timestamp
        const timestamp = new Date(item.timestamp);
        const formattedTimestamp = timestamp.toLocaleString();

        // Get source collection/request names if available
        let sourceName = '';
        let sourceCollectionId = '';
        let sourceRequestId = '';
        if (item.sourceCollectionId && HistoryPanel._storageService) {
            const collection = await HistoryPanel._storageService.getCollectionAsync(item.sourceCollectionId);
            if (collection) {
                sourceName = collection.name;
                sourceCollectionId = item.sourceCollectionId;
                if (item.sourceRequestId) {
                    const request = collection.requests.find(r => r.id === item.sourceRequestId);
                    if (request) {
                        sourceName += ` / ${request.name}`;
                        sourceRequestId = item.sourceRequestId;
                    }
                }
            }
        }

        // Syntax highlight response body if JSON
        let highlightedResponseBody = '';
        if (item.responseBody) {
            const contentType = item.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type')?.value || '';
            highlightedResponseBody = await SyntaxHighlighter.getInstance().highlightResponse(item.responseBody, contentType);
        }

        // Syntax highlight request body if present
        let highlightedRequestBody = '';
        if (item.body && item.body.type !== 'none' && item.body.content) {
            const bodyContentType = item.body.type === 'json' ? 'application/json' :
                item.body.type === 'xml' ? 'application/xml' :
                    'text/plain';
            highlightedRequestBody = await SyntaxHighlighter.getInstance().highlightResponse(item.body.content, bodyContentType);
        }

        // Status class
        const statusClass = item.statusCode && item.statusCode >= 200 && item.statusCode < 300 ? 'status-success' : 'status-error';

        // Parse cookies from Set-Cookie headers
        const cookies: { name: string; value: string; domain: string; path: string }[] = [];
        if (item.responseHeaders) {
            item.responseHeaders
                .filter(h => h.name.toLowerCase() === 'set-cookie')
                .forEach(h => {
                    const parts = h.value.split(';').map(p => p.trim());
                    const [nameValue, ...attrs] = parts;
                    const [name, ...valueParts] = nameValue.split('=');
                    const value = valueParts.join('=');

                    let domain = '', path = '';
                    attrs.forEach(attr => {
                        const [key, val] = attr.split('=');
                        if (key && key.toLowerCase() === 'domain') { domain = val || ''; }
                        if (key && key.toLowerCase() === 'path') { path = val || ''; }
                    });

                    cookies.push({ name, value, domain, path });
                });
        }

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';">
    <link href="${codiconsUri}" rel="stylesheet" />
    <link href="${sharedCssUri}" rel="stylesheet" />
    <link href="${requestViewCssUri}" rel="stylesheet" />
    <link href="${historyViewCssUri}" rel="stylesheet" />
    <title>History Details</title>
</head>
<body>
    <div class="history-container">
        <!-- Header -->
        <div class="history-header">
            <div class="history-title">
                <span class="method-badge ${escapeHtml(item.method)}">${escapeHtml(item.method)}</span>
                <span class="url-display">${escapeHtml(item.url)}</span>
            </div>
            <vscode-button id="saveToCollectionBtn">
                <span class="codicon codicon-save"></span>
                Save to Collection
            </vscode-button>
        </div>

        <!-- Metadata Section -->
        <div class="section">
            <div class="section-header">
                <span class="codicon codicon-info"></span>
                Metadata
            </div>
            <div class="section-content">
                <div class="metadata-grid">
                    <span class="metadata-label">Timestamp:</span>
                    <span class="metadata-value">${escapeHtml(formattedTimestamp)}</span>
                    
                    ${item.statusCode !== undefined ? `
                    <span class="metadata-label">Status:</span>
                    <span class="metadata-value ${statusClass}">${item.statusCode} ${escapeHtml(item.statusText || '')}</span>
                    ` : ''}
                    
                    ${item.responseTime !== undefined ? `
                    <span class="metadata-label">Duration:</span>
                    <span class="metadata-value">${item.responseTime}ms</span>
                    ` : ''}
                    
                    ${sourceName ? `
                    <span class="metadata-label">Source:</span>
                    ${sourceRequestId ? `
                    <a class="metadata-value source-link" id="sourceLink" data-collection-id="${escapeHtml(sourceCollectionId)}" data-request-id="${escapeHtml(sourceRequestId)}">${escapeHtml(sourceName)}</a>
                    ` : `
                    <span class="metadata-value">${escapeHtml(sourceName)}</span>
                    `}
                    ` : ''}
                </div>
            </div>
        </div>

        <!-- Request Section -->
        <div class="section">
            <div class="section-header">
                <span class="codicon codicon-arrow-right"></span>
                Request
            </div>
            <div class="section-content">
                <vscode-tabs id="requestTabs" selected-index="0">
                    <vscode-tab-header slot="header">Headers <span class="tab-badge">${item.headers.length}</span></vscode-tab-header>
                    <vscode-tab-header slot="header">Body</vscode-tab-header>

                    <!-- Request Headers Tab -->
                    <vscode-tab-panel>
                        ${item.headers.length > 0 ? `
                            <table class="headers-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${item.headers.map(h => `
                                        <tr>
                                            <td>${escapeHtml(h.name)}</td>
                                            <td>${escapeHtml(h.value)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : '<div class="no-data">No headers</div>'}
                    </vscode-tab-panel>

                    <!-- Request Body Tab -->
                    <vscode-tab-panel>
                        ${item.body && item.body.type !== 'none' && item.body.content ? `
                            <div class="body-preview">
                                ${highlightedRequestBody}
                            </div>
                        ` : '<div class="no-data">No request body</div>'}
                    </vscode-tab-panel>
                </vscode-tabs>
            </div>
        </div>

        <!-- Response Section -->
        <div class="section">
            <div class="section-header">
                <span class="codicon codicon-arrow-left"></span>
                Response
            </div>
            <div class="section-content">
                ${item.statusCode !== undefined ? `
                <div class="response-metrics-inline" style="margin-bottom: 12px;">
                    <div class="metric-inline">
                        <span class="metric-label">Status:</span>
                        <span class="metric-value ${statusClass}">${item.statusCode} ${escapeHtml(item.statusText || '')}</span>
                    </div>
                    ${item.responseTime !== undefined ? `
                    <div class="metric-inline">
                        <span class="metric-label">Time:</span>
                        <span class="metric-value">${item.responseTime}ms</span>
                    </div>
                    ` : ''}
                </div>
                ` : '<div class="no-data" style="margin-bottom: 12px;">No response recorded</div>'}

                <vscode-tabs id="responseTabs" selected-index="0">
                    <vscode-tab-header slot="header">Body</vscode-tab-header>
                    <vscode-tab-header slot="header">Headers${item.responseHeaders ? ` <span class="tab-badge">${item.responseHeaders.filter(h => h.name.toLowerCase() !== 'set-cookie').length}</span>` : ''}</vscode-tab-header>
                    <vscode-tab-header slot="header">Cookies${cookies.length > 0 ? ` <span class="tab-badge">${cookies.length}</span>` : ''}</vscode-tab-header>

                    <!-- Response Body Tab -->
                    <vscode-tab-panel>
                        ${item.responseBody ? `
                            <div class="body-preview">
                                ${highlightedResponseBody}
                            </div>
                            ${item.responseBodyTruncated ? `
                            <div class="truncated-warning">
                                <span class="codicon codicon-warning"></span>
                                Response body was truncated due to size limits
                            </div>
                            ` : ''}
                        ` : '<div class="no-data">No response body stored</div>'}
                    </vscode-tab-panel>

                    <!-- Response Headers Tab -->
                    <vscode-tab-panel>
                        ${item.responseHeaders && item.responseHeaders.filter(h => h.name.toLowerCase() !== 'set-cookie').length > 0 ? `
                            <table class="headers-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${item.responseHeaders.filter(h => h.name.toLowerCase() !== 'set-cookie').map(h => `
                                        <tr>
                                            <td>${escapeHtml(h.name)}</td>
                                            <td>${escapeHtml(h.value)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : '<div class="no-data">No response headers stored</div>'}
                    </vscode-tab-panel>

                    <!-- Cookies Tab -->
                    <vscode-tab-panel>
                        ${cookies.length > 0 ? `
                            <table class="cookies-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Value</th>
                                        <th>Domain</th>
                                        <th>Path</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${cookies.map(c => `
                                        <tr>
                                            <td>${escapeHtml(c.name)}</td>
                                            <td>${escapeHtml(c.value)}</td>
                                            <td>${escapeHtml(c.domain)}</td>
                                            <td>${escapeHtml(c.path)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        ` : '<div class="no-data">No cookies in response</div>'}
                    </vscode-tab-panel>
                </vscode-tabs>
            </div>
        </div>
    </div>

    <script type="module" nonce="${nonce}" src="${bundleUri}"></script>
    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();

            // Save to Collection button handler
            document.getElementById('saveToCollectionBtn').addEventListener('click', () => {
                vscode.postMessage({ type: 'saveToCollection' });
            });

            // Source link click handler
            const sourceLink = document.getElementById('sourceLink');
            if (sourceLink) {
                sourceLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    const collectionId = sourceLink.getAttribute('data-collection-id');
                    const requestId = sourceLink.getAttribute('data-request-id');
                    vscode.postMessage({ type: 'navigateToSource', collectionId, requestId });
                });
            }

            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.type) {
                    // Add any additional message handlers here
                }
            });
        })();
    </script>
</body>
</html>`;
    }

    private _getErrorHtml(nonce: string, bundleUri: vscode.Uri, codiconsUri: vscode.Uri, sharedCssUri: vscode.Uri): string {
        const webview = this._panel.webview;
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';">
    <link href="${codiconsUri}" rel="stylesheet" />
    <link href="${sharedCssUri}" rel="stylesheet" />
    <title>History Details</title>
</head>
<body>
    <div style="padding: 20px; text-align: center;">
        <span class="codicon codicon-error" style="font-size: 48px; color: var(--vscode-errorForeground);"></span>
        <h2>History Item Not Found</h2>
        <p>The requested history item could not be loaded.</p>
    </div>
    <script type="module" nonce="${nonce}" src="${bundleUri}"></script>
</body>
</html>`;
    }

    private _dispose(): void {
        // Remove from panels map
        HistoryPanel.panels.delete(this._historyId);

        // Clean up disposables
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    public dispose(): void {
        this._panel.dispose();
    }
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
