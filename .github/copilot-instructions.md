# Endpoint Extension - Development Guidelines

## Project Overview
VS Code REST Client extension with native GUI using vscode-elements for styling.

## Architecture

### Directory Structure
- `src/commands/` - VS Code command implementations
- `src/http/` - HTTP client, response handling
- `src/models/` - TypeScript interfaces
- `src/parser/` - .http file parsing/serialization
- `src/providers/` - TreeDataProvider classes for sidebar views
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

### Commands
Commands are prefixed with `endpoint.` and registered in `extension.ts`.

### Build Commands
- `npm run compile` - Full build with type checking and linting
- `npm run watch` - Watch mode for development
- `npm run check-types` - TypeScript type checking only

### Testing
Press F5 in VS Code to launch Extension Development Host.

## Conventions
- Use vscode-elements for all webview UI components
- Store one request per panel (keyed by request ID)
- TreeDataProviders implement refresh() for data updates
- Use ThemeIcon for tree item icons
- Webview `restoreState()` must fully restore all form fields from saved state
- Collection settings edited via `CollectionSettingsPanel` webview
