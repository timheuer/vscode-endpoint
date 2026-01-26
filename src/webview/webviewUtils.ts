import * as vscode from 'vscode';

/**
 * Generate a nonce for Content Security Policy
 */
export function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * Get a webview URI for a resource in the extension
 */
export function getWebviewUri(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    pathList: string[]
): vscode.Uri {
    return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathList));
}

/**
 * Get the URI for vscode-elements resources
 * Assets are copied to dist/webview during build
 */
export function getVscodeElementsUri(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): { bundleUri: vscode.Uri } {
    const bundleUri = getWebviewUri(webview, extensionUri, [
        'dist',
        'webview',
        'bundled.js'
    ]);

    return { bundleUri };
}

/**
 * Get the URI for codicons
 * Assets are copied to dist/webview during build
 */
export function getCodiconsUri(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): vscode.Uri {
    return getWebviewUri(webview, extensionUri, [
        'dist',
        'webview',
        'codicon.css'
    ]);
}

/**
 * Get the URI for shared webview CSS
 * Assets are copied to dist/webview during build
 */
export function getSharedCssUri(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): vscode.Uri {
    return getWebviewUri(webview, extensionUri, [
        'dist',
        'webview',
        'shared.css'
    ]);
}

/**
 * Get the URI for request view CSS
 * Assets are copied to dist/webview during build
 */
export function getRequestViewCssUri(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): vscode.Uri {
    return getWebviewUri(webview, extensionUri, [
        'dist',
        'webview',
        'requestView.css'
    ]);
}

/**
 * Get the URI for collection settings CSS
 * Assets are copied to dist/webview during build
 */
export function getCollectionSettingsCssUri(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): vscode.Uri {
    return getWebviewUri(webview, extensionUri, [
        'dist',
        'webview',
        'collectionSettings.css'
    ]);
}

/**
 * Get the URI for Monaco Editor loader
 * Assets are copied to dist/webview/monaco during build
 */
export function getMonacoLoaderUri(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): vscode.Uri {
    return getWebviewUri(webview, extensionUri, [
        'dist',
        'webview',
        'monaco',
        'vs',
        'loader.js'
    ]);
}

/**
 * Get the base URI for Monaco Editor (for AMD require.config paths)
 * Assets are copied to dist/webview/monaco during build
 */
export function getMonacoBaseUri(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): vscode.Uri {
    return getWebviewUri(webview, extensionUri, [
        'dist',
        'webview',
        'monaco'
    ]);
}
