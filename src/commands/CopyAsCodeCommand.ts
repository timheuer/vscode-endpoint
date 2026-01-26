import * as vscode from 'vscode';
import { Request, Collection } from '../models/Collection';
import { getGenerators, ResolvedRequest, ResolvedHeader } from '../codegen';
import { VariableService } from '../storage/VariableService';
import { StorageService } from '../storage/StorageService';
import { getLogger } from '../logger';

/**
 * Build a ResolvedRequest from a Collection Request with optional variable resolution
 */
async function buildResolvedRequest(
    request: Request,
    collectionId: string | undefined,
    variableService: VariableService,
    storageService: StorageService,
    resolveVariables: boolean
): Promise<ResolvedRequest> {
    const logger = getLogger();

    // Get collection defaults if available
    let collection: Collection | undefined;
    if (collectionId) {
        collection = storageService.getCollection(collectionId);
    }

    // Merge headers: collection defaults + request headers
    const headers: ResolvedHeader[] = [];
    const seenHeaders = new Set<string>();

    // Add collection default headers first
    if (collection?.defaultHeaders) {
        for (const h of collection.defaultHeaders) {
            if (h.enabled && h.name) {
                const key = h.name.toLowerCase();
                if (!seenHeaders.has(key)) {
                    seenHeaders.add(key);
                    const value = resolveVariables
                        ? await variableService.resolveText(h.value, collectionId)
                        : h.value;
                    headers.push({ name: h.name, value });
                }
            }
        }
    }

    // Add request headers (override collection defaults)
    for (const h of request.headers) {
        if (h.enabled && h.name) {
            const key = h.name.toLowerCase();
            // Remove existing header if present (request overrides collection)
            const existingIndex = headers.findIndex(hdr => hdr.name.toLowerCase() === key);
            if (existingIndex !== -1) {
                headers.splice(existingIndex, 1);
            }
            const value = resolveVariables
                ? await variableService.resolveText(h.value, collectionId)
                : h.value;
            headers.push({ name: h.name, value });
        }
    }

    // Determine effective auth
    const effectiveAuth = request.auth?.type !== 'none' ? request.auth :
        (collection?.defaultAuth?.type !== 'none' ? collection?.defaultAuth : request.auth);

    // Add auth header
    if (effectiveAuth) {
        if (effectiveAuth.type === 'basic' && effectiveAuth.username) {
            const username = resolveVariables
                ? await variableService.resolveText(effectiveAuth.username, collectionId)
                : effectiveAuth.username;
            const password = resolveVariables
                ? await variableService.resolveText(effectiveAuth.password || '', collectionId)
                : (effectiveAuth.password || '');
            const credentials = Buffer.from(`${username}:${password}`).toString('base64');
            headers.push({ name: 'Authorization', value: `Basic ${credentials}` });
        } else if (effectiveAuth.type === 'bearer' && effectiveAuth.token) {
            const token = resolveVariables
                ? await variableService.resolveText(effectiveAuth.token, collectionId)
                : effectiveAuth.token;
            headers.push({ name: 'Authorization', value: `Bearer ${token}` });
        } else if (effectiveAuth.type === 'apikey' && effectiveAuth.apiKeyName && effectiveAuth.apiKeyIn === 'header') {
            const keyValue = resolveVariables
                ? await variableService.resolveText(effectiveAuth.apiKeyValue || '', collectionId)
                : (effectiveAuth.apiKeyValue || '');
            headers.push({ name: effectiveAuth.apiKeyName, value: keyValue });
        }
    }

    // Resolve URL
    let url = request.url;
    if (resolveVariables) {
        url = await variableService.resolveText(url, collectionId);
    }

    // Handle API key in query (append to URL)
    if (effectiveAuth?.type === 'apikey' && effectiveAuth.apiKeyName && effectiveAuth.apiKeyIn === 'query') {
        const keyValue = resolveVariables
            ? await variableService.resolveText(effectiveAuth.apiKeyValue || '', collectionId)
            : (effectiveAuth.apiKeyValue || '');
        const separator = url.includes('?') ? '&' : '?';
        url += `${separator}${encodeURIComponent(effectiveAuth.apiKeyName)}=${encodeURIComponent(keyValue)}`;
    }

    // Build result
    const result: ResolvedRequest = {
        method: request.method,
        url,
        headers,
    };

    // Add body if present
    if (request.body && request.body.type !== 'none' && request.body.content) {
        let content = request.body.content;
        if (resolveVariables) {
            content = await variableService.resolveText(content, collectionId);
        }

        // Add Content-Type header if not present
        const hasContentType = headers.some(h => h.name.toLowerCase() === 'content-type');
        if (!hasContentType) {
            const contentTypeMap: Record<string, string> = {
                json: 'application/json',
                xml: 'application/xml',
                form: 'application/x-www-form-urlencoded',
                text: 'text/plain',
            };
            const contentType = contentTypeMap[request.body.type];
            if (contentType) {
                headers.push({ name: 'Content-Type', value: contentType });
            }
        }

        result.body = {
            type: request.body.type as 'json' | 'form' | 'text' | 'xml',
            content,
        };
    }

    logger.debug(`Built resolved request: ${result.method} ${result.url}`);
    return result;
}

