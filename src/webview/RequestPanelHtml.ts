import * as vscode from 'vscode';
import { getNonce, getVscodeElementsUri, getCodiconsUri } from './webviewUtils';
import { Request, HttpMethod, RequestBody, AuthConfig } from '../models/Collection';

export interface RequestData {
    id?: string;
    name: string;
    method: HttpMethod;
    url: string;
    queryParams: { key: string; value: string; enabled: boolean }[];
    headers: { key: string; value: string; enabled: boolean }[];
    auth: AuthConfig;
    body: RequestBody;
}

export function getDefaultRequestData(): RequestData {
    return {
        name: 'New Request',
        method: 'GET',
        url: '',
        queryParams: [],
        headers: [],
        auth: { type: 'none' },
        body: { type: 'none', content: '' }
    };
}

export function requestToRequestData(request: Request): RequestData {
    // Parse query params from URL
    const queryParams: { key: string; value: string; enabled: boolean }[] = [];
    try {
        const url = new URL(request.url);
        url.searchParams.forEach((value, key) => {
            queryParams.push({ key, value, enabled: true });
        });
    } catch {
        // Invalid URL, ignore query params
    }

    return {
        id: request.id,
        name: request.name,
        method: request.method,
        url: request.url.split('?')[0], // URL without query string
        queryParams,
        headers: request.headers.map(h => ({ key: h.name, value: h.value, enabled: h.enabled })),
        auth: request.auth || { type: 'none' },
        body: request.body
    };
}

