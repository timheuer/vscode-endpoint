import * as vscode from 'vscode';
import * as path from 'path';
import { Collection, AuthConfig } from '../models/Collection';
import { getLogger } from '../logger';

const REPO_FOLDER = '.endpoint';
const COLLECTIONS_FOLDER = 'collections';
const REDACTED_MARKER = '{{REDACTED}}';

/**
 * Manages repo-based collections stored in .endpoint/collections/.
 * Sensitive auth data (passwords, tokens, API keys) is stripped before saving to files.
 */
export class RepoCollectionService {
    private workspaceFolder: vscode.Uri | undefined;

    constructor() {
        this.workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    }

    hasWorkspace(): boolean {
        return this.workspaceFolder !== undefined;
    }

    private getCollectionsFolderUri(): vscode.Uri | undefined {
        if (!this.workspaceFolder) {
            return undefined;
        }
        return vscode.Uri.joinPath(this.workspaceFolder, REPO_FOLDER, COLLECTIONS_FOLDER);
    }

    private async ensureCollectionsFolder(): Promise<vscode.Uri | undefined> {
        const folderUri = this.getCollectionsFolderUri();
        if (!folderUri) {
            return undefined;
        }

        try {
            await vscode.workspace.fs.stat(folderUri);
        } catch {
            await vscode.workspace.fs.createDirectory(folderUri);
        }

        return folderUri;
    }

    slugify(name: string): string {
        return name
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    async generateFilename(name: string, existingFiles: string[], excludeFile?: string): Promise<string> {
        const baseSlug = this.slugify(name) || 'collection';
        let filename = `${baseSlug}.json`;
        let counter = 1;

        const existingFilesLower = existingFiles
            .filter(f => f !== excludeFile)
            .map(f => f.toLowerCase());

        while (existingFilesLower.includes(filename.toLowerCase())) {
            filename = `${baseSlug}-${counter}.json`;
            counter++;
        }

        return filename;
    }

    sanitizeAuthConfig(auth: AuthConfig | undefined): AuthConfig | undefined {
        if (!auth || auth.type === 'none') {
            return auth;
        }

        const sanitized: AuthConfig = { type: auth.type };

        switch (auth.type) {
            case 'basic':
                sanitized.username = auth.username;
                sanitized.password = auth.password ? REDACTED_MARKER : undefined;
                break;
            case 'bearer':
                sanitized.token = auth.token ? REDACTED_MARKER : undefined;
                break;
            case 'apikey':
                sanitized.apiKeyName = auth.apiKeyName;
                sanitized.apiKeyIn = auth.apiKeyIn;
                sanitized.apiKeyValue = auth.apiKeyValue ? REDACTED_MARKER : undefined;
                break;
        }

        return sanitized;
    }

    hasRedactedValues(auth: AuthConfig | undefined): boolean {
        if (!auth) {
            return false;
        }
        return auth.password === REDACTED_MARKER ||
            auth.token === REDACTED_MARKER ||
            auth.apiKeyValue === REDACTED_MARKER;
    }

    sanitizeForRepo(collection: Collection): Collection {
        return {
            ...collection,
            storageType: 'repo',
            defaultAuth: this.sanitizeAuthConfig(collection.defaultAuth),
            requests: collection.requests.map(request => ({
                ...request,
                auth: this.sanitizeAuthConfig(request.auth),
            })),
        };
    }

    async loadRepoCollections(): Promise<Collection[]> {
        const folderUri = this.getCollectionsFolderUri();
        if (!folderUri) {
            return [];
        }

        const logger = getLogger();
        const collections: Collection[] = [];

        try {
            const entries = await vscode.workspace.fs.readDirectory(folderUri);

            for (const [name, type] of entries) {
                if (type !== vscode.FileType.File || !name.endsWith('.json')) {
                    continue;
                }

                try {
                    const fileUri = vscode.Uri.joinPath(folderUri, name);
                    const content = await vscode.workspace.fs.readFile(fileUri);
                    const collection = JSON.parse(Buffer.from(content).toString('utf8')) as Collection;

                    collection.storageType = 'repo';
                    collection.repoFilePath = name;

                    collections.push(collection);
                } catch (err) {
                    logger.error(`Failed to load repo collection ${name}:`, err);
                }
            }
        } catch {
            // Folder doesn't exist yet
        }

        return collections;
    }

    async saveToRepo(collection: Collection): Promise<string> {
        const folderUri = await this.ensureCollectionsFolder();
        if (!folderUri) {
            throw new Error('No workspace folder available for repo-based collections');
        }

        const existingFiles = await this.listRepoFiles();
        const filename = collection.repoFilePath ||
            await this.generateFilename(collection.name, existingFiles);

        const sanitized = this.sanitizeForRepo(collection);
        const json = JSON.stringify(sanitized, null, 2);

        const fileUri = vscode.Uri.joinPath(folderUri, filename);
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(json, 'utf8'));

        return filename;
    }

    async deleteFromRepo(repoFilePath: string): Promise<void> {
        const folderUri = this.getCollectionsFolderUri();
        if (!folderUri) {
            return;
        }

        const fileUri = vscode.Uri.joinPath(folderUri, repoFilePath);
        try {
            await vscode.workspace.fs.delete(fileUri);
        } catch {
            // File may not exist
        }
    }

    async listRepoFiles(): Promise<string[]> {
        const folderUri = this.getCollectionsFolderUri();
        if (!folderUri) {
            return [];
        }

        try {
            const entries = await vscode.workspace.fs.readDirectory(folderUri);
            return entries
                .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.json'))
                .map(([name]) => name);
        } catch {
            return [];
        }
    }

    getRepoFilePath(filename: string): string | undefined {
        if (!this.workspaceFolder) {
            return undefined;
        }
        return path.join(this.workspaceFolder.fsPath, REPO_FOLDER, COLLECTIONS_FOLDER, filename);
    }

    getWatchPattern(): vscode.RelativePattern | undefined {
        if (!this.workspaceFolder) {
            return undefined;
        }
        return new vscode.RelativePattern(
            this.workspaceFolder,
            `${REPO_FOLDER}/${COLLECTIONS_FOLDER}/*.json`
        );
    }
}
