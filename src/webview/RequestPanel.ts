import * as vscode from 'vscode';
import { generateRequestPanelHtml, RequestData, getDefaultRequestData, requestToRequestData } from './RequestPanelHtml';
import { Request } from '../models/Collection';
import { HistoryItem, createHistoryItem } from '../models/HistoryItem';
import { HttpClient } from '../http/HttpClient';
import { HttpResponse } from '../http/ResponseContentProvider';
import { ResponseDisplay } from '../http/ResponseDisplay';
import { StorageService } from '../storage/StorageService';
import { VariableService } from '../storage/VariableService';
import { ResponseStorage } from '../storage/ResponseStorage';
import { maskAuthHeaders, maskResponseHeaders, sanitizeUrl, shouldStoreBody, truncateBody, sanitizeBody, sanitizeFormBody } from '../storage/HistorySanitizer';
import { getGenerator } from '../codegen';
import { SyntaxHighlighter } from '../http/SyntaxHighlighter';
import { DirtyStateProvider } from '../providers/DirtyStateProvider';
import { getLogger } from '../logger';
import { getSetting } from '../settings';

export class RequestPanel {
    public static currentPanel: RequestPanel | undefined;
    private static panels: Map<string, RequestPanel> = new Map();
    private static _storageService: StorageService | undefined;
    private static _variableService: VariableService | undefined;
    private static _httpClient: HttpClient | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _requestData: RequestData;
    private _requestId: string | undefined;
    private _collectionId: string | undefined;
    private _lastResponse: HttpResponse | undefined;
    private _isDirty: boolean = false;
    private _originalDataHash: string = '';
    private _baseName: string = '';

    public static initialize(
        storageService: StorageService,
        variableService: VariableService
    ): void {
        RequestPanel._storageService = storageService;
        RequestPanel._variableService = variableService;
        RequestPanel._httpClient = new HttpClient();
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        requestData: RequestData,
        collectionId?: string
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._requestData = requestData;
        this._requestId = requestData.id;
        this._collectionId = collectionId;

        // Initialize dirty state tracking
        this._baseName = requestData.name || 'New Request';
        this._originalDataHash = this._computeDataHash(requestData);
        this._isDirty = false;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed - prompt to save if dirty
        this._panel.onDidDispose(async () => {
            await this._handlePanelClose();
        }, null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => this._handleMessage(message),
            null,
            this._disposables
        );

        // Note: With retainContextWhenHidden: true, webview state is preserved
        // No need to regenerate HTML on visibility change
    }

    public static createOrShow(extensionUri: vscode.Uri, requestData?: RequestData, collectionId?: string): RequestPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const data = requestData || getDefaultRequestData();
        const panelKey = data.id || 'new-request';

        // If we already have a panel for this request, show it
        if (data.id && RequestPanel.panels.has(data.id)) {
            const existingPanel = RequestPanel.panels.get(data.id)!;
            existingPanel._panel.reveal(column);
            return existingPanel;
        }

        // If showing a new request and we have an existing new request panel, reuse it
        if (!data.id && RequestPanel.currentPanel && !RequestPanel.currentPanel._requestId) {
            RequestPanel.currentPanel._requestData = data;
            RequestPanel.currentPanel._collectionId = collectionId;
            RequestPanel.currentPanel._update();
            RequestPanel.currentPanel._panel.reveal(column);
            return RequestPanel.currentPanel;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'endpointRequest',
            data.id ? data.name : 'New Request',
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
        panel.iconPath = new vscode.ThemeIcon('symbol-method');

        const requestPanel = new RequestPanel(panel, extensionUri, data, collectionId);

        if (data.id) {
            RequestPanel.panels.set(data.id, requestPanel);
        } else {
            RequestPanel.currentPanel = requestPanel;
        }

        return requestPanel;
    }

    public static async openRequest(extensionUri: vscode.Uri, request: Request, collectionId?: string): Promise<RequestPanel> {
        const requestData = requestToRequestData(request);

        // Fetch inherited headers and auth from collection if available
        if (collectionId && RequestPanel._storageService) {
            const collection = await RequestPanel._storageService.getCollectionAsync(collectionId);
            if (collection) {
                // Inherited headers
                if (collection.defaultHeaders && collection.defaultHeaders.length > 0) {
                    requestData.inheritedHeaders = collection.defaultHeaders
                        .filter(h => h.name) // Only include headers with names
                        .map(h => ({ key: h.name, value: h.value }));
                    // Restore inherited headers state from saved disabled list
                    requestData.inheritedHeadersState = {};
                    const disabledSet = new Set(request.disabledInheritedHeaders || []);
                    requestData.inheritedHeaders.forEach(h => {
                        requestData.inheritedHeadersState![h.key] = !disabledSet.has(h.key);
                    });
                }

                // Inherited auth
                if (collection.defaultAuth && collection.defaultAuth.type !== 'none') {
                    requestData.inheritedAuth = collection.defaultAuth;
                    // Respect saved useInheritedAuth value, default to true only if not explicitly set
                    requestData.useInheritedAuth = request.useInheritedAuth !== false;
                }

                // Available requests for pre-request selection (exclude current request)
                requestData.availableRequests = collection.requests
                    .filter(r => r.id !== request.id)
                    .map(r => ({ id: r.id, name: r.name }));
            }
        }

        const panel = RequestPanel.createOrShow(extensionUri, requestData, collectionId);

        // Send available requests to the webview
        if (collectionId && RequestPanel._storageService) {
            const collection = await RequestPanel._storageService.getCollectionAsync(collectionId);
            if (collection) {
                panel._sendAvailableRequests(collection.requests, request.id);
            }
        }

        return panel;
    }

