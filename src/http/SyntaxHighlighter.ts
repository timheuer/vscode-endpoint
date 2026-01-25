// Language mapping for code generators
const LANGUAGE_MAP: Record<string, string> = {
    'curl': 'bash',
    'javascript-fetch': 'javascript',
    'python-requests': 'python',
    'csharp-httpclient': 'csharp',
    'go-nethttp': 'go',
    'php-curl': 'php',
};

// Languages we need for code snippets and responses
const REQUIRED_LANGS = ['bash', 'javascript', 'python', 'csharp', 'go', 'php', 'json', 'xml', 'html', 'css'];

/**
 * Singleton service for syntax highlighting using Shiki
 * Uses JavaScript regex engine for VS Code extension compatibility
 * Uses dual themes (light/dark) with CSS variables for automatic theme switching
 */
export class SyntaxHighlighter {
    private static instance: SyntaxHighlighter;
    private highlighter: any = null; // Dynamic Shiki highlighter instance
    private initPromise: Promise<void> | null = null;

    private constructor() { }

    public static getInstance(): SyntaxHighlighter {
        if (!SyntaxHighlighter.instance) {
            SyntaxHighlighter.instance = new SyntaxHighlighter();
        }
        return SyntaxHighlighter.instance;
    }

    /**
     * Initialize the highlighter with JS regex engine (no WASM needed)
     */
    private async init(): Promise<void> {
        if (this.highlighter) { return; }
        if (this.initPromise) { return this.initPromise; }

        this.initPromise = (async () => {
            const { createHighlighterCore } = await import('shiki/core');
            const { createJavaScriptRegexEngine } = await import('shiki/engine/javascript');

            this.highlighter = await createHighlighterCore({
                themes: [
                    import('@shikijs/themes/github-dark'),
                    import('@shikijs/themes/github-light'),
                ],
                langs: REQUIRED_LANGS.map(lang => import(`@shikijs/langs/${lang}`)),
                engine: createJavaScriptRegexEngine(),
            });
        })();

        return this.initPromise;
    }

    /**
     * Highlight code using Shiki with dual themes (CSS variables handle light/dark)
     */
    public async highlight(code: string, language: string): Promise<string> {
        try {
            await this.init();
            if (!this.highlighter) {
                return this.escapeHtml(code);
            }

            // Map generator IDs to actual language names
            const lang = LANGUAGE_MAP[language] || language;

            // Use dual themes - CSS variables handle light/dark switching
            const html = this.highlighter.codeToHtml(code, {
                lang,
                themes: {
                    light: 'github-light',
                    dark: 'github-dark',
                },
                defaultColor: false, // Use CSS variables instead of inline colors
            });

            return html;
        } catch (error) {
            // Fallback to escaped plain text if highlighting fails
            console.error('Shiki highlighting failed:', error);
            return this.escapeHtml(code);
        }
    }

    /**
     * Highlight a response body based on content type
     */
    public async highlightResponse(body: string, contentType: string): Promise<string> {
        const lang = this.detectLanguage(contentType, body);

        // Format JSON for better readability
        if (lang === 'json') {
            try {
                const parsed = JSON.parse(body);
                body = JSON.stringify(parsed, null, 2);
            } catch {
                // Not valid JSON, use as-is
            }
        }

        return this.highlight(body, lang);
    }

    /**
     * Detect language from content type or body content
     */
    private detectLanguage(contentType: string, body: string): string {
        const ct = contentType.toLowerCase();

        if (ct.includes('json')) { return 'json'; }
        if (ct.includes('xml')) { return 'xml'; }
        if (ct.includes('html')) { return 'html'; }
        if (ct.includes('javascript')) { return 'javascript'; }
        if (ct.includes('css')) { return 'css'; }

        // Try to detect from content
        const trimmed = body.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                JSON.parse(trimmed);
                return 'json';
            } catch {
                // Not JSON
            }
        }
        if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
            return 'xml';
        }

        return 'text';
    }

    private escapeHtml(text: string): string {
        return `<pre><code>${text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')}</code></pre>`;
    }
}
