import { ResponseStorage } from '../storage/ResponseStorage';

/**
 * Variable resolver for .http file placeholders
 * Supports {{variableName}} syntax with nested resolution
 * Supports {{requestName.response.body.path}} for request chaining
 */

export interface ResolverOptions {
    /** Maximum depth for nested variable resolution (default: 10) */
    maxDepth?: number;
    /** Whether to throw on unresolved variables (default: false) */
    throwOnUnresolved?: boolean;
}

const VARIABLE_PATTERN = /\{\{([^{}]+)\}\}/g;
const RESPONSE_VAR_PATTERN = /^(\w+)\.response\.(body|headers|status|statusText)/;

/**
 * Resolve all {{varName}} placeholders in a string
 * @param text The text containing variable placeholders
 * @param variables Record of variable names to values
 * @param options Optional resolver configuration
 * @returns Text with variables resolved
 */
export function resolveVariables(
    text: string,
    variables: Record<string, string>,
    options: ResolverOptions = {}
): string {
    const { maxDepth = 10, throwOnUnresolved = false } = options;

    let result = text;
    let depth = 0;
    let hasUnresolved = false;

    // Keep resolving until no more changes or max depth reached
    while (depth < maxDepth) {
        const previousResult = result;

        result = result.replace(VARIABLE_PATTERN, (match, varName) => {
            const trimmedName = varName.trim();

            if (trimmedName in variables) {
                return variables[trimmedName];
            }

            // Check for response variable references (request chaining)
            if (RESPONSE_VAR_PATTERN.test(trimmedName)) {
                const responseStorage = ResponseStorage.getInstance();
                const responseValue = responseStorage.resolveReference(trimmedName);
                if (responseValue !== null) {
                    return responseValue;
                }
            }

            // Check for built-in variables
            const builtInValue = resolveBuiltInVariable(trimmedName);
            if (builtInValue !== null) {
                return builtInValue;
            }

            hasUnresolved = true;
            return match; // Keep the placeholder as-is
        });

        // If nothing changed, we're done
        if (result === previousResult) {
            break;
        }

        depth++;
    }

    if (throwOnUnresolved && hasUnresolved) {
        const unresolvedVars = findUnresolvedVariables(result);
        throw new Error(`Unresolved variables: ${unresolvedVars.join(', ')}`);
    }

    return result;
}

/**
 * Resolve built-in/dynamic variables
 */
function resolveBuiltInVariable(name: string): string | null {
    // Parse variable name and parameters
    const parts = name.trim().split(/\s+/);
    const varName = parts[0].toLowerCase();
    const params = parts.slice(1);

    // Timestamp variables
    if (varName === '$timestamp' || varName === '$datetime') {
        return resolveTimestampVariable(params);
    }
    if (varName === '$timestamp_unix' || varName === '$unix') {
        const timestamp = resolveTimestampVariable(params);
        if (timestamp) {
            return Math.floor(new Date(timestamp).getTime() / 1000).toString();
        }
        return Math.floor(Date.now() / 1000).toString();
    }
    if (varName === '$date') {
        const timestamp = resolveTimestampVariable(params);
        return timestamp ? timestamp.split('T')[0] : new Date().toISOString().split('T')[0];
    }
    if (varName === '$time') {
        const timestamp = resolveTimestampVariable(params);
        return timestamp ? timestamp.split('T')[1].split('.')[0] : new Date().toISOString().split('T')[1].split('.')[0];
    }
    if (varName === '$localdatetime') {
        return resolveLocalDatetimeVariable(params);
    }

    // Random variables
    if (varName === '$guid' || varName === '$uuid') {
        return generateUUID();
    }
    if (varName === '$randomint') {
        return resolveRandomInt(params);
    }

    // Environment variable (format: $env:VAR_NAME)
    if (name.startsWith('$env:')) {
        const envName = name.substring(5);
        return process.env[envName] || null;
    }

    return null;
}

/**
 * Resolve $randomInt with optional min/max parameters
 * Format: $randomInt [min max]
 */
function resolveRandomInt(params: string[]): string {
    if (params.length >= 2) {
        const min = parseInt(params[0], 10);
        const max = parseInt(params[1], 10);
        if (!isNaN(min) && !isNaN(max)) {
            // Generate random integer between min (inclusive) and max (inclusive)
            return Math.floor(Math.random() * (max - min + 1) + min).toString();
        }
    }
    // Default: random integer 0-999999
    return Math.floor(Math.random() * 1000000).toString();
}