    public static openHistoryItem(extensionUri: vscode.Uri, historyItem: HistoryItem): RequestPanel {
        const requestData: RequestData = {
            name: `${historyItem.method} ${historyItem.url}`,
            method: historyItem.method,
            url: historyItem.url,
            queryParams: [],
            headers: historyItem.headers.map(h => ({ key: h.name, value: h.value, enabled: h.enabled })),
            auth: { type: 'none' },
            body: historyItem.body
        };

        // Parse query params from URL
        try {
            const url = new URL(historyItem.url);
            url.searchParams.forEach((value, key) => {
                requestData.queryParams.push({ key, value, enabled: true });
            });
            requestData.url = url.origin + url.pathname;
        } catch {
            // Invalid URL, use as-is
        }

        return RequestPanel.createOrShow(extensionUri, requestData);
    }

    public loadRequest(requestData: RequestData): void {
        this._requestData = requestData;
        this._requestId = requestData.id;
        this._baseName = requestData.name || 'New Request';
        this._originalDataHash = this._computeDataHash(requestData);
        this._clearDirty();
        this._panel.title = this._baseName;
        this._panel.webview.postMessage({ type: 'loadRequest', data: requestData });
    }

    public sendImmediately(): void {
        if (this._requestData) {
            this._sendRequest(this._requestData);
        }
    }

    /**
     * Compute a hash of request data for change detection
     */
    private _computeDataHash(data: RequestData): string {
        // Create a normalized representation for comparison
        const normalized = {
            name: data.name,
            method: data.method,
            url: data.url,
            queryParams: data.queryParams,
            headers: data.headers,
            auth: data.auth,
            body: data.body,
            inheritedHeadersState: data.inheritedHeadersState,
            useInheritedAuth: data.useInheritedAuth,
            preRequestId: data.preRequestId
        };
        return JSON.stringify(normalized);
    }

    /**
     * Mark the request as dirty (has unsaved changes)
     */
    private _setDirty(): void {
        if (!this._isDirty) {
            this._isDirty = true;
            this._panel.title = `\u25cf ${this._baseName}`;

            // Update global dirty state tracker
            if (this._requestId) {
                DirtyStateProvider.getInstance().setDirty(this._requestId, true);
                vscode.commands.executeCommand('endpoint.refreshCollections');
            }

            // Notify webview of dirty state
            this._panel.webview.postMessage({ type: 'dirtyStateChanged', isDirty: true });
        }
    }

    /**
     * Clear dirty state (e.g., after save)
     */
    private _clearDirty(): void {
        if (this._isDirty) {
            this._isDirty = false;
            this._panel.title = this._baseName;

            // Update global dirty state tracker
            if (this._requestId) {
                DirtyStateProvider.getInstance().setDirty(this._requestId, false);
                vscode.commands.executeCommand('endpoint.refreshCollections');
            }

            // Notify webview of dirty state
            this._panel.webview.postMessage({ type: 'dirtyStateChanged', isDirty: false });
        }
    }

    /**
     * Check if current data differs from original
     */
    private _checkDirty(data: RequestData): void {
        const currentHash = this._computeDataHash(data);
        if (currentHash !== this._originalDataHash) {
            this._setDirty();
        } else {
            this._clearDirty();
        }
    }

