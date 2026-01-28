import * as vscode from 'vscode';

/**
 * All endpoint extension settings
 */
export interface EndpointSettings {
    timeout: number;
    followRedirects: boolean;
    maxRedirects: number;
    rejectUnauthorized: boolean;
    historyLimit: number;
    defaultContentType: 'json' | 'form' | 'xml' | 'text' | 'none';
    'history.storeResponses': boolean;
    'history.maxResponseSize': number;
}

/**
 * Default settings values matching package.json defaults
 */
const DEFAULT_SETTINGS: EndpointSettings = {
    timeout: 30000,
    followRedirects: true,
    maxRedirects: 10,
    rejectUnauthorized: true,
    historyLimit: 100,
    defaultContentType: 'json',
    'history.storeResponses': true,
    'history.maxResponseSize': 262144,
};

/**
 * Get current endpoint extension settings from VS Code configuration
 */
export function getSettings(): EndpointSettings {
    const config = vscode.workspace.getConfiguration('endpoint');

    return {
        timeout: config.get<number>('timeout', DEFAULT_SETTINGS.timeout),
        followRedirects: config.get<boolean>('followRedirects', DEFAULT_SETTINGS.followRedirects),
        maxRedirects: config.get<number>('maxRedirects', DEFAULT_SETTINGS.maxRedirects),
        rejectUnauthorized: config.get<boolean>('rejectUnauthorized', DEFAULT_SETTINGS.rejectUnauthorized),
        historyLimit: config.get<number>('historyLimit', DEFAULT_SETTINGS.historyLimit),
        defaultContentType: config.get<EndpointSettings['defaultContentType']>(
            'defaultContentType',
            DEFAULT_SETTINGS.defaultContentType
        ),
        'history.storeResponses': config.get<boolean>('history.storeResponses', DEFAULT_SETTINGS['history.storeResponses']),
        'history.maxResponseSize': config.get<number>('history.maxResponseSize', DEFAULT_SETTINGS['history.maxResponseSize']),
    };
}

/**
 * Get a specific setting value
 */
export function getSetting<K extends keyof EndpointSettings>(key: K): EndpointSettings[K] {
    return getSettings()[key];
}

/**
 * Get default settings (useful for reference or reset)
 */
export function getDefaultSettings(): EndpointSettings {
    return { ...DEFAULT_SETTINGS };
}
