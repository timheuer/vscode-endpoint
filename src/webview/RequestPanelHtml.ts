import * as vscode from 'vscode';
import { getNonce, getVscodeElementsUri, getCodiconsUri, getSharedCssUri, getRequestViewCssUri } from './webviewUtils';
import { Request, HttpMethod, RequestBody, AuthConfig } from '../models/Collection';
import { getSetting } from '../settings';

export interface RequestData {
    id?: string;
    name: string;
    method: HttpMethod;
    url: string;
    queryParams: { key: string; value: string; enabled: boolean }[];
    headers: { key: string; value: string; enabled: boolean }[];
    inheritedHeaders?: { key: string; value: string }[];
    inheritedHeadersState?: Record<string, boolean>;
    inheritedAuth?: AuthConfig;
    useInheritedAuth?: boolean;
    auth: AuthConfig;
    body: RequestBody;
    preRequestId?: string;
    availableRequests?: { id: string; name: string }[];
}

export function getDefaultRequestData(): RequestData {
    const defaultContentType = getSetting('defaultContentType');
    return {
        name: 'New Request',
        method: 'GET',
        url: '',
        queryParams: [],
        headers: [],
        auth: { type: 'none' },
        body: { type: defaultContentType, content: '' }
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
        body: request.body,
        preRequestId: request.preRequestId
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
    const sharedCssUri = getSharedCssUri(webview, extensionUri);
    const requestViewCssUri = getRequestViewCssUri(webview, extensionUri);

    const data = requestData || getDefaultRequestData();

    // Determine if auth inputs should be initially disabled (inherited auth is being used)
    const authDisabled = data.inheritedAuth && data.inheritedAuth.type !== 'none' && data.useInheritedAuth !== false;
    const authDisabledAttr = authDisabled ? 'disabled' : '';

    // Calculate initial counts for tab badges
    const queryParamsCount = data.queryParams.filter(p => p.enabled && p.key.trim()).length;
    const requestHeadersCount = data.headers.filter(h => h.enabled && h.key.trim()).length;
    const inheritedHeadersCount = (data.inheritedHeaders || []).filter(h => {
        const state = data.inheritedHeadersState || {};
        return state[h.key] !== false; // Default to enabled if not explicitly disabled
    }).length;
    const totalHeadersCount = requestHeadersCount + inheritedHeadersCount;

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';">
    <link href="${codiconsUri}" rel="stylesheet" />
    <link href="${sharedCssUri}" rel="stylesheet" />
    <link href="${requestViewCssUri}" rel="stylesheet" />
    <title>Request Editor</title>
</head>
<body>
    <!-- Autocomplete dropdown -->
    <div id="autocompleteDropdown" class="autocomplete-dropdown"></div>
    
    <!-- Variable value tooltip -->
    <div id="variableTooltip" class="variable-tooltip"></div>

    <div class="split-container">
    <div class="request-pane">
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
        <div id="dirtyIndicator" class="dirty-indicator">
            <span class="codicon codicon-circle-filled"></span>
            <span>Unsaved</span>
        </div>
    </div>

    <vscode-tabs id="requestTabs" selected-index="0">
        <vscode-tab-header slot="header">Query Params${queryParamsCount > 0 ? ` <span class="tab-badge" id="queryParamsCount">${queryParamsCount}</span>` : ' <span class="tab-badge" id="queryParamsCount" style="display:none"></span>'}</vscode-tab-header>
        <vscode-tab-header slot="header">Headers${totalHeadersCount > 0 ? ` <span class="tab-badge" id="reqHeadersCount">${totalHeadersCount}</span>` : ' <span class="tab-badge" id="reqHeadersCount" style="display:none"></span>'}</vscode-tab-header>
        <vscode-tab-header slot="header">Auth</vscode-tab-header>
        <vscode-tab-header slot="header">Body</vscode-tab-header>
        <vscode-tab-header slot="header">Settings</vscode-tab-header>

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
            <!-- Inherited Headers Section -->
            <div class="inherited-headers-section" id="inheritedHeadersSection" style="${!data.inheritedHeaders || data.inheritedHeaders.length === 0 ? 'display: none;' : ''}">
                <details class="inherited-headers-details">
                    <summary>
                        <span class="codicon codicon-link"></span>
                        Inherited Headers
                        <span class="inherited-badge" id="inheritedCount">${data.inheritedHeaders?.length || 0}</span>
                    </summary>
                    <div class="inherited-headers-content">
                        <table class="key-value-table" id="inheritedHeadersTable">
                            <thead>
                                <tr>
                                    <th class="checkbox-cell"></th>
                                    <th>Key</th>
                                    <th>Value</th>
                                    <th class="delete-cell"></th>
                                </tr>
                            </thead>
                            <tbody id="inheritedHeadersBody">
                                ${renderInheritedHeaderRows(data.inheritedHeaders || [], data.inheritedHeadersState || {})}
                            </tbody>
                        </table>
                    </div>
                </details>
            </div>

            <!-- Request Headers Section -->
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
            <!-- Inherited Auth Section -->
            <div class="inherited-auth-section" id="inheritedAuthSection" style="${!data.inheritedAuth || data.inheritedAuth.type === 'none' ? 'display: none;' : ''}">
                <div class="inherited-auth-toggle">
                    <vscode-checkbox id="useInheritedAuth" ${data.useInheritedAuth !== false ? 'checked' : ''}>
                        Use inherited auth from collection (<span class="inherited-auth-type" id="inheritedAuthType">${data.inheritedAuth?.type || 'none'}</span>)
                    </vscode-checkbox>
                </div>
            </div>

            <div class="auth-section${authDisabled ? ' disabled' : ''}" id="authSection">
                <vscode-single-select id="authType" ${authDisabledAttr}>
                    <vscode-option value="none" ${data.auth.type === 'none' ? 'selected' : ''}>No Auth</vscode-option>
                    <vscode-option value="basic" ${data.auth.type === 'basic' ? 'selected' : ''}>Basic Auth</vscode-option>
                    <vscode-option value="bearer" ${data.auth.type === 'bearer' ? 'selected' : ''}>Bearer Token</vscode-option>
                    <vscode-option value="apikey" ${data.auth.type === 'apikey' ? 'selected' : ''}>API Key</vscode-option>
                </vscode-single-select>

                <div id="authBasic" class="auth-fields ${data.auth.type === 'basic' ? 'active' : ''}">
                    <div class="auth-field-row">
                        <label>Username</label>
                        <vscode-textfield id="authUsername" value="${escapeHtml(data.auth.username || '')}" ${authDisabledAttr}></vscode-textfield>
                    </div>
                    <div class="auth-field-row">
                        <label>Password</label>
                        <div class="secret-field-wrapper">
                            <vscode-textfield id="authPassword" type="password" value="${escapeHtml(data.auth.password || '')}" ${authDisabledAttr}></vscode-textfield>
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
                            <vscode-textfield id="authToken" type="password" value="${escapeHtml(data.auth.token || '')}" ${authDisabledAttr}></vscode-textfield>
                            <span class="secret-toggle-btn" data-target="authToken" title="Show/Hide">
                                <span class="codicon codicon-eye"></span>
                            </span>
                        </div>
                    </div>
                </div>

                <div id="authApiKey" class="auth-fields ${data.auth.type === 'apikey' ? 'active' : ''}">
                    <div class="auth-field-row">
                        <label>Key Name</label>
                        <vscode-textfield id="authApiKeyName" value="${escapeHtml(data.auth.apiKeyName || '')}" ${authDisabledAttr}></vscode-textfield>
                    </div>
                    <div class="auth-field-row">
                        <label>Key Value</label>
                        <div class="secret-field-wrapper">
                            <vscode-textfield id="authApiKeyValue" type="password" value="${escapeHtml(data.auth.apiKeyValue || '')}" ${authDisabledAttr}></vscode-textfield>
                            <span class="secret-toggle-btn" data-target="authApiKeyValue" title="Show/Hide">
                                <span class="codicon codicon-eye"></span>
                            </span>
                        </div>
                    </div>
                    <div class="auth-field-row">
                        <label>Add to</label>
                        <vscode-single-select id="authApiKeyIn" ${authDisabledAttr}>
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

        <!-- Settings Tab -->
        <vscode-tab-panel>
            <div class="settings-section">
                <div class="pre-request-section">
                    <h4>Pre-Request</h4>
                    <p class="section-description">Execute another request before this one runs. Useful for authentication or setup requests.</p>
                    <div class="pre-request-toggle">
                        <vscode-checkbox id="enablePreRequest" ${data.preRequestId ? 'checked' : ''}>
                            Execute another request first
                        </vscode-checkbox>
                    </div>
                    <div class="pre-request-select" id="preRequestSelectContainer" style="${data.preRequestId ? '' : 'display: none;'}">
                        <label>Request to run first:</label>
                        <vscode-single-select id="preRequestSelect">
                            <vscode-option value="">-- Select a request --</vscode-option>
                            ${renderAvailableRequestOptions(data.availableRequests || [], data.preRequestId)}
                        </vscode-single-select>
                    </div>
                </div>
            </div>
        </vscode-tab-panel>
    </vscode-tabs>
    </div>
    <div class="split-divider" id="splitDivider"></div>
    <div class="response-pane">
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
            <vscode-tab-header slot="header">Headers <span class="tab-badge" id="headersCount" style="display:none">0</span></vscode-tab-header>
            <vscode-tab-header slot="header">Cookies <span class="tab-badge" id="cookiesCount" style="display:none">0</span></vscode-tab-header>
            <vscode-tab-header slot="header">Raw</vscode-tab-header>
            <vscode-tab-header slot="header">Code Snippet</vscode-tab-header>

            <!-- Response Body Tab -->
            <vscode-tab-panel>
                <div class="response-tab-content">
                    <div class="response-body-wrapper">
                        <div class="response-body" id="responseBody"></div>
                        <button class="copy-response-btn" id="copyResponseBtn" title="Copy response">
                            <span class="codicon codicon-copy"></span>
                        </button>
                    </div>
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
                    <div class="response-body-wrapper">
                        <div class="response-body" id="responseRaw"></div>
                        <button class="copy-response-btn" id="copyRawBtn" title="Copy raw response">
                            <span class="codicon codicon-copy"></span>
                        </button>
                    </div>
                </div>
            </vscode-tab-panel>

            <!-- Code Snippet Tab -->
            <vscode-tab-panel>
                <div class="response-tab-content">
                    <div class="code-snippet-controls">
                        <div class="code-snippet-select-group">
                            <label>Language</label>
                            <vscode-single-select id="codeLanguage">
                                <vscode-option value="curl" selected>cURL</vscode-option>
                                <vscode-option value="javascript-fetch">JavaScript (fetch)</vscode-option>
                                <vscode-option value="python-requests">Python (requests)</vscode-option>
                                <vscode-option value="csharp-httpclient">C# (HttpClient)</vscode-option>
                                <vscode-option value="go-nethttp">Go (net/http)</vscode-option>
                                <vscode-option value="php-curl">PHP (cURL)</vscode-option>
                            </vscode-single-select>
                        </div>
                        <vscode-checkbox id="codeResolveVariables">Resolve variable values</vscode-checkbox>
                        <vscode-button id="copyCodeBtn" appearance="secondary">
                            <span class="codicon codicon-copy"></span>
                            Copy
                        </vscode-button>
                    </div>
                    <div class="code-snippet-output" id="codeSnippetOutput">
                        <pre><code id="codeSnippetCode">Send a request to generate code snippet</code></pre>
                    </div>
                </div>
            </vscode-tab-panel>
        </vscode-tabs>
    </div>
    </div>
    </div>

    <script type="module" nonce="${nonce}" src="${bundleUri}"></script>
    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();
            
            // Initial state
            let requestData = ${JSON.stringify(data)};
            let inheritedHeaders = requestData.inheritedHeaders || [];
            let inheritedHeadersState = requestData.inheritedHeadersState || {};
            let inheritedAuth = requestData.inheritedAuth || null;
            
            // Autocomplete state
            let availableVariables = [];
            let autocompleteTarget = null;
            let autocompleteStartPos = 0;
            let selectedIndex = -1;
            
            // Variable tooltip state
            let resolvedVariablesCache = {};
            let pendingVariableResolve = null;
            
            // Response body for copy functionality
            let currentResponseBody = '';
            
            // Request available variables on load
            vscode.postMessage({ type: 'getAvailableVariables' });
            
            // Split pane drag handling
            let isDragging = false;
            let startY = 0;
            let startHeight = 0;

            function initSplitPane() {
                const divider = document.getElementById('splitDivider');
                const requestPane = document.querySelector('.request-pane');
                
                if (!divider || !requestPane) return;
                
                // Restore saved height from state
                const savedState = vscode.getState();
                if (savedState && savedState.requestPaneHeight) {
                    requestPane.style.height = savedState.requestPaneHeight + 'px';
                }
                
                divider.addEventListener('mousedown', (e) => {
                    isDragging = true;
                    startY = e.clientY;
                    startHeight = requestPane.offsetHeight;
                    divider.classList.add('dragging');
                    document.body.style.cursor = 'ns-resize';
                    document.body.style.userSelect = 'none';
                    e.preventDefault();
                });
                
                document.addEventListener('mousemove', (e) => {
                    if (!isDragging) return;
                    
                    const deltaY = e.clientY - startY;
                    const newHeight = Math.max(150, Math.min(startHeight + deltaY, window.innerHeight - 200));
                    requestPane.style.height = newHeight + 'px';
                });
                
                document.addEventListener('mouseup', () => {
                    if (!isDragging) return;
                    
                    isDragging = false;
                    divider.classList.remove('dragging');
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                    
                    // Save the height to state
                    const currentState = vscode.getState() || {};
                    vscode.setState({
                        ...currentState,
                        requestPaneHeight: requestPane.offsetHeight
                    });
                    
                    // Trigger scroll recalculation after resize
                    if (typeof updateResponseTabHeight === 'function') {
                        setTimeout(updateResponseTabHeight, 50);
                    }
                });
            }

            // Initialize split pane when DOM is ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initSplitPane);
            } else {
                initSplitPane();
            }
            
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
                
                // Notify extension of content change for dirty state tracking
                vscode.postMessage({ type: 'contentChanged', data: state });
                
                // Update tab counts
                updateTabCounts();
            }
            
            function updateTabCounts() {
                // Count enabled query params with non-empty keys
                const queryParamsBody = document.getElementById('queryParamsBody');
                let queryParamsCount = 0;
                if (queryParamsBody) {
                    queryParamsBody.querySelectorAll('.key-value-row').forEach(row => {
                        const checkbox = row.querySelector('vscode-checkbox');
                        const keyField = row.querySelector('[data-field="key"]');
                        if (checkbox && checkbox.checked && keyField && keyField.value.trim()) {
                            queryParamsCount++;
                        }
                    });
                }
                
                // Count enabled request headers with non-empty keys
                const headersBody = document.getElementById('headersBody');
                let headersCount = 0;
                if (headersBody) {
                    headersBody.querySelectorAll('.key-value-row').forEach(row => {
                        const checkbox = row.querySelector('vscode-checkbox');
                        const keyField = row.querySelector('[data-field="key"]');
                        if (checkbox && checkbox.checked && keyField && keyField.value.trim()) {
                            headersCount++;
                        }
                    });
                }
                
                // Count enabled inherited headers
                const inheritedHeadersBody = document.getElementById('inheritedHeadersBody');
                if (inheritedHeadersBody) {
                    inheritedHeadersBody.querySelectorAll('.key-value-row').forEach(row => {
                        const checkbox = row.querySelector('vscode-checkbox');
                        if (checkbox && checkbox.checked) {
                            headersCount++;
                        }
                    });
                }
                
                // Update count displays
                const queryCountEl = document.getElementById('queryParamsCount');
                const headerCountEl = document.getElementById('reqHeadersCount');
                
                if (queryCountEl) {
                    queryCountEl.textContent = queryParamsCount > 0 ? queryParamsCount : '';
                    queryCountEl.style.display = queryParamsCount > 0 ? '' : 'none';
                }
                if (headerCountEl) {
                    headerCountEl.textContent = headersCount > 0 ? headersCount : '';
                    headerCountEl.style.display = headersCount > 0 ? '' : 'none';
                }
            }

            function collectRequestData() {
                const method = document.getElementById('method').value;
                const url = document.getElementById('url').value;
                const queryParams = collectKeyValueRows('queryParamsBody', 'queryParam');
                const headers = collectKeyValueRows('headersBody', 'header');
                
                // Collect inherited headers state
                const collectedInheritedState = {};
                const inheritedRows = document.querySelectorAll('#inheritedHeadersBody tr');
                inheritedRows.forEach(row => {
                    const checkbox = row.querySelector('vscode-checkbox');
                    const keySpan = row.querySelector('[data-inherited-key]');
                    if (checkbox && keySpan) {
                        const key = keySpan.dataset.inheritedKey;
                        collectedInheritedState[key] = checkbox.checked;
                    }
                });
                inheritedHeadersState = collectedInheritedState;
                
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
                
                // Check if using inherited auth
                const useInheritedAuthCheckbox = document.getElementById('useInheritedAuth');
                const useInheritedAuth = useInheritedAuthCheckbox ? useInheritedAuthCheckbox.checked : false;

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

                // Collect pre-request settings
                const enablePreRequest = document.getElementById('enablePreRequest');
                const preRequestSelect = document.getElementById('preRequestSelect');
                let preRequestId = null;
                if (enablePreRequest && enablePreRequest.checked && preRequestSelect) {
                    preRequestId = preRequestSelect.value || null;
                }

                return {
                    id: requestData.id,
                    name: requestData.name,
                    method,
                    url,
                    queryParams,
                    headers,
                    inheritedHeaders: inheritedHeaders,
                    inheritedHeadersState: inheritedHeadersState,
                    inheritedAuth: inheritedAuth,
                    useInheritedAuth: useInheritedAuth,
                    auth,
                    body: { type: bodyType, content: bodyContent },
                    preRequestId: preRequestId
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
                
                // Restore inherited headers and their state
                if (state.inheritedHeaders && Array.isArray(state.inheritedHeaders)) {
                    inheritedHeaders = state.inheritedHeaders;
                }
                if (state.inheritedHeadersState) {
                    inheritedHeadersState = state.inheritedHeadersState;
                }
                restoreInheritedHeadersState(state.inheritedHeaders || inheritedHeaders, state.inheritedHeadersState || inheritedHeadersState);
                
                // Restore auth
                const authIdMap = { 'basic': 'authBasic', 'bearer': 'authBearer', 'apikey': 'authApiKey' };
                if (state.auth) {
                    const authType = state.auth.type || 'none';
                    document.getElementById('authType').value = authType;
                    
                    // Update auth section visibility
                    document.querySelectorAll('.auth-fields').forEach(el => el.classList.remove('active'));
                    if (authType !== 'none' && authIdMap[authType]) {
                        const authSection = document.getElementById(authIdMap[authType]);
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
                
                // Restore useInheritedAuth state
                const useInheritedAuthCheckbox = document.getElementById('useInheritedAuth');
                if (useInheritedAuthCheckbox) {
                    // Respect explicit false, default to true only if undefined and inherited auth exists
                    const useInherited = state.useInheritedAuth === true || 
                        (state.useInheritedAuth === undefined && inheritedAuth && inheritedAuth.type !== 'none');
                    
                    console.log('[Auth Debug] restoreState useInheritedAuth:', {
                        stateValue: state.useInheritedAuth,
                        inheritedAuth: inheritedAuth,
                        computed: useInherited
                    });
                    
                    useInheritedAuthCheckbox.checked = useInherited;
                    // Pass the value directly to avoid timing issues with web component
                    updateAuthSectionState(useInherited);
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
                
                // Restore pre-request settings
                const enablePreRequest = document.getElementById('enablePreRequest');
                const preRequestSelectContainer = document.getElementById('preRequestSelectContainer');
                const preRequestSelect = document.getElementById('preRequestSelect');
                
                if (enablePreRequest && preRequestSelectContainer) {
                    if (state.preRequestId) {
                        enablePreRequest.checked = true;
                        preRequestSelectContainer.style.display = '';
                        if (preRequestSelect) {
                            preRequestSelect.value = state.preRequestId;
                        }
                    } else {
                        enablePreRequest.checked = false;
                        preRequestSelectContainer.style.display = 'none';
                    }
                }
                
                // Update tab counts after restore
                updateTabCounts();
            }
            
            function restoreInheritedHeadersState(headers, state) {
                const tbody = document.getElementById('inheritedHeadersBody');
                if (!tbody) return;
                
                // Clear existing rows
                tbody.innerHTML = '';
                
                // Render inherited header rows
                if (headers && headers.length > 0) {
                    headers.forEach(header => {
                        const isEnabled = state && state[header.key] !== undefined ? state[header.key] : true;
                        const row = document.createElement('tr');
                        row.className = 'key-value-row inherited-row';
                        row.innerHTML = \`
                            <td class="checkbox-cell">
                                <vscode-checkbox \${isEnabled ? 'checked' : ''}></vscode-checkbox>
                            </td>
                            <td>
                                <vscode-textfield data-inherited-key="\${escapeHtmlInJs(header.key)}" value="\${escapeHtmlInJs(header.key)}" disabled></vscode-textfield>
                            </td>
                            <td>
                                <vscode-textfield value="\${escapeHtmlInJs(header.value)}" disabled></vscode-textfield>
                            </td>
                            <td class="delete-cell">
                                <!-- No delete button for inherited headers -->
                            </td>
                        \`;
                        tbody.appendChild(row);
                        
                        // Add change handler for checkbox
                        row.querySelector('vscode-checkbox').addEventListener('change', saveState);
                    });
                }
                
                updateInheritedHeadersVisibility(headers);
            }
            
            function updateInheritedHeadersVisibility(headers) {
                const section = document.getElementById('inheritedHeadersSection');
                const countBadge = document.getElementById('inheritedCount');
                
                if (headers && headers.length > 0) {
                    if (section) section.style.display = '';
                    if (countBadge) countBadge.textContent = headers.length;
                } else {
                    if (section) section.style.display = 'none';
                }
            }

            function updateInheritedAuthVisibility(auth) {
                const section = document.getElementById('inheritedAuthSection');
                const typeBadge = document.getElementById('inheritedAuthType');
                
                if (auth && auth.type && auth.type !== 'none') {
                    if (section) section.style.display = '';
                    if (typeBadge) typeBadge.textContent = auth.type;
                    // Don't call updateAuthSectionState here - restoreState already handled it
                    // This function only controls visibility of the inherited auth section
                } else {
                    if (section) section.style.display = 'none';
                    // When there's no inherited auth, make sure auth section is enabled
                    updateAuthSectionState(false);
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
            const authIdMapHandler = { 'basic': 'authBasic', 'bearer': 'authBearer', 'apikey': 'authApiKey' };
            document.getElementById('authType').addEventListener('change', (e) => {
                const authType = e.target.value;
                document.querySelectorAll('.auth-fields').forEach(el => el.classList.remove('active'));
                if (authType !== 'none' && authIdMapHandler[authType]) {
                    const authSection = document.getElementById(authIdMapHandler[authType]);
                    if (authSection) {
                        authSection.classList.add('active');
                    }
                }
                saveState();
            });

            // Use inherited auth toggle handler
            function updateAuthSectionState(forceUseInherited) {
                const useInheritedAuthCheckbox = document.getElementById('useInheritedAuth');
                const authSection = document.getElementById('authSection');
                
                // Use forceUseInherited if provided, otherwise read from checkbox
                // Default to false if checkbox.checked is undefined (web component not ready)
                const checkboxChecked = forceUseInherited !== undefined ? forceUseInherited : 
                    (useInheritedAuthCheckbox && useInheritedAuthCheckbox.checked === true);
                
                if (authSection) {
                    // Simple rule: disable auth section ONLY if checkbox is checked
                    // If unchecked, auth section is always enabled
                    authSection.classList.toggle('disabled', checkboxChecked);
                    
                    // Actually disable/enable the form elements within auth section
                    // Use setAttribute/removeAttribute for custom elements (vscode-elements)
                    const authTypeSelect = document.getElementById('authType');
                    if (authTypeSelect) {
                        if (checkboxChecked) {
                            authTypeSelect.setAttribute('disabled', '');
                        } else {
                            authTypeSelect.removeAttribute('disabled');
                        }
                    }
                    
                    // Disable all input fields in auth section
                    authSection.querySelectorAll('vscode-textfield, vscode-single-select').forEach(el => {
                        if (checkboxChecked) {
                            el.setAttribute('disabled', '');
                        } else {
                            el.removeAttribute('disabled');
                        }
                    });
                }
            }
            
            const useInheritedAuthCheckbox = document.getElementById('useInheritedAuth');
            if (useInheritedAuthCheckbox) {
                useInheritedAuthCheckbox.addEventListener('change', () => {
                    const inheritedAuthSection = document.getElementById('inheritedAuthSection');
                    const hasValidInheritedAuth = inheritedAuthSection && 
                        inheritedAuthSection.style.display !== 'none' &&
                        inheritedAuth && 
                        inheritedAuth.type && 
                        inheritedAuth.type !== 'none';
                    
                    // When using inherited auth, reset request auth to 'none'
                    // These states are mutually exclusive
                    if (useInheritedAuthCheckbox.checked && hasValidInheritedAuth) {
                        const authTypeSelect = document.getElementById('authType');
                        if (authTypeSelect) {
                            authTypeSelect.value = 'none';
                            document.querySelectorAll('.auth-fields').forEach(el => el.classList.remove('active'));
                        }
                    }
                    
                    updateAuthSectionState();
                    saveState();
                });
                // Don't initialize here - restoreState() will handle it with the correct value
            }

            // Pre-request checkbox handler
            const enablePreRequestCheckbox = document.getElementById('enablePreRequest');
            if (enablePreRequestCheckbox) {
                enablePreRequestCheckbox.addEventListener('change', () => {
                    const preRequestSelectContainer = document.getElementById('preRequestSelectContainer');
                    if (preRequestSelectContainer) {
                        preRequestSelectContainer.style.display = enablePreRequestCheckbox.checked ? '' : 'none';
                    }
                    saveState();
                });
            }
            
            // Pre-request select change handler
            const preRequestSelect = document.getElementById('preRequestSelect');
            if (preRequestSelect) {
                preRequestSelect.addEventListener('change', saveState);
            }

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

            // Code Snippet tab handlers
            let currentCodeSnippet = '';
            
            function generateCodeSnippet() {
                const data = collectRequestData();
                const language = document.getElementById('codeLanguage').value;
                const resolveVars = document.getElementById('codeResolveVariables').checked;
                vscode.postMessage({ 
                    type: 'generateCodeSnippet', 
                    data,
                    language,
                    resolveVariables: resolveVars
                });
            }
            
            document.getElementById('codeLanguage').addEventListener('change', generateCodeSnippet);
            document.getElementById('codeResolveVariables').addEventListener('change', generateCodeSnippet);
            
            document.getElementById('copyCodeBtn').addEventListener('click', () => {
                if (currentCodeSnippet) {
                    vscode.postMessage({ type: 'copyToClipboard', text: currentCodeSnippet });
                }
            });

            // Open in Editor button handler
            document.getElementById('openInEditorBtn').addEventListener('click', () => {
                vscode.postMessage({ type: 'openInEditor' });
            });

            // Copy response button handlers
            function setupCopyButton(btnId) {
                const btn = document.getElementById(btnId);
                if (!btn) return;
                
                btn.addEventListener('click', () => {
                    if (!currentResponseBody) return;
                    
                    vscode.postMessage({ type: 'copyToClipboard', text: currentResponseBody });
                    
                    // Visual feedback
                    btn.classList.add('copied');
                    const icon = btn.querySelector('.codicon');
                    if (icon) {
                        icon.classList.remove('codicon-copy');
                        icon.classList.add('codicon-check');
                    }
                    
                    setTimeout(() => {
                        btn.classList.remove('copied');
                        if (icon) {
                            icon.classList.remove('codicon-check');
                            icon.classList.add('codicon-copy');
                        }
                    }, 1500);
                });
            }
            
            setupCopyButton('copyResponseBtn');
            setupCopyButton('copyRawBtn');

            // Calculate and set fixed height for response tab content
            function updateResponseTabHeight() {
                const responsePane = document.querySelector('.response-pane');
                const responseMetrics = document.getElementById('responseMetrics');
                const responseTabs = document.getElementById('responseTabs');
                
                if (!responsePane || !responseMetrics || !responseTabs) return;
                
                // Get available height: response pane - metrics - tab headers - margins
                const paneRect = responsePane.getBoundingClientRect();
                const metricsRect = responseMetrics.getBoundingClientRect();
                const tabHeaderHeight = 40;
                const margins = 36;
                
                const availableHeight = paneRect.height - metricsRect.height - tabHeaderHeight - margins;
                
                // Set height on all tab content divs
                const contents = document.querySelectorAll('#responseTabs .response-tab-content');
                contents.forEach(content => {
                    if (availableHeight > 50) {
                        content.style.height = availableHeight + 'px';
                        content.style.maxHeight = availableHeight + 'px';
                    }
                });
            }

            // Update tab content height on tab change
            const responseTabs = document.getElementById('responseTabs');
            if (responseTabs) {
                responseTabs.addEventListener('vsc-tabs-select', () => {
                    setTimeout(updateResponseTabHeight, 50);
                });
            }

            // Update tab content height when window/panel is resized
            let resizeTimeout;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(updateResponseTabHeight, 100);
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
                        inheritedHeaders = message.data.inheritedHeaders || [];
                        inheritedHeadersState = message.data.inheritedHeadersState || {};
                        inheritedAuth = message.data.inheritedAuth || null;
                        restoreState(requestData);
                        updateInheritedAuthVisibility(inheritedAuth);
                        // Hide dirty indicator on fresh load
                        const loadIndicator = document.getElementById('dirtyIndicator');
                        if (loadIndicator) {
                            loadIndicator.classList.remove('visible');
                        }
                        // Don't call saveState() here to avoid triggering dirty immediately
                        break;
                    case 'updateInheritedHeaders':
                        inheritedHeaders = message.data.inheritedHeaders || [];
                        // Preserve existing state for headers that still exist
                        const newState = {};
                        inheritedHeaders.forEach(h => {
                            newState[h.key] = inheritedHeadersState[h.key] !== undefined ? inheritedHeadersState[h.key] : true;
                        });
                        inheritedHeadersState = newState;
                        restoreInheritedHeadersState(inheritedHeaders, inheritedHeadersState);
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
                    case 'variablesList':
                        availableVariables = message.data || [];
                        // Clear resolved variables cache when variable list updates
                        resolvedVariablesCache = {};
                        break;
                    case 'variableResolved':
                        // Cache the resolved value and source
                        resolvedVariablesCache[message.variableName] = { 
                            value: message.resolvedValue, 
                            source: message.source 
                        };
                        // Show tooltip if this is the pending request
                        if (pendingVariableResolve && pendingVariableResolve.variableName === message.variableName) {
                            displayTooltip(message.variableName, message.resolvedValue, message.source, pendingVariableResolve.mouseX, pendingVariableResolve.mouseY);
                            pendingVariableResolve = null;
                        }
                        break;
                    case 'codeSnippetGenerated':
                        currentCodeSnippet = message.rawCode || '';
                        const outputEl = document.getElementById('codeSnippetOutput');
                        if (outputEl) {
                            if (message.highlightedCode) {
                                // Use pre-highlighted HTML from extension host (Shiki generates own <pre><code>)
                                outputEl.innerHTML = message.highlightedCode;
                            } else if (currentCodeSnippet) {
                                outputEl.innerHTML = '<pre><code>' + currentCodeSnippet.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</code></pre>';
                            } else {
                                outputEl.innerHTML = '<pre><code class="code-snippet-placeholder">Failed to generate code</code></pre>';
                            }
                        }
                        break;
                    case 'codeCopied':
                        // Notification handled by extension
                        break;
                    case 'dirtyStateChanged':
                        // Update dirty indicator visibility
                        const indicator = document.getElementById('dirtyIndicator');
                        if (indicator) {
                            indicator.classList.toggle('visible', message.isDirty);
                        }
                        break;
                    case 'updateAvailableRequests':
                        // Update the pre-request dropdown with available requests
                        const preReqSelect = document.getElementById('preRequestSelect');
                        if (preReqSelect && message.data) {
                            const requests = message.data.requests || [];
                            const currentRequestId = message.data.currentRequestId;
                            // Filter out the current request (can't run yourself first)
                            const filteredRequests = requests.filter(r => r.id !== currentRequestId);
                            
                            let optionsHtml = '<vscode-option value="">-- Select a request --</vscode-option>';
                            if (filteredRequests.length === 0) {
                                optionsHtml += '<vscode-option value="" disabled>No other requests in this collection</vscode-option>';
                            } else {
                                filteredRequests.forEach(req => {
                                    const selected = req.id === requestData.preRequestId ? 'selected' : '';
                                    optionsHtml += '<vscode-option value="' + escapeHtmlInJs(req.id) + '" ' + selected + '>' + escapeHtmlInJs(req.name) + '</vscode-option>';
                                });
                            }
                            preReqSelect.innerHTML = optionsHtml;
                        }
                        break;
                }
            });
            
            // Autocomplete functionality
            const autocompleteDropdown = document.getElementById('autocompleteDropdown');
            
            // Fields that should have autocomplete
            const autocompleteSelectors = [
                '#url',
                '#authUsername',
                '#authPassword',
                '#authToken',
                '#authApiKeyName',
                '#authApiKeyValue',
                '#bodyJsonContent',
                '#bodyTextContent',
                '#bodyXmlContent',
                '[data-field="value"]' // Query param and header value inputs
            ];
            
            function isAutocompleteField(element) {
                if (!element) return false;
                for (const selector of autocompleteSelectors) {
                    if (element.matches && element.matches(selector)) return true;
                    if (element.id && selector === '#' + element.id) return true;
                    if (element.dataset && element.dataset.field === 'value') return true;
                }
                // Also check if it's a textarea
                if (element.tagName === 'TEXTAREA') return true;
                return false;
            }
            
            function getInputElement(target) {
                // For vscode-textfield, we need to find the inner input
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
                if (element.tagName === 'VSCODE-TEXTFIELD') {
                    return element.value || '';
                }
                return element.value || '';
            }
            
            function setValue(element, value) {
                if (element.tagName === 'VSCODE-TEXTFIELD') {
                    element.value = value;
                } else {
                    element.value = value;
                }
            }
            
            function showAutocomplete(target, cursorPos) {
                const value = getValue(target);
                const textBeforeCursor = value.substring(0, cursorPos);
                
                // Find the last {{ before cursor
                const lastOpenBrace = textBeforeCursor.lastIndexOf('{{');
                if (lastOpenBrace === -1) {
                    hideAutocomplete();
                    return;
                }
                
                // Check if there's a closing }} between {{ and cursor
                const textAfterBrace = textBeforeCursor.substring(lastOpenBrace + 2);
                if (textAfterBrace.includes('}}')) {
                    hideAutocomplete();
                    return;
                }
                
                // Get the partial variable name typed so far
                const partialName = textAfterBrace.toLowerCase();
                
                // Filter variables based on partial match
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
                
                // Add click handlers
                autocompleteDropdown.querySelectorAll('.autocomplete-item').forEach(item => {
                    item.addEventListener('click', (e) => {
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
                
                // Scroll selected item into view
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
                
                // Set cursor position after the inserted variable
                const newCursorPos = autocompleteStartPos + name.length + 4; // {{ + name + }}
                setTimeout(() => {
                    autocompleteTarget.focus();
                    setCursorPosition(autocompleteTarget, newCursorPos);
                }, 0);
                
                hideAutocomplete();
                saveState();
            }
            
            // Listen for input events on document (handles dynamically added fields)
            document.addEventListener('input', (e) => {
                const target = e.target;
                if (!isAutocompleteField(target)) return;
                
                const cursorPos = getCursorPosition(target);
                const value = getValue(target);
                const textBeforeCursor = value.substring(0, cursorPos);
                
                // Check if we just typed {{ or are continuing to type after {{
                if (textBeforeCursor.endsWith('{{') || 
                    (autocompleteTarget === target && autocompleteDropdown.classList.contains('visible'))) {
                    showAutocomplete(target, cursorPos);
                } else {
                    // Check if cursor is still within a {{ ... (no closing }})
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
            
            // Close autocomplete on scroll (positions may become invalid)
            // But ignore scrolls within the dropdown itself (from scrollIntoView)
            document.addEventListener('scroll', (e) => {
                if (!autocompleteDropdown.contains(e.target)) {
                    hideAutocomplete();
                }
            }, true);

            // Variable hover tooltip functionality
            const variableTooltip = document.getElementById('variableTooltip');
            let tooltipTimeout = null;
            let currentTooltipTarget = null;
            
            function findVariableAtPosition(text, position) {
                // Find all {{variable}} patterns and check if position is within one
                let match;
                const pattern = /\{\{([^{}]+)\}\}/g;
                while ((match = pattern.exec(text)) !== null) {
                    const start = match.index;
                    const end = match.index + match[0].length;
                    if (position >= start && position <= end) {
                        return {
                            name: match[1].trim(),
                            fullMatch: match[0],
                            start: start,
                            end: end
                        };
                    }
                }
                return null;
            }
            
            function getCharacterPositionFromMouse(element, mouseX, mouseY) {
                // For vscode-textfield, get the inner input element
                const input = element.tagName === 'VSCODE-TEXTFIELD' 
                    ? (element.shadowRoot?.querySelector('input') || element)
                    : element;
                
                const text = input.value || '';
                if (!text) return -1;
                
                // Create a temporary span to measure text width
                const tempSpan = document.createElement('span');
                const computedStyle = window.getComputedStyle(input);
                tempSpan.style.cssText = \`
                    font-family: \${computedStyle.fontFamily};
                    font-size: \${computedStyle.fontSize};
                    letter-spacing: \${computedStyle.letterSpacing};
                    white-space: pre;
                    position: absolute;
                    visibility: hidden;
                \`;
                document.body.appendChild(tempSpan);
                
                const inputRect = input.getBoundingClientRect();
                const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
                const scrollLeft = input.scrollLeft || 0;
                const relativeX = mouseX - inputRect.left - paddingLeft + scrollLeft;
                
                // Binary search for the character position
                let left = 0;
                let right = text.length;
                
                while (left < right) {
                    const mid = Math.floor((left + right) / 2);
                    tempSpan.textContent = text.substring(0, mid);
                    const width = tempSpan.offsetWidth;
                    
                    if (width < relativeX) {
                        left = mid + 1;
                    } else {
                        right = mid;
                    }
                }
                
                document.body.removeChild(tempSpan);
                return left;
            }
            
            function showVariableTooltip(element, variableName, mouseX, mouseY) {
                // Check cache first
                if (resolvedVariablesCache[variableName] !== undefined) {
                    const cached = resolvedVariablesCache[variableName];
                    displayTooltip(variableName, cached.value, cached.source, mouseX, mouseY);
                    return;
                }
                
                // Request resolution from extension host
                pendingVariableResolve = { variableName, mouseX, mouseY };
                vscode.postMessage({ type: 'resolveVariable', variableName: variableName });
            }
            
            function displayTooltip(variableName, resolvedValue, source, mouseX, mouseY) {
                const isResolved = resolvedValue !== null && resolvedValue !== undefined;
                const displayValue = isResolved ? resolvedValue : 'undefined';
                
                let tooltipHtml = \`<div class="variable-tooltip-name">{{\${escapeHtmlInJs(variableName)}}}</div>\`;
                tooltipHtml += \`<div class="\${isResolved ? 'variable-tooltip-value' : 'variable-tooltip-unresolved'}">\${escapeHtmlInJs(displayValue)}</div>\`;
                
                if (source) {
                    tooltipHtml += \`<div class="variable-tooltip-source">Resolved by: \${escapeHtmlInJs(source)}</div>\`;
                }
                
                variableTooltip.innerHTML = tooltipHtml;
                
                // Position tooltip near cursor
                variableTooltip.style.left = mouseX + 10 + 'px';
                variableTooltip.style.top = mouseY + 10 + 'px';
                
                // Adjust if tooltip goes off screen
                const tooltipRect = variableTooltip.getBoundingClientRect();
                if (tooltipRect.right > window.innerWidth) {
                    variableTooltip.style.left = (mouseX - tooltipRect.width - 10) + 'px';
                }
                if (tooltipRect.bottom > window.innerHeight) {
                    variableTooltip.style.top = (mouseY - tooltipRect.height - 10) + 'px';
                }
                
                variableTooltip.classList.add('visible');
            }
            
            function hideVariableTooltip() {
                variableTooltip.classList.remove('visible');
                currentTooltipTarget = null;
                pendingVariableResolve = null;
                if (tooltipTimeout) {
                    clearTimeout(tooltipTimeout);
                    tooltipTimeout = null;
                }
            }
            
            // Handle mouse move over input fields
            document.addEventListener('mousemove', (e) => {
                const target = e.target;
                
                // Check if hovering over an autocomplete-enabled field
                if (!isAutocompleteField(target)) {
                    if (currentTooltipTarget) {
                        hideVariableTooltip();
                    }
                    return;
                }
                
                // Debounce the check
                if (tooltipTimeout) {
                    clearTimeout(tooltipTimeout);
                }
                
                tooltipTimeout = setTimeout(() => {
                    const charPos = getCharacterPositionFromMouse(target, e.clientX, e.clientY);
                    const text = getValue(target);
                    const variable = findVariableAtPosition(text, charPos);
                    
                    if (variable) {
                        // Show tooltip for this variable
                        currentTooltipTarget = target;
                        showVariableTooltip(target, variable.name, e.clientX, e.clientY);
                    } else if (currentTooltipTarget) {
                        hideVariableTooltip();
                    }
                }, 200);
            });
            
            // Hide tooltip when mouse leaves input
            document.addEventListener('mouseout', (e) => {
                if (isAutocompleteField(e.target) && !isAutocompleteField(e.relatedTarget)) {
                    hideVariableTooltip();
                }
            });

            function showResponse(response) {
                const responsePane = document.querySelector('.response-pane');
                const divider = document.getElementById('splitDivider');
                if (responsePane) responsePane.classList.add('visible');
                if (divider) divider.classList.add('visible');
                
                // Store raw response body for copy functionality
                currentResponseBody = response.body || '';
                
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
                
                // Response body tab - use pre-highlighted HTML from extension host
                const bodyEl = document.getElementById('responseBody');
                if (response.highlightedBody) {
                    // Use pre-highlighted HTML from extension host
                    bodyEl.innerHTML = response.highlightedBody;
                } else if (isJson) {
                    try {
                        const parsed = JSON.parse(response.body);
                        const formatted = JSON.stringify(parsed, null, 2);
                        bodyEl.textContent = formatted;
                    } catch {
                        bodyEl.textContent = response.body;
                    }
                } else {
                    bodyEl.textContent = response.body;
                }
                
                // Headers tab
                const headers = response.headers || {};
                const headerEntries = Object.entries(headers);
                const headersCountEl = document.getElementById('headersCount');
                headersCountEl.textContent = headerEntries.length;
                headersCountEl.style.display = headerEntries.length > 0 ? '' : 'none';
                
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
                document.getElementById('cookiesCount').style.display = cookies.length > 0 ? '' : 'none';
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
                
                // Generate code snippet
                generateCodeSnippet();
                
                // Update tab content heights after response is displayed
                setTimeout(updateResponseTabHeight, 100);
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
                const responsePane = document.querySelector('.response-pane');
                const divider = document.getElementById('splitDivider');
                if (responsePane) responsePane.classList.add('visible');
                if (divider) divider.classList.add('visible');
                
                // Store error as response body for copy functionality
                currentResponseBody = error || '';
                
                const statusEl = document.getElementById('responseStatus');
                statusEl.textContent = 'Error';
                statusEl.className = 'metric-value status-error';
                
                document.getElementById('responseTime').textContent = '-';
                document.getElementById('responseSize').textContent = '-';
                document.getElementById('responseBody').textContent = error;
                document.getElementById('responseRaw').textContent = error;
                document.getElementById('headersCount').textContent = '0';
                document.getElementById('headersCount').style.display = 'none';
                document.getElementById('cookiesCount').textContent = '0';
                document.getElementById('cookiesCount').style.display = 'none';
                document.getElementById('responseHeadersBody').innerHTML = '';
                document.getElementById('responseCookiesBody').innerHTML = '';
                document.getElementById('noCookies').style.display = 'block';
                document.getElementById('responseCookiesTable').style.display = 'none';
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

function renderInheritedHeaderRows(headers: { key: string; value: string }[], state: Record<string, boolean>): string {
    if (!headers || headers.length === 0) {
        return '';
    }

    return headers.map(header => {
        const isEnabled = state && state[header.key] !== undefined ? state[header.key] : true;
        return `
        <tr class="key-value-row inherited-row">
            <td class="checkbox-cell">
                <vscode-checkbox ${isEnabled ? 'checked' : ''}></vscode-checkbox>
            </td>
            <td>
                <vscode-textfield data-inherited-key="${escapeHtml(header.key)}" value="${escapeHtml(header.key)}" disabled></vscode-textfield>
            </td>
            <td>
                <vscode-textfield value="${escapeHtml(header.value)}" disabled></vscode-textfield>
            </td>
            <td class="delete-cell">
                <!-- No delete button for inherited headers -->
            </td>
        </tr>
    `;
    }).join('');
}

function renderAvailableRequestOptions(requests: { id: string; name: string }[], selectedId?: string): string {
    if (!requests || requests.length === 0) {
        return '<vscode-option value="" disabled>No other requests in this collection</vscode-option>';
    }

    return requests.map(req =>
        `<vscode-option value="${escapeHtml(req.id)}" ${req.id === selectedId ? 'selected' : ''}>${escapeHtml(req.name)}</vscode-option>`
    ).join('');
}
