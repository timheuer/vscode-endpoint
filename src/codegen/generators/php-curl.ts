import { LanguageGenerator, ResolvedRequest, VARIABLE_PATTERN } from '../types';

export class PhpCurlGenerator implements LanguageGenerator {
    id = 'php-curl';
    name = 'PHP (cURL)';

    generate(request: ResolvedRequest): string {
        const lines: string[] = [];
        lines.push('<?php');
        lines.push('');
        lines.push('$ch = curl_init();');
        lines.push('');
        lines.push(`curl_setopt($ch, CURLOPT_URL, ${this.formatString(request.url)});`);
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
                lines.push(`    ${this.formatString(`${header.name}: ${header.value}`)},`);
            }
            lines.push(']);');
        }

        // Set body
        if (request.body && request.body.content) {
            lines.push('');
            lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, ${this.formatString(request.body.content)});`);
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

    /**
     * Format a string, using string concatenation with getenv() for {{VAR}} patterns.
     */
    private formatString(str: string): string {
        const hasVars = VARIABLE_PATTERN.test(str);
        VARIABLE_PATTERN.lastIndex = 0;

        if (hasVars) {
            // Split the string into parts and concatenate with getenv() calls
            const parts: string[] = [];
            let lastIndex = 0;
            const regex = new RegExp(VARIABLE_PATTERN.source, 'g');
            let match;

            while ((match = regex.exec(str)) !== null) {
                // Add the text before this variable
                if (match.index > lastIndex) {
                    const text = str.slice(lastIndex, match.index);
                    parts.push(`'${this.escapePhp(text)}'`);
                }
                // Add the getenv() call
                const varName = match[1].trim();
                parts.push(`getenv('${varName}')`);
                lastIndex = match.index + match[0].length;
            }

            // Add any remaining text after the last variable
            if (lastIndex < str.length) {
                const text = str.slice(lastIndex);
                parts.push(`'${this.escapePhp(text)}'`);
            }

            return parts.join(' . ');
        } else {
            return `'${this.escapePhp(str)}'`;
        }
    }

    private escapePhp(str: string): string {
        return str
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    }
}
