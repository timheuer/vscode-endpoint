import { LanguageGenerator, ResolvedRequest } from '../types';

export class JavaScriptFetchGenerator implements LanguageGenerator {
    id = 'javascript-fetch';
    name = 'JavaScript (fetch)';

    generate(request: ResolvedRequest): string {
        const hasHeaders = request.headers.length > 0;
        const hasBody = request.body && request.body.content;
        const needsOptions = request.method !== 'GET' || hasHeaders || hasBody;

        if (!needsOptions) {
            return `fetch('${this.escapeJs(request.url)}');`;
        }

        const lines: string[] = [];
        lines.push(`fetch('${this.escapeJs(request.url)}', {`);
        lines.push(`  method: '${request.method}',`);

        if (hasHeaders) {
            lines.push('  headers: {');
            for (let i = 0; i < request.headers.length; i++) {
                const header = request.headers[i];
                const comma = i < request.headers.length - 1 ? ',' : '';
                lines.push(`    '${this.escapeJs(header.name)}': '${this.escapeJs(header.value)}'${comma}`);
            }
            lines.push('  },');
        }

        if (hasBody) {
            const bodyStr = this.formatBody(request.body!.content, request.body!.type);
            lines.push(`  body: ${bodyStr},`);
        }

        lines.push('});');

        return lines.join('\n');
    }

    private escapeJs(str: string): string {
        return str
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    }

    private formatBody(content: string, type: string): string {
        if (type === 'json') {
            try {
                // Validate it's valid JSON and format nicely
                JSON.parse(content);
                return `JSON.stringify(${content})`;
            } catch {
                // Fall back to string literal
                return `'${this.escapeJs(content)}'`;
            }
        }
        return `'${this.escapeJs(content)}'`;
    }
}
