## Plan: Repo-Based Collection Storage

Allow users to store collections in a `.endpoint/` folder within their repository, enabling team sharing while keeping sensitive auth data local-only.

### Steps

1. **Extend Collection model** in [Collection.ts](src/models/Collection.ts) — Add `storageType: 'local' | 'repo'` and optional `repoFilePath?: string` fields to track where each collection is persisted.

2. **Create `RepoCollectionService`** in `src/storage/` — New service responsible for reading/writing collection JSON files in `.endpoint/collections/`, with methods: `loadRepoCollections()`, `saveToRepo(collection)`, `deleteFromRepo(id)`, and a `sanitizeForRepo()` function that strips sensitive `AuthConfig` values (tokens, passwords, apiKeyValue) and replaces them with placeholder markers like `"{{REDACTED}}"`. Use slugified collection name for filename (e.g., `my-api-collection.json`) with collision handling via numeric suffix.

3. **Add file watcher** in [extension.ts](src/extension.ts) — Use `vscode.workspace.createFileSystemWatcher('.endpoint/collections/*.json')` to detect external changes. When file changes externally while collection is clean in memory, auto-reload. When collection is dirty, show notification with "Reload from Disk" / "Keep Local Changes" options.

4. **Update StorageService** in [StorageService.ts](src/storage/StorageService.ts) — Modify `getCollections()` to merge local (globalState) + repo (file-based) collections, and route `saveCollection()`/`deleteCollection()` based on `storageType`.

5. **Add "Convert to Repo Collection" command** — Register command that prompts warning about sensitive data exclusion, then moves a collection from globalState to `.endpoint/collections/{slug}.json`, preserving the collection but clearing auth secrets from the file.

6. **Update Collection Settings UI** in [CollectionSettingsPanel.ts](src/webview/CollectionSettingsPanel.ts) — Add "Storage Location" section showing repo/local status, with button to convert. Display warning banner when editing repo-based collection auth: "Auth credentials are stored locally and won't be shared."

7. **Document `.gitignore` guidance** in README — Add section explaining that `.endpoint/collections/*.json` contains shareable collection data, and recommend patterns if users want to exclude specific files.
