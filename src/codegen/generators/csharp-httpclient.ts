import { LanguageGenerator, ResolvedRequest, VARIABLE_PATTERN } from '../types';

export class CSharpHttpClientGenerator implements LanguageGenerator {
    id = 'csharp-httpclient';
    name = 'C# (HttpClient)';

    generate(request: ResolvedRequest): string {
        const lines: string[] = [];
        lines.push('using System.Net.Http;');
        lines.push('using System.Text;');
        lines.push('');
        lines.push('using var client = new HttpClient();');
        lines.push('');

        const hasBody = request.body && request.body.content;

        // Create request message
        lines.push(`var request = new HttpRequestMessage(HttpMethod.${this.toHttpMethodName(request.method)}, ${this.formatString(request.url)});`);

        // Add headers
        for (const header of request.headers) {
            const headerName = header.name.toLowerCase();
            // Content-Type should be set on content, not on request headers
            if (headerName !== 'content-type') {
                lines.push(`request.Headers.Add("${this.escapeCSharp(header.name)}", ${this.formatString(header.value)});`);
            }
        }

        // Add body
        if (hasBody) {
            const contentType = this.getContentType(request);
            lines.push(`request.Content = new StringContent(${this.formatString(request.body!.content)}, Encoding.UTF8, "${contentType}");`);
        }

        lines.push('');
        lines.push('var response = await client.SendAsync(request);');
        lines.push('var content = await response.Content.ReadAsStringAsync();');
        lines.push('Console.WriteLine(content);');

        return lines.join('\n');
    }

    /**
     * Format a string, using string concatenation with Environment.GetEnvironmentVariable for {{VAR}} patterns.
     */
    private formatString(str: string): string {
        const hasVars = VARIABLE_PATTERN.test(str);
        VARIABLE_PATTERN.lastIndex = 0;

        if (hasVars) {
            // Split the string into parts and concatenate with Environment.GetEnvironmentVariable calls
            const parts: string[] = [];
            let lastIndex = 0;
            const regex = new RegExp(VARIABLE_PATTERN.source, 'g');
            let match;

            while ((match = regex.exec(str)) !== null) {
                // Add the text before this variable
                if (match.index > lastIndex) {
                    const text = str.slice(lastIndex, match.index);
                    parts.push(`"${this.escapeCSharp(text)}"`);
                }
                // Add the Environment.GetEnvironmentVariable call
                const varName = match[1].trim();
                parts.push(`Environment.GetEnvironmentVariable("${varName}")`);
                lastIndex = match.index + match[0].length;
            }

            // Add any remaining text after the last variable
            if (lastIndex < str.length) {
                const text = str.slice(lastIndex);
                parts.push(`"${this.escapeCSharp(text)}"`);
            }

            return parts.join(' + ');
        } else {
            return `"${this.escapeCSharp(str)}"`;
        }
    }

    private escapeCSharp(str: string): string {
        return str
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    }

    private toHttpMethodName(method: string): string {
        // HttpMethod has static properties like Get, Post, etc.
        return method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
    }

    private getContentType(request: ResolvedRequest): string {
        // Check for explicit Content-Type header
        const contentTypeHeader = request.headers.find(
            h => h.name.toLowerCase() === 'content-type'
        );
        if (contentTypeHeader) {
            return contentTypeHeader.value;
        }

        // Default based on body type
        switch (request.body?.type) {
            case 'json':
                return 'application/json';
            case 'xml':
                return 'application/xml';
            case 'form':
                return 'application/x-www-form-urlencoded';
            default:
                return 'text/plain';
        }
    }
}
