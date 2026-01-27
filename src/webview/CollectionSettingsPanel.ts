import * as vscode from 'vscode';
import { getNonce, getVscodeElementsUri, getCodiconsUri, getSharedCssUri, getCollectionSettingsCssUri } from './webviewUtils';
import { Collection, RequestHeader, AuthConfig, AuthType } from '../models/Collection';
import { StorageService } from '../storage/StorageService';
import { VariableService } from '../storage/VariableService';

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
            case 'getAvailableVariables':
                this._getAvailableVariables();
                break;
            case 'convertToRepo':
                await this._convertToRepo();
                break;
        }
    }

    private async _convertToRepo(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            vscode.l10n.t('Convert "{0}" to a repo-based collection?\n\nSensitive authentication data (passwords, tokens, API keys) will be stored locally and NOT included in the repository file. Team members will need to configure their own credentials.', this._collection.name),
            { modal: true },
            vscode.l10n.t('Convert to Repo')
        );

        if (confirm === vscode.l10n.t('Convert to Repo')) {
            try {
                await this._storageService.convertToRepoCollection(this._collection);
                this._collection.storageType = 'repo';
                vscode.commands.executeCommand('endpoint.refreshCollections');
                this._update();
                vscode.window.showInformationMessage(vscode.l10n.t('Collection "{0}" is now stored in .endpoint/collections/', this._collection.name));
            } catch (error) {
                vscode.window.showErrorMessage(vscode.l10n.t('Failed to convert collection: {0}', String(error)));
            }
        }
    }

    private async _getAvailableVariables(): Promise<void> {
        // Built-in variable names
        const builtinVariables = [
            '$timestamp',
            '$guid',
            '$uuid',
            '$date',
            '$time',
            '$randomint',
            '$datetime',
            '$timestamp_unix'
        ];

        // Convert to flat array format: { name: string, source: string }[]
        const variables: { name: string; source: string }[] = builtinVariables.map(name => ({
            name,
            source: 'Built-in'
        }));

        try {
            const variableService = new VariableService(this._storageService);
            // Get variables preview from VariableService
            const preview = await variableService.getVariablesPreview(this._collection.id);

            // Add environment variables
            for (const name of Object.keys(preview.environment)) {
                variables.push({ name, source: 'Environment' });
            }

            // Add collection variables
            for (const name of Object.keys(preview.collection)) {
                variables.push({ name, source: 'Collection' });
            }

            this._panel.webview.postMessage({ type: 'variablesList', data: variables });
        } catch (error) {
            // Return just built-ins on error
            this._panel.webview.postMessage({ type: 'variablesList', data: variables });
        }
    }

    private async _saveSettings(data: { headers: RequestHeader[]; auth: AuthConfig }): Promise<void> {
        this._collection.defaultHeaders = data.headers;
        this._collection.defaultAuth = data.auth;
        this._collection.updatedAt = Date.now();
        await this._storageService.saveCollection(this._collection);
        vscode.commands.executeCommand('endpoint.refreshCollections');
        vscode.window.showInformationMessage(vscode.l10n.t('Collection settings saved for "{0}"', this._collection.name));
    }

    private _update(): void {
        this._panel.webview.html = this._getHtml();
    }

    private _getHtml(): string {
        const nonce = getNonce();
        const { bundleUri } = getVscodeElementsUri(this._panel.webview, this._extensionUri);
        const codiconsUri = getCodiconsUri(this._panel.webview, this._extensionUri);
        const sharedCssUri = getSharedCssUri(this._panel.webview, this._extensionUri);
        const collectionSettingsCssUri = getCollectionSettingsCssUri(this._panel.webview, this._extensionUri);
        const extensionVersion = vscode.extensions.getExtension('timheuer.vscode-endpoint')?.packageJSON.version ?? '';

        const headers = this._collection.defaultHeaders || [];
        const auth = this._collection.defaultAuth || { type: 'none' as AuthType };
        const isRepoCollection = this._collection.storageType === 'repo';
        const hasWorkspace = vscode.workspace.workspaceFolders !== undefined && vscode.workspace.workspaceFolders.length > 0;

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource}; font-src ${this._panel.webview.cspSource}; script-src ${this._panel.webview.cspSource} 'nonce-${nonce}';">
    <link href="${codiconsUri}" rel="stylesheet" />
    <link href="${sharedCssUri}" rel="stylesheet" />
    <link href="${collectionSettingsCssUri}" rel="stylesheet" />
    <title>Collection Settings</title>
