import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../logger';

/**
 * Service for parsing .env files from the workspace root.
 * Variables from .env files have lower precedence than extension environments/collections.
 */
export class DotEnvService {
    private static instance: DotEnvService;

    private constructor() { }

    static getInstance(): DotEnvService {
        if (!DotEnvService.instance) {
            DotEnvService.instance = new DotEnvService();
        }
        return DotEnvService.instance;
    }

    /**
     * Get variables from the .env file in the workspace root.
     * Returns empty record if no workspace or .env file exists.
     */
    getVariables(): Record<string, string> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return {};
        }

        const envPath = path.join(workspaceFolder.uri.fsPath, '.env');
        return this.parseEnvFile(envPath);
    }

    /**
     * Parse a .env file and return key-value pairs.
     * Follows standard .env format:
     * - KEY=value
     * - Lines starting with # are comments
     * - Empty lines are ignored
     * - Quoted values have quotes stripped
     */
    private parseEnvFile(filePath: string): Record<string, string> {
        const logger = getLogger();

        if (!fs.existsSync(filePath)) {
            logger.debug(`No .env file found at ${filePath}`);
            return {};
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const variables: Record<string, string> = {};

            const lines = content.split(/\r?\n/);
            for (const line of lines) {
                const trimmed = line.trim();

                if (!trimmed || trimmed.startsWith('#')) {
                    continue;
                }

                const equalsIndex = trimmed.indexOf('=');
                if (equalsIndex === -1) {
                    continue;
                }

                const key = trimmed.substring(0, equalsIndex).trim();
                let value = trimmed.substring(equalsIndex + 1).trim();

                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }

                if (key) {
                    variables[key] = value;
                }
            }

            const varCount = Object.keys(variables).length;
            if (varCount > 0) {
                logger.debug(`Loaded ${varCount} variables from .env file`);
            }

            return variables;
        } catch (error) {
            logger.warn(`Failed to parse .env file: ${error}`);
            return {};
        }
    }

    hasEnvFile(): boolean {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return false;
        }

        const envPath = path.join(workspaceFolder.uri.fsPath, '.env');
        return fs.existsSync(envPath);
    }
}
