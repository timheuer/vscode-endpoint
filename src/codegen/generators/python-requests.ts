import { LanguageGenerator, ResolvedRequest, VARIABLE_PATTERN } from '../types';

export class PythonRequestsGenerator implements LanguageGenerator {
    id = 'python-requests';
    name = 'Python (requests)';

    generate(request: ResolvedRequest): string {
        const lines: string[] = [];
        const needsOs = this.hasVariablesInRequest(request);

        lines.push('import requests');
        if (needsOs) {
            lines.push('import os');
        }
        lines.push('');

        const methodLower = request.method.toLowerCase();
        const hasHeaders = request.headers.length > 0;
        const hasBody = request.body && request.body.content;

        // Build headers dict
        if (hasHeaders) {
            lines.push('headers = {');
            for (const header of request.headers) {
                lines.push(`    '${this.escapePy(header.name)}': ${this.formatString(header.value)},`);
            }
            lines.push('}');
            lines.push('');
        }

        // Build body/data
        if (hasBody) {
            const bodyType = request.body!.type;
            const bodyHasVars = VARIABLE_PATTERN.test(request.body!.content);
            VARIABLE_PATTERN.lastIndex = 0;

            if (bodyType === 'json' && !bodyHasVars) {
                try {
                    const jsonObj = JSON.parse(request.body!.content);
                    lines.push(`json_data = ${this.toPythonDict(jsonObj)}`);
                    lines.push('');
                } catch {
                    lines.push(`data = ${this.formatString(request.body!.content)}`);
                    lines.push('');
                }
            } else {
                lines.push(`data = ${this.formatString(request.body!.content)}`);
                lines.push('');
            }
        }

        // Build request call
        const args: string[] = [this.formatString(request.url)];
        if (hasHeaders) {
            args.push('headers=headers');
        }
        if (hasBody) {
            const bodyHasVars = VARIABLE_PATTERN.test(request.body!.content);
            VARIABLE_PATTERN.lastIndex = 0;

            if (request.body!.type === 'json' && !bodyHasVars) {
                try {
                    JSON.parse(request.body!.content);
                    args.push('json=json_data');
                } catch {
                    args.push('data=data');
                }
            } else {
                args.push('data=data');
            }
        }

        lines.push(`response = requests.${methodLower}(${args.join(', ')})`);
        lines.push('print(response.text)');

        return lines.join('\n');
    }

    /**
     * Check if any part of the request contains unresolved variables
     */
    private hasVariablesInRequest(request: ResolvedRequest): boolean {
        const check = (str: string) => {
            const result = VARIABLE_PATTERN.test(str);
            VARIABLE_PATTERN.lastIndex = 0;
            return result;
        };

        if (check(request.url)) {
            return true;
        }
        for (const h of request.headers) {
            if (check(h.value)) {
                return true;
            }
        }
        if (request.body && check(request.body.content)) {
            return true;
        }
        return false;
    }

    /**
     * Format a string, using string concatenation with os.environ.get for {{VAR}} patterns.
     */
    private formatString(str: string): string {
        const hasVars = VARIABLE_PATTERN.test(str);
        VARIABLE_PATTERN.lastIndex = 0;

        if (hasVars) {
            // Split the string into parts and concatenate with os.environ.get calls
            const parts: string[] = [];
            let lastIndex = 0;
            const regex = new RegExp(VARIABLE_PATTERN.source, 'g');
            let match;

            while ((match = regex.exec(str)) !== null) {
                // Add the text before this variable
                if (match.index > lastIndex) {
                    const text = str.slice(lastIndex, match.index);
                    parts.push(`'${this.escapePy(text)}'`);
                }
                // Add the os.environ.get call
                const varName = match[1].trim();
                parts.push(`os.environ.get('${varName}', '')`);
                lastIndex = match.index + match[0].length;
            }

            // Add any remaining text after the last variable
            if (lastIndex < str.length) {
                const text = str.slice(lastIndex);
                parts.push(`'${this.escapePy(text)}'`);
            }

            return parts.join(' + ');
        } else {
            return `'${this.escapePy(str)}'`;
        }
    }

    private escapePy(str: string): string {
        return str
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    }

    private toPythonDict(obj: unknown, indent: number = 0): string {
        const spaces = '    '.repeat(indent);
        const innerSpaces = '    '.repeat(indent + 1);

        if (obj === null) {
            return 'None';
        }
        if (typeof obj === 'boolean') {
            return obj ? 'True' : 'False';
        }
        if (typeof obj === 'number') {
            return String(obj);
        }
        if (typeof obj === 'string') {
            return `'${this.escapePy(obj)}'`;
        }
        if (Array.isArray(obj)) {
            if (obj.length === 0) {
                return '[]';
            }
            const items = obj.map(item => this.toPythonDict(item, indent + 1));
            return `[\n${innerSpaces}${items.join(`,\n${innerSpaces}`)}\n${spaces}]`;
        }
        if (typeof obj === 'object') {
            const entries = Object.entries(obj as Record<string, unknown>);
            if (entries.length === 0) {
                return '{}';
            }
            const items = entries.map(([key, value]) =>
                `'${this.escapePy(key)}': ${this.toPythonDict(value, indent + 1)}`
            );
            return `{\n${innerSpaces}${items.join(`,\n${innerSpaces}`)}\n${spaces}}`;
        }
        return String(obj);
    }
}