/**
 * Create the copyAsCode command
 */
export function createCopyAsCodeCommand(
    storageService: StorageService,
    variableService: VariableService
): (requestItem: { request: Request; collectionId?: string }) => Promise<void> {
    return async (requestItem) => {
        const logger = getLogger();
        const { request, collectionId } = requestItem;

        logger.debug(`Copy as Code: ${request.method} ${request.url}`);

        // Get available generators
        const generators = getGenerators();
        if (generators.length === 0) {
            vscode.window.showWarningMessage(vscode.l10n.t('No code generators available.'));
            return;
        }

        // Show quick pick for language selection
        const languageItems = generators.map(g => ({
            label: g.name,
            description: g.id,
            generator: g,
        }));

        const selectedLanguage = await vscode.window.showQuickPick(languageItems, {
            placeHolder: vscode.l10n.t('Select language'),
            title: vscode.l10n.t('Copy as Code'),
        });

        if (!selectedLanguage) {
            return;
        }

        // Ask whether to resolve variables
        const resolveChoice = await vscode.window.showQuickPick([
            { label: vscode.l10n.t('Resolve variables'), description: vscode.l10n.t('Replace {{variable}} with actual values'), resolve: true },
            { label: vscode.l10n.t('Keep placeholders'), description: vscode.l10n.t('Keep {{variable}} syntax in generated code'), resolve: false },
        ], {
            placeHolder: vscode.l10n.t('How should variables be handled?'),
            title: vscode.l10n.t('Variable Resolution'),
        });

        if (!resolveChoice) {
            return;
        }

        try {
            // Build resolved request
            const resolvedRequest = await buildResolvedRequest(
                request,
                collectionId,
                variableService,
                storageService,
                resolveChoice.resolve
            );

            // Generate code
            const code = selectedLanguage.generator.generate(resolvedRequest);

            // Copy to clipboard
            await vscode.env.clipboard.writeText(code);

            vscode.window.showInformationMessage(vscode.l10n.t('Copied {0} code to clipboard.', selectedLanguage.label));
            logger.debug(`Generated ${selectedLanguage.label} code and copied to clipboard`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to generate code: ${errorMessage}`);
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to generate code: {0}', errorMessage));
        }
    };
}

/**
 * Handle copyAsCode from webview (with RequestData instead of Request)
 */
export async function handleWebviewCopyAsCode(
    requestData: {
        method: string;
        url: string;
        queryParams: { key: string; value: string; enabled: boolean }[];
        headers: { key: string; value: string; enabled: boolean }[];
        auth: { type: string; username?: string; password?: string; token?: string; apiKeyName?: string; apiKeyValue?: string; apiKeyIn?: string };
        body: { type: string; content: string };
        inheritedHeaders?: { key: string; value: string }[];
        inheritedHeadersState?: Record<string, boolean>;
    },
    collectionId: string | undefined,
    variableService: VariableService,
    storageService: StorageService
): Promise<void> {
    const logger = getLogger();

    // Get available generators
    const generators = getGenerators();
    if (generators.length === 0) {
        vscode.window.showWarningMessage(vscode.l10n.t('No code generators available.'));
        return;
    }

    // Show quick pick for language selection
    const languageItems = generators.map(g => ({
        label: g.name,
        description: g.id,
        generator: g,
    }));

    const selectedLanguage = await vscode.window.showQuickPick(languageItems, {
        placeHolder: vscode.l10n.t('Select language'),
        title: vscode.l10n.t('Copy as Code'),
    });

    if (!selectedLanguage) {
        return;
    }

    // Ask whether to resolve variables
    const resolveChoice = await vscode.window.showQuickPick([
        { label: vscode.l10n.t('Resolve variables'), description: vscode.l10n.t('Replace {{variable}} with actual values'), resolve: true },
        { label: vscode.l10n.t('Keep placeholders'), description: vscode.l10n.t('Keep {{variable}} syntax in generated code'), resolve: false },
    ], {
        placeHolder: vscode.l10n.t('How should variables be handled?'),
        title: vscode.l10n.t('Variable Resolution'),
    });

    if (!resolveChoice) {
        return;
    }

    try {
        // Build URL with query params
        let url = requestData.url;
        const queryParams = requestData.queryParams.filter(p => p.enabled && p.key);
        if (queryParams.length > 0) {
            const searchParams = new URLSearchParams();
            queryParams.forEach(p => searchParams.append(p.key, p.value));
            url += (url.includes('?') ? '&' : '?') + searchParams.toString();
        }

        if (resolveChoice.resolve) {
            url = await variableService.resolveText(url, collectionId);
        }

        // Build headers
        const headers: ResolvedHeader[] = [];

        // Add enabled inherited headers first
        if (requestData.inheritedHeaders && requestData.inheritedHeaders.length > 0) {
            const state = requestData.inheritedHeadersState || {};
            for (const h of requestData.inheritedHeaders) {
                const isEnabled = state[h.key] !== undefined ? state[h.key] : true;
                if (isEnabled && h.key) {
                    const value = resolveChoice.resolve
                        ? await variableService.resolveText(h.value, collectionId)
                        : h.value;
                    headers.push({ name: h.key, value });
                }
            }
        }

        // Add request headers (override inherited)
        for (const h of requestData.headers) {
            if (h.enabled && h.key) {
                const key = h.key.toLowerCase();
                const existingIndex = headers.findIndex(hdr => hdr.name.toLowerCase() === key);
                if (existingIndex !== -1) {
                    headers.splice(existingIndex, 1);
                }
                const value = resolveChoice.resolve
                    ? await variableService.resolveText(h.value, collectionId)
                    : h.value;
                headers.push({ name: h.key, value });
            }
        }

        // Handle auth
        const auth = requestData.auth;
        if (auth.type === 'basic' && auth.username) {
            const username = resolveChoice.resolve
                ? await variableService.resolveText(auth.username, collectionId)
                : auth.username;
            const password = resolveChoice.resolve
                ? await variableService.resolveText(auth.password || '', collectionId)
                : (auth.password || '');
            const credentials = Buffer.from(`${username}:${password}`).toString('base64');
            headers.push({ name: 'Authorization', value: `Basic ${credentials}` });
        } else if (auth.type === 'bearer' && auth.token) {
            const token = resolveChoice.resolve
                ? await variableService.resolveText(auth.token, collectionId)
                : auth.token;
            headers.push({ name: 'Authorization', value: `Bearer ${token}` });
        } else if (auth.type === 'apikey' && auth.apiKeyName) {
            const keyValue = resolveChoice.resolve
                ? await variableService.resolveText(auth.apiKeyValue || '', collectionId)
                : (auth.apiKeyValue || '');
            if (auth.apiKeyIn === 'header') {
                headers.push({ name: auth.apiKeyName, value: keyValue });
            } else {
                const separator = url.includes('?') ? '&' : '?';
                url += `${separator}${encodeURIComponent(auth.apiKeyName)}=${encodeURIComponent(keyValue)}`;
            }
        }

        // Build resolved request
        const resolvedRequest: ResolvedRequest = {
            method: requestData.method as any,
            url,
            headers,
        };

        // Add body if present
        if (requestData.body && requestData.body.type !== 'none' && requestData.body.content) {
            let content = requestData.body.content;
            if (resolveChoice.resolve) {
                content = await variableService.resolveText(content, collectionId);
            }

            // Add Content-Type header if not present
            const hasContentType = headers.some(h => h.name.toLowerCase() === 'content-type');
            if (!hasContentType) {
                const contentTypeMap: Record<string, string> = {
                    json: 'application/json',
                    xml: 'application/xml',
                    form: 'application/x-www-form-urlencoded',
                    text: 'text/plain',
                };
                const contentType = contentTypeMap[requestData.body.type];
                if (contentType) {
                    headers.push({ name: 'Content-Type', value: contentType });
                }
            }

            resolvedRequest.body = {
                type: requestData.body.type as 'json' | 'form' | 'text' | 'xml',
                content,
            };
        }

        // Generate code
        const code = selectedLanguage.generator.generate(resolvedRequest);

        // Copy to clipboard
        await vscode.env.clipboard.writeText(code);

        vscode.window.showInformationMessage(vscode.l10n.t('Copied {0} code to clipboard.', selectedLanguage.label));
        logger.debug(`Generated ${selectedLanguage.label} code from webview and copied to clipboard`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Failed to generate code: ${errorMessage}`);
        vscode.window.showErrorMessage(vscode.l10n.t('Failed to generate code: {0}', errorMessage));
    }
}
