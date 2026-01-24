import * as vscode from 'vscode';
import { Logger, createLoggerFromConfig } from '@timheuer/vscode-ext-logger';

let logger: Logger | undefined;

/**
 * Initializes the extension logger. Call this once during activation.
 * Uses VS Code configuration for log level with automatic monitoring.
 */
export function initializeLogger(context: vscode.ExtensionContext): Logger {
    logger = createLoggerFromConfig(
        context.extension.packageJSON.displayName,
        'endpoint',      // Config section
        'logLevel',      // Config key
        'info',          // Default level
        true,            // Output channel enabled
        context,         // Extension context for auto cleanup
        true             // Enable config monitoring
    );
    return logger;
}

/**
 * Gets the extension logger. Throws if not initialized.
 */
export function getLogger(): Logger {
    if (!logger) {
        throw new Error('Logger not initialized. Call initializeLogger first.');
    }
    return logger;
}

/**
 * Disposes the logger. Call during deactivation.
 */
export function disposeLogger(): void {
    logger?.dispose();
    logger = undefined;
}

export { Logger };
