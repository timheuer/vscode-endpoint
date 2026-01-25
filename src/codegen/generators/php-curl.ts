import { LanguageGenerator, ResolvedRequest } from '../types';

export class PhpCurlGenerator implements LanguageGenerator {
    id = 'php-curl';
    name = 'PHP (cURL)';

    generate(request: ResolvedRequest): string {
        const lines: string[] = [];
        lines.push('<?php');
        lines.push('');
        lines.push('$ch = curl_init();');
        lines.push('');
        lines.push(`curl_setopt($ch, CURLOPT_URL, '${this.escapePhp(request.url)}');`);
        lines.push('curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);');

        // Set method
        if (request.method === 'POST') {
            lines.push('curl_setopt($ch, CURLOPT_POST, true);');
        } else if (request.method !== 'GET') {
            lines.push(`curl_setopt($ch, CURLOPT_CUSTOMREQUEST, '${request.method}');`);
        }

        // Set headers
        if (request.headers.length > 0) {
            lines.push('');
            lines.push('curl_setopt($ch, CURLOPT_HTTPHEADER, [');
            for (const header of request.headers) {
                lines.push(`    '${this.escapePhp(header.name)}: ${this.escapePhp(header.value)}',`);
            }
            lines.push(']);');
        }

        // Set body
        if (request.body && request.body.content) {
            lines.push('');
            lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, '${this.escapePhp(request.body.content)}');`);
        }

        lines.push('');
        lines.push('$response = curl_exec($ch);');
        lines.push('');
        lines.push('if (curl_errno($ch)) {');
        lines.push("    echo 'Error: ' . curl_error($ch);");
        lines.push('} else {');
        lines.push('    echo $response;');
        lines.push('}');
        lines.push('');
        lines.push('curl_close($ch);');

        return lines.join('\n');
    }

    private escapePhp(str: string): string {
        return str
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    }
}
