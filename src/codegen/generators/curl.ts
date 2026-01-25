import { LanguageGenerator, ResolvedRequest } from '../types';

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
        parts.push(`'${this.escapeShell(request.url)}'`);

        // Headers
        for (const header of request.headers) {
            parts.push(`-H '${this.escapeShell(header.name)}: ${this.escapeShell(header.value)}'`);
        }

        // Body
        if (request.body && request.body.content) {
            const escapedBody = this.escapeShell(request.body.content);
            parts.push(`-d '${escapedBody}'`);
        }

        return parts.join(' \\\n  ');
    }

    private escapeShell(str: string): string {
        // Escape single quotes for shell
        return str.replace(/'/g, "'\\''");
    }
}
