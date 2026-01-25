import * as vscode from 'vscode';
import { getNonce, getVscodeElementsUri, getCodiconsUri } from './webviewUtils';
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
    auth: AuthConfig;
    body: RequestBody;
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

        /* Inherited headers styles */
        .inherited-headers-section {
            margin-bottom: 16px;
        }

        .inherited-headers-details {
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
        }

        .inherited-headers-details summary {
            padding: 8px 12px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            gap: 6px;
            user-select: none;
        }

        .inherited-headers-details summary:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .inherited-headers-details summary::-webkit-details-marker {
            display: none;
        }

        .inherited-headers-details summary::before {
            content: '';
            border: 5px solid transparent;
            border-left-color: var(--vscode-foreground);
            margin-right: 4px;
            transition: transform 0.1s;
        }

        .inherited-headers-details[open] summary::before {
            transform: rotate(90deg);
        }

        .inherited-headers-content {
            padding: 8px 12px 12px;
            border-top: 1px solid var(--vscode-widget-border);
        }

        .inherited-badge {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 10px;
            padding: 2px 8px;
            font-size: 10px;
            font-weight: normal;
            margin-left: auto;
        }

        .inherited-row {
            background-color: transparent;
        }

        .inherited-row vscode-textfield {
            width: 100%;
        }

        /* Inherited auth styles */
        .inherited-auth-section {
            margin-bottom: 16px;
        }

        .inherited-auth-details {
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
        }

        .inherited-auth-details summary {
            padding: 8px 12px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            gap: 6px;
            user-select: none;
        }

        .inherited-auth-details summary:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .inherited-auth-details summary::-webkit-details-marker {
            display: none;
        }

        .inherited-auth-details summary::before {
            content: '';
            border: 5px solid transparent;
            border-left-color: var(--vscode-foreground);
            margin-right: 4px;
            transition: transform 0.1s;
        }

        .inherited-auth-details[open] summary::before {
            transform: rotate(90deg);
        }

        .inherited-auth-content {
            padding: 8px 12px 12px;
            border-top: 1px solid var(--vscode-widget-border);
        }

        .inherited-auth-type {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 10px;
            padding: 2px 8px;
            font-size: 10px;
            font-weight: normal;
            margin-left: auto;
            text-transform: capitalize;
        }

        .inherited-auth-field {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }

        .inherited-auth-field:last-child {
            margin-bottom: 0;
        }

        .inherited-auth-field label {
            width: 100px;
            flex-shrink: 0;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .inherited-auth-field vscode-textfield {
            flex: 1;
        }

        .no-inherited-headers {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            font-size: 12px;
            padding: 8px 0;
        }

        /* Autocomplete dropdown styles */
        .autocomplete-dropdown {
            position: fixed;
            z-index: 10000;
            min-width: 250px;
            max-width: 400px;
            max-height: 200px;
            overflow-y: auto;
            background-color: var(--vscode-editorWidget-background, var(--vscode-editor-background));
            border: 1px solid var(--vscode-editorWidget-border, var(--vscode-widget-border));
            border-radius: 4px;
            box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.36));
            display: none;
        }

        .autocomplete-dropdown.visible {
            display: block;
        }

        .autocomplete-item {
            display: flex;
            flex-direction: column;
            padding: 6px 10px;
            cursor: pointer;
            border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
        }

        .autocomplete-item:last-child {
            border-bottom: none;
        }

        .autocomplete-item:hover,
        .autocomplete-item.selected {
            background-color: var(--vscode-list-hoverBackground, rgba(90, 93, 94, 0.31));
        }

        .autocomplete-item.selected {
            background-color: var(--vscode-list-activeSelectionBackground, #094771);
            color: var(--vscode-list-activeSelectionForeground, #ffffff);
        }

        .autocomplete-item-name {
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: var(--vscode-editor-font-size, 13px);
            font-weight: 500;
        }

        .autocomplete-item-source {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
        }

        .autocomplete-item.selected .autocomplete-item-source {
            color: var(--vscode-list-activeSelectionForeground, #ffffff);
            opacity: 0.8;
        }

        .autocomplete-no-results {
            padding: 8px 10px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
    </style>
</head>
<body>
    <!-- Autocomplete dropdown -->
    <div id="autocompleteDropdown" class="autocomplete-dropdown"></div>

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
                <details class="inherited-auth-details">
                    <summary>
                        <span class="codicon codicon-link"></span>
                        Inherited Auth
                        <span class="inherited-auth-type" id="inheritedAuthType">${data.inheritedAuth?.type || 'none'}</span>
                    </summary>
                    <div class="inherited-auth-content" id="inheritedAuthContent">
                        ${renderInheritedAuth(data.inheritedAuth)}
                    </div>
                </details>
            </div>

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
            let inheritedHeaders = requestData.inheritedHeaders || [];
            let inheritedHeadersState = requestData.inheritedHeadersState || {};
            let inheritedAuth = requestData.inheritedAuth || null;
            
            // Autocomplete state
            let availableVariables = [];
            let autocompleteTarget = null;
            let autocompleteStartPos = 0;
            let selectedIndex = -1;
            
            // Request available variables on load
            vscode.postMessage({ type: 'getAvailableVariables' });
            
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
                    inheritedHeaders: inheritedHeaders,
                    inheritedHeadersState: inheritedHeadersState,
                    inheritedAuth: inheritedAuth,
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
                } else {
                    if (section) section.style.display = 'none';
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
                        inheritedHeaders = message.data.inheritedHeaders || [];
                        inheritedHeadersState = message.data.inheritedHeadersState || {};
                        inheritedAuth = message.data.inheritedAuth || null;
                        restoreState(requestData);
                        updateInheritedAuthVisibility(inheritedAuth);
                        saveState();
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
            document.addEventListener('scroll', () => {
                hideAutocomplete();
            }, true);

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

function renderInheritedAuth(auth: AuthConfig | undefined): string {
    if (!auth || auth.type === 'none') {
        return '<div class="inherited-auth-field"><span>No authentication configured</span></div>';
    }

    switch (auth.type) {
        case 'basic':
            return `
                <div class="inherited-auth-field">
                    <label>Username</label>
                    <vscode-textfield value="${escapeHtml(auth.username || '')}" disabled></vscode-textfield>
                </div>
                <div class="inherited-auth-field">
                    <label>Password</label>
                    <vscode-textfield type="password" value="${escapeHtml(auth.password || '')}" disabled></vscode-textfield>
                </div>
            `;
        case 'bearer':
            return `
                <div class="inherited-auth-field">
                    <label>Token</label>
                    <vscode-textfield type="password" value="${escapeHtml(auth.token || '')}" disabled></vscode-textfield>
                </div>
            `;
        case 'apikey':
            return `
                <div class="inherited-auth-field">
                    <label>Key Name</label>
                    <vscode-textfield value="${escapeHtml(auth.apiKeyName || '')}" disabled></vscode-textfield>
                </div>
                <div class="inherited-auth-field">
                    <label>Key Value</label>
                    <vscode-textfield type="password" value="${escapeHtml(auth.apiKeyValue || '')}" disabled></vscode-textfield>
                </div>
                <div class="inherited-auth-field">
                    <label>Add to</label>
                    <vscode-textfield value="${auth.apiKeyIn === 'query' ? 'Query Params' : 'Header'}" disabled></vscode-textfield>
                </div>
            `;
        default:
            return '';
    }
}
