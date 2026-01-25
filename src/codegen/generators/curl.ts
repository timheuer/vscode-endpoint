import { LanguageGenerator, ResolvedRequest, VARIABLE_PATTERN } from '../types';

export class CurlGenerator implements LanguageGenerator {
    id = 'curl';
    name = 'cURL';

    generate(request: ResolvedRequest): string {
        const parts: string[] = ['curl'];

        // Method (GET is implicit in curl)
        if (request.method !== 'GET') {
            parts.push(`-X ${request.method}`);
        }

        // URL
        parts.push(this.formatString(request.url));

        // Headers
        for (const header of request.headers) {
            parts.push(`-H ${this.formatString(`${header.name}: ${header.value}`)}`);
        }

        // Body
        if (request.body && request.body.content) {
            parts.push(`-d ${this.formatString(request.body.content)}`);
        }

        return parts.join(' \\\n  ');
    }

    /**
     * Format a string for shell, using environment variables for {{VAR}} patterns.
     * Uses double quotes when variables are present (for shell expansion),
     * single quotes otherwise (safer for special characters).
     */
    private formatString(str: string): string {
        const hasVars = VARIABLE_PATTERN.test(str);
        // Reset regex lastIndex after test
        VARIABLE_PATTERN.lastIndex = 0;

        if (hasVars) {
            // Use double quotes for shell variable expansion
            const escaped = this.escapeDoubleQuote(str);
            const withEnvVars = escaped.replace(new RegExp(VARIABLE_PATTERN.source, 'g'), (_, varName) => {
                return `$${varName.trim()}`;
            });
            return `"${withEnvVars}"`;
        } else {
            // Use single quotes (more reliable for special chars)
            return `'${this.escapeSingleQuote(str)}'`;
        }
    }

    private escapeSingleQuote(str: string): string {
        return str.replace(/'/g, "'\\''");
    }

    private escapeDoubleQuote(str: string): string {
        // Escape backslash, double quote, dollar (unless it's our var), and backtick
        return str
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/`/g, '\\`');
    }
}
