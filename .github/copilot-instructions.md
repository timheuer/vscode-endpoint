# Endpoint Extension - Development Guidelines

## Project Overview

VS Code REST Client extension with native GUI using vscode-elements for styling.

## Architecture

### Directory Structure

- `src/codegen/` - Code generation for multiple languages (cURL, fetch, Python, C#, Go, PHP)
- `src/commands/` - VS Code command implementations
- `src/http/` - HTTP client, response handling, syntax highlighting
- `src/models/` - TypeScript interfaces
- `src/parser/` - .http file parsing/serialization
- `src/providers/` - TreeDataProvider classes for sidebar views
- `src/settings/` - VS Code configuration settings service
- `src/storage/` - Persistence layer using ExtensionContext
- `src/webview/` - Webview panels for request editing and collection settings

### Key Patterns

1. **Storage**: Use `StorageService` for all persistence (globalState for data, secrets for sensitive values). Settings Sync enabled for `endpoint.collections` and `endpoint.environments` keys via `setKeysForSync()` in activation. Collections (including all requests, headers, auth) and environment metadata (names, variable names, enabled flags) sync across machines. Environment variable values stored in SecretStorage do NOT sync (OS credential store is machine-local). Active environment ID and history are NOT synced (machine-specific).
2. **Variables**: Use `VariableService` for variable resolution with precedence: Request > Environment > Collection > .env file > Built-in. The `DotEnvService` singleton reads `.env` files from the workspace root using standard KEY=value format (supports comments with #, quoted values).
3. **HTTP Execution**: Use native Node.js `http`/`https` modules via `HttpClient`
4. **Response Display**: Virtual documents with `endpoint-response:` URI scheme
5. **Webview State**: Use `vscode.setState()`/`vscode.getState()` for preserving form data. With `retainContextWhenHidden: true`, avoid regenerating HTML on visibility change. **CSP Note**: When loading external scripts via `src` attribute, the CSP must include `${webview.cspSource}` in `script-src` (nonce alone only works for inline scripts).
6. **Collection Defaults**: Collections support `defaultHeaders` and `defaultAuth` that merge with request-specific values (request overrides collection)
7. **Request Chaining**: Use `ResponseStorage` singleton for session-scoped response storage. Supports `{{requestName.response.body.path}}` syntax via `VariableResolver`
8. **Logging**: Use `@timheuer/vscode-ext-logger` via `src/logger.ts`. Import `getLogger()` to access the logger. Log level controlled via `endpoint.logLevel` setting with automatic config monitoring.
9. **Environment Variable Security**: Environment variable VALUES are stored in VS Code's SecretStorage (encrypted), while metadata (names, enabled flags) is stored in globalState. Methods `getEnvironments()`, `getEnvironment()`, `getActiveEnvironment()` are async. Variable values are masked in the tree view UI.
10. **Settings**: Use `getSettings()` or `getSetting(key)` from `src/settings` to access user-configurable options. Settings are read fresh on each call (no caching) so changes take effect on next request.
11. **Code Generation**: Use `src/codegen/` module for "Copy as Code" functionality. Implements `LanguageGenerator` interface with `id`, `name`, and `generate(ResolvedRequest)` method. Built-in generators: curl, javascript-fetch, python-requests, csharp-httpclient, go-nethttp, php-curl. Custom generators can be registered via `registerGenerator()`. Quick-pick flow offers variable resolution choice. When "Keep placeholders" is selected, unresolved `{{VAR}}` syntax is converted to language-specific environment variable access: shell `$VAR`, JS `process.env.VAR`, Python `os.environ.get('VAR')`, C# `Environment.GetEnvironmentVariable("VAR")`, Go `os.Getenv("VAR")`, PHP `getenv('VAR')`.
12. **Import/Export Variable Transformation**: On export to .http files, `{{VARIABLE_NAME}}` is transformed to `{{$dotenv VARIABLE_NAME}}` for compatibility with REST Client extension. On import, `{{$dotenv VARIABLE_NAME}}` is transformed back to `{{VARIABLE_NAME}}`. Built-in variables (`{{$guid}}`, `{{$timestamp}}`, etc.) and request chaining syntax (`{{requestName.response.body.path}}`) are preserved unchanged during export.
13. **Import Auth Detection**: When importing .http files, `Authorization` headers are automatically detected and converted to proper auth configuration. `Authorization: Bearer <token>` becomes `auth.type='bearer'` with the token value. `Authorization: Basic <base64>` is decoded to `auth.type='basic'` with username/password. Variable placeholders (e.g., `{{token}}`) are preserved. Unknown auth schemes (e.g., Digest) remain as regular headers. The Authorization header is removed after conversion to avoid duplication.
14. **Syntax Highlighting**: Use `SyntaxHighlighter` singleton from `src/http/SyntaxHighlighter.ts` for code/response syntax highlighting. Uses Shiki with TextMate grammars (JS regex engine, no WASM). Dual-theme support via CSS variables (`--shiki-light`, `--shiki-dark`) with `github-light`/`github-dark` themes. Webview CSS switches based on `.vscode-light`/`.vscode-dark` body classes. Methods: `highlight(code, language)`, `highlightResponse(body, contentType)`. **IMPORTANT**: Shiki imports MUST use static imports with `@ts-expect-error` comments (ESM-only package in CJS context). Dynamic imports like `import(\`@shikijs/langs/${lang}\`)` will NOT be bundled and will fail in deployed extensions.
15. **Dirty State Tracking**: Use `DirtyStateProvider` singleton from `src/providers/DirtyStateProvider.ts` for tracking unsaved changes. Implements `FileDecorationProvider` for tree view decorations (shows "M" badge and modified color on dirty requests). `RequestPanel` tracks dirty state by comparing current data hash to original. Visual indicators: panel title prefix "●", tree item description suffix "●", and webview "Unsaved" badge. Webview sends `contentChanged` messages on input/change events. Dirty state cleared on save or panel close.
16. **Pre-Request Execution**: Requests can be configured to execute another request first via the Settings tab. The `preRequestId` field on `Request` model stores the ID of the request to run before. `_executePreRequest()` in `RequestPanel.ts` handles recursive execution with cycle detection (prevents A→B→A chains). Pre-request responses are stored in `ResponseStorage` for variable chaining. The webview receives available requests via `updateAvailableRequests` message when the panel opens.
17. **Repo-Based Collections**: Collections can be stored in `.endpoint/collections/` folder for version control sharing. The `Collection` model has `storageType: 'local' | 'repo'` and `repoFilePath?: string` fields. `RepoCollectionService` in `src/storage/` handles file I/O with `sanitizeForRepo()` stripping sensitive auth data (passwords, tokens, API keys replaced with `{{REDACTED}}`). Auth data for repo collections is stored separately in SecretStorage with key pattern `endpoint.repo.{collectionId}.auth`. `StorageService.getCollectionsAsync()` merges local + repo collections, re-hydrating auth from secrets. File watcher in `extension.ts` detects external changes and prompts reload. Tree view shows `(repo)` suffix and `folder-library` icon for repo collections. `endpoint.convertToRepoCollection` command moves collection from globalState to file with warning about auth exclusion.
18. **History Feature**: History stores executed requests for debugging. `HistoryItem` model in `src/models/HistoryItem.ts` includes `responseBody`, `responseHeaders`, `sourceRequestId`, `sourceCollectionId`, and `responseBodyTruncated` fields. `HistorySanitizer` in `src/storage/` masks sensitive headers (`Authorization`, `X-Api-Key`, `X-Auth-Token`) and URL params (`api_key`, `token`, etc.). Only JSON responses are stored (via `shouldStoreBody()`), truncated to 256KB (configurable via `endpoint.history.maxResponseSize`). `HistoryProvider` groups items by date ("Today", "Yesterday", "This Week", "Older") with persisted collapsed state. `HistoryPanel` webview displays read-only request/response with syntax-highlighted JSON and "Save to Collection" action. Settings: `endpoint.history.storeResponses` (boolean, default true), `endpoint.history.maxResponseSize` (number, default 262144).

### Commands

Commands are prefixed with `endpoint.` and registered in `extension.ts`.

### Build Commands

- `npm run compile` - Full build with type checking and linting
- `npm run watch` - Watch mode for development
- `npm run check-types` - TypeScript type checking only

### Packaging

Run `vsce ls` to verify package contents before publishing. Expected output:

```
package.json
icon.png
README.md
LICENSE
dist/extension.js
dist/webview/codicon.ttf
dist/webview/codicon.css
dist/webview/bundled.js
```

⚠️ Alert if any of these appear in `vsce ls` output (should NOT be packaged):

- `src/` directory or `.ts` files
- `node_modules/`
- `*.map` files (sourcemaps)
- `tsconfig.json`, `eslint.config.mjs`, `esbuild.js`
- `docs/` or test files

### Testing

Press F5 in VS Code to launch Extension Development Host.

## Conventions

- Use vscode-elements for all webview UI components
- Store one request per panel (keyed by request ID)
- TreeDataProviders implement refresh() for data updates
- Use ThemeIcon for tree item icons
- Webview `restoreState()` must fully restore all form fields from saved state
- Collection settings edited via `CollectionSettingsPanel` webview
