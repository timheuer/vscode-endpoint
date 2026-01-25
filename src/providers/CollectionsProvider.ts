import * as vscode from 'vscode';
import { Collection, Request, createCollection, createRequest } from '../models/Collection';
import { StorageService } from '../storage/StorageService';
import { DirtyStateProvider } from './DirtyStateProvider';

export type CollectionTreeItem = CollectionItem | RequestItem;

export class CollectionItem extends vscode.TreeItem {
    constructor(
        public readonly collection: Collection,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(collection.name, collapsibleState);
        this.contextValue = 'collection';
        this.iconPath = new vscode.ThemeIcon('folder');
        this.tooltip = collection.description || collection.name;
        this.description = `${collection.requests.length} request${collection.requests.length !== 1 ? 's' : ''}`;
    }
}

export class RequestItem extends vscode.TreeItem {
    constructor(
        public readonly request: Request,
        public readonly collectionId: string
    ) {
        super(request.name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'request';
        this.iconPath = this.getMethodIcon(request.method);
        this.tooltip = `${request.method} ${request.url}`;

        // Check if request has unsaved changes
        const isDirty = DirtyStateProvider.getInstance().isDirty(request.id);
        this.description = isDirty ? `${request.method} ●` : request.method;

        // Set resourceUri for FileDecorationProvider
        this.resourceUri = vscode.Uri.parse(`endpoint-request:/${request.id}`);

        this.command = {
            command: 'endpoint.openRequest',
            title: 'Open Request',
            arguments: [this],
        };
    }

    private getMethodIcon(method: string): vscode.ThemeIcon {
        const methodColors: Record<string, string> = {
            'GET': 'symbolMethod',
            'POST': 'symbolFunction',
            'PUT': 'symbolProperty',
            'PATCH': 'symbolEvent',
            'DELETE': 'symbolOperator',
            'HEAD': 'symbolInterface',
            'OPTIONS': 'symbolTypeParameter',
        };
        return new vscode.ThemeIcon(methodColors[method] || 'circle-outline');
    }
}

export class CollectionsProvider implements vscode.TreeDataProvider<CollectionTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CollectionTreeItem | undefined | null | void> = new vscode.EventEmitter<CollectionTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CollectionTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private storageService: StorageService) { }

    private get collections(): Collection[] {
        return this.storageService.getCollections();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: CollectionTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CollectionTreeItem): Thenable<CollectionTreeItem[]> {
        if (!element) {
            return Promise.resolve(
                this.collections.map(
                    (c) => new CollectionItem(c, vscode.TreeItemCollapsibleState.Collapsed)
                )
            );
        }

        if (element instanceof CollectionItem) {
            return Promise.resolve(
                element.collection.requests.map(
                    (r) => new RequestItem(r, element.collection.id)
                )
            );
        }

        return Promise.resolve([]);
    }

    async addCollection(): Promise<Collection | undefined> {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter collection name',
            placeHolder: 'My Collection',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Collection name is required';
                }
                return null;
            },
        });

        if (name) {
            const collection = createCollection(name.trim());
            await this.storageService.saveCollection(collection);
            this.refresh();
            return collection;
        }
        return undefined;
    }

    async editCollection(item: CollectionItem): Promise<void> {
        const newName = await vscode.window.showInputBox({
            prompt: 'Enter new collection name',
            value: item.collection.name,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Collection name is required';
                }
                return null;
            },
        });

        if (newName) {
            const collection = this.storageService.getCollection(item.collection.id);
            if (collection) {
                collection.name = newName.trim();
                collection.updatedAt = Date.now();
                await this.storageService.saveCollection(collection);
                this.refresh();
            }
        }
    }

    async deleteCollection(item: CollectionItem): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete collection "${item.collection.name}"?`,
            { modal: true },
            'Delete'
        );

        if (confirm === 'Delete') {
            await this.storageService.deleteCollection(item.collection.id);
            this.refresh();
        }
    }

    async duplicateCollection(item: CollectionItem): Promise<void> {
        const newCollection = createCollection(`${item.collection.name} (Copy)`, item.collection.description);
        newCollection.requests = item.collection.requests.map((r) => ({
            ...r,
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        }));
        newCollection.variables = item.collection.variables ? { ...item.collection.variables } : undefined;
        newCollection.defaultHeaders = item.collection.defaultHeaders ? [...item.collection.defaultHeaders] : undefined;
        newCollection.defaultAuth = item.collection.defaultAuth ? { ...item.collection.defaultAuth } : undefined;
        await this.storageService.saveCollection(newCollection);
        this.refresh();
    }

    async addRequest(collectionItem: CollectionItem): Promise<Request | undefined> {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter request name',
            placeHolder: 'New Request',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Request name is required';
                }
                return null;
            },
        });

        if (name) {
            const request = createRequest(name.trim());
            const collection = this.storageService.getCollection(collectionItem.collection.id);
            if (collection) {
                collection.requests.push(request);
                collection.updatedAt = Date.now();
                await this.storageService.saveCollection(collection);
                this.refresh();
                return request;
            }
        }
        return undefined;
    }

    async editRequest(item: RequestItem): Promise<void> {
        const newName = await vscode.window.showInputBox({
            prompt: 'Enter new request name',
            value: item.request.name,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Request name is required';
                }
                return null;
            },
        });

        if (newName) {
            const collection = this.storageService.getCollection(item.collectionId);
            if (collection) {
                const request = collection.requests.find((r) => r.id === item.request.id);
                if (request) {
                    request.name = newName.trim();
                    request.updatedAt = Date.now();
                    collection.updatedAt = Date.now();
                    await this.storageService.saveCollection(collection);
                    this.refresh();
                }
            }
        }
    }

    async deleteRequest(item: RequestItem): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete request "${item.request.name}"?`,
            { modal: true },
            'Delete'
        );

        if (confirm === 'Delete') {
            const collection = this.storageService.getCollection(item.collectionId);
            if (collection) {
                collection.requests = collection.requests.filter((r) => r.id !== item.request.id);
                collection.updatedAt = Date.now();
                await this.storageService.saveCollection(collection);
                this.refresh();
            }
        }
    }

    async duplicateRequest(item: RequestItem): Promise<void> {
        const collection = this.storageService.getCollection(item.collectionId);
        if (collection) {
            const newRequest = createRequest(`${item.request.name} (Copy)`, item.request.method, item.request.url);
            newRequest.headers = [...item.request.headers];
            newRequest.body = { ...item.request.body };
            collection.requests.push(newRequest);
            collection.updatedAt = Date.now();
            await this.storageService.saveCollection(collection);
            this.refresh();
        }
    }

    getCollections(): Collection[] {
        return this.collections;
    }

    getCollectionById(id: string): Collection | undefined {
        return this.storageService.getCollection(id);
    }

    async updateRequest(collectionId: string, request: Request): Promise<void> {
        const collection = this.storageService.getCollection(collectionId);
        if (collection) {
            const index = collection.requests.findIndex((r) => r.id === request.id);
            if (index !== -1) {
                collection.requests[index] = request;
                collection.updatedAt = Date.now();
                await this.storageService.saveCollection(collection);
                this.refresh();
            }
        }
    }

    async updateCollection(collection: Collection): Promise<void> {
        await this.storageService.saveCollection(collection);
        this.refresh();
    }
}
