import { LanguageGenerator, ResolvedRequest, VARIABLE_PATTERN } from '../types';

export class GoNetHttpGenerator implements LanguageGenerator {
    id = 'go-nethttp';
    name = 'Go (net/http)';

    generate(request: ResolvedRequest): string {
        const lines: string[] = [];
        const needsOs = this.hasVariablesInRequest(request);

        lines.push('package main');
        lines.push('');
        lines.push('import (');
        lines.push('\t"fmt"');
        lines.push('\t"io"');
        lines.push('\t"net/http"');
        if (needsOs) {
            lines.push('\t"os"');
        }
        if (request.body && request.body.content) {
            lines.push('\t"strings"');
        }
        lines.push(')');
        lines.push('');
        lines.push('func main() {');

        const hasBody = request.body && request.body.content;

        // Create body reader if needed
        if (hasBody) {
            lines.push(`\tbody := strings.NewReader(${this.formatString(request.body!.content)})`);
        }

        // Create request
        const bodyArg = hasBody ? 'body' : 'nil';
        lines.push(`\treq, err := http.NewRequest("${request.method}", ${this.formatString(request.url)}, ${bodyArg})`);
        lines.push('\tif err != nil {');
        lines.push('\t\tpanic(err)');
        lines.push('\t}');

        // Add headers
        for (const header of request.headers) {
            lines.push(`\treq.Header.Set("${this.escapeGo(header.name)}", ${this.formatString(header.value)})`);
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
     * Format a string, using string concatenation with os.Getenv for {{VAR}} patterns.
     */
    private formatString(str: string): string {
        const hasVars = VARIABLE_PATTERN.test(str);
        VARIABLE_PATTERN.lastIndex = 0;

        if (hasVars) {
            // Split the string into parts and concatenate with os.Getenv calls
            const parts: string[] = [];
            let lastIndex = 0;
            const regex = new RegExp(VARIABLE_PATTERN.source, 'g');
            let match;

            while ((match = regex.exec(str)) !== null) {
                // Add the text before this variable
                if (match.index > lastIndex) {
                    const text = str.slice(lastIndex, match.index);
                    parts.push(`"${this.escapeGo(text)}"`);
                }
                // Add the os.Getenv call
                const varName = match[1].trim();
                parts.push(`os.Getenv("${varName}")`);
                lastIndex = match.index + match[0].length;
            }

            // Add any remaining text after the last variable
            if (lastIndex < str.length) {
                const text = str.slice(lastIndex);
                parts.push(`"${this.escapeGo(text)}"`);
            }

            return parts.join(' + ');
        } else {
            // No variables, check if we can use raw string
            if (!str.includes('`')) {
                return `\`${str}\``;
            }
            return `"${this.escapeGo(str)}"`;
        }
    }

    private escapeGo(str: string): string {
        return str
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    }
}