/**
 * Resolve timestamp variables with optional offset
 * Format: $timestamp [offset unit]
 * Units: y (years), M (months), w (weeks), d (days), h (hours), m (minutes), s (seconds), ms (milliseconds)
 */
function resolveTimestampVariable(params: string[]): string {
    let date = new Date();
    
    if (params.length >= 2) {
        const offset = parseInt(params[0], 10);
        const unit = params[1];
        
        if (!isNaN(offset)) {
            switch (unit) {
                case 'y':
                    date = new Date(date.setFullYear(date.getFullYear() + offset));
                    break;
                case 'M':
                    date = new Date(date.setMonth(date.getMonth() + offset));
                    break;
                case 'w':
                    date = new Date(date.setDate(date.getDate() + offset * 7));
                    break;
                case 'd':
                    date = new Date(date.setDate(date.getDate() + offset));
                    break;
                case 'h':
                    date = new Date(date.setHours(date.getHours() + offset));
                    break;
                case 'm':
                    date = new Date(date.setMinutes(date.getMinutes() + offset));
                    break;
                case 's':
                    date = new Date(date.setSeconds(date.getSeconds() + offset));
                    break;
                case 'ms':
                    date = new Date(date.setMilliseconds(date.getMilliseconds() + offset));
                    break;
            }
        }
    }
    
    return date.toISOString();
}

/**
 * Resolve $localDatetime with optional format and offset
 * Format: $localDatetime [format] [offset unit]
 * Formats: rfc1123, iso8601 (default)
 */
function resolveLocalDatetimeVariable(params: string[]): string {
    let format = 'iso8601';
    let offsetParams: string[] = [];
    
    // Parse parameters
    if (params.length > 0) {
        // Check if first param is a format
        if (params[0] === 'rfc1123' || params[0] === 'iso8601') {
            format = params[0];
            offsetParams = params.slice(1);
        } else {
            // No format specified, params are offset
            offsetParams = params;
        }
    }
    
    // Get timestamp with offset
    const isoString = resolveTimestampVariable(offsetParams);
    const date = new Date(isoString);
    
    if (format === 'rfc1123') {
        return date.toUTCString();
    }
    
    // Default: ISO 8601 in local time
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const absOffset = Math.abs(offset);
    const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
    const minutes = String(absOffset % 60).padStart(2, '0');
    
    const localISO = date.getFullYear() +
        '-' + String(date.getMonth() + 1).padStart(2, '0') +
        '-' + String(date.getDate()).padStart(2, '0') +
        'T' + String(date.getHours()).padStart(2, '0') +
        ':' + String(date.getMinutes()).padStart(2, '0') +
        ':' + String(date.getSeconds()).padStart(2, '0') +
        '.' + String(date.getMilliseconds()).padStart(3, '0') +
        sign + hours + ':' + minutes;
    
    return localISO;
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Find all unresolved variable placeholders in text
 * @param text The text to search
 * @returns Array of unresolved variable names
 */
export function findUnresolvedVariables(text: string): string[] {
    const matches = text.matchAll(VARIABLE_PATTERN);
    const unresolved = new Set<string>();

    for (const match of matches) {
        unresolved.add(match[1].trim());
    }

    return Array.from(unresolved);
}

/**
 * Check if text contains any variable placeholders
 * @param text The text to check
 * @returns true if text contains {{...}} placeholders
 */
export function hasVariables(text: string): boolean {
    return VARIABLE_PATTERN.test(text);
}

/**
 * Extract all variable names from text (resolved and unresolved)
 * @param text The text to search
 * @returns Array of variable names referenced in the text
 */
export function extractVariableNames(text: string): string[] {
    const matches = text.matchAll(/\{\{([^{}]+)\}\}/g);
    const names = new Set<string>();

    for (const match of matches) {
        names.add(match[1].trim());
    }

    return Array.from(names);
}

/**
 * Create a variable scope by merging multiple variable sources
 * Later sources override earlier ones
 * @param sources Variable records to merge
 * @returns Merged variables record
 */
export function mergeVariables(...sources: Record<string, string>[]): Record<string, string> {
    return Object.assign({}, ...sources);
}

/**
 * Resolve variables in a ParsedRequest
 */
export function resolveRequestVariables(
    request: { url: string; headers: { name: string; value: string }[]; body?: string },
    variables: Record<string, string>,
    options?: ResolverOptions
): { url: string; headers: { name: string; value: string }[]; body?: string } {
    return {
        url: resolveVariables(request.url, variables, options),
        headers: request.headers.map(h => ({
            name: h.name,
            value: resolveVariables(h.value, variables, options),
        })),
        body: request.body ? resolveVariables(request.body, variables, options) : undefined,
    };
}
