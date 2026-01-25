import { HttpMethod } from '../models/Collection';

/**
 * A header with resolved values
 */
export interface ResolvedHeader {
    name: string;
    value: string;
}

/**
 * A fully resolved HTTP request ready for code generation
 */
export interface ResolvedRequest {
    method: HttpMethod;
    url: string;
    headers: ResolvedHeader[];
    body?: {
        type: 'json' | 'form' | 'text' | 'xml';
        content: string;
    };
}

/**
 * Language code generator interface
 */
export interface LanguageGenerator {
    /** Unique identifier for this generator */
    id: string;
    /** Display name shown in quick pick */
    name: string;
    /** Generate code snippet from a resolved request */
    generate(request: ResolvedRequest): string;
}

/**
 * Regex pattern to detect {{VARIABLE}} syntax
 */
export const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;

/**
 * Check if a string contains unresolved variables
 */
export function hasVariables(text: string): boolean {
    return VARIABLE_PATTERN.test(text);
}

/**
 * Extract variable names from a string
 */
export function extractVariables(text: string): string[] {
    const vars: string[] = [];
    const regex = new RegExp(VARIABLE_PATTERN.source, 'g');
    let match;
    while ((match = regex.exec(text)) !== null) {
        vars.push(match[1].trim());
    }
    return vars;
}
