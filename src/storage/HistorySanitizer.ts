import { RequestHeader } from '../models/Collection';

// Headers that contain authentication credentials or session data (for REQUEST headers)
const SENSITIVE_REQUEST_HEADERS = [
    'authorization', 'cookie', 'proxy-authorization'
];

// Headers to mask in RESPONSE headers (less aggressive - we keep set-cookie for debugging)
const SENSITIVE_RESPONSE_HEADERS = [
    'authorization', 'proxy-authorization'
];

// Patterns to match in header names (case-insensitive substring match)
// Catches headers like X-Api-Key, X-Config-Key, X-Auth-Token, etc.
const SENSITIVE_HEADER_PATTERNS = [
    'key', 'token', 'secret', 'auth', 'credential', 'password', 'bearer', 'jwt'
];

// Headers that should NOT be masked even if they match patterns above
// set-cookie contains "key" but we want to preserve it for debugging
const SAFE_HEADERS = [
    'set-cookie', 'etag', 'cache-control', 'content-type'
];

// Query/body parameter names that commonly contain secrets
const SENSITIVE_PARAMS = [
    'api_key', 'apikey', 'apiKey', 'key',
    'token', 'access_token', 'accessToken', 'refresh_token', 'refreshToken',
    'secret', 'password', 'passwd', 'pwd',
    'client_id', 'clientId', 'client_secret', 'clientSecret',
    'auth', 'auth_token', 'authToken', 'bearer',
    'jwt', 'session', 'sessionid', 'session_id', 'sessionId',
    'private_key', 'privateKey', 'secret_key', 'secretKey'
];

const DEFAULT_MAX_BYTES = 262144; // 256KB

/**
 * Check if a key name is sensitive (case-insensitive).
 */
function isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase();
    return SENSITIVE_PARAMS.some(param => param.toLowerCase() === lowerKey);
}

/**
 * Check if a header name matches any sensitive pattern (substring match).
 * Returns false for headers in the safe list even if they match patterns.
 */
function isSensitiveHeaderName(headerName: string): boolean {
    const lowerName = headerName.toLowerCase();
    // Don't mask headers in the safe list
    if (SAFE_HEADERS.includes(lowerName)) {
        return false;
    }
    return SENSITIVE_HEADER_PATTERNS.some(pattern => lowerName.includes(pattern));
}

/**
 * Masks values of sensitive authorization headers in REQUEST headers.
 * Matches exact header names (Authorization, Cookie) and pattern-based names (anything with key, token, secret, auth, etc.).
 */
export function maskAuthHeaders(headers: RequestHeader[]): RequestHeader[] {
    return headers.map(header => {
        const lowerName = header.name.toLowerCase();
        if (SENSITIVE_REQUEST_HEADERS.includes(lowerName) || isSensitiveHeaderName(lowerName)) {
            return { ...header, value: '***' };
        }
        return header;
    });
}

/**
 * Masks values of sensitive headers in RESPONSE headers.
 * Less aggressive than request headers - keeps Set-Cookie for debugging.
 * Matches exact header names and pattern-based names.
 */
export function maskResponseHeaders(headers: RequestHeader[]): RequestHeader[] {
    return headers.map(header => {
        const lowerName = header.name.toLowerCase();
        if (SENSITIVE_RESPONSE_HEADERS.includes(lowerName) || isSensitiveHeaderName(lowerName)) {
            return { ...header, value: '***' };
        }
        return header;
    });
}

/**
 * Masks common API key patterns in URL query parameters.
 * Includes: api_key, token, password, client_secret, session, jwt, etc.
 */
export function sanitizeUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        const params = urlObj.searchParams;
        let modified = false;

        for (const [key] of params.entries()) {
            if (isSensitiveKey(key)) {
                params.set(key, '***');
                modified = true;
            }
        }

        return modified ? urlObj.toString() : url;
    } catch {
        // If URL parsing fails, try regex-based replacement for relative URLs or malformed URLs
        let result = url;
        for (const param of SENSITIVE_PARAMS) {
            const regex = new RegExp(`([?&]${param}=)([^&]*)`, 'gi');
            result = result.replace(regex, '$1***');
        }
        return result;
    }
}

/**
 * Determines if request body should be stored based on content type.
 * Only stores bodies with content types starting with 'application/json'.
 */
export function shouldStoreBody(contentType: string | undefined): boolean {
    if (!contentType) {
        return false;
    }
    return contentType.toLowerCase().startsWith('application/json');
}

/**
 * Masks sensitive parameters in JSON body content.
 * Recursively traverses JSON objects and masks values for sensitive keys.
 * Includes: password, token, secret, client_secret, session, jwt, etc.
 */
export function sanitizeBody(body: string): string {
    try {
        const parsed = JSON.parse(body);
        const sanitized = sanitizeJsonValue(parsed);
        return JSON.stringify(sanitized, null, 2);
    } catch {
        // Not valid JSON, return as-is
        return body;
    }
}

function sanitizeJsonValue(value: unknown): unknown {
    if (value === null || value === undefined) {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(item => sanitizeJsonValue(item));
    }

    if (typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
            if (isSensitiveKey(key) && typeof val === 'string') {
                result[key] = '***';
            } else {
                result[key] = sanitizeJsonValue(val);
            }
        }
        return result;
    }

    return value;
}

/**
 * Sanitizes form-urlencoded body content.
 * Handles both JSON array format [{key,value,enabled}] from webview
 * and URL-encoded format (key=value&key2=value2).
 * Masks sensitive keys in both formats.
 */
export function sanitizeFormBody(body: string): string {
    try {
        // First, try to parse as JSON array (webview format)
        const parsed = JSON.parse(body);
        if (Array.isArray(parsed)) {
            // JSON array format: [{key: "name", value: "val", enabled: true}, ...]
            const sanitized = parsed.map((field: { key?: string; value?: string; enabled?: boolean }) => {
                if (field.key && isSensitiveKey(field.key)) {
                    return { ...field, value: '***' };
                }
                return field;
            });
            return JSON.stringify(sanitized);
        }
        // Not an array, fall through to URL-encoded handling
    } catch {
        // Not JSON, try URL-encoded format
    }

    // URL-encoded format handling
    try {
        const params = new URLSearchParams(body);
        for (const [key] of params.entries()) {
            if (isSensitiveKey(key)) {
                params.set(key, '***');
            }
        }
        return params.toString();
    } catch {
        return body;
    }
}

/**
 * Truncates body to specified max bytes.
 * @param body The body string to truncate
 * @param maxBytes Maximum bytes allowed (default: 262144 = 256KB)
 * @returns Object with truncated body and flag indicating if truncation occurred
 */
export function truncateBody(body: string, maxBytes: number = DEFAULT_MAX_BYTES): { body: string; truncated: boolean } {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(body);

    if (bytes.length <= maxBytes) {
        return { body, truncated: false };
    }

    // Truncate at byte boundary, then decode back to string
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const truncatedBytes = bytes.slice(0, maxBytes);
    const truncatedBody = decoder.decode(truncatedBytes);

    return { body: truncatedBody, truncated: true };
}
