import * as vscode from 'vscode';
import { Collection } from '../models/Collection';
import { Environment } from '../models/Environment';
import { HistoryItem } from '../models/HistoryItem';

const STORAGE_KEYS = {
    COLLECTIONS: 'endpoint.collections',
    ENVIRONMENTS: 'endpoint.environments',
    ACTIVE_ENVIRONMENT: 'endpoint.activeEnvironmentId',
    HISTORY: 'endpoint.history',
} as const;

/**
 * Centralized storage service using VS Code's ExtensionContext for persistence.
 * Uses globalState for data that roams with VS Code profile.
 * Uses secrets for sensitive data like API keys and tokens.
 */
export class StorageService {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    // ==================== Collections ====================

    /**
     * Get all collections from storage
     */
    getCollections(): Collection[] {
        return this.context.globalState.get<Collection[]>(STORAGE_KEYS.COLLECTIONS, []);
    }

    /**
     * Save all collections to storage
     */
    async saveCollections(collections: Collection[]): Promise<void> {
        await this.context.globalState.update(STORAGE_KEYS.COLLECTIONS, collections);
    }

    /**
     * Get a single collection by ID
     */
    getCollection(id: string): Collection | undefined {
        const collections = this.getCollections();
        return collections.find(c => c.id === id);
    }

    /**
     * Save or update a single collection
     */
    async saveCollection(collection: Collection): Promise<void> {
        const collections = this.getCollections();
        const index = collections.findIndex(c => c.id === collection.id);

        if (index !== -1) {
            collections[index] = collection;
        } else {
            collections.push(collection);
        }

        await this.saveCollections(collections);
    }

    /**
     * Delete a collection by ID
     */
    async deleteCollection(id: string): Promise<void> {
        const collections = this.getCollections();
        const filtered = collections.filter(c => c.id !== id);
        await this.saveCollections(filtered);
    }

    // ==================== Environments ====================

    /**
     * Get all environments from storage
     */
    getEnvironments(): Environment[] {
        return this.context.globalState.get<Environment[]>(STORAGE_KEYS.ENVIRONMENTS, []);
    }

    /**
     * Save all environments to storage
     */
    async saveEnvironments(environments: Environment[]): Promise<void> {
        await this.context.globalState.update(STORAGE_KEYS.ENVIRONMENTS, environments);
    }

    /**
     * Get a single environment by ID
     */
    getEnvironment(id: string): Environment | undefined {
        const environments = this.getEnvironments();
        return environments.find(e => e.id === id);
    }

    /**
     * Save or update a single environment
     */
    async saveEnvironment(environment: Environment): Promise<void> {
        const environments = this.getEnvironments();
        const index = environments.findIndex(e => e.id === environment.id);

        if (index !== -1) {
            environments[index] = environment;
        } else {
            environments.push(environment);
        }

        await this.saveEnvironments(environments);
    }

    /**
     * Delete an environment by ID
     */
    async deleteEnvironment(id: string): Promise<void> {
        const environments = this.getEnvironments();
        const filtered = environments.filter(e => e.id !== id);
        await this.saveEnvironments(filtered);

        // Clear active environment if it was deleted
        if (this.getActiveEnvironmentId() === id) {
            await this.setActiveEnvironmentId(undefined);
        }
    }

    /**
     * Get the active environment ID
     */
    getActiveEnvironmentId(): string | undefined {
        return this.context.globalState.get<string>(STORAGE_KEYS.ACTIVE_ENVIRONMENT);
    }

    /**
     * Set the active environment ID
     */
    async setActiveEnvironmentId(id: string | undefined): Promise<void> {
        await this.context.globalState.update(STORAGE_KEYS.ACTIVE_ENVIRONMENT, id);
    }

    /**
     * Get the active environment
     */
    getActiveEnvironment(): Environment | undefined {
        const id = this.getActiveEnvironmentId();
        if (!id) {
            return undefined;
        }
        return this.getEnvironment(id);
    }

    // ==================== History ====================

    private readonly maxHistoryItems = 100;

    /**
     * Get all history items from storage
     */
    getHistory(): HistoryItem[] {
        return this.context.globalState.get<HistoryItem[]>(STORAGE_KEYS.HISTORY, []);
    }

    /**
     * Add a history item (prepends to maintain newest-first order)
     */
    async addHistoryItem(item: HistoryItem): Promise<void> {
        const history = this.getHistory();
        history.unshift(item);

        // Trim history if it exceeds max items
        const trimmed = history.slice(0, this.maxHistoryItems);
        await this.context.globalState.update(STORAGE_KEYS.HISTORY, trimmed);
    }

    /**
     * Delete a history item by ID
     */
    async deleteHistoryItem(id: string): Promise<void> {
        const history = this.getHistory();
        const filtered = history.filter(h => h.id !== id);
        await this.context.globalState.update(STORAGE_KEYS.HISTORY, filtered);
    }

    /**
     * Clear all history items
     */
    async clearHistory(): Promise<void> {
        await this.context.globalState.update(STORAGE_KEYS.HISTORY, []);
    }

    /**
     * Get a single history item by ID
     */
    getHistoryItem(id: string): HistoryItem | undefined {
        const history = this.getHistory();
        return history.find(h => h.id === id);
    }

    // ==================== Secrets ====================

    /**
     * Get a secret value by key
     */
    async getSecret(key: string): Promise<string | undefined> {
        return await this.context.secrets.get(key);
    }

    /**
     * Set a secret value
     */
    async setSecret(key: string, value: string): Promise<void> {
        await this.context.secrets.store(key, value);
    }

    /**
     * Delete a secret by key
     */
    async deleteSecret(key: string): Promise<void> {
        await this.context.secrets.delete(key);
    }
}
