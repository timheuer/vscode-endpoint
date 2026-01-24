import { StorageService } from './StorageService';
import { resolveVariables, ResolverOptions } from '../parser/VariableResolver';

/**
 * Service for resolving variables with proper precedence.
 * 
 * Variable precedence (highest to lowest):
 * 1. Request-level variables (passed in)
 * 2. Active Environment variables
 * 3. Collection variables (from Collection.variables)
 * 4. Built-in variables ($timestamp, $guid, etc.)
 */
export class VariableService {
    constructor(private storageService: StorageService) { }

    /**
     * Get resolved variables with proper precedence.
     * 
     * @param collectionId - Optional collection ID to get collection-level variables
     * @param requestVariables - Optional request-level variables (highest precedence)
     * @returns Merged variables record with proper precedence applied
     */
    getResolvedVariables(
        collectionId?: string,
        requestVariables?: Record<string, string>
    ): Record<string, string> {
        const variables: Record<string, string> = {};

        // 4. Collection variables (lowest precedence among user-defined)
        if (collectionId) {
            const collection = this.storageService.getCollection(collectionId);
            if (collection?.variables) {
                Object.assign(variables, collection.variables);
            }
        }

        // 3. Active Environment variables (higher precedence than collection)
        const activeEnvironment = this.storageService.getActiveEnvironment();
        if (activeEnvironment) {
            for (const envVar of activeEnvironment.variables) {
                if (envVar.enabled) {
                    variables[envVar.name] = envVar.value;
                }
            }
        }

        // 2. Request-level variables (highest user-defined precedence)
        if (requestVariables) {
            Object.assign(variables, requestVariables);
        }

        // Note: Built-in variables ($timestamp, $guid, etc.) are handled
        // dynamically by the resolveVariables function during resolution

        return variables;
    }

    /**
     * Resolve all variable placeholders in a text string.
     * 
     * @param text - The text containing {{variable}} placeholders
     * @param collectionId - Optional collection ID for collection-level variables
     * @param requestVariables - Optional request-level variables
     * @param options - Optional resolver configuration
     * @returns Text with variables resolved
     */
    resolveText(
        text: string,
        collectionId?: string,
        requestVariables?: Record<string, string>,
        options?: ResolverOptions
    ): string {
        const variables = this.getResolvedVariables(collectionId, requestVariables);
        return resolveVariables(text, variables, options);
    }

    /**
     * Resolve variables in a request object (URL, headers, body).
     * 
     * @param request - Request object with url, headers, and optional body
     * @param collectionId - Optional collection ID for collection-level variables
     * @param requestVariables - Optional request-level variables
     * @param options - Optional resolver configuration
     * @returns Request object with variables resolved
     */
    resolveRequest(
        request: { url: string; headers: { name: string; value: string }[]; body?: string },
        collectionId?: string,
        requestVariables?: Record<string, string>,
        options?: ResolverOptions
    ): { url: string; headers: { name: string; value: string }[]; body?: string } {
        const variables = this.getResolvedVariables(collectionId, requestVariables);

        return {
            url: resolveVariables(request.url, variables, options),
            headers: request.headers.map(h => ({
                name: h.name,
                value: resolveVariables(h.value, variables, options),
            })),
            body: request.body ? resolveVariables(request.body, variables, options) : undefined,
        };
    }

    /**
     * Get a preview of all available variables for display/debugging.
     * 
     * @param collectionId - Optional collection ID
     * @param requestVariables - Optional request-level variables
     * @returns Object with variables grouped by source
     */
    getVariablesPreview(
        collectionId?: string,
        requestVariables?: Record<string, string>
    ): {
        collection: Record<string, string>;
        environment: Record<string, string>;
        request: Record<string, string>;
        merged: Record<string, string>;
    } {
        const collectionVars: Record<string, string> = {};
        const environmentVars: Record<string, string> = {};
        const requestVars: Record<string, string> = requestVariables || {};

        // Get collection variables
        if (collectionId) {
            const collection = this.storageService.getCollection(collectionId);
            if (collection?.variables) {
                Object.assign(collectionVars, collection.variables);
            }
        }

        // Get environment variables
        const activeEnvironment = this.storageService.getActiveEnvironment();
        if (activeEnvironment) {
            for (const envVar of activeEnvironment.variables) {
                if (envVar.enabled) {
                    environmentVars[envVar.name] = envVar.value;
                }
            }
        }

        return {
            collection: collectionVars,
            environment: environmentVars,
            request: requestVars,
            merged: this.getResolvedVariables(collectionId, requestVariables),
        };
    }
}
