import { LanguageGenerator, ResolvedRequest } from '../types';

export class GoNetHttpGenerator implements LanguageGenerator {
    id = 'go-nethttp';
    name = 'Go (net/http)';

    generate(request: ResolvedRequest): string {
        const lines: string[] = [];
        lines.push('package main');
        lines.push('');
        lines.push('import (');
        lines.push('\t"fmt"');
        lines.push('\t"io"');
        lines.push('\t"net/http"');
        if (request.body && request.body.content) {
            lines.push('\t"strings"');
        }
        lines.push(')');
        lines.push('');
        lines.push('func main() {');

        const hasBody = request.body && request.body.content;

        // Create body reader if needed
        if (hasBody) {
            lines.push(`\tbody := strings.NewReader(\`${this.escapeGoRaw(request.body!.content)}\`)`);
        }

        // Create request
        const bodyArg = hasBody ? 'body' : 'nil';
        lines.push(`\treq, err := http.NewRequest("${request.method}", "${this.escapeGo(request.url)}", ${bodyArg})`);
        lines.push('\tif err != nil {');
        lines.push('\t\tpanic(err)');
        lines.push('\t}');

        // Add headers
        for (const header of request.headers) {
            lines.push(`\treq.Header.Set("${this.escapeGo(header.name)}", "${this.escapeGo(header.value)}")`);
        }

        lines.push('');
        lines.push('\tclient := &http.Client{}');
        lines.push('\tresp, err := client.Do(req)');
        lines.push('\tif err != nil {');
        lines.push('\t\tpanic(err)');
        lines.push('\t}');
        lines.push('\tdefer resp.Body.Close()');
        lines.push('');
        lines.push('\trespBody, err := io.ReadAll(resp.Body)');
        lines.push('\tif err != nil {');
        lines.push('\t\tpanic(err)');
        lines.push('\t}');
        lines.push('\tfmt.Println(string(respBody))');
        lines.push('}');

        return lines.join('\n');
    }

    private escapeGo(str: string): string {
        return str
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    }

    private escapeGoRaw(str: string): string {
        // For raw strings (backticks), we can't have backticks in the content
        // If there are backticks, fall back to regular string escaping
        if (str.includes('`')) {
            return this.escapeGo(str);
        }
        return str;
    }
}
