import { LanguageGenerator, ResolvedRequest } from '../types';

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
        lines.push(`var request = new HttpRequestMessage(HttpMethod.${this.toHttpMethodName(request.method)}, "${this.escapeCSharp(request.url)}");`);

        // Add headers
        for (const header of request.headers) {
            const headerName = header.name.toLowerCase();
            // Content-Type should be set on content, not on request headers
            if (headerName !== 'content-type') {
                lines.push(`request.Headers.Add("${this.escapeCSharp(header.name)}", "${this.escapeCSharp(header.value)}");`);
            }
        }

        // Add body
        if (hasBody) {
            const contentType = this.getContentType(request);
            lines.push(`request.Content = new StringContent("${this.escapeCSharp(request.body!.content)}", Encoding.UTF8, "${contentType}");`);
        }

        lines.push('');
        lines.push('var response = await client.SendAsync(request);');
        lines.push('var content = await response.Content.ReadAsStringAsync();');
        lines.push('Console.WriteLine(content);');

        return lines.join('\n');
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