</head>
<body>
    <!-- Autocomplete dropdown -->
    <div id="autocompleteDropdown" class="autocomplete-dropdown"></div>
    <h2>Collection Settings: ${escapeHtml(this._collection.name)}</h2>
    
    <div class="section">
        <div class="section-title">Storage Location</div>
        ${isRepoCollection ? `
        <div class="info-banner info-banner-repo">
            <span class="codicon codicon-folder-library"></span>
            <span>This collection is stored in <strong>.endpoint/collections/</strong> and can be shared via version control.</span>
        </div>
        <p class="info-text info-text-warning">
            <span class="codicon codicon-warning"></span>
            Authentication credentials are stored locally and will NOT be included in the repository file. Team members will need to configure their own credentials.
        </p>
        ` : `
        <div class="info-banner info-banner-local">
            <span class="codicon codicon-folder"></span>
            <span>This collection is stored locally in VS Code settings.</span>
        </div>
        ${hasWorkspace ? `
        <vscode-button id="convertToRepoBtn" appearance="secondary" style="margin-top: 8px;">
            <span class="codicon codicon-repo"></span>
            Store in Repository
        </vscode-button>
        <p class="info-text" style="margin-top: 8px;">Convert to share this collection via version control. Sensitive auth data will remain local.</p>
        ` : `
        <p class="info-text" style="margin-top: 8px;">Open a workspace folder to enable repository-based storage.</p>
        `}
        `}
    </div>
    
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
            
            // Autocomplete state
            let availableVariables = [];
            let autocompleteTarget = null;
            let autocompleteStartPos = 0;
            let selectedIndex = -1;
            
            // Request available variables
            vscode.postMessage({ type: 'getAvailableVariables' });
            
            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.type === 'variablesList') {
                    availableVariables = message.data || [];
                }
            });
            
            // Autocomplete selectors - fields that should have autocomplete
            const autocompleteSelectors = [
                '#authUsername',
                '#authPassword',
                '#authToken',
                '#authApiKeyName',
                '#authApiKeyValue',
                '[data-field="value"]' // Header value inputs
            ];
            
            function isAutocompleteField(element) {
                if (!element) return false;
                for (const selector of autocompleteSelectors) {
                    if (element.matches && element.matches(selector)) return true;
                    if (element.id && selector === '#' + element.id) return true;
                    if (element.dataset && element.dataset.field === 'value') return true;
                }
                return false;
            }
            
            function getInputElement(target) {
                if (target.tagName === 'VSCODE-TEXTFIELD') {
                    return target.shadowRoot?.querySelector('input') || target;
                }
                return target;
            }
            
            function getCursorPosition(element) {
                const input = getInputElement(element);
                return input.selectionStart || 0;
            }
            
            function setCursorPosition(element, pos) {
                const input = getInputElement(element);
                if (input.setSelectionRange) {
                    input.setSelectionRange(pos, pos);
                }
            }
            
            function getValue(element) {
                return element.value || '';
            }
            
            function setValue(element, value) {
                element.value = value;
            }
            
            const autocompleteDropdown = document.getElementById('autocompleteDropdown');
            
            function showAutocomplete(target, cursorPos) {
                const value = getValue(target);
                const textBeforeCursor = value.substring(0, cursorPos);
                
                const lastOpenBrace = textBeforeCursor.lastIndexOf('{{');
                if (lastOpenBrace === -1) {
                    hideAutocomplete();
                    return;
                }
                
                const textAfterBrace = textBeforeCursor.substring(lastOpenBrace + 2);
                if (textAfterBrace.includes('}}')) {
                    hideAutocomplete();
                    return;
                }
                
                const partialName = textAfterBrace.toLowerCase();
                const filtered = availableVariables.filter(v => 
                    v.name.toLowerCase().includes(partialName)
                );
                
                if (filtered.length === 0) {
                    renderAutocomplete([]);
                    positionDropdown(target);
                    autocompleteDropdown.classList.add('visible');
                    autocompleteTarget = target;
                    autocompleteStartPos = lastOpenBrace;
                    selectedIndex = -1;
                    return;
                }
                
                renderAutocomplete(filtered);
                positionDropdown(target);
                autocompleteDropdown.classList.add('visible');
                autocompleteTarget = target;
                autocompleteStartPos = lastOpenBrace;
                selectedIndex = 0;
                updateSelectedItem();
            }
            
            function hideAutocomplete() {
                autocompleteDropdown.classList.remove('visible');
                autocompleteTarget = null;
                selectedIndex = -1;
            }
            
            function escapeHtmlInJs(text) {
                return text
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }
            
            function renderAutocomplete(variables) {
                if (variables.length === 0) {
                    autocompleteDropdown.innerHTML = '<div class="autocomplete-no-results">No matching variables</div>';
                    return;
                }
                
                autocompleteDropdown.innerHTML = variables.map((v, i) => \`
                    <div class="autocomplete-item" data-index="\${i}" data-name="\${escapeHtmlInJs(v.name)}">
                        <span class="autocomplete-item-name">\${escapeHtmlInJs(v.name)}</span>
                        <span class="autocomplete-item-source">\${escapeHtmlInJs(v.source || 'Variable')}</span>
                    </div>
                \`).join('');
                
                autocompleteDropdown.querySelectorAll('.autocomplete-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const name = item.dataset.name;
                        insertVariable(name);
                    });
                });
            }
            
            function positionDropdown(target) {
                const rect = target.getBoundingClientRect();
                autocompleteDropdown.style.left = rect.left + 'px';
                autocompleteDropdown.style.top = (rect.bottom + 2) + 'px';
                autocompleteDropdown.style.minWidth = Math.min(rect.width, 250) + 'px';
            }
            
            function updateSelectedItem() {
                const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
                items.forEach((item, i) => {
                    item.classList.toggle('selected', i === selectedIndex);
                });
                if (selectedIndex >= 0 && items[selectedIndex]) {
                    items[selectedIndex].scrollIntoView({ block: 'nearest' });
                }
            }
            
            function insertVariable(name) {
                if (!autocompleteTarget) return;
                
                const value = getValue(autocompleteTarget);
                const beforeBrace = value.substring(0, autocompleteStartPos);
                const cursorPos = getCursorPosition(autocompleteTarget);
                const afterCursor = value.substring(cursorPos);
                
                const newValue = beforeBrace + '{{' + name + '}}' + afterCursor;
                setValue(autocompleteTarget, newValue);
                
                const newCursorPos = autocompleteStartPos + name.length + 4;
                setTimeout(() => {
                    autocompleteTarget.focus();
                    setCursorPosition(autocompleteTarget, newCursorPos);
                }, 0);
                
                hideAutocomplete();
            }
            
            // Listen for input events on document
            document.addEventListener('input', (e) => {
                const target = e.target;
                if (!isAutocompleteField(target)) return;
                
                const cursorPos = getCursorPosition(target);
                const value = getValue(target);
                const textBeforeCursor = value.substring(0, cursorPos);
                
                if (textBeforeCursor.endsWith('{{') || 
                    (autocompleteTarget === target && autocompleteDropdown.classList.contains('visible'))) {
                    showAutocomplete(target, cursorPos);
                } else {
                    const lastOpen = textBeforeCursor.lastIndexOf('{{');
                    if (lastOpen !== -1) {
                        const afterOpen = textBeforeCursor.substring(lastOpen + 2);
                        if (!afterOpen.includes('}}')) {
                            showAutocomplete(target, cursorPos);
                            return;
                        }
                    }
                    hideAutocomplete();
                }
            });
            
            // Keyboard navigation for autocomplete
            document.addEventListener('keydown', (e) => {
                if (!autocompleteDropdown.classList.contains('visible')) return;
                
                const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
                const itemCount = items.length;
                
                switch (e.key) {
                    case 'ArrowDown':
                        e.preventDefault();
                        if (itemCount > 0) {
                            selectedIndex = (selectedIndex + 1) % itemCount;
                            updateSelectedItem();
                        }
                        break;
                    case 'ArrowUp':
                        e.preventDefault();
                        if (itemCount > 0) {
                            selectedIndex = selectedIndex <= 0 ? itemCount - 1 : selectedIndex - 1;
                            updateSelectedItem();
                        }
                        break;
                    case 'Enter':
                        if (selectedIndex >= 0 && items[selectedIndex]) {
                            e.preventDefault();
                            const name = items[selectedIndex].dataset.name;
                            insertVariable(name);
                        }
                        break;
                    case 'Escape':
                        e.preventDefault();
                        hideAutocomplete();
                        break;
                    case 'Tab':
                        if (selectedIndex >= 0 && items[selectedIndex]) {
                            e.preventDefault();
                            const name = items[selectedIndex].dataset.name;
                            insertVariable(name);
                        } else {
                            hideAutocomplete();
                        }
                        break;
                }
            });
            
            // Close autocomplete when clicking outside
            document.addEventListener('click', (e) => {
                if (!autocompleteDropdown.contains(e.target) && e.target !== autocompleteTarget) {
                    hideAutocomplete();
                }
            });
            
            // Close autocomplete on scroll (but ignore scrolls within the dropdown itself)
            document.addEventListener('scroll', (e) => {
                if (!autocompleteDropdown.contains(e.target)) {
                    hideAutocomplete();
                }
            }, true);

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
            const authIdMap = { 'basic': 'authBasic', 'bearer': 'authBearer', 'apikey': 'authApiKey' };
            document.getElementById('authType').addEventListener('change', (e) => {
                const authType = e.target.value;
                document.querySelectorAll('.auth-fields').forEach(el => el.classList.remove('active'));
                if (authType !== 'none' && authIdMap[authType]) {
                    const authSection = document.getElementById(authIdMap[authType]);
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
                { name: 'User-Agent', value: 'Endpoint for VS Code/${extensionVersion}' },
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

            // Convert to repo button handler
            const convertBtn = document.getElementById('convertToRepoBtn');
            if (convertBtn) {
                convertBtn.addEventListener('click', () => {
                    vscode.postMessage({ type: 'convertToRepo' });
                });
            }
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
