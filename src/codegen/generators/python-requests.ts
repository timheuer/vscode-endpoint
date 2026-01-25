import { LanguageGenerator, ResolvedRequest } from '../types';

export class PythonRequestsGenerator implements LanguageGenerator {
    id = 'python-requests';
    name = 'Python (requests)';

    generate(request: ResolvedRequest): string {
        const lines: string[] = [];
        lines.push('import requests');
        lines.push('');

        const methodLower = request.method.toLowerCase();
        const hasHeaders = request.headers.length > 0;
        const hasBody = request.body && request.body.content;

        // Build headers dict
        if (hasHeaders) {
            lines.push('headers = {');
            for (const header of request.headers) {
                lines.push(`    '${this.escapePy(header.name)}': '${this.escapePy(header.value)}',`);
            }
            lines.push('}');
            lines.push('');
        }

        // Build body/data
        if (hasBody) {
            const bodyType = request.body!.type;
            if (bodyType === 'json') {
                try {
                    const jsonObj = JSON.parse(request.body!.content);
                    lines.push(`json_data = ${this.toPythonDict(jsonObj)}`);
                    lines.push('');
                } catch {
                    lines.push(`data = '${this.escapePy(request.body!.content)}'`);
                    lines.push('');
                }
            } else {
                lines.push(`data = '${this.escapePy(request.body!.content)}'`);
                lines.push('');
            }
        }

        // Build request call
        const args: string[] = [`'${this.escapePy(request.url)}'`];
        if (hasHeaders) {
            args.push('headers=headers');
        }
        if (hasBody) {
            if (request.body!.type === 'json') {
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
