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
