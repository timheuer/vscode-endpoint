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

    /**
     * Initialize the RequestPanel with required services
     */
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

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => this._handleMessage(message),
            null,
            this._disposables
        );

        // Note: With retainContextWhenHidden: true, webview state is preserved
        // No need to regenerate HTML on visibility change
    }

    /**
     * Create or show a new request panel
     */
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

        const requestPanel = new RequestPanel(panel, extensionUri, data, collectionId);

        if (data.id) {
            RequestPanel.panels.set(data.id, requestPanel);
        } else {
            RequestPanel.currentPanel = requestPanel;
        }

        return requestPanel;
    }

    /**
     * Open a request from a collection
     */
    public static openRequest(extensionUri: vscode.Uri, request: Request, collectionId?: string): RequestPanel {
        const requestData = requestToRequestData(request);
        return RequestPanel.createOrShow(extensionUri, requestData, collectionId);
    }

    /**
     * Open a history item
     */
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

    /**
     * Load request data into the panel
     */
    public loadRequest(requestData: RequestData): void {
        this._requestData = requestData;
        this._requestId = requestData.id;
        this._panel.title = requestData.name || 'New Request';
        this._panel.webview.postMessage({ type: 'loadRequest', data: requestData });
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
            case 'openInEditor':
                this._openResponseInEditor();
                break;
            case 'getAvailableVariables':
                this._getAvailableVariables();
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

    private async _openResponseInEditor(): Promise<void> {
        if (!this._lastResponse) {
            vscode.window.showWarningMessage('No response to open. Send a request first.');
            return;
        }
        const responseDisplay = ResponseDisplay.getInstance();
        await responseDisplay.showResponse(this._lastResponse, this._panel.viewColumn);
    }

    private async _sendRequest(data: RequestData): Promise<void> {
        // Check if services are initialized
        if (!RequestPanel._httpClient || !RequestPanel._variableService || !RequestPanel._storageService) {
            vscode.window.showErrorMessage('HTTP Client not initialized. Please reload the extension.');
            return;
        }

        // Get collection defaults if available
        let collectionDefaults: { headers?: { name: string; value: string; enabled: boolean }[]; auth?: any } = {};
        if (this._collectionId) {
            const collection = RequestPanel._storageService.getCollection(this._collectionId);
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

        // Build headers - merge collection defaults with request headers
        // Request headers override collection defaults
        const headers: Record<string, string> = {};

        // First apply collection default headers
        if (collectionDefaults.headers) {
            collectionDefaults.headers.filter(h => h.enabled && h.name).forEach(h => {
                headers[h.name] = h.value;
            });
        }

        // Then apply request-specific headers (overrides collection defaults)
        data.headers.filter(h => h.enabled && h.key).forEach(h => {
            headers[h.key] = h.value;
        });

        // Determine effective auth - request auth overrides collection auth
        const effectiveAuth = data.auth.type !== 'none' ? data.auth :
            (collectionDefaults.auth && collectionDefaults.auth.type !== 'none' ? collectionDefaults.auth : data.auth);

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
                try {
                    const formData = JSON.parse(data.body.content);
                    const params = new URLSearchParams();
                    formData.filter((f: any) => f.enabled && f.key).forEach((f: any) => {
                        params.append(f.key, f.value);
                    });
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

        // Create history item before sending
        const historyItem = createHistoryItem(
            data.method as any,
            resolvedUrl,
            resolvedHeaders.map(h => ({ ...h, enabled: true })),
            { type: data.body.type, content: resolvedBody || '' }
        );

        // Show loading state
        this._panel.webview.postMessage({
            type: 'requestStarted',
            data: { url: resolvedUrl, method: data.method }
        });

        try {
            // Execute the request using HttpClient
            const response = await RequestPanel._httpClient.executeRequest(request);

            // Update history item with response data
            historyItem.statusCode = response.status;
            historyItem.statusText = response.statusText;
            historyItem.responseTime = response.time;

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

            // Send response to webview for display in tabbed view
            this._panel.webview.postMessage({
                type: 'showResponse',
                data: {
                    status: response.status,
                    statusText: response.statusText,
                    time: response.time,
                    size: response.size,
                    headers: response.headers,
                    body: response.body
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

            vscode.window.showErrorMessage(`Request failed: ${errorMessage}`);
        }
    }

    private async _saveRequest(data: RequestData): Promise<void> {
        if (!RequestPanel._storageService) {
            vscode.window.showErrorMessage('Storage not initialized. Please reload the extension.');
            return;
        }

        // If this request belongs to a collection, update it
        if (this._collectionId && data.id) {
            const collection = RequestPanel._storageService.getCollection(this._collectionId);
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

                    // Update the request in the collection
                    collection.requests[requestIndex] = {
                        ...collection.requests[requestIndex],
                        name: data.name,
                        method: data.method,
                        url: url,
                        headers: data.headers.map(h => ({ name: h.key, value: h.value, enabled: h.enabled })),
                        body: data.body,
                        auth: data.auth,
                        updatedAt: Date.now()
                    };
                    collection.updatedAt = Date.now();
                    await RequestPanel._storageService.saveCollection(collection);

                    // Update panel title
                    this._panel.title = data.name;
                    this._requestData = data;

                    vscode.commands.executeCommand('endpoint.refreshCollections');
                    vscode.window.showInformationMessage(`Request "${data.name}" saved.`);
                    return;
                }
            }
        }

        // If no collection or request not found, offer to save to a collection
        const collections = RequestPanel._storageService.getCollections();
        if (collections.length === 0) {
            const create = await vscode.window.showInformationMessage(
                'No collections found. Create one first?',
                'Create Collection'
            );
            if (create) {
                vscode.commands.executeCommand('endpoint.addCollection');
            }
            return;
        }

        // Let user pick a collection
        const items = collections.map(c => ({
            label: c.name,
            description: `${c.requests.length} requests`,
            collection: c
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a collection to save the request to'
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

            const newRequest = {
                id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                name: data.name || 'New Request',
                method: data.method,
                url: url,
                headers: data.headers.map(h => ({ name: h.key, value: h.value, enabled: h.enabled })),
                body: data.body,
                auth: data.auth,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            selected.collection.requests.push(newRequest);
            selected.collection.updatedAt = Date.now();
            await RequestPanel._storageService.saveCollection(selected.collection);

            // Update panel state
            this._requestId = newRequest.id;
            this._collectionId = selected.collection.id;
            data.id = newRequest.id;
            this._requestData = data;
            this._panel.title = data.name || 'New Request';

            // Register this panel with the new request ID
            RequestPanel.panels.set(newRequest.id, this);
            if (RequestPanel.currentPanel === this) {
                RequestPanel.currentPanel = undefined;
            }

            vscode.commands.executeCommand('endpoint.refreshCollections');
            vscode.window.showInformationMessage(`Request saved to "${selected.collection.name}".`);
        }
    }

    private _update(): void {
        this._panel.webview.html = generateRequestPanelHtml(
            this._panel.webview,
            this._extensionUri,
            this._requestData
        );
    }

    public dispose(): void {
        // Remove from panels map
        if (this._requestId) {
            RequestPanel.panels.delete(this._requestId);
        }
        if (RequestPanel.currentPanel === this) {
            RequestPanel.currentPanel = undefined;
        }

        // Clean up resources
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