export function generateRequestPanelHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    requestData?: RequestData
): string {
    const nonce = getNonce();
    const { bundleUri } = getVscodeElementsUri(webview, extensionUri);
    const codiconsUri = getCodiconsUri(webview, extensionUri);

    const data = requestData || getDefaultRequestData();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <link href="${codiconsUri}" rel="stylesheet" />
    <title>Request Editor</title>
    <style>
        * {
            box-sizing: border-box;
        }
        
        body {
            padding: 16px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }

        .request-bar {
            display: flex;
            gap: 8px;
            align-items: center;
            margin-bottom: 16px;
        }

        .request-bar vscode-single-select {
            width: 120px;
            flex-shrink: 0;
        }

        .request-bar vscode-textfield {
            flex: 1;
        }

        .request-bar vscode-button {
            flex-shrink: 0;
        }

        vscode-tabs {
            width: 100%;
        }

        vscode-tab-panel {
            padding: 16px 0;
            overflow: visible;
        }

        /* Allow dropdowns to overflow their containers */
        vscode-single-select {
            position: relative;
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

        .key-value-table vscode-textfield {
            width: 100%;
        }

        .key-value-row {
            border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.35));
        }

        .key-value-row:last-child {
            border-bottom: none;
        }

        .add-row-btn {
            margin-top: 8px;
        }

        .checkbox-cell {
            width: 32px;
            text-align: center;
        }

        .delete-cell {
            width: 40px;
            text-align: center;
        }

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

        .auth-section {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .auth-fields {
            display: none;
            flex-direction: column;
            gap: 8px;
            padding: 12px;
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            margin-top: 8px;
        }

        .auth-fields.active {
            display: flex;
        }

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

        .body-section {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .body-content {
            display: none;
        }

        .body-content.active {
            display: block;
        }

        .body-textarea {
            width: 100%;
            min-height: 200px;
            padding: 8px;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: var(--vscode-editor-font-size, 13px);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
            border-radius: 4px;
            resize: vertical;
        }

        .body-textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }

        .response-section {
            display: none;
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid var(--vscode-widget-border);
        }

        .response-section.active {
            display: block;
        }

        .response-metrics {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 12px;
            padding: 8px 12px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
        }

        .metric {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .metric-label {
            opacity: 0.8;
        }

        .metric-value {
            font-weight: 500;
        }

        .status-success {
            color: var(--vscode-testing-iconPassed);
        }

        .status-error {
            color: var(--vscode-testing-iconFailed);
        }

        .response-body {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
            border-radius: 4px;
            padding: 12px;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: var(--vscode-editor-font-size, 13px);
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 400px;
            overflow: auto;
        }

        /* Syntax highlighting */
        .hl-key { color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe); }
        .hl-string { color: var(--vscode-debugTokenExpression-string, #ce9178); }
        .hl-number { color: var(--vscode-debugTokenExpression-number, #b5cea8); }
        .hl-boolean { color: var(--vscode-debugTokenExpression-boolean, #569cd6); }
        .hl-null { color: var(--vscode-debugTokenExpression-boolean, #569cd6); }
        .hl-punctuation { color: var(--vscode-foreground); }
        .hl-tag { color: var(--vscode-symbolIcon-classForeground, #569cd6); }
        .hl-attr-name { color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe); }
        .hl-attr-value { color: var(--vscode-debugTokenExpression-string, #ce9178); }
        .hl-comment { color: var(--vscode-descriptionForeground, #6a9955); font-style: italic; }

        .response-tabs {
            margin-top: 12px;
        }

        .response-tab-content {
            padding: 12px 0;
        }

        .tab-badge {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 10px;
            padding: 2px 6px;
            font-size: 11px;
            margin-left: 6px;
        }

        .headers-table {
            width: 100%;
            border-collapse: collapse;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: var(--vscode-editor-font-size, 13px);
        }

        .headers-table th {
            text-align: left;
            padding: 8px;
            border-bottom: 1px solid var(--vscode-widget-border);
            font-weight: 500;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
        }

        .headers-table td {
            padding: 6px 8px;
            border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
            vertical-align: top;
        }

        .headers-table td:first-child {
            color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
            white-space: nowrap;
        }

        .headers-table td:last-child {
            word-break: break-all;
        }

        .cookies-table {
            width: 100%;
            border-collapse: collapse;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: var(--vscode-editor-font-size, 13px);
        }

        .cookies-table th {
            text-align: left;
            padding: 8px;
            border-bottom: 1px solid var(--vscode-widget-border);
            font-weight: 500;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
        }

        .cookies-table td {
            padding: 6px 8px;
            border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
        }

        .no-data {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 16px;
        }

        .metrics-spacer {
            flex: 1;
        }

        .response-metrics vscode-button {
            font-size: 12px;
        }

        .hidden {
            display: none !important;
        }

        .section-title {
            font-weight: 500;
            margin-bottom: 8px;
        }

        vscode-checkbox {
            --checkbox-size: 16px;
        }
    </style>
</head>
<body>
    <div class="request-bar">
        <vscode-single-select id="method">
            <vscode-option value="GET" ${data.method === 'GET' ? 'selected' : ''}>GET</vscode-option>
            <vscode-option value="POST" ${data.method === 'POST' ? 'selected' : ''}>POST</vscode-option>
            <vscode-option value="PUT" ${data.method === 'PUT' ? 'selected' : ''}>PUT</vscode-option>
            <vscode-option value="PATCH" ${data.method === 'PATCH' ? 'selected' : ''}>PATCH</vscode-option>
            <vscode-option value="DELETE" ${data.method === 'DELETE' ? 'selected' : ''}>DELETE</vscode-option>
            <vscode-option value="HEAD" ${data.method === 'HEAD' ? 'selected' : ''}>HEAD</vscode-option>
            <vscode-option value="OPTIONS" ${data.method === 'OPTIONS' ? 'selected' : ''}>OPTIONS</vscode-option>
        </vscode-single-select>
        <vscode-textfield id="url" placeholder="Enter URL" value="${escapeHtml(data.url)}"></vscode-textfield>
        <vscode-button id="sendBtn">
            <span class="codicon codicon-play"></span>
            Send
        </vscode-button>
        <vscode-button id="saveBtn" appearance="secondary">
            <span class="codicon codicon-save"></span>
            Save
        </vscode-button>
    </div>

    <vscode-tabs id="requestTabs" selected-index="0">
        <vscode-tab-header slot="header">Query Params</vscode-tab-header>
        <vscode-tab-header slot="header">Headers</vscode-tab-header>
        <vscode-tab-header slot="header">Auth</vscode-tab-header>
        <vscode-tab-header slot="header">Body</vscode-tab-header>

        <!-- Query Params Tab -->
        <vscode-tab-panel>
            <table class="key-value-table" id="queryParamsTable">
                <thead>
                    <tr>
                        <th class="checkbox-cell"></th>
                        <th>Key</th>
                        <th>Value</th>
                        <th class="delete-cell"></th>
                    </tr>
                </thead>
                <tbody id="queryParamsBody">
                    ${renderKeyValueRows(data.queryParams, 'queryParam')}
                </tbody>
            </table>
            <vscode-button class="add-row-btn" appearance="secondary" data-action="addQueryParam">
                <span class="codicon codicon-add"></span>
                Add Parameter
            </vscode-button>
        </vscode-tab-panel>

        <!-- Headers Tab -->
        <vscode-tab-panel>
            <table class="key-value-table" id="headersTable">
                <thead>
                    <tr>
                        <th class="checkbox-cell"></th>
                        <th>Key</th>
                        <th>Value</th>
                        <th class="delete-cell"></th>
                    </tr>
                </thead>
                <tbody id="headersBody">
                    ${renderHeaderRows(data.headers)}
                </tbody>
            </table>
            <vscode-button class="add-row-btn" appearance="secondary" data-action="addHeader">
                <span class="codicon codicon-add"></span>
                Add Header
            </vscode-button>
        </vscode-tab-panel>

        <!-- Auth Tab -->
        <vscode-tab-panel>
            <div class="auth-section">
                <vscode-single-select id="authType">
                    <vscode-option value="none" ${data.auth.type === 'none' ? 'selected' : ''}>No Auth</vscode-option>
                    <vscode-option value="basic" ${data.auth.type === 'basic' ? 'selected' : ''}>Basic Auth</vscode-option>
                    <vscode-option value="bearer" ${data.auth.type === 'bearer' ? 'selected' : ''}>Bearer Token</vscode-option>
                    <vscode-option value="apikey" ${data.auth.type === 'apikey' ? 'selected' : ''}>API Key</vscode-option>
                </vscode-single-select>

                <div id="authBasic" class="auth-fields ${data.auth.type === 'basic' ? 'active' : ''}">
                    <div class="auth-field-row">
                        <label>Username</label>
                        <vscode-textfield id="authUsername" value="${escapeHtml(data.auth.username || '')}"></vscode-textfield>
                    </div>
                    <div class="auth-field-row">
                        <label>Password</label>
                        <div class="secret-field-wrapper">
                            <vscode-textfield id="authPassword" type="password" value="${escapeHtml(data.auth.password || '')}"></vscode-textfield>
                            <span class="secret-toggle-btn" data-target="authPassword" title="Show/Hide">
                                <span class="codicon codicon-eye"></span>
                            </span>
                        </div>
                    </div>
                </div>

                <div id="authBearer" class="auth-fields ${data.auth.type === 'bearer' ? 'active' : ''}">
                    <div class="auth-field-row">
                        <label>Token</label>
                        <div class="secret-field-wrapper">
                            <vscode-textfield id="authToken" type="password" value="${escapeHtml(data.auth.token || '')}"></vscode-textfield>
                            <span class="secret-toggle-btn" data-target="authToken" title="Show/Hide">
                                <span class="codicon codicon-eye"></span>
                            </span>
                        </div>
                    </div>
                </div>

                <div id="authApiKey" class="auth-fields ${data.auth.type === 'apikey' ? 'active' : ''}">
                    <div class="auth-field-row">
                        <label>Key Name</label>
                        <vscode-textfield id="authApiKeyName" value="${escapeHtml(data.auth.apiKeyName || '')}"></vscode-textfield>
                    </div>
                    <div class="auth-field-row">
                        <label>Key Value</label>
                        <div class="secret-field-wrapper">
                            <vscode-textfield id="authApiKeyValue" type="password" value="${escapeHtml(data.auth.apiKeyValue || '')}"></vscode-textfield>
                            <span class="secret-toggle-btn" data-target="authApiKeyValue" title="Show/Hide">
                                <span class="codicon codicon-eye"></span>
                            </span>
                        </div>
                    </div>
                    <div class="auth-field-row">
                        <label>Add to</label>
                        <vscode-single-select id="authApiKeyIn">
                            <vscode-option value="header" ${data.auth.apiKeyIn === 'header' || !data.auth.apiKeyIn ? 'selected' : ''}>Header</vscode-option>
                            <vscode-option value="query" ${data.auth.apiKeyIn === 'query' ? 'selected' : ''}>Query Params</vscode-option>
                        </vscode-single-select>
                    </div>
                </div>
            </div>
        </vscode-tab-panel>

        <!-- Body Tab -->
        <vscode-tab-panel>
            <div class="body-section">
                <vscode-single-select id="bodyType">
                    <vscode-option value="none" ${data.body.type === 'none' ? 'selected' : ''}>None</vscode-option>
                    <vscode-option value="json" ${data.body.type === 'json' ? 'selected' : ''}>JSON</vscode-option>
                    <vscode-option value="form" ${data.body.type === 'form' ? 'selected' : ''}>Form Data</vscode-option>
                    <vscode-option value="text" ${data.body.type === 'text' ? 'selected' : ''}>Raw Text</vscode-option>
                    <vscode-option value="xml" ${data.body.type === 'xml' ? 'selected' : ''}>XML</vscode-option>
                </vscode-single-select>

                <div id="bodyNone" class="body-content ${data.body.type === 'none' ? 'active' : ''}">
                    <p style="opacity: 0.7;">This request does not have a body.</p>
                </div>

                <div id="bodyJson" class="body-content ${data.body.type === 'json' ? 'active' : ''}">
                    <textarea class="body-textarea" id="bodyJsonContent" placeholder='{"key": "value"}'>${escapeHtml(data.body.type === 'json' ? data.body.content : '')}</textarea>
                </div>

                <div id="bodyForm" class="body-content ${data.body.type === 'form' ? 'active' : ''}">
                    <table class="key-value-table" id="formDataTable">
                        <thead>
                            <tr>
                                <th class="checkbox-cell"></th>
                                <th>Key</th>
                                <th>Value</th>
                                <th class="delete-cell"></th>
                            </tr>
                        </thead>
                        <tbody id="formDataBody">
                            ${renderFormDataRows(data.body.type === 'form' ? data.body.content : '')}
                        </tbody>
                    </table>
                    <vscode-button class="add-row-btn" appearance="secondary" data-action="addFormData">
                        <span class="codicon codicon-add"></span>
                        Add Field
                    </vscode-button>
                </div>

                <div id="bodyText" class="body-content ${data.body.type === 'text' ? 'active' : ''}">
                    <textarea class="body-textarea" id="bodyTextContent" placeholder="Enter raw text">${escapeHtml(data.body.type === 'text' ? data.body.content : '')}</textarea>
                </div>

                <div id="bodyXml" class="body-content ${data.body.type === 'xml' ? 'active' : ''}">
                    <textarea class="body-textarea" id="bodyXmlContent" placeholder="<xml></xml>">${escapeHtml(data.body.type === 'xml' ? data.body.content : '')}</textarea>
                </div>
            </div>
        </vscode-tab-panel>
    </vscode-tabs>

    <!-- Response Section -->
    <div class="response-section" id="responseSection">
        <div class="response-metrics" id="responseMetrics">
            <div class="metric">
                <span class="metric-label">Status:</span>
                <span class="metric-value" id="responseStatus">-</span>
            </div>
            <div class="metric">
                <span class="metric-label">Time:</span>
                <span class="metric-value" id="responseTime">-</span>
            </div>
            <div class="metric">
                <span class="metric-label">Size:</span>
                <span class="metric-value" id="responseSize">-</span>
            </div>
            <div class="metrics-spacer"></div>
            <vscode-button id="openInEditorBtn" appearance="secondary" title="Open in VS Code editor with full features (folding, search, minimap)">
                <span class="codicon codicon-go-to-file"></span>
                Open in Editor
            </vscode-button>
        </div>
        
        <vscode-tabs class="response-tabs" id="responseTabs" selected-index="0">
            <vscode-tab-header slot="header">Response</vscode-tab-header>
            <vscode-tab-header slot="header">Headers <span class="tab-badge" id="headersCount">0</span></vscode-tab-header>
            <vscode-tab-header slot="header">Cookies <span class="tab-badge" id="cookiesCount">0</span></vscode-tab-header>
            <vscode-tab-header slot="header">Raw</vscode-tab-header>

            <!-- Response Body Tab -->
            <vscode-tab-panel>
                <div class="response-tab-content">
                    <div class="response-body" id="responseBody"></div>
                </div>
            </vscode-tab-panel>

            <!-- Headers Tab -->
            <vscode-tab-panel>
                <div class="response-tab-content">
                    <table class="headers-table" id="responseHeadersTable">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody id="responseHeadersBody"></tbody>
                    </table>
                </div>
            </vscode-tab-panel>

            <!-- Cookies Tab -->
            <vscode-tab-panel>
                <div class="response-tab-content">
                    <table class="cookies-table" id="responseCookiesTable">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Value</th>
                                <th>Domain</th>
                                <th>Path</th>
                            </tr>
                        </thead>
                        <tbody id="responseCookiesBody"></tbody>
                    </table>
                    <div class="no-data" id="noCookies" style="display: none;">No cookies in response</div>
                </div>
            </vscode-tab-panel>

            <!-- Raw Tab -->
            <vscode-tab-panel>
                <div class="response-tab-content">
                    <div class="response-body" id="responseRaw"></div>
                </div>
            </vscode-tab-panel>
        </vscode-tabs>
    </div>

    <script type="module" nonce="${nonce}" src="${bundleUri}"></script>
    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();
            
            // Initial state
            let requestData = ${JSON.stringify(data)};
            
            // Restore state if available
            const previousState = vscode.getState();
            if (previousState) {
                requestData = previousState;
                restoreState(requestData);
            }

            // Save state periodically
            function saveState() {
                const state = collectRequestData();
                vscode.setState(state);
            }

            function collectRequestData() {
                const method = document.getElementById('method').value;
                const url = document.getElementById('url').value;
                const queryParams = collectKeyValueRows('queryParamsBody', 'queryParam');
                const headers = collectKeyValueRows('headersBody', 'header');
                
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

                const bodyType = document.getElementById('bodyType').value;
                let bodyContent = '';
                if (bodyType === 'json') {
                    bodyContent = document.getElementById('bodyJsonContent').value;
                } else if (bodyType === 'form') {
                    bodyContent = JSON.stringify(collectKeyValueRows('formDataBody', 'formData'));
                } else if (bodyType === 'text') {
                    bodyContent = document.getElementById('bodyTextContent').value;
                } else if (bodyType === 'xml') {
                    bodyContent = document.getElementById('bodyXmlContent').value;
                }

                return {
                    id: requestData.id,
                    name: requestData.name,
                    method,
                    url,
                    queryParams,
                    headers,
                    auth,
                    body: { type: bodyType, content: bodyContent }
                };
            }

            function collectKeyValueRows(tbodyId, prefix) {
                const rows = [];
                const tbody = document.getElementById(tbodyId);
                if (!tbody) return rows;
                
                tbody.querySelectorAll('tr').forEach((row, index) => {
                    const enabledCheckbox = row.querySelector('vscode-checkbox');
                    const keyInput = row.querySelector('vscode-textfield[data-field="key"]');
                    const valueInput = row.querySelector('vscode-textfield[data-field="value"]');
                    
                    if (keyInput && valueInput) {
                        rows.push({
                            key: keyInput.value || '',
                            value: valueInput.value || '',
                            enabled: enabledCheckbox ? enabledCheckbox.checked : true
                        });
                    }
                });
                return rows;
            }

            function restoreState(state) {
                // Restore method and URL
                if (state.method) {
                    document.getElementById('method').value = state.method;
                }
                if (state.url) {
                    document.getElementById('url').value = state.url;
                }
                
                // Restore query params
                if (state.queryParams && Array.isArray(state.queryParams)) {
                    restoreKeyValueRows('queryParamsBody', state.queryParams);
                }
                
                // Restore headers
                if (state.headers && Array.isArray(state.headers)) {
                    restoreKeyValueRows('headersBody', state.headers);
                }
                
                // Restore auth
                if (state.auth) {
                    const authType = state.auth.type || 'none';
                    document.getElementById('authType').value = authType;
                    
                    // Update auth section visibility
                    document.querySelectorAll('.auth-fields').forEach(el => el.classList.remove('active'));
                    if (authType !== 'none') {
                        const authSection = document.getElementById('auth' + authType.charAt(0).toUpperCase() + authType.slice(1));
                        if (authSection) {
                            authSection.classList.add('active');
                        }
                    }
                    
                    // Restore auth field values
                    if (state.auth.username !== undefined) {
                        document.getElementById('authUsername').value = state.auth.username;
                    }
                    if (state.auth.password !== undefined) {
                        document.getElementById('authPassword').value = state.auth.password;
                    }
                    if (state.auth.token !== undefined) {
                        document.getElementById('authToken').value = state.auth.token;
                    }
                    if (state.auth.apiKeyName !== undefined) {
                        document.getElementById('authApiKeyName').value = state.auth.apiKeyName;
                    }
                    if (state.auth.apiKeyValue !== undefined) {
                        document.getElementById('authApiKeyValue').value = state.auth.apiKeyValue;
                    }
                    if (state.auth.apiKeyIn !== undefined) {
                        document.getElementById('authApiKeyIn').value = state.auth.apiKeyIn;
                    }
                }
                
                // Restore body
                if (state.body) {
                    const bodyType = state.body.type || 'none';
                    document.getElementById('bodyType').value = bodyType;
                    
                    // Update body section visibility
                    document.querySelectorAll('.body-content').forEach(el => el.classList.remove('active'));
                    const bodySection = document.getElementById('body' + bodyType.charAt(0).toUpperCase() + bodyType.slice(1));
                    if (bodySection) {
                        bodySection.classList.add('active');
                    }
                    
                    // Restore body content
                    if (bodyType === 'json' && state.body.content) {
                        document.getElementById('bodyJsonContent').value = state.body.content;
                    } else if (bodyType === 'form' && state.body.content) {
                        try {
                            const formData = JSON.parse(state.body.content);
                            restoreKeyValueRows('formDataBody', formData);
                        } catch (e) {
                            // Invalid JSON, ignore
                        }
                    } else if (bodyType === 'text' && state.body.content) {
                        document.getElementById('bodyTextContent').value = state.body.content;
                    } else if (bodyType === 'xml' && state.body.content) {
                        document.getElementById('bodyXmlContent').value = state.body.content;
                    }
                }
            }
            
            function restoreKeyValueRows(tbodyId, items) {
                const tbody = document.getElementById(tbodyId);
                if (!tbody) return;
                
                // Clear existing rows
                tbody.innerHTML = '';
                
                // Add rows from state
                items.forEach(item => {
                    const row = document.createElement('tr');
                    row.className = 'key-value-row';
                    row.innerHTML = \`
                        <td class="checkbox-cell">
                            <vscode-checkbox \${item.enabled ? 'checked' : ''}></vscode-checkbox>
                        </td>
                        <td>
                            <vscode-textfield data-field="key" placeholder="Key" value="\${escapeHtmlInJs(item.key || '')}"></vscode-textfield>
                        </td>
                        <td>
                            <vscode-textfield data-field="value" placeholder="Value" value="\${escapeHtmlInJs(item.value || '')}"></vscode-textfield>
                        </td>
                        <td class="delete-cell">
                            <button class="delete-btn" data-action="deleteRow">
                                <span class="codicon codicon-trash"></span>
                            </button>
                        </td>
                    \`;
                    tbody.appendChild(row);
                    
                    // Add delete handler
                    row.querySelector('.delete-btn').addEventListener('click', () => {
                        row.remove();
                        saveState();
                    });
                });
            }
            
            function escapeHtmlInJs(text) {
                return text
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
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
                saveState();
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

            // Body type change handler
            document.getElementById('bodyType').addEventListener('change', (e) => {
                const bodyType = e.target.value;
                document.querySelectorAll('.body-content').forEach(el => el.classList.remove('active'));
                const bodySection = document.getElementById('body' + bodyType.charAt(0).toUpperCase() + bodyType.slice(1));
                if (bodySection) {
                    bodySection.classList.add('active');
                }
                saveState();
            });

            // Send button handler
            document.getElementById('sendBtn').addEventListener('click', () => {
                const data = collectRequestData();
                vscode.postMessage({ type: 'sendRequest', data });
            });

            // Save button handler
            document.getElementById('saveBtn').addEventListener('click', () => {
                const data = collectRequestData();
                vscode.postMessage({ type: 'saveRequest', data });
            });

            // Open in Editor button handler
            document.getElementById('openInEditorBtn').addEventListener('click', () => {
                vscode.postMessage({ type: 'openInEditor' });
            });

            // Add row buttons
            document.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const action = e.target.closest('[data-action]').dataset.action;
                    if (action === 'addQueryParam') {
                        addKeyValueRow('queryParamsBody', 'queryParam');
                    } else if (action === 'addHeader') {
                        addKeyValueRow('headersBody', 'header');
                    } else if (action === 'addFormData') {
                        addKeyValueRow('formDataBody', 'formData');
                    }
                    saveState();
                });
            });

            function addKeyValueRow(tbodyId, prefix) {
                const tbody = document.getElementById(tbodyId);
                if (!tbody) return;
                
                const index = tbody.querySelectorAll('tr').length;
                const row = document.createElement('tr');
                row.className = 'key-value-row';
                row.innerHTML = \`
                    <td class="checkbox-cell">
                        <vscode-checkbox checked></vscode-checkbox>
                    </td>
                    <td>
                        <vscode-textfield data-field="key" placeholder="Key"></vscode-textfield>
                    </td>
                    <td>
                        <vscode-textfield data-field="value" placeholder="Value"></vscode-textfield>
                    </td>
                    <td class="delete-cell">
                        <button class="delete-btn" data-action="deleteRow">
                            <span class="codicon codicon-trash"></span>
                        </button>
                    </td>
                \`;
                tbody.appendChild(row);
                
                // Add delete handler
                row.querySelector('.delete-btn').addEventListener('click', () => {
                    row.remove();
                    saveState();
                });
            }

            // Delete row handlers for initial rows
            document.querySelectorAll('.delete-btn[data-action="deleteRow"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.target.closest('tr').remove();
                    saveState();
                });
            });

            // Save state on input changes
            document.addEventListener('input', saveState);
            document.addEventListener('change', saveState);

            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.type) {
                    case 'loadRequest':
                        requestData = message.data;
                        restoreState(requestData);
                        saveState();
                        break;
                    case 'showResponse':
                        showResponse(message.data);
                        break;
                    case 'showError':
                        showError(message.error);
                        break;
                    case 'requestError':
                        showError(message.data.message);
                        break;
                }
            });

            function showResponse(response) {
                const section = document.getElementById('responseSection');
                section.classList.add('active');
                
                // Status metrics
                const statusEl = document.getElementById('responseStatus');
                statusEl.textContent = response.status + ' ' + (response.statusText || '');
                statusEl.className = 'metric-value ' + (response.status >= 200 && response.status < 300 ? 'status-success' : 'status-error');
                
                document.getElementById('responseTime').textContent = response.time + 'ms';
                document.getElementById('responseSize').textContent = formatBytes(response.size);
                
                // Detect content type
                const contentType = (response.headers && (response.headers['content-type'] || response.headers['Content-Type'])) || '';
                const isJson = contentType.includes('json') || response.body.trim().startsWith('{') || response.body.trim().startsWith('[');
                const isXml = contentType.includes('xml') || response.body.trim().startsWith('<?xml') || response.body.trim().startsWith('<');
                
                // Response body tab - formatted with syntax highlighting
                const bodyEl = document.getElementById('responseBody');
                if (isJson) {
                    try {
                        const parsed = JSON.parse(response.body);
                        const formatted = JSON.stringify(parsed, null, 2);
                        bodyEl.innerHTML = highlightJson(formatted);
                    } catch {
                        bodyEl.textContent = response.body;
                    }
                } else if (isXml) {
                    bodyEl.innerHTML = highlightXml(response.body);
                } else {
                    bodyEl.textContent = response.body;
                }
                
                // Headers tab
                const headers = response.headers || {};
                const headerEntries = Object.entries(headers);
                document.getElementById('headersCount').textContent = headerEntries.length;
                
                const headersBody = document.getElementById('responseHeadersBody');
                headersBody.innerHTML = headerEntries.map(([name, value]) => 
                    \`<tr><td>\${escapeHtmlJs(name)}</td><td>\${escapeHtmlJs(String(value))}</td></tr>\`
                ).join('');
                
                // Cookies tab - parse from Set-Cookie headers
                const cookies = [];
                const setCookie = headers['set-cookie'] || headers['Set-Cookie'];
                if (setCookie) {
                    const cookieStrings = Array.isArray(setCookie) ? setCookie : [setCookie];
                    cookieStrings.forEach(cookieStr => {
                        const parts = cookieStr.split(';').map(p => p.trim());
                        const [nameValue, ...attrs] = parts;
                        const [name, ...valueParts] = nameValue.split('=');
                        const value = valueParts.join('=');
                        
                        let domain = '', path = '';
                        attrs.forEach(attr => {
                            const [key, val] = attr.split('=');
                            if (key.toLowerCase() === 'domain') domain = val || '';
                            if (key.toLowerCase() === 'path') path = val || '';
                        });
                        
                        cookies.push({ name, value, domain, path });
                    });
                }
                
                document.getElementById('cookiesCount').textContent = cookies.length;
                const cookiesBody = document.getElementById('responseCookiesBody');
                const noCookies = document.getElementById('noCookies');
                
                if (cookies.length > 0) {
                    cookiesBody.innerHTML = cookies.map(c => 
                        \`<tr><td>\${escapeHtmlJs(c.name)}</td><td>\${escapeHtmlJs(c.value)}</td><td>\${escapeHtmlJs(c.domain)}</td><td>\${escapeHtmlJs(c.path)}</td></tr>\`
                    ).join('');
                    noCookies.style.display = 'none';
                    document.getElementById('responseCookiesTable').style.display = 'table';
                } else {
                    cookiesBody.innerHTML = '';
                    noCookies.style.display = 'block';
                    document.getElementById('responseCookiesTable').style.display = 'none';
                }
                
                // Raw tab - unformatted response
                document.getElementById('responseRaw').textContent = response.body;
            }
            
            function escapeHtmlJs(text) {
                if (!text) return '';
                return String(text)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
            }

            function showError(error) {
                const section = document.getElementById('responseSection');
                section.classList.add('active');
                
                const statusEl = document.getElementById('responseStatus');
                statusEl.textContent = 'Error';
                statusEl.className = 'metric-value status-error';
                
                document.getElementById('responseTime').textContent = '-';
                document.getElementById('responseSize').textContent = '-';
                document.getElementById('responseBody').textContent = error;
                document.getElementById('responseRaw').textContent = error;
                document.getElementById('headersCount').textContent = '0';
                document.getElementById('cookiesCount').textContent = '0';
                document.getElementById('responseHeadersBody').innerHTML = '';
                document.getElementById('responseCookiesBody').innerHTML = '';
                document.getElementById('noCookies').style.display = 'block';
                document.getElementById('responseCookiesTable').style.display = 'none';
            }

            function highlightJson(json) {
                // Escape HTML first
                const escaped = json
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                
                // Apply syntax highlighting
                return escaped.replace(
                    /("(?:\\\\.|[^"\\\\])*")(\\s*:)?|(\\b(?:true|false)\\b)|(\\bnull\\b)|(\\b-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)|([{}\\[\\],:])/g,
                    (match, str, colon, bool, nul, num, punct) => {
                        if (str) {
                            if (colon) {
                                // It's a key
                                return '<span class=\"hl-key\">' + str + '</span>' + colon;
                            }
                            // It's a string value
                            return '<span class=\"hl-string\">' + str + '</span>';
                        }
                        if (bool) return '<span class=\"hl-boolean\">' + bool + '</span>';
                        if (nul) return '<span class=\"hl-null\">' + nul + '</span>';
                        if (num) return '<span class=\"hl-number\">' + num + '</span>';
                        if (punct) return '<span class=\"hl-punctuation\">' + punct + '</span>';
                        return match;
                    }
                );
            }

            function highlightXml(xml) {
                // Escape HTML entities but preserve structure for highlighting
                let result = '';
                let i = 0;
                while (i < xml.length) {
                    if (xml[i] === '<') {
                        // Check for comment
                        if (xml.substring(i, i + 4) === '<!--') {
                            const endComment = xml.indexOf('-->', i);
                            if (endComment !== -1) {
                                const comment = xml.substring(i, endComment + 3);
                                result += '<span class=\"hl-comment\">' + escapeHtmlJs(comment) + '</span>';
                                i = endComment + 3;
                                continue;
                            }
                        }
                        
                        // Find the end of the tag
                        const tagEnd = xml.indexOf('>', i);
                        if (tagEnd !== -1) {
                            const tagContent = xml.substring(i + 1, tagEnd);
                            const isClosing = tagContent.startsWith('/');
                            const isSelfClosing = tagContent.endsWith('/');
                            
                            // Parse tag name and attributes
                            const tagMatch = tagContent.match(/^\\/?([^\\s\\/]+)(.*?)(\\/?)$/s);
                            if (tagMatch) {
                                const tagName = tagMatch[1];
                                const attrs = tagMatch[2];
                                const trailing = tagMatch[3];
                                
                                result += '&lt;<span class=\"hl-tag\">' + (isClosing ? '/' : '') + escapeHtmlJs(tagName.replace(/^\\//, '')) + '</span>';
                                
                                // Highlight attributes
                                if (attrs) {
                                    result += attrs.replace(
                                        /([\\w:-]+)(\\s*=\\s*)([\"'])(.*?)\\3/g,
                                        (m, name, eq, quote, value) => 
                                            '<span class=\"hl-attr-name\">' + escapeHtmlJs(name) + '</span>' + 
                                            eq + quote + '<span class=\"hl-attr-value\">' + escapeHtmlJs(value) + '</span>' + quote
                                    );
                                }
                                
                                if (trailing || isSelfClosing) result += '/';
                                result += '&gt;';
                            } else {
                                result += '&lt;' + escapeHtmlJs(tagContent) + '&gt;';
                            }
                            i = tagEnd + 1;
                            continue;
                        }
                    }
                    
                    // Regular text
                    if (xml[i] === '&') {
                        result += '&amp;';
                    } else if (xml[i] === '<') {
                        result += '&lt;';
                    } else if (xml[i] === '>') {
                        result += '&gt;';
                    } else {
                        result += xml[i];
                    }
                    i++;
                }
                return result;
            }

            function formatBytes(bytes) {
                if (bytes === 0) return '0 B';
                const k = 1024;
                const sizes = ['B', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            }
        })();
    </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderKeyValueRows(items: { key: string; value: string; enabled: boolean }[], prefix: string): string {
    if (!items || items.length === 0) {
        return '';
    }

    return items.map((item, index) => `
        <tr class="key-value-row">
            <td class="checkbox-cell">
                <vscode-checkbox ${item.enabled ? 'checked' : ''}></vscode-checkbox>
            </td>
            <td>
                <vscode-textfield data-field="key" placeholder="Key" value="${escapeHtml(item.key)}"></vscode-textfield>
            </td>
            <td>
                <vscode-textfield data-field="value" placeholder="Value" value="${escapeHtml(item.value)}"></vscode-textfield>
            </td>
            <td class="delete-cell">
                <button class="delete-btn" data-action="deleteRow">
                    <span class="codicon codicon-trash"></span>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderHeaderRows(headers: { key: string; value: string; enabled: boolean }[]): string {
    if (!headers || headers.length === 0) {
        return '';
    }

    return headers.map((header, index) => `
        <tr class="key-value-row">
            <td class="checkbox-cell">
                <vscode-checkbox ${header.enabled ? 'checked' : ''}></vscode-checkbox>
            </td>
            <td>
                <vscode-textfield data-field="key" placeholder="Key" value="${escapeHtml(header.key)}"></vscode-textfield>
            </td>
            <td>
                <vscode-textfield data-field="value" placeholder="Value" value="${escapeHtml(header.value)}"></vscode-textfield>
            </td>
            <td class="delete-cell">
                <button class="delete-btn" data-action="deleteRow">
                    <span class="codicon codicon-trash"></span>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderFormDataRows(content: string): string {
    if (!content) {
        return '';
    }

    try {
        const items = JSON.parse(content) as { key: string; value: string; enabled: boolean }[];
        return renderKeyValueRows(items, 'formData');
    } catch {
        return '';
    }
}
