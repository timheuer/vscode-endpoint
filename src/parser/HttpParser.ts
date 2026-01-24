import { Request, HttpMethod, RequestBody } from '../models/Collection';

export interface ParsedRequest {
    name?: string;
    method: string;
    url: string;
    headers: { name: string; value: string }[];
    body?: string;
}

export interface ParsedHttpFile {
    variables: Record<string, string>;
    requests: ParsedRequest[];
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'];

/**
 * Parse a .http file into structured data
 * @param content The raw content of the .http file
 * @returns Parsed file with variables and requests
 */
export function parseHttpFile(content: string): ParsedHttpFile {
    const lines = content.split(/\r?\n/);
    const variables: Record<string, string> = {};
    const requests: ParsedRequest[] = [];

    let currentRequest: ParsedRequest | null = null;
    let pendingName: string | undefined;
    let inBody = false;
    let bodyLines: string[] = [];

    const finalizeRequest = () => {
        if (currentRequest) {
            if (bodyLines.length > 0) {
                // Trim trailing empty lines from body
                while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') {
                    bodyLines.pop();
                }
                if (bodyLines.length > 0) {
                    currentRequest.body = bodyLines.join('\n');
                }
            }
            requests.push(currentRequest);
        }
        currentRequest = null;
        inBody = false;
        bodyLines = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Check for request separator (###)
        if (trimmedLine.startsWith('###')) {
            finalizeRequest();
            // Extract name from separator if present (e.g., "### Get all users")
            const separatorName = trimmedLine.substring(3).trim();
            if (separatorName) {
                pendingName = separatorName;
            }
            continue;
        }

        // Check for file-level variable (@varName = value)
        const variableMatch = trimmedLine.match(/^@(\w+)\s*=\s*(.+)$/);
        if (variableMatch && !currentRequest) {
            variables[variableMatch[1]] = variableMatch[2].trim();
            continue;
        }

        // Check for request name comment (# @name requestName)
        const nameMatch = trimmedLine.match(/^#\s*@name\s+(\S+)/);
        if (nameMatch) {
            pendingName = nameMatch[1];
            continue;
        }

        // Skip regular comments (lines starting with # but not # @name)
        if (trimmedLine.startsWith('#') && !nameMatch) {
            continue;
        }

        // If we're in body mode, collect body lines
        if (inBody) {
            bodyLines.push(line);
            continue;
        }

        // Check for request line (METHOD URL)
        const requestLineMatch = trimmedLine.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\s+(.+)$/i);
        if (requestLineMatch) {
            finalizeRequest();
            currentRequest = {
                name: pendingName,
                method: requestLineMatch[1].toUpperCase(),
                url: requestLineMatch[2].trim(),
                headers: [],
            };
            pendingName = undefined;
            continue;
        }

        // If we have a current request, look for headers or body
        if (currentRequest) {
            // Empty line marks transition from headers to body
            if (trimmedLine === '') {
                inBody = true;
                continue;
            }

            // Parse header (Header-Name: value)
            const headerMatch = line.match(/^([^:]+):\s*(.*)$/);
            if (headerMatch) {
                currentRequest.headers.push({
                    name: headerMatch[1].trim(),
                    value: headerMatch[2].trim(),
                });
                continue;
            }
        }
    }

    // Finalize the last request
    finalizeRequest();

    return { variables, requests };
}

/**
 * Detect body type from content and headers
 */
function detectBodyType(body: string | undefined, headers: { name: string; value: string }[]): RequestBody['type'] {
    if (!body || body.trim() === '') {
        return 'none';
    }

    // Check Content-Type header
    const contentTypeHeader = headers.find(h => h.name.toLowerCase() === 'content-type');
    if (contentTypeHeader) {
        const contentType = contentTypeHeader.value.toLowerCase();
        if (contentType.includes('application/json')) {
            return 'json';
        }
        if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
            return 'xml';
        }
        if (contentType.includes('application/x-www-form-urlencoded')) {
            return 'form';
        }
    }

    // Try to detect from content
    const trimmedBody = body.trim();
    if ((trimmedBody.startsWith('{') && trimmedBody.endsWith('}')) ||
        (trimmedBody.startsWith('[') && trimmedBody.endsWith(']'))) {
        return 'json';
    }
    if (trimmedBody.startsWith('<?xml') || trimmedBody.startsWith('<')) {
        return 'xml';
    }

    return 'text';
}

/**
 * Convert a parsed request to a Request model
 */
export function parsedRequestToRequest(parsed: ParsedRequest, id?: string): Request {
    const now = Date.now();
    const bodyType = detectBodyType(parsed.body, parsed.headers);

    return {
        id: id || `${now}-${Math.random().toString(36).substring(2, 9)}`,
        name: parsed.name || `${parsed.method} Request`,
        method: parsed.method.toUpperCase() as HttpMethod,
        url: parsed.url,
        headers: parsed.headers.map(h => ({
            name: h.name,
            value: h.value,
            enabled: true,
        })),
        body: {
            type: bodyType,
            content: parsed.body || '',
        },
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * Convert requests back to .http file format
 * @param requests Array of Request objects to serialize
 * @param variables Optional variables to include at the top of the file
 * @returns Formatted .http file content
 */
export function serializeToHttpFile(requests: Request[], variables?: Record<string, string>): string {
    const lines: string[] = [];

    // Add variables at the top
    if (variables && Object.keys(variables).length > 0) {
        for (const [name, value] of Object.entries(variables)) {
            lines.push(`@${name} = ${value}`);
        }
        lines.push('');
    }

    // Add each request
    requests.forEach((request, index) => {
        // Add separator with request name
        if (index > 0 || (variables && Object.keys(variables).length > 0)) {
            lines.push(`### ${request.name}`);
        } else {
            lines.push(`### ${request.name}`);
        }

        // Add @name comment if the name is a valid identifier
        if (request.name && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(request.name)) {
            lines.push(`# @name ${request.name}`);
        }

        // Add request line
        lines.push(`${request.method} ${request.url}`);

        // Add headers
        const enabledHeaders = request.headers.filter(h => h.enabled);
        for (const header of enabledHeaders) {
            lines.push(`${header.name}: ${header.value}`);
        }

        // Add body if present
        if (request.body && request.body.type !== 'none' && request.body.content) {
            lines.push('');
            lines.push(request.body.content);
        }

        // Add blank line between requests
        if (index < requests.length - 1) {
            lines.push('');
        }
    });

    return lines.join('\n');
}

/**
 * Parse a single request block (useful for snippets)
 */
export function parseRequestBlock(content: string): ParsedRequest | null {
    const result = parseHttpFile(content);
    return result.requests.length > 0 ? result.requests[0] : null;
}
