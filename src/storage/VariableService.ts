import { StorageService } from './StorageService';
import { DotEnvService } from './DotEnvService';
import { resolveVariables, ResolverOptions } from '../parser/VariableResolver';

/**
 * Service for resolving variables with proper precedence.
 * 
 * Variable precedence (highest to lowest):
 * 1. Request-level variables (passed in)
 * 2. Active Environment variables
 * 3. Collection variables (from Collection.variables)
 * 4. .env file variables (from workspace root)
 * 5. Built-in variables ($timestamp, $guid, etc.)
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
    async getResolvedVariables(
        collectionId?: string,
        requestVariables?: Record<string, string>
    ): Promise<Record<string, string>> {
        const variables: Record<string, string> = {};

        // 5. .env file variables (lowest precedence among user-defined)
        const dotEnvService = DotEnvService.getInstance();
        const dotEnvVars = dotEnvService.getVariables();
        Object.assign(variables, dotEnvVars);

        // 4. Collection variables (higher precedence than .env)
        if (collectionId) {
            const collection = await this.storageService.getCollectionAsync(collectionId);
            if (collection?.variables) {
                Object.assign(variables, collection.variables);
            }
        }

        // 3. Active Environment variables (higher precedence than collection)
        const activeEnvironment = await this.storageService.getActiveEnvironment();
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
    async resolveText(
        text: string,
        collectionId?: string,
        requestVariables?: Record<string, string>,
        options?: ResolverOptions
    ): Promise<string> {
        const variables = await this.getResolvedVariables(collectionId, requestVariables);
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
    async resolveRequest(
        request: { url: string; headers: { name: string; value: string }[]; body?: string },
        collectionId?: string,
        requestVariables?: Record<string, string>,
        options?: ResolverOptions
    ): Promise<{ url: string; headers: { name: string; value: string }[]; body?: string }> {
        const variables = await this.getResolvedVariables(collectionId, requestVariables);

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
    async getVariablesPreview(
        collectionId?: string,
        requestVariables?: Record<string, string>
    ): Promise<{
        dotenv: Record<string, string>;
        collection: Record<string, string>;
        environment: Record<string, string>;
        request: Record<string, string>;
        merged: Record<string, string>;
    }> {
        const dotEnvService = DotEnvService.getInstance();
        const dotenvVars: Record<string, string> = dotEnvService.getVariables();
        const collectionVars: Record<string, string> = {};
        const environmentVars: Record<string, string> = {};
        const requestVars: Record<string, string> = requestVariables || {};

        if (collectionId) {
            const collection = await this.storageService.getCollectionAsync(collectionId);
            if (collection?.variables) {
                Object.assign(collectionVars, collection.variables);
            }
        }

        const activeEnvironment = await this.storageService.getActiveEnvironment();
        if (activeEnvironment) {
            for (const envVar of activeEnvironment.variables) {
                if (envVar.enabled) {
                    environmentVars[envVar.name] = envVar.value;
                }
            }
        }

        return {
            dotenv: dotenvVars,
            collection: collectionVars,
            environment: environmentVars,
            request: requestVars,
            merged: await this.getResolvedVariables(collectionId, requestVariables),
        };
    }
}
