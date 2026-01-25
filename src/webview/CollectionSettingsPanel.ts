import * as vscode from 'vscode';
import { getNonce, getVscodeElementsUri, getCodiconsUri } from './webviewUtils';
import { Collection, RequestHeader, AuthConfig, AuthType } from '../models/Collection';
import { StorageService } from '../storage/StorageService';

export class CollectionSettingsPanel {
    private static panels: Map<string, CollectionSettingsPanel> = new Map();
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _storageService: StorageService;
    private _collection: Collection;
    private _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        storageService: StorageService,
        collection: Collection
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._storageService = storageService;
        this._collection = collection;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => this._handleMessage(message),
            null,
            this._disposables
        );
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        storageService: StorageService,
        collection: Collection
    ): CollectionSettingsPanel {
        const column = vscode.window.activeTextEditor?.viewColumn;

        // If panel already exists for this collection, show it
        if (CollectionSettingsPanel.panels.has(collection.id)) {
            const existingPanel = CollectionSettingsPanel.panels.get(collection.id)!;
            existingPanel._panel.reveal(column);
            return existingPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'collectionSettings',
            `Settings: ${collection.name}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'dist')
                ]
            }
        );

        const settingsPanel = new CollectionSettingsPanel(panel, extensionUri, storageService, collection);
        CollectionSettingsPanel.panels.set(collection.id, settingsPanel);
        return settingsPanel;
    }

    private async _handleMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'saveSettings':
                await this._saveSettings(message.data);
                break;
        }
    }

    private async _saveSettings(data: { headers: RequestHeader[]; auth: AuthConfig }): Promise<void> {
        this._collection.defaultHeaders = data.headers;
        this._collection.defaultAuth = data.auth;
        this._collection.updatedAt = Date.now();
        await this._storageService.saveCollection(this._collection);
        vscode.commands.executeCommand('endpoint.refreshCollections');
        vscode.window.showInformationMessage(`Collection settings saved for "${this._collection.name}"`);
    }

    private _update(): void {
        this._panel.webview.html = this._getHtml();
    }

    private _getHtml(): string {
        const nonce = getNonce();
        const { bundleUri } = getVscodeElementsUri(this._panel.webview, this._extensionUri);
        const codiconsUri = getCodiconsUri(this._panel.webview, this._extensionUri);

        const headers = this._collection.defaultHeaders || [];
        const auth = this._collection.defaultAuth || { type: 'none' as AuthType };

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; font-src ${this._panel.webview.cspSource}; script-src 'nonce-${nonce}';">
    <link href="${codiconsUri}" rel="stylesheet" />
    <title>Collection Settings</title>
    <style>
        * { box-sizing: border-box; }
        body {
            padding: 16px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h2 {
            margin-top: 0;
            border-bottom: 1px solid var(--vscode-widget-border);
            padding-bottom: 8px;
        }
        .section {
            margin-bottom: 24px;
        }
        .section-title {
            font-weight: 500;
            margin-bottom: 12px;
            font-size: 14px;
        }
        .key-value-table {
            width: 100%;
            border-collapse: collapse;
        }
        .key-value-table th {
            text-align: left;
            padding: 8px;
            border-bottom: 1px solid var(--vscode-widget-border);
            font-weight: 500;
        }
        .key-value-table td {
            padding: 4px 8px;
            vertical-align: middle;
        }
        .key-value-row {
            border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.35));
        }
        .key-value-row:last-child {
            border-bottom: none;
        }
        .checkbox-cell { width: 32px; text-align: center; }
        .delete-cell { width: 40px; text-align: center; }
        .delete-btn {
            cursor: pointer;
            opacity: 0.7;
            background: none;
            border: none;
            color: var(--vscode-foreground);
            padding: 4px;
        }
        .delete-btn:hover {
            opacity: 1;
            color: var(--vscode-errorForeground);
        }
        .add-row-btn { margin-top: 8px; }
        .auth-section { display: flex; flex-direction: column; gap: 12px; }
        .auth-fields {
            display: none;
            flex-direction: column;
            gap: 8px;
            padding: 12px;
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            margin-top: 8px;
        }
        .auth-fields.active { display: flex; }
        .auth-field-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .auth-field-row label {
            width: 100px;
            flex-shrink: 0;
        }
        .auth-field-row vscode-textfield,
        .auth-field-row vscode-single-select {
            flex: 1;
        }
        .secret-field-wrapper {
            display: flex;
            flex: 1;
            gap: 4px;
            align-items: center;
        }
        .secret-field-wrapper vscode-textfield {
            flex: 1;
        }
        .secret-toggle-btn {
            cursor: pointer;
            opacity: 0.7;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .secret-toggle-btn:hover {
            opacity: 1;
        }
        .button-row {
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid var(--vscode-widget-border);
        }
        .info-text {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            margin-bottom: 12px;
        }
    </style>
</head>
<body>
    <h2>Collection Settings: ${escapeHtml(this._collection.name)}</h2>
    
    <div class="section">
        <div class="section-title">Default Headers</div>
        <p class="info-text">These headers will be automatically included in all requests within this collection. Request-specific headers will override these defaults.</p>
        <table class="key-value-table">
            <thead>
                <tr>
                    <th class="checkbox-cell"></th>
                    <th>Key</th>
                    <th>Value</th>
                    <th class="delete-cell"></th>
                </tr>
            </thead>
            <tbody id="headersBody">
                ${this._renderHeaderRows(headers)}
            </tbody>
        </table>
        <vscode-button class="add-row-btn" appearance="secondary" data-action="addHeader">
            <span class="codicon codicon-add"></span>
            Add Header
        </vscode-button>
        <vscode-button class="add-row-btn" appearance="secondary" data-action="addCommonHeaders" style="margin-left: 8px;">
            <span class="codicon codicon-sparkle"></span>
            Add Common Headers
        </vscode-button>
    </div>

    <div class="section">
        <div class="section-title">Default Authentication</div>
        <p class="info-text">This authentication will be used for all requests in this collection unless overridden at the request level.</p>
        <div class="auth-section">
            <vscode-single-select id="authType">
                <vscode-option value="none" ${auth.type === 'none' ? 'selected' : ''}>No Auth</vscode-option>
                <vscode-option value="basic" ${auth.type === 'basic' ? 'selected' : ''}>Basic Auth</vscode-option>
                <vscode-option value="bearer" ${auth.type === 'bearer' ? 'selected' : ''}>Bearer Token</vscode-option>
                <vscode-option value="apikey" ${auth.type === 'apikey' ? 'selected' : ''}>API Key</vscode-option>
            </vscode-single-select>

            <div id="authBasic" class="auth-fields ${auth.type === 'basic' ? 'active' : ''}">
                <div class="auth-field-row">
                    <label>Username</label>
                    <vscode-textfield id="authUsername" value="${escapeHtml(auth.username || '')}"></vscode-textfield>
                </div>
                <div class="auth-field-row">
                    <label>Password</label>
                    <div class="secret-field-wrapper">
                        <vscode-textfield id="authPassword" type="password" value="${escapeHtml(auth.password || '')}"></vscode-textfield>
                        <span class="secret-toggle-btn" data-target="authPassword" title="Show/Hide">
                            <span class="codicon codicon-eye"></span>
                        </span>
                    </div>
                </div>
            </div>

            <div id="authBearer" class="auth-fields ${auth.type === 'bearer' ? 'active' : ''}">
                <div class="auth-field-row">
                    <label>Token</label>
                    <div class="secret-field-wrapper">
                        <vscode-textfield id="authToken" type="password" value="${escapeHtml(auth.token || '')}"></vscode-textfield>
                        <span class="secret-toggle-btn" data-target="authToken" title="Show/Hide">
                            <span class="codicon codicon-eye"></span>
                        </span>
                    </div>
                </div>
            </div>

            <div id="authApiKey" class="auth-fields ${auth.type === 'apikey' ? 'active' : ''}">
                <div class="auth-field-row">
                    <label>Key Name</label>
                    <vscode-textfield id="authApiKeyName" value="${escapeHtml(auth.apiKeyName || '')}"></vscode-textfield>
                </div>
                <div class="auth-field-row">
                    <label>Key Value</label>
                    <div class="secret-field-wrapper">
                        <vscode-textfield id="authApiKeyValue" type="password" value="${escapeHtml(auth.apiKeyValue || '')}"></vscode-textfield>
                        <span class="secret-toggle-btn" data-target="authApiKeyValue" title="Show/Hide">
                            <span class="codicon codicon-eye"></span>
                        </span>
                    </div>
                </div>
                <div class="auth-field-row">
                    <label>Add to</label>
                    <vscode-single-select id="authApiKeyIn">
                        <vscode-option value="header" ${auth.apiKeyIn === 'header' || !auth.apiKeyIn ? 'selected' : ''}>Header</vscode-option>
                        <vscode-option value="query" ${auth.apiKeyIn === 'query' ? 'selected' : ''}>Query Params</vscode-option>
                    </vscode-single-select>
                </div>
            </div>
        </div>
    </div>

    <div class="button-row">
        <vscode-button id="saveBtn">
            <span class="codicon codicon-save"></span>
            Save Settings
        </vscode-button>
    </div>

    <script type="module" nonce="${nonce}" src="${bundleUri}"></script>
    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();

            function collectHeaderRows() {
                const rows = [];
                document.getElementById('headersBody').querySelectorAll('tr').forEach(row => {
                    const enabledCheckbox = row.querySelector('vscode-checkbox');
                    const keyInput = row.querySelector('vscode-textfield[data-field="key"]');
                    const valueInput = row.querySelector('vscode-textfield[data-field="value"]');
                    if (keyInput && valueInput) {
                        rows.push({
                            name: keyInput.value || '',
                            value: valueInput.value || '',
                            enabled: enabledCheckbox ? enabledCheckbox.checked : true
                        });
                    }
                });
                return rows;
            }

            function collectAuthConfig() {
                const authType = document.getElementById('authType').value;
                const auth = { type: authType };
                if (authType === 'basic') {
                    auth.username = document.getElementById('authUsername').value;
                    auth.password = document.getElementById('authPassword').value;
                } else if (authType === 'bearer') {
                    auth.token = document.getElementById('authToken').value;
                } else if (authType === 'apikey') {
                    auth.apiKeyName = document.getElementById('authApiKeyName').value;
                    auth.apiKeyValue = document.getElementById('authApiKeyValue').value;
                    auth.apiKeyIn = document.getElementById('authApiKeyIn').value;
                }
                return auth;
            }

            // Auth type change handler
            document.getElementById('authType').addEventListener('change', (e) => {
                const authType = e.target.value;
                document.querySelectorAll('.auth-fields').forEach(el => el.classList.remove('active'));
                if (authType !== 'none') {
                    const authSection = document.getElementById('auth' + authType.charAt(0).toUpperCase() + authType.slice(1));
                    if (authSection) {
                        authSection.classList.add('active');
                    }
                }
            });

            // Secret field show/hide toggle
            document.querySelectorAll('.secret-toggle-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const targetId = btn.dataset.target;
                    const field = document.getElementById(targetId);
                    const icon = btn.querySelector('.codicon');
                    if (field) {
                        if (field.type === 'password') {
                            field.type = 'text';
                            icon.classList.remove('codicon-eye');
                            icon.classList.add('codicon-eye-closed');
                        } else {
                            field.type = 'password';
                            icon.classList.remove('codicon-eye-closed');
                            icon.classList.add('codicon-eye');
                        }
                    }
                });
            });

            // Save button
            document.getElementById('saveBtn').addEventListener('click', () => {
                const headers = collectHeaderRows();
                const auth = collectAuthConfig();
                vscode.postMessage({ type: 'saveSettings', data: { headers, auth } });
            });

            // Add header button
            document.querySelector('[data-action="addHeader"]').addEventListener('click', () => {
                addHeaderRow();
            });

            // Add common headers button
            document.querySelector('[data-action="addCommonHeaders"]').addEventListener('click', () => {
                addCommonHeaders();
            });

            const commonHeaders = [
                { name: 'Accept', value: 'application/json' },
                { name: 'Content-Type', value: 'application/json' },
                { name: 'User-Agent', value: 'Endpoint/1.0' },
                { name: 'Accept-Encoding', value: 'gzip, deflate' },
                { name: 'Cache-Control', value: 'no-cache' }
            ];

            function addCommonHeaders() {
                const existingKeys = new Set();
                document.getElementById('headersBody').querySelectorAll('tr').forEach(row => {
                    const keyInput = row.querySelector('vscode-textfield[data-field="key"]');
                    if (keyInput && keyInput.value) {
                        existingKeys.add(keyInput.value.toLowerCase());
                    }
                });

                let addedCount = 0;
                commonHeaders.forEach(header => {
                    if (!existingKeys.has(header.name.toLowerCase())) {
                        addHeaderRow(header.name, header.value, true);
                        addedCount++;
                    }
                });

                if (addedCount === 0) {
                    // All common headers already exist
                }
            }

            function addHeaderRow(key = '', value = '', enabled = true) {
                const tbody = document.getElementById('headersBody');
                const row = document.createElement('tr');
                row.className = 'key-value-row';
                row.innerHTML = \`
                    <td class="checkbox-cell">
                        <vscode-checkbox \${enabled ? 'checked' : ''}></vscode-checkbox>
                    </td>
                    <td>
                        <vscode-textfield data-field="key" placeholder="Key" value="\${key}"></vscode-textfield>
                    </td>
                    <td>
                        <vscode-textfield data-field="value" placeholder="Value" value="\${value}"></vscode-textfield>
                    </td>
                    <td class="delete-cell">
                        <button class="delete-btn" data-action="deleteRow">
                            <span class="codicon codicon-trash"></span>
                        </button>
                    </td>
                \`;
                tbody.appendChild(row);
                row.querySelector('.delete-btn').addEventListener('click', () => row.remove());
            }

            // Delete handlers for initial rows
            document.querySelectorAll('.delete-btn[data-action="deleteRow"]').forEach(btn => {
                btn.addEventListener('click', (e) => e.target.closest('tr').remove());
            });
        })();
    </script>
</body>
</html>`;
    }

    private _renderHeaderRows(headers: RequestHeader[]): string {
        if (!headers || headers.length === 0) {
            return '';
        }
        return headers.map(h => `
            <tr class="key-value-row">
                <td class="checkbox-cell">
                    <vscode-checkbox ${h.enabled ? 'checked' : ''}></vscode-checkbox>
                </td>
                <td>
                    <vscode-textfield data-field="key" placeholder="Key" value="${escapeHtml(h.name)}"></vscode-textfield>
                </td>
                <td>
                    <vscode-textfield data-field="value" placeholder="Value" value="${escapeHtml(h.value)}"></vscode-textfield>
                </td>
                <td class="delete-cell">
                    <button class="delete-btn" data-action="deleteRow">
                        <span class="codicon codicon-trash"></span>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    public dispose(): void {
        CollectionSettingsPanel.panels.delete(this._collection.id);
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) {
                d.dispose();
            }
        }
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
