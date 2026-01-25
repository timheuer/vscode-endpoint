import { LanguageGenerator, ResolvedRequest, VARIABLE_PATTERN } from '../types';

export class JavaScriptFetchGenerator implements LanguageGenerator {
    id = 'javascript-fetch';
    name = 'JavaScript (fetch)';

    generate(request: ResolvedRequest): string {
        const hasHeaders = request.headers.length > 0;
        const hasBody = request.body && request.body.content;
        const needsOptions = request.method !== 'GET' || hasHeaders || hasBody;

        if (!needsOptions) {
            return `fetch(${this.formatString(request.url)});`;
        }

        const lines: string[] = [];
        lines.push(`fetch(${this.formatString(request.url)}, {`);
        lines.push(`  method: '${request.method}',`);

        if (hasHeaders) {
            lines.push('  headers: {');
            for (let i = 0; i < request.headers.length; i++) {
                const header = request.headers[i];
                const comma = i < request.headers.length - 1 ? ',' : '';
                lines.push(`    '${this.escapeJs(header.name)}': ${this.formatString(header.value)}${comma}`);
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

    /**
     * Format a string, using template literals with process.env for {{VAR}} patterns.
     */
    private formatString(str: string): string {
        const hasVars = VARIABLE_PATTERN.test(str);
        VARIABLE_PATTERN.lastIndex = 0;

        if (hasVars) {
            // Use template literal with process.env
            const escaped = this.escapeTemplateLiteral(str);
            const withEnvVars = escaped.replace(new RegExp(VARIABLE_PATTERN.source, 'g'), (_, varName) => {
                return `\${process.env.${varName.trim()}}`;
            });
            return `\`${withEnvVars}\``;
        } else {
            return `'${this.escapeJs(str)}'`;
        }
    }

    private escapeJs(str: string): string {
        return str
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    }

    private escapeTemplateLiteral(str: string): string {
        return str
            .replace(/\\/g, '\\\\')
            .replace(/`/g, '\\`')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    }

    private formatBody(content: string, type: string): string {
        const hasVars = VARIABLE_PATTERN.test(content);
        VARIABLE_PATTERN.lastIndex = 0;

        if (type === 'json' && !hasVars) {
            try {
                // Validate it's valid JSON and format nicely
                JSON.parse(content);
                return `JSON.stringify(${content})`;
            } catch {
                // Fall back to string literal
                return `'${this.escapeJs(content)}'`;
            }
        }
        return this.formatString(content);
    }
}
