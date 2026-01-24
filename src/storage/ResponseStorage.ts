import { HttpResponse } from '../http/ResponseContentProvider';

/**
 * Session-scoped storage for named request responses.
 * Enables request chaining via {{requestName.response.body.path}} syntax.
 * 
 * Storage is in-memory only - cleared when VS Code restarts.
 */
export class ResponseStorage {
    private static _instance: ResponseStorage | undefined;
    private _responses: Map<string, HttpResponse> = new Map();

    private constructor() { }

    public static getInstance(): ResponseStorage {
        if (!ResponseStorage._instance) {
            ResponseStorage._instance = new ResponseStorage();
        }
        return ResponseStorage._instance;
    }

    /**
     * Store a response keyed by request name (from @name directive)
     */
    public storeResponse(requestName: string, response: HttpResponse): void {
        this._responses.set(requestName, response);
    }

    /**
     * Retrieve a stored response by request name
     */
    public getResponse(requestName: string): HttpResponse | undefined {
        return this._responses.get(requestName);
    }

    /**
     * Check if a response exists for the given request name
     */
    public hasResponse(requestName: string): boolean {
        return this._responses.has(requestName);
    }

    /**
     * Get all stored request names
     */
    public getStoredRequestNames(): string[] {
        return Array.from(this._responses.keys());
    }

    /**
     * Clear a specific response
     */
    public clearResponse(requestName: string): void {
        this._responses.delete(requestName);
    }

    /**
     * Clear all stored responses
     */
    public clearAll(): void {
        this._responses.clear();
    }

    /**
     * Resolve a response variable reference like "requestName.response.body.access_token"
     * 
     * Supported paths:
     * - requestName.response.body - entire body as string
     * - requestName.response.body.property - JSON property access
     * - requestName.response.body.nested.path - nested JSON property
     * - requestName.response.headers.Header-Name - specific header value
     * - requestName.response.status - HTTP status code
     * - requestName.response.statusText - HTTP status text
     * 
     * @param reference - The full reference string (e.g., "login.response.body.token")
     * @returns The resolved value or null if not found
     */
    public resolveReference(reference: string): string | null {
        // Parse: requestName.response.type[.path...]
        const match = reference.match(/^(\w+)\.response\.(body|headers|status|statusText)(.*)$/);
        if (!match) {
            return null;
        }

        const [, requestName, responseType, pathPart] = match;
        const response = this._responses.get(requestName);
        if (!response) {
            return null;
        }

        switch (responseType) {
            case 'status':
                return response.status.toString();

            case 'statusText':
                return response.statusText;

            case 'headers': {
                // Format: .Header-Name
                const headerName = pathPart.startsWith('.') ? pathPart.substring(1) : pathPart;
                if (!headerName) {
                    // Return all headers as JSON
                    return JSON.stringify(response.headers);
                }
                // Case-insensitive header lookup (headers is Record<string, string>)
                const lowerHeaderName = headerName.toLowerCase();
                for (const [key, value] of Object.entries(response.headers)) {
                    if (key.toLowerCase() === lowerHeaderName) {
                        return value;
                    }
                }
                return null;
            }

            case 'body': {
                if (!pathPart || pathPart === '') {
                    // Return entire body
                    return response.body;
                }

                // Parse JSON path: .property.nested.path or [0].property
                const path = pathPart.startsWith('.') ? pathPart.substring(1) : pathPart;
                return this._resolveJsonPath(response.body, path);
            }

            default:
                return null;
        }
    }

    /**
     * Navigate a JSON path like "access_token" or "data.items[0].id"
     */
    private _resolveJsonPath(jsonString: string, path: string): string | null {
        try {
            let value: any = JSON.parse(jsonString);

            // Split path by . and handle array notation [n]
            const parts = path.split(/\.|\[/).filter(p => p);

            for (const part of parts) {
                if (value === null || value === undefined) {
                    return null;
                }

                // Handle array index like "0]"
                if (part.endsWith(']')) {
                    const index = parseInt(part.slice(0, -1), 10);
                    if (Array.isArray(value) && index >= 0 && index < value.length) {
                        value = value[index];
                    } else {
                        return null;
                    }
                } else {
                    value = value[part];
                }
            }

            // Convert result to string
            if (value === null || value === undefined) {
                return null;
            }
            if (typeof value === 'object') {
                return JSON.stringify(value);
            }
            return String(value);

        } catch {
            // Body is not valid JSON, return null
            return null;
        }
    }
}
