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
    const lowerName = name.toLowerCase();

    // Timestamp variables
    if (lowerName === '$timestamp' || lowerName === '$datetime') {
        return new Date().toISOString();
    }
    if (lowerName === '$timestamp_unix' || lowerName === '$unix') {
        return Math.floor(Date.now() / 1000).toString();
    }
    if (lowerName === '$date') {
        return new Date().toISOString().split('T')[0];
    }
    if (lowerName === '$time') {
        return new Date().toISOString().split('T')[1].split('.')[0];
    }

    // Random variables
    if (lowerName === '$guid' || lowerName === '$uuid') {
        return generateUUID();
    }
    if (lowerName === '$randomint') {
        return Math.floor(Math.random() * 1000000).toString();
    }

    // Environment variable (format: $env:VAR_NAME)
    if (name.startsWith('$env:')) {
        const envName = name.substring(5);
        return process.env[envName] || null;
    }

    return null;
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
