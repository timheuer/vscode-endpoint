import * as vscode from 'vscode';
import { Collection } from '../models/Collection';
import { Environment, EnvironmentVariable } from '../models/Environment';
import { HistoryItem } from '../models/HistoryItem';

const STORAGE_KEYS = {
    COLLECTIONS: 'endpoint.collections',
    ENVIRONMENTS: 'endpoint.environments',
    ACTIVE_ENVIRONMENT: 'endpoint.activeEnvironmentId',
    HISTORY: 'endpoint.history',
} as const;

/**
 * Stored environment variable without the sensitive value field.
 * Values are stored separately in SecretStorage.
 */
interface StoredEnvironmentVariable {
    name: string;
    enabled: boolean;
}

/**
 * Environment metadata stored in globalState.
 * Variable values are stored separately in SecretStorage.
 */
interface StoredEnvironment {
    id: string;
    name: string;
    variables: StoredEnvironmentVariable[]; // no value field
    isActive: boolean;
    createdAt: number;
    updatedAt: number;
}

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
     * Get the secret storage key for a variable value
     */
    private getSecretKeyForVariable(envId: string, varName: string): string {
        return `endpoint.env.${envId}.var.${varName}`;
    }

    /**
     * Get all secret keys for an environment based on its stored variables
     */
    private getAllSecretKeysForEnvironment(storedEnv: StoredEnvironment): string[] {
        return storedEnv.variables.map(v => this.getSecretKeyForVariable(storedEnv.id, v.name));
    }

    /**
     * Get stored environments metadata from globalState (without values)
     */
    private getStoredEnvironments(): StoredEnvironment[] {
        return this.context.globalState.get<StoredEnvironment[]>(STORAGE_KEYS.ENVIRONMENTS, []);
    }

    /**
     * Save stored environments metadata to globalState
     */
    private async saveStoredEnvironments(environments: StoredEnvironment[]): Promise<void> {
        await this.context.globalState.update(STORAGE_KEYS.ENVIRONMENTS, environments);
    }

    /**
     * Hydrate a stored environment with values from SecretStorage
     */
    private async hydrateEnvironment(stored: StoredEnvironment): Promise<Environment> {
        const variables: EnvironmentVariable[] = await Promise.all(
            stored.variables.map(async (v) => {
                const secretKey = this.getSecretKeyForVariable(stored.id, v.name);
                const value = await this.context.secrets.get(secretKey) ?? '';
                return {
                    name: v.name,
                    value,
                    enabled: v.enabled,
                };
            })
        );

        return {
            id: stored.id,
            name: stored.name,
            variables,
            isActive: stored.isActive,
            createdAt: stored.createdAt,
            updatedAt: stored.updatedAt,
        };
    }

    /**
     * Get all environments from storage (hydrated with values from secrets)
     */
    async getEnvironments(): Promise<Environment[]> {
        const storedEnvironments = this.getStoredEnvironments();
        return Promise.all(storedEnvironments.map(stored => this.hydrateEnvironment(stored)));
    }

    /**
     * Save all environments to storage
     * Note: This replaces all environments. For single updates, use saveEnvironment().
     */
    async saveEnvironments(environments: Environment[]): Promise<void> {
        // First, get current stored environments to know which secrets to clean up
        const currentStored = this.getStoredEnvironments();

        // Delete all existing secrets for all environments
        for (const stored of currentStored) {
            const secretKeys = this.getAllSecretKeysForEnvironment(stored);
            await Promise.all(secretKeys.map(key => this.context.secrets.delete(key)));
        }

        // Convert environments to stored format and save values to secrets
        const storedEnvironments: StoredEnvironment[] = [];
        for (const env of environments) {
            // Store variable values in secrets
            await Promise.all(
                env.variables.map(v =>
                    this.context.secrets.store(this.getSecretKeyForVariable(env.id, v.name), v.value)
                )
            );

            // Create stored environment without values
            storedEnvironments.push({
                id: env.id,
                name: env.name,
                variables: env.variables.map(v => ({ name: v.name, enabled: v.enabled })),
                isActive: env.isActive,
                createdAt: env.createdAt,
                updatedAt: env.updatedAt,
            });
        }

        await this.saveStoredEnvironments(storedEnvironments);
    }

    /**
     * Get a single environment by ID (hydrated with values from secrets)
     */
    async getEnvironment(id: string): Promise<Environment | undefined> {
        const storedEnvironments = this.getStoredEnvironments();
        const stored = storedEnvironments.find(e => e.id === id);
        if (!stored) {
            return undefined;
        }
        return this.hydrateEnvironment(stored);
    }

    /**
     * Save or update a single environment
     */
    async saveEnvironment(environment: Environment): Promise<void> {
        const storedEnvironments = this.getStoredEnvironments();
        const index = storedEnvironments.findIndex(e => e.id === environment.id);

        // If updating, clean up old secrets first
        if (index !== -1) {
            const oldStored = storedEnvironments[index];
            const oldSecretKeys = this.getAllSecretKeysForEnvironment(oldStored);
            await Promise.all(oldSecretKeys.map(key => this.context.secrets.delete(key)));
        }

        // Store variable values in secrets
        await Promise.all(
            environment.variables.map(v =>
                this.context.secrets.store(this.getSecretKeyForVariable(environment.id, v.name), v.value)
            )
        );

        // Create stored environment without values
        const storedEnv: StoredEnvironment = {
            id: environment.id,
            name: environment.name,
            variables: environment.variables.map(v => ({ name: v.name, enabled: v.enabled })),
            isActive: environment.isActive,
            createdAt: environment.createdAt,
            updatedAt: environment.updatedAt,
        };

        if (index !== -1) {
            storedEnvironments[index] = storedEnv;
        } else {
            storedEnvironments.push(storedEnv);
        }

        await this.saveStoredEnvironments(storedEnvironments);
    }

    /**
     * Delete an environment by ID (also deletes associated secrets)
     */
    async deleteEnvironment(id: string): Promise<void> {
        const storedEnvironments = this.getStoredEnvironments();
        const stored = storedEnvironments.find(e => e.id === id);

        // Delete all secrets for this environment
        if (stored) {
            const secretKeys = this.getAllSecretKeysForEnvironment(stored);
            await Promise.all(secretKeys.map(key => this.context.secrets.delete(key)));
        }

        const filtered = storedEnvironments.filter(e => e.id !== id);
        await this.saveStoredEnvironments(filtered);

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
     * Get the active environment (hydrated with values from secrets)
     */
    async getActiveEnvironment(): Promise<Environment | undefined> {
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
