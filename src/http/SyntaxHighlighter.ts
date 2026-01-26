// Static imports for shiki - required for bundling (dynamic imports don't work in packaged extensions)
// @ts-expect-error shiki is ESM-only, but esbuild handles the conversion
import { createHighlighterCore } from 'shiki/core';
// @ts-expect-error shiki is ESM-only, but esbuild handles the conversion
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
// @ts-expect-error shiki is ESM-only, but esbuild handles the conversion
import themeDark from '@shikijs/themes/github-dark';
// @ts-expect-error shiki is ESM-only, but esbuild handles the conversion
import themeLight from '@shikijs/themes/github-light';
// @ts-expect-error shiki is ESM-only, but esbuild handles the conversion
import langBash from '@shikijs/langs/bash';
// @ts-expect-error shiki is ESM-only, but esbuild handles the conversion
import langJavascript from '@shikijs/langs/javascript';
// @ts-expect-error shiki is ESM-only, but esbuild handles the conversion
import langPython from '@shikijs/langs/python';
// @ts-expect-error shiki is ESM-only, but esbuild handles the conversion
import langCsharp from '@shikijs/langs/csharp';
// @ts-expect-error shiki is ESM-only, but esbuild handles the conversion
import langGo from '@shikijs/langs/go';
// @ts-expect-error shiki is ESM-only, but esbuild handles the conversion
import langPhp from '@shikijs/langs/php';
// @ts-expect-error shiki is ESM-only, but esbuild handles the conversion
import langJson from '@shikijs/langs/json';
// @ts-expect-error shiki is ESM-only, but esbuild handles the conversion
import langXml from '@shikijs/langs/xml';
// @ts-expect-error shiki is ESM-only, but esbuild handles the conversion
import langHtml from '@shikijs/langs/html';
// @ts-expect-error shiki is ESM-only, but esbuild handles the conversion
import langCss from '@shikijs/langs/css';

import { getLogger } from '../logger';

// Language mapping for code generators
const LANGUAGE_MAP: Record<string, string> = {
    'curl': 'bash',
    'javascript-fetch': 'javascript',
    'python-requests': 'python',
    'csharp-httpclient': 'csharp',
    'go-nethttp': 'go',
    'php-curl': 'php',
};

/**
 * Singleton service for syntax highlighting using Shiki
 * Uses JavaScript regex engine for VS Code extension compatibility
 * Uses dual themes (light/dark) with CSS variables for automatic theme switching
 */
export class SyntaxHighlighter {
    private static instance: SyntaxHighlighter;
    private highlighter: any = null;
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
            this.highlighter = await createHighlighterCore({
                themes: [themeDark, themeLight],
                langs: [langBash, langJavascript, langPython, langCsharp, langGo, langPhp, langJson, langXml, langHtml, langCss],
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
            getLogger().debug('Shiki highlighting failed, using fallback', { error });
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
