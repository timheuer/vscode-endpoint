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
 * Get a webview URI for a resource in node_modules or extension resources
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
 */
export function getVscodeElementsUri(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): { bundleUri: vscode.Uri } {
    const bundleUri = getWebviewUri(webview, extensionUri, [
        'node_modules',
        '@vscode-elements',
        'elements',
        'dist',
        'bundled.js'
    ]);

    return { bundleUri };
}

/**
 * Get the URI for codicons
 */
export function getCodiconsUri(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): vscode.Uri {
    return getWebviewUri(webview, extensionUri, [
        'node_modules',
        '@vscode',
        'codicons',
        'dist',
        'codicon.css'
    ]);
}
