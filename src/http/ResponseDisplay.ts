import * as vscode from 'vscode';
import { HttpResponse, ResponseContentProvider } from './ResponseContentProvider';

/**
 * Manages the display of HTTP responses in VS Code editors
 */
export class ResponseDisplay {
    private static instance: ResponseDisplay;
    private _currentResponseUri: vscode.Uri | undefined;

    public static getInstance(): ResponseDisplay {
        if (!ResponseDisplay.instance) {
            ResponseDisplay.instance = new ResponseDisplay();
        }
        return ResponseDisplay.instance;
    }

    /**
     * Determine the language ID based on Content-Type header
     */
    private getLanguageId(contentType: string | undefined): string {
        if (!contentType) {
            return 'plaintext';
        }

        const type = contentType.toLowerCase().split(';')[0].trim();

        const languageMap: Record<string, string> = {
            'application/json': 'json',
            'text/json': 'json',
            'text/html': 'html',
            'application/xhtml+xml': 'html',
            'application/xml': 'xml',
            'text/xml': 'xml',
            'application/rss+xml': 'xml',
            'application/atom+xml': 'xml',
            'text/javascript': 'javascript',
            'application/javascript': 'javascript',
            'application/x-javascript': 'javascript',
            'text/css': 'css',
            'text/plain': 'plaintext',
            'text/markdown': 'markdown',
            'application/x-www-form-urlencoded': 'plaintext',
        };

        return languageMap[type] || 'plaintext';
    }

    /**
     * Get file extension based on language ID
     */
    private getExtension(languageId: string): string {
        const extensionMap: Record<string, string> = {
            'json': 'json',
            'html': 'html',
            'xml': 'xml',
            'javascript': 'js',
            'css': 'css',
            'markdown': 'md',
            'plaintext': 'txt',
        };
        return extensionMap[languageId] || 'txt';
    }

    /**
     * Format the response body for display
     */
    private formatBody(body: string, languageId: string): string {
        if (languageId === 'json') {
            try {
                const parsed = JSON.parse(body);
                return JSON.stringify(parsed, null, 2);
            } catch {
                // Return as-is if not valid JSON
                return body;
            }
        }
        return body;
    }

    /**
     * Generate the response document content with headers as comments
     */
    private generateContent(response: HttpResponse, languageId: string): string {
        const lines: string[] = [];

        // Comment prefix based on language
        let commentStart = '// ';
        let commentEnd = '';

        if (languageId === 'html' || languageId === 'xml') {
            commentStart = '<!-- ';
            commentEnd = ' -->';
        } else if (languageId === 'css') {
            commentStart = '/* ';
            commentEnd = ' */';
        }

        // Add status line
        lines.push(`${commentStart}HTTP/1.1 ${response.status} ${response.statusText}${commentEnd}`);

        // Add headers
        for (const [name, value] of Object.entries(response.headers)) {
            lines.push(`${commentStart}${name}: ${value}${commentEnd}`);
        }

        // Add timing and size info
        lines.push(`${commentStart}---${commentEnd}`);
        lines.push(`${commentStart}Time: ${response.time}ms | Size: ${this.formatSize(response.size)}${commentEnd}`);
        lines.push(`${commentStart}---${commentEnd}`);
        lines.push('');

        // Add formatted body
        const formattedBody = this.formatBody(response.body, languageId);
        lines.push(formattedBody);

        return lines.join('\n');
    }

    /**
     * Format byte size for display
     */
    private formatSize(bytes: number): string {
        if (bytes < 1024) {
            return `${bytes} B`;
        } else if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(2)} KB`;
        } else {
            return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        }
    }

    /**
     * Show the response in a virtual document with syntax highlighting
     */
    public async showResponse(response: HttpResponse, webviewViewColumn?: vscode.ViewColumn): Promise<void> {
        const provider = ResponseContentProvider.getInstance();

        // Determine language from Content-Type
        const contentType = response.headers['content-type'] || response.headers['Content-Type'];
        const languageId = this.getLanguageId(contentType);
        const extension = this.getExtension(languageId);

        // Create URI for the virtual document
        const timestamp = Date.now();
        const uri = vscode.Uri.parse(`endpoint-response:response-${timestamp}.${extension}`);

        // Generate and set content
        const content = this.generateContent(response, languageId);
        provider.setContent(uri, content);

        // Store current response URI
        this._currentResponseUri = uri;

        try {
            // First, split the editor to show response below
            await vscode.commands.executeCommand('workbench.action.editorLayoutTwoRows');

            // Open the document
            const doc = await vscode.workspace.openTextDocument(uri);

            // Focus on second editor group and show document there
            await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');

            await vscode.window.showTextDocument(doc, {
                viewColumn: vscode.ViewColumn.Two,
                preserveFocus: false,
                preview: true
            });

            // Set the language for syntax highlighting
            await vscode.languages.setTextDocumentLanguage(doc, languageId);

        } catch (error) {
            // Fallback: just open in a new column
            console.error('Failed to split editor:', error);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: true,
                preview: true
            });
            await vscode.languages.setTextDocumentLanguage(doc, languageId);
        }
    }

    /**
     * Close the current response document
     */
    public async closeCurrentResponse(): Promise<void> {
        if (this._currentResponseUri) {
            const provider = ResponseContentProvider.getInstance();
            provider.deleteContent(this._currentResponseUri);
            this._currentResponseUri = undefined;
        }
    }
}