    private _handleMessage(message: any): void {
        switch (message.type) {
            case 'sendRequest':
                this._sendRequest(message.data);
                break;
            case 'saveRequest':
                this._saveRequest(message.data);
                break;
            case 'updateRequest':
                this._requestData = message.data;
                break;
            case 'contentChanged':
                // Webview notifies us of content changes for dirty tracking
                this._requestData = message.data;
                this._checkDirty(message.data);
                break;
            case 'openInEditor':
                this._openResponseInEditor();
                break;
            case 'getAvailableVariables':
                this._getAvailableVariables();
                break;
            case 'generateCodeSnippet':
                this._generateCodeSnippet(message.data, message.language, message.resolveVariables);
                break;
            case 'copyToClipboard':
                this._copyToClipboard(message.text);
                break;
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

        if (!RequestPanel._variableService) {
            this._panel.webview.postMessage({ type: 'variablesList', data: variables });
            return;
        }

        try {
            // Get variables preview from VariableService
            const preview = await RequestPanel._variableService.getVariablesPreview(this._collectionId);

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

    private async _generateCodeSnippet(data: RequestData, language: string, resolveVariables: boolean): Promise<void> {
        if (!RequestPanel._variableService || !RequestPanel._storageService) {
            this._panel.webview.postMessage({ type: 'codeSnippetGenerated', highlightedCode: '<pre><code>// Services not initialized</code></pre>', rawCode: '// Services not initialized' });
            return;
        }

        try {
            const code = await this._buildCodeSnippet(data, language, resolveVariables);
            const highlightedCode = await SyntaxHighlighter.getInstance().highlight(code, language);
            this._panel.webview.postMessage({ type: 'codeSnippetGenerated', highlightedCode, rawCode: code });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorCode = `// Error: ${errorMessage}`;
            this._panel.webview.postMessage({ type: 'codeSnippetGenerated', highlightedCode: `<pre><code>${errorCode}</code></pre>`, rawCode: errorCode });
        }
    }

    private async _buildCodeSnippet(data: RequestData, language: string, resolveVariables: boolean): Promise<string> {
        const generator = getGenerator(language);
        if (!generator) {
            return `// Unknown language: ${language}`;
        }

        // Build URL with query params
        let url = data.url;
        const queryParams = data.queryParams.filter(p => p.enabled && p.key);
        if (queryParams.length > 0) {
            const searchParams = new URLSearchParams();
            queryParams.forEach(p => searchParams.append(p.key, p.value));
            url += (url.includes('?') ? '&' : '?') + searchParams.toString();
        }

        if (resolveVariables && RequestPanel._variableService) {
            url = await RequestPanel._variableService.resolveText(url, this._collectionId);
        }

        // Build headers
        const headers: { name: string; value: string }[] = [];

        // Add enabled inherited headers first
        if (data.inheritedHeaders && data.inheritedHeaders.length > 0) {
            const state = data.inheritedHeadersState || {};
            for (const h of data.inheritedHeaders) {
                const isEnabled = state[h.key] !== undefined ? state[h.key] : true;
                if (isEnabled && h.key) {
                    let value = h.value;
                    if (resolveVariables && RequestPanel._variableService) {
                        value = await RequestPanel._variableService.resolveText(value, this._collectionId);
                    }
                    headers.push({ name: h.key, value });
                }
            }
        }

        // Add request headers (override inherited)
        for (const h of data.headers) {
            if (h.enabled && h.key) {
                const key = h.key.toLowerCase();
                const existingIndex = headers.findIndex(hdr => hdr.name.toLowerCase() === key);
                if (existingIndex !== -1) {
                    headers.splice(existingIndex, 1);
                }
                let value = h.value;
                if (resolveVariables && RequestPanel._variableService) {
                    value = await RequestPanel._variableService.resolveText(value, this._collectionId);
                }
                headers.push({ name: h.key, value });
            }
        }

        // Handle auth - respect useInheritedAuth toggle
        // If useInheritedAuth is true and inherited auth exists, use it
        // Otherwise use request auth
        let effectiveAuth = data.auth;
        if (data.useInheritedAuth !== false && data.inheritedAuth && data.inheritedAuth.type !== 'none') {
            effectiveAuth = data.inheritedAuth;
        }

        if (effectiveAuth && effectiveAuth.type === 'basic' && effectiveAuth.username) {
            let username = effectiveAuth.username;
            let password = effectiveAuth.password || '';
            if (resolveVariables && RequestPanel._variableService) {
                username = await RequestPanel._variableService.resolveText(username, this._collectionId);
                password = await RequestPanel._variableService.resolveText(password, this._collectionId);
            }
            const credentials = Buffer.from(`${username}:${password}`).toString('base64');
            headers.push({ name: 'Authorization', value: `Basic ${credentials}` });
        } else if (effectiveAuth && effectiveAuth.type === 'bearer' && effectiveAuth.token) {
            let token = effectiveAuth.token;
            if (resolveVariables && RequestPanel._variableService) {
                token = await RequestPanel._variableService.resolveText(token, this._collectionId);
            }
            headers.push({ name: 'Authorization', value: `Bearer ${token}` });
        } else if (effectiveAuth && effectiveAuth.type === 'apikey' && effectiveAuth.apiKeyName) {
            let keyValue = effectiveAuth.apiKeyValue || '';
            if (resolveVariables && RequestPanel._variableService) {
                keyValue = await RequestPanel._variableService.resolveText(keyValue, this._collectionId);
            }
            if (effectiveAuth.apiKeyIn === 'header') {
                headers.push({ name: effectiveAuth.apiKeyName, value: keyValue });
            } else {
                const separator = url.includes('?') ? '&' : '?';
                url += `${separator}${encodeURIComponent(effectiveAuth.apiKeyName)}=${encodeURIComponent(keyValue)}`;
            }
        }

        // Build resolved request
        const resolvedRequest: any = {
            method: data.method,
            url,
            headers,
        };

        // Add body if present
        if (data.body && data.body.type !== 'none' && data.body.content) {
            let content = data.body.content;

            // Handle form data: convert JSON array to URL-encoded string
            if (data.body.type === 'form') {
                try {
                    const formData = JSON.parse(data.body.content);
                    const params = new URLSearchParams();
                    for (const f of formData.filter((field: any) => field.enabled && field.key)) {
                        let key = f.key;
                        let value = f.value;
                        if (resolveVariables && RequestPanel._variableService) {
                            key = await RequestPanel._variableService.resolveText(key, this._collectionId);
                            value = await RequestPanel._variableService.resolveText(value, this._collectionId);
                        }
                        params.append(key, value);
                    }
                    content = params.toString();
                } catch {
                    // Use content as-is if parsing fails
                    if (resolveVariables && RequestPanel._variableService) {
                        content = await RequestPanel._variableService.resolveText(content, this._collectionId);
                    }
                }
            } else if (resolveVariables && RequestPanel._variableService) {
                content = await RequestPanel._variableService.resolveText(content, this._collectionId);
            }

            // Add Content-Type header if not present
            const hasContentType = headers.some(h => h.name.toLowerCase() === 'content-type');
            if (!hasContentType) {
                const contentTypeMap: Record<string, string> = {
                    json: 'application/json',
                    xml: 'application/xml',
                    form: 'application/x-www-form-urlencoded',
                    text: 'text/plain',
                };
                const contentType = contentTypeMap[data.body.type];
                if (contentType) {
                    headers.push({ name: 'Content-Type', value: contentType });
                }
            }

            resolvedRequest.body = {
                type: data.body.type,
                content,
            };
        }

        return generator.generate(resolvedRequest);
    }

    private async _copyToClipboard(text: string): Promise<void> {
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage(vscode.l10n.t('Code copied to clipboard'));
    }

    private async _openResponseInEditor(): Promise<void> {
        if (!this._lastResponse) {
            vscode.window.showWarningMessage(vscode.l10n.t('No response to open. Send a request first.'));
            return;
        }
        const responseDisplay = ResponseDisplay.getInstance();
        await responseDisplay.showResponse(this._lastResponse, this._panel.viewColumn);
    }

    /**
     * Execute a pre-request before the main request
     * @param preRequestId - The ID of the request to execute
     * @param visitedIds - Array of request IDs already in the chain (for cycle detection)
     * @returns true if successful, false if failed
     */
    private async _executePreRequest(preRequestId: string, visitedIds: string[]): Promise<boolean> {
        if (!RequestPanel._storageService || !RequestPanel._httpClient || !RequestPanel._variableService || !this._collectionId) {
            return false;
        }

        // Cycle detection
        if (visitedIds.includes(preRequestId)) {
            vscode.window.showErrorMessage(vscode.l10n.t('Pre-request cycle detected. Request chain: {0}', visitedIds.join(' → ') + ' → ' + preRequestId));
            return false;
        }

        // Get the collection and find the pre-request
        const collection = await RequestPanel._storageService.getCollectionAsync(this._collectionId);
        if (!collection) {
            vscode.window.showErrorMessage(vscode.l10n.t('Collection not found'));
            return false;
        }

        const preRequest = collection.requests.find(r => r.id === preRequestId);
        if (!preRequest) {
            vscode.window.showErrorMessage(vscode.l10n.t('Pre-request not found: {0}', preRequestId));
            return false;
        }

        // If the pre-request also has a pre-request, execute it first (recursively)
        if (preRequest.preRequestId) {
            const nestedResult = await this._executePreRequest(preRequest.preRequestId, [...visitedIds, preRequestId]);
            if (!nestedResult) {
                return false;
            }
        }

        // Execute the pre-request
        try {
            // Show progress for pre-request
            const displayName = preRequest.name || `${preRequest.method} request`;
            this._panel.webview.postMessage({
                type: 'requestStarted',
                data: { url: preRequest.url, method: preRequest.method, isPreRequest: true, name: displayName }
            });

            // Build the request with resolved variables
            const variableService = RequestPanel._variableService!;

            // Resolve headers
            const resolvedHeaders = await Promise.all(
                preRequest.headers.filter(h => h.enabled && h.name).map(async h => ({
                    name: h.name,
                    value: await variableService.resolveText(h.value, this._collectionId),
                    enabled: true
                }))
            );

            // Handle auth
            const auth = preRequest.auth || collection.defaultAuth;
            let resolvedUrl = await variableService.resolveText(preRequest.url, this._collectionId);

            if (auth && auth.type === 'basic' && auth.username) {
                const username = await variableService.resolveText(auth.username, this._collectionId);
                const password = await variableService.resolveText(auth.password || '', this._collectionId);
                const credentials = Buffer.from(`${username}:${password}`).toString('base64');
                resolvedHeaders.push({ name: 'Authorization', value: `Basic ${credentials}`, enabled: true });
            } else if (auth && auth.type === 'bearer' && auth.token) {
                const token = await variableService.resolveText(auth.token, this._collectionId);
                resolvedHeaders.push({ name: 'Authorization', value: `Bearer ${token}`, enabled: true });
            } else if (auth && auth.type === 'apikey' && auth.apiKeyName) {
                const keyValue = await variableService.resolveText(auth.apiKeyValue || '', this._collectionId);
                if (auth.apiKeyIn === 'header') {
                    resolvedHeaders.push({ name: auth.apiKeyName, value: keyValue, enabled: true });
                } else {
                    // Add to query params
                    const separator = resolvedUrl.includes('?') ? '&' : '?';
                    resolvedUrl += `${separator}${encodeURIComponent(auth.apiKeyName)}=${encodeURIComponent(keyValue)}`;
                }
            }

            // Resolve body and add Content-Type header
            let resolvedBody: string | undefined;

            if (preRequest.body && preRequest.body.type !== 'none' && preRequest.body.content) {
                // Handle form data - convert from JSON array to URL-encoded string
                if (preRequest.body.type === 'form') {
                    try {
                        const formData = JSON.parse(preRequest.body.content);
                        const params = new URLSearchParams();
                        for (const f of formData.filter((field: any) => field.enabled && field.key)) {
                            const resolvedKey = await variableService.resolveText(f.key, this._collectionId);
                            const resolvedValue = await variableService.resolveText(f.value, this._collectionId);
                            params.append(resolvedKey, resolvedValue);
                        }
                        resolvedBody = params.toString();
                    } catch (e) {
                        getLogger().error(`Failed to parse form data for pre-request`);
                        resolvedBody = await variableService.resolveText(preRequest.body.content, this._collectionId);
                    }
                } else {
                    resolvedBody = await variableService.resolveText(preRequest.body.content, this._collectionId);
                }

                // Add Content-Type header if not already present
                const hasContentType = resolvedHeaders.some(h => h.name.toLowerCase() === 'content-type');
                if (!hasContentType) {
                    const contentTypeMap: Record<string, string> = {
                        json: 'application/json',
                        xml: 'application/xml',
                        form: 'application/x-www-form-urlencoded',
                        text: 'text/plain',
                    };
                    const contentType = contentTypeMap[preRequest.body.type];
                    if (contentType) {
                        resolvedHeaders.push({ name: 'Content-Type', value: contentType, enabled: true });
                    }
                }
            }

            // Build request object
            const requestObj: Request = {
                id: preRequest.id,
                name: preRequest.name,
                method: preRequest.method,
                url: resolvedUrl,
                headers: resolvedHeaders,
                body: resolvedBody ? { type: preRequest.body.type, content: resolvedBody } : { type: 'none', content: '' },
                createdAt: preRequest.createdAt,
                updatedAt: preRequest.updatedAt
            };

            // Execute with progress
            const response = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Window,
                    title: vscode.l10n.t('$(sync~spin) Running pre-request: {0}...', displayName)
                },
                async () => RequestPanel._httpClient!.executeRequest(requestObj)
            );

            // Store response for request chaining
            if (preRequest.name) {
                const responseStorage = ResponseStorage.getInstance();
                responseStorage.storeResponse(preRequest.name, response);
                getLogger().debug(`Pre-request "${preRequest.name}" completed with status ${response.status}`);
            } else {
                getLogger().warn('Pre-request has no name - response will not be available for variable chaining');
            }

            // Check if the pre-request was successful (2xx status codes)
            if (response.status >= 200 && response.status < 300) {
                return true;
            } else {
                // For 4xx/5xx errors, ask user whether to continue
                const result = await vscode.window.showWarningMessage(
                    vscode.l10n.t('Pre-request "{0}" failed with status {1}. Continue anyway?', preRequest.name, response.status),
                    { modal: true },
                    vscode.l10n.t('Continue'),
                    vscode.l10n.t('Abort')
                );

                if (result === vscode.l10n.t('Continue')) {
                    getLogger().warn(`User chose to continue despite pre-request failure (status ${response.status})`);
                    return true;
                } else {
                    getLogger().debug(`User aborted main request after pre-request failure (status ${response.status})`);
                    return false;
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(vscode.l10n.t('Pre-request "{0}" failed: {1}', preRequest.name, errorMessage));
            return false;
        }
    }

    private async _sendRequest(data: RequestData): Promise<void> {
        const logger = getLogger();

        // Check if services are initialized
        if (!RequestPanel._httpClient || !RequestPanel._variableService || !RequestPanel._storageService) {
            vscode.window.showErrorMessage(vscode.l10n.t('HTTP Client not initialized. Please reload the extension.'));
            return;
        }

        // Execute pre-request if configured
        if (data.preRequestId && this._collectionId) {
            logger.debug(`Executing pre-request before main request`);
            const preRequestResult = await this._executePreRequest(data.preRequestId, [data.id || '']);
            if (!preRequestResult) {
                logger.warn('Pre-request failed or was aborted');
                // Pre-request failed, abort the main request
                return;
            }
            logger.debug('Pre-request completed, proceeding with main request');
        }

        // Get collection defaults if available
        let collectionDefaults: { headers?: { name: string; value: string; enabled: boolean }[]; auth?: any } = {};
        if (this._collectionId) {
            const collection = await RequestPanel._storageService.getCollectionAsync(this._collectionId);
            if (collection) {
                collectionDefaults = {
                    headers: collection.defaultHeaders,
                    auth: collection.defaultAuth
                };
            }
        }

        // Build the full URL with query params
        let url = data.url;
        const queryParams = data.queryParams.filter(p => p.enabled && p.key);
        if (queryParams.length > 0) {
            const searchParams = new URLSearchParams();
            queryParams.forEach(p => searchParams.append(p.key, p.value));
            url += (url.includes('?') ? '&' : '?') + searchParams.toString();
        }

        // Build headers - merge enabled inherited headers with request headers
        // Request headers override inherited headers
        const headers: Record<string, string> = {};

        // First apply enabled inherited headers
        if (data.inheritedHeaders && data.inheritedHeaders.length > 0) {
            const inheritedState = data.inheritedHeadersState || {};
            data.inheritedHeaders.forEach(h => {
                // Only include if enabled (default to true if not specified)
                const isEnabled = inheritedState[h.key] !== undefined ? inheritedState[h.key] : true;
                if (isEnabled && h.key) {
                    headers[h.key] = h.value;
                }
            });
        }

        // Then apply request-specific headers (overrides inherited headers)
        data.headers.filter(h => h.enabled && h.key).forEach(h => {
            headers[h.key] = h.value;
        });

        // Determine effective auth - respect useInheritedAuth flag
        // Priority: If useInheritedAuth is checked (and valid inherited auth exists), use inherited auth
        // Otherwise, request auth overrides collection auth
        let effectiveAuth = data.auth;
        if (data.useInheritedAuth !== false && data.inheritedAuth && data.inheritedAuth.type && data.inheritedAuth.type !== 'none') {
            effectiveAuth = data.inheritedAuth;
        } else if (data.auth.type !== 'none') {
            effectiveAuth = data.auth;
        } else if (collectionDefaults.auth && collectionDefaults.auth.type !== 'none') {
            effectiveAuth = collectionDefaults.auth;
        }

        // Add auth headers (resolve variables in auth values)
        if (effectiveAuth.type === 'basic' && effectiveAuth.username) {
            const resolvedUsername = await RequestPanel._variableService!.resolveText(effectiveAuth.username, this._collectionId);
            const resolvedPassword = await RequestPanel._variableService!.resolveText(effectiveAuth.password || '', this._collectionId);
            const credentials = Buffer.from(`${resolvedUsername}:${resolvedPassword}`).toString('base64');
            headers['Authorization'] = `Basic ${credentials}`;
        } else if (effectiveAuth.type === 'bearer' && effectiveAuth.token) {
            const resolvedToken = await RequestPanel._variableService!.resolveText(effectiveAuth.token, this._collectionId);
            headers['Authorization'] = `Bearer ${resolvedToken}`;
        } else if (effectiveAuth.type === 'apikey' && effectiveAuth.apiKeyName) {
            const resolvedKeyValue = await RequestPanel._variableService!.resolveText(effectiveAuth.apiKeyValue || '', this._collectionId);
            if (effectiveAuth.apiKeyIn === 'header') {
                headers[effectiveAuth.apiKeyName] = resolvedKeyValue;
            } else {
                // Add to query params
                const separator = url.includes('?') ? '&' : '?';
                url += `${separator}${encodeURIComponent(effectiveAuth.apiKeyName)}=${encodeURIComponent(resolvedKeyValue)}`;
            }
        }

        // Set content-type for body
        let body: string | undefined;
        if (data.body.type !== 'none' && data.body.content) {
            body = data.body.content;
            if (data.body.type === 'json' && !headers['Content-Type']) {
                headers['Content-Type'] = 'application/json';
            } else if (data.body.type === 'form' && !headers['Content-Type']) {
                headers['Content-Type'] = 'application/x-www-form-urlencoded';
                // Convert form data to URL encoded string
                // Variables must be resolved BEFORE URL encoding, otherwise {{...}} becomes %7B%7B...%7D%7D
                try {
                    const formData = JSON.parse(data.body.content);
                    const params = new URLSearchParams();
                    const variableService = RequestPanel._variableService!;
                    for (const f of formData.filter((field: any) => field.enabled && field.key)) {
                        const resolvedKey = await variableService.resolveText(f.key, this._collectionId);
                        const resolvedValue = await variableService.resolveText(f.value, this._collectionId);
                        params.append(resolvedKey, resolvedValue);
                    }
                    body = params.toString();
                } catch {
                    // Use content as-is
                }
            } else if (data.body.type === 'xml' && !headers['Content-Type']) {
                headers['Content-Type'] = 'application/xml';
            } else if (data.body.type === 'text' && !headers['Content-Type']) {
                headers['Content-Type'] = 'text/plain';
            }
        }

        // Resolve variables using VariableService
        const variableService = RequestPanel._variableService;
        const resolvedUrl = await variableService.resolveText(url, this._collectionId);
        const resolvedHeaders: { name: string; value: string }[] = await Promise.all(
            Object.entries(headers).map(async ([name, value]) => ({
                name,
                value: await variableService.resolveText(value, this._collectionId),
            }))
        );
        const resolvedBody = body ? await variableService.resolveText(body, this._collectionId) : undefined;

        // Build the request object
        const request: Request = {
            id: data.id || `temp-${Date.now()}`,
            name: data.name,
            method: data.method as any,
            url: resolvedUrl,
            headers: resolvedHeaders.map(h => ({ ...h, enabled: true })),
            body: resolvedBody ? { type: data.body.type, content: resolvedBody } : { type: 'none', content: '' },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        // Create history item - always store unresolved values (placeholders like {{TOKEN}}) for security
        // Apply sanitization to the URL (masks sensitive query params)
        const historyUrl = sanitizeUrl(url);

        // Apply sanitization to request headers - include ALL merged headers (collection defaults + request-specific)
        // Convert the headers object back to array format for storage
        const historyHeaders = maskAuthHeaders(
            Object.entries(headers).map(([name, value]) => ({ name, value, enabled: true }))
        );

        const historyItem = createHistoryItem(
            data.method as any,
            historyUrl,
            historyHeaders,
            sanitizeRequestBody(data.body)
        );

        // Store source request and collection IDs for traceability
        if (this._requestId) {
            historyItem.sourceRequestId = this._requestId;
        }
        if (this._collectionId) {
            historyItem.sourceCollectionId = this._collectionId;
        }

        // Show loading state
        this._panel.webview.postMessage({
            type: 'requestStarted',
            data: { url: resolvedUrl, method: data.method }
        });

        try {
            // Execute the request using HttpClient with status bar progress
            const displayName = data.name || `${data.method} request`;
            const response = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Window,
                    title: vscode.l10n.t('$(sync~spin) Sending {0}...', displayName)
                },
                async () => RequestPanel._httpClient!.executeRequest(request)
            );

            // Update history item with response data
            historyItem.statusCode = response.status;
            historyItem.statusText = response.statusText;
            historyItem.responseTime = response.time;

            // Store sanitized response headers
            const responseHeaders: { name: string; value: string; enabled: boolean }[] = Object.entries(response.headers).map(
                ([name, value]) => ({ name, value: String(value), enabled: true })
            );
            historyItem.responseHeaders = maskResponseHeaders(responseHeaders);

            // Store response body based on settings and content type
            const storeResponses = getSetting('history.storeResponses') ?? true;
            const contentType = response.headers['content-type'] || response.headers['Content-Type'] || '';

            if (storeResponses && shouldStoreBody(contentType) && response.body) {
                const maxResponseSize = getSetting('history.maxResponseSize') ?? 262144;
                const sanitizedBody = sanitizeBody(response.body);
                const { body: truncatedBody, truncated } = truncateBody(sanitizedBody, maxResponseSize);
                historyItem.responseBody = truncatedBody;
                historyItem.responseBodyTruncated = truncated;
            }

            // Add to history
            await RequestPanel._storageService.addHistoryItem(historyItem);

            // Refresh history view
            vscode.commands.executeCommand('endpoint.refreshHistory');

            // Store response for "Open in Editor" feature
            this._lastResponse = response;

            // Store response for request chaining (if request has a name)
            if (data.name) {
                const responseStorage = ResponseStorage.getInstance();
                responseStorage.storeResponse(data.name, response);
            }

            // Highlight response body based on content type (reuse contentType from above)
            const highlightedBody = await SyntaxHighlighter.getInstance().highlightResponse(response.body, contentType);

            // Send response to webview for display in tabbed view
            this._panel.webview.postMessage({
                type: 'showResponse',
                data: {
                    status: response.status,
                    statusText: response.statusText,
                    time: response.time,
                    size: response.size,
                    headers: response.headers,
                    body: response.body,
                    highlightedBody
                }
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            // Still add to history but with error
            historyItem.statusCode = 0;
            historyItem.statusText = `Error: ${errorMessage}`;
            await RequestPanel._storageService.addHistoryItem(historyItem);
            vscode.commands.executeCommand('endpoint.refreshHistory');

            // Show error in webview
            this._panel.webview.postMessage({
                type: 'requestError',
                data: {
                    message: errorMessage
                }
            });

            vscode.window.showErrorMessage(vscode.l10n.t('Request failed: {0}', errorMessage));
        }
    }

    private async _saveRequest(data: RequestData): Promise<void> {
        if (!RequestPanel._storageService) {
            vscode.window.showErrorMessage(vscode.l10n.t('Storage not initialized. Please reload the extension.'));
            return;
        }

        // If this request belongs to a collection, update it
        if (this._collectionId && data.id) {
            const collection = await RequestPanel._storageService.getCollectionAsync(this._collectionId);
            if (collection) {
                const requestIndex = collection.requests.findIndex(r => r.id === data.id);
                if (requestIndex !== -1) {
                    // Build the full URL with query params
                    let url = data.url;
                    const queryParams = data.queryParams.filter(p => p.enabled && p.key);
                    if (queryParams.length > 0) {
                        const searchParams = new URLSearchParams();
                        queryParams.forEach(p => searchParams.append(p.key, p.value));
                        url += (url.includes('?') ? '&' : '?') + searchParams.toString();
                    }

                    // Build list of disabled inherited headers from state
                    const disabledInheritedHeaders: string[] = [];
                    if (data.inheritedHeadersState) {
                        for (const [key, enabled] of Object.entries(data.inheritedHeadersState)) {
                            if (!enabled) {
                                disabledInheritedHeaders.push(key);
                            }
                        }
                    }

                    // Update the request in the collection
                    collection.requests[requestIndex] = {
                        ...collection.requests[requestIndex],
                        name: data.name,
                        method: data.method,
                        url: url,
                        headers: data.headers.map(h => ({ name: h.key, value: h.value, enabled: h.enabled })),
                        body: data.body,
                        auth: data.auth,
                        useInheritedAuth: data.useInheritedAuth,
                        disabledInheritedHeaders: disabledInheritedHeaders.length > 0 ? disabledInheritedHeaders : undefined,
                        preRequestId: data.preRequestId || undefined,
                        updatedAt: Date.now()
                    };
                    collection.updatedAt = Date.now();
                    await RequestPanel._storageService.saveCollection(collection);

                    // Update panel state and clear dirty
                    this._baseName = data.name;
                    this._panel.title = data.name;
                    this._requestData = data;
                    this._originalDataHash = this._computeDataHash(data);
                    this._clearDirty();

                    vscode.commands.executeCommand('endpoint.refreshCollections');
                    return;
                }
            }
        }

        // If no collection or request not found, offer to save to a collection
        const collections = await RequestPanel._storageService.getCollectionsAsync();
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
            // Build the full URL with query params
            let url = data.url;
            const queryParams = data.queryParams.filter(p => p.enabled && p.key);
            if (queryParams.length > 0) {
                const searchParams = new URLSearchParams();
                queryParams.forEach(p => searchParams.append(p.key, p.value));
                url += (url.includes('?') ? '&' : '?') + searchParams.toString();
            }

            // Build list of disabled inherited headers from state
            const disabledInheritedHeaders: string[] = [];
            if (data.inheritedHeadersState) {
                for (const [key, enabled] of Object.entries(data.inheritedHeadersState)) {
                    if (!enabled) {
                        disabledInheritedHeaders.push(key);
                    }
                }
            }

            const newRequest = {
                id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                name: data.name || 'New Request',
                method: data.method,
                url: url,
                headers: data.headers.map(h => ({ name: h.key, value: h.value, enabled: h.enabled })),
                body: data.body,
                auth: data.auth,
                disabledInheritedHeaders: disabledInheritedHeaders.length > 0 ? disabledInheritedHeaders : undefined,
                preRequestId: data.preRequestId || undefined,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            selected.collection.requests.push(newRequest);
            selected.collection.updatedAt = Date.now();
            await RequestPanel._storageService.saveCollection(selected.collection);

            // Update panel state and clear dirty
            this._requestId = newRequest.id;
            this._collectionId = selected.collection.id;
            data.id = newRequest.id;
            this._requestData = data;
            this._baseName = data.name || 'New Request';
            this._panel.title = this._baseName;
            this._originalDataHash = this._computeDataHash(data);
            this._clearDirty();

            // Register this panel with the new request ID
            RequestPanel.panels.set(newRequest.id, this);
            if (RequestPanel.currentPanel === this) {
                RequestPanel.currentPanel = undefined;
            }

            vscode.commands.executeCommand('endpoint.refreshCollections');
            vscode.window.showInformationMessage(vscode.l10n.t('Request saved to "{0}".', selected.collection.name));
        }
    }

    private _update(): void {
        this._panel.webview.html = generateRequestPanelHtml(
            this._panel.webview,
            this._extensionUri,
            this._requestData
        );
    }

    /**
     * Send available requests list to webview for pre-request selection
     */
    private _sendAvailableRequests(requests: Request[], currentRequestId?: string): void {
        this._panel.webview.postMessage({
            type: 'updateAvailableRequests',
            data: {
                requests: requests.map(r => ({ id: r.id, name: r.name })),
                currentRequestId
            }
        });
    }

    /**
     * Handle panel close - prompt to save if dirty
     */
    private async _handlePanelClose(): Promise<void> {
        if (this._isDirty && this._requestId) {
            const result = await vscode.window.showWarningMessage(
                vscode.l10n.t('Do you want to save changes to "{0}"?', this._baseName),
                { modal: true },
                vscode.l10n.t('Save'),
                vscode.l10n.t("Don't Save")
            );

            if (result === vscode.l10n.t('Save')) {
                await this._saveRequest(this._requestData);
                this._cleanup();
            } else if (result === vscode.l10n.t("Don't Save")) {
                this._cleanup();
            } else {
                // Cancel (built-in button or Escape) - re-open the panel with current dirty state
                this._reopenWithDirtyState();
            }
        } else {
            this._cleanup();
        }
    }

    /**
     * Re-open the panel preserving dirty state (when user cancels close)
     */
    private _reopenWithDirtyState(): void {
        // Store what we need before cleanup removes it from the map
        const requestData = { ...this._requestData };
        const collectionId = this._collectionId;
        const extensionUri = this._extensionUri;
        const originalHash = this._originalDataHash;
        const baseName = this._baseName;

        // Clean up the old panel tracking (but panel is already disposed)
        if (this._requestId) {
            RequestPanel.panels.delete(this._requestId);
        }
        if (RequestPanel.currentPanel === this) {
            RequestPanel.currentPanel = undefined;
        }

        // Clean up disposables
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }

        // Re-create panel with the dirty data
        const newPanel = RequestPanel.createOrShow(extensionUri, requestData, collectionId);

        // Restore dirty state on the new panel
        newPanel._originalDataHash = originalHash;
        newPanel._baseName = baseName;
        newPanel._setDirty();
    }

    /**
     * Clean up resources (called after panel is disposed)
     */
    private _cleanup(): void {
        // Remove from panels map
        if (this._requestId) {
            RequestPanel.panels.delete(this._requestId);
            // Clear dirty state when panel is closed
            DirtyStateProvider.getInstance().clearDirty(this._requestId);
            vscode.commands.executeCommand('endpoint.refreshCollections');
        }
        if (RequestPanel.currentPanel === this) {
            RequestPanel.currentPanel = undefined;
        }

        // Clean up disposables
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    public dispose(): void {
        this._cleanup();
    }
}

/**
 * Sanitize request body before storing in history.
 * Masks sensitive parameters in JSON and form-urlencoded bodies.
 */
function sanitizeRequestBody(body: { type: string; content?: string }): { type: 'none' | 'json' | 'form' | 'text' | 'xml'; content: string } {
    const content = body.content || '';
    const bodyType = body.type as 'none' | 'json' | 'form' | 'text' | 'xml';

    if (!content) {
        return { type: bodyType, content: '' };
    }

    switch (body.type) {
        case 'json':
            return { type: 'json', content: sanitizeBody(content) };
        case 'form':
            return { type: 'form', content: sanitizeFormBody(content) };
        default:
            // For raw/xml/other types, don't sanitize (could contain anything)
            return { type: bodyType, content };
    }
}
