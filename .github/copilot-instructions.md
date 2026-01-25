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
1. **Storage**: Use `StorageService` for all persistence (globalState for data, secrets for sensitive values)
2. **Variables**: Use `VariableService` for variable resolution with precedence: Request > Environment > Collection > Built-in
3. **HTTP Execution**: Use native Node.js `http`/`https` modules via `HttpClient`
4. **Response Display**: Virtual documents with `endpoint-response:` URI scheme
5. **Webview State**: Use `vscode.setState()`/`vscode.getState()` for preserving form data. With `retainContextWhenHidden: true`, avoid regenerating HTML on visibility change
6. **Collection Defaults**: Collections support `defaultHeaders` and `defaultAuth` that merge with request-specific values (request overrides collection)
7. **Request Chaining**: Use `ResponseStorage` singleton for session-scoped response storage. Supports `{{requestName.response.body.path}}` syntax via `VariableResolver`
8. **Logging**: Use `@timheuer/vscode-ext-logger` via `src/logger.ts`. Import `getLogger()` to access the logger. Log level controlled via `endpoint.logLevel` setting with automatic config monitoring.
9. **Environment Variable Security**: Environment variable VALUES are stored in VS Code's SecretStorage (encrypted), while metadata (names, enabled flags) is stored in globalState. Methods `getEnvironments()`, `getEnvironment()`, `getActiveEnvironment()` are async. Variable values are masked in the tree view UI.
10. **Settings**: Use `getSettings()` or `getSetting(key)` from `src/settings` to access user-configurable options. Settings are read fresh on each call (no caching) so changes take effect on next request.
11. **Code Generation**: Use `src/codegen/` module for "Copy as Code" functionality. Implements `LanguageGenerator` interface with `id`, `name`, and `generate(ResolvedRequest)` method. Built-in generators: curl, javascript-fetch, python-requests, csharp-httpclient, go-nethttp, php-curl. Custom generators can be registered via `registerGenerator()`. Quick-pick flow offers variable resolution choice.
12. **Syntax Highlighting**: Use `SyntaxHighlighter` singleton from `src/http/SyntaxHighlighter.ts` for code/response syntax highlighting. Uses Shiki with TextMate grammars (JS regex engine, no WASM). Dual-theme support via CSS variables (`--shiki-light`, `--shiki-dark`) with `github-light`/`github-dark` themes. Webview CSS switches based on `.vscode-light`/`.vscode-dark` body classes. Methods: `highlight(code, language)`, `highlightResponse(body, contentType)`.

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
