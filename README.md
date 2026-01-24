# Endpoint - REST Client for VS Code

A REST API testing extension with a native VS Code GUI, using vscode-elements for styling and `.http` file format for storage/interop.

## Features

- **Request Editor Panel**: GUI-based HTTP request builder with tabs for Query Params, Headers, Auth, and Body
- **Collections**: Organize requests into collections for easy management
- **Environments**: Manage environment variables with precedence-based resolution
- **History**: Automatic request history tracking
- **Response Display**: Syntax-highlighted responses in VS Code's native editor
- **Import/Export**: Full `.http` file format support for interoperability

### Request Builder

- HTTP methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- Query parameters with key-value editor
- Headers with enable/disable toggle
- Auth types: None, Basic, Bearer Token, API Key
- Body types: None, JSON, Form Data, Raw Text, XML

### Variable Resolution

Variables are resolved with the following precedence (highest to lowest):

1. Request-level variables (defined in `.http` files with `@varName = value`)
2. Active Environment variables (set in the Environments view)
3. Collection variables
4. Built-in variables

#### Variable Syntax

Use `{{variableName}}` syntax to reference variables in URLs, headers, and body content.

#### Setting Environment Variables

1. Open the **Environments** view in the sidebar
2. Create a new environment (click the "+" button)
3. Right-click the environment and select "Add Variable"
4. Enter a variable name (e.g., `baseUrl`) and value (e.g., `https://api.example.com`)
5. Set the environment as active by right-clicking and selecting "Set as Active"

#### Using Variables in Requests

```http
GET {{baseUrl}}/users
Authorization: Bearer {{token}}
```

Variables in the active environment will be automatically resolved when you send the request.

#### Built-in Variables

| Variable | Alias | Description |
|----------|-------|-------------|
| `{{$timestamp}}` | `{{$datetime}}` | ISO 8601 timestamp |
| `{{$timestamp_unix}}` | `{{$unix}}` | Unix timestamp (seconds) |
| `{{$date}}` | | Date only (YYYY-MM-DD) |
| `{{$time}}` | | Time only (HH:MM:SS) |
| `{{$guid}}` | `{{$uuid}}` | UUID v4 |
| `{{$randomint}}` | | Random integer (0-999999) |
| `{{$env:VAR_NAME}}` | | System environment variable |

### Request Chaining

Use response values from one request in subsequent requests. This is useful for authentication flows where you need to extract a token and use it in follow-up API calls.

#### How It Works

1. Give your first request a name (the "Name" field in the request editor)
2. Execute the request
3. Reference the response in subsequent requests using `{{requestName.response.*}}` syntax

#### Syntax

| Reference | Returns |
|-----------|---------|
| `{{name.response.body}}` | Entire response body |
| `{{name.response.body.property}}` | JSON property value |
| `{{name.response.body.nested.path}}` | Nested JSON property |
| `{{name.response.body.items[0].id}}` | Array element access |
| `{{name.response.headers.Content-Type}}` | Response header value |
| `{{name.response.status}}` | HTTP status code |
| `{{name.response.statusText}}` | HTTP status text |

#### Example: OAuth Token Flow

```http
### Get OAuth Token
# Request name: "upsToken"
POST https://api.example.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id={{clientId}}&client_secret={{clientSecret}}

### Use Token in API Call
GET https://api.example.com/resources
Authorization: Bearer {{upsToken.response.body.access_token}}
```

**Note**: Responses are stored in memory for the current session only. Restarting VS Code clears all stored responses.

### Collection Settings

Collections support default headers and authentication that apply to all requests within the collection:

1. Right-click a collection in the sidebar
2. Select "Collection Settings"
3. Add default headers or configure default authentication
4. Save settings

Request-specific headers and authentication will override collection defaults.

Use `{{variableName}}` syntax in URLs, headers, and body.

## Usage

### New Request

- Press `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux)
- Or click the "+" button in the Collections view

### Import .http File

- Press `Cmd+Shift+I` (Mac) or `Ctrl+Shift+I` (Windows/Linux)
- Or run command: "Endpoint: Import HTTP File"

### Export Collection

- Right-click a collection in the sidebar
- Select "Export Collection"

## .http File Format

```http
@baseUrl = https://api.example.com
@token = my-secret-token

### Get all users
GET {{baseUrl}}/users
Authorization: Bearer {{token}}
Accept: application/json

### Create user
POST {{baseUrl}}/users
Content-Type: application/json

{
    "name": "John Doe",
    "email": "john@example.com"
}
```

## Keyboard Shortcuts

| Command | Mac | Windows/Linux |
|---------|-----|---------------|
| New Request | `Cmd+Shift+R` | `Ctrl+Shift+R` |
| Import HTTP File | `Cmd+Shift+I` | `Ctrl+Shift+I` |
| Export Collection | `Cmd+Shift+E` | `Ctrl+Shift+E` |

## Project Structure

```
src/
├── commands/         # Import/Export commands
├── http/             # HTTP client, response display
├── models/           # Data interfaces
├── parser/           # .http file parser and serializer
├── providers/        # TreeDataProviders for sidebar views
├── storage/          # Persistence layer
└── webview/          # Request panel webview
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `endpoint.logLevel` | `info` | Controls logging verbosity: `off`, `error`, `warn`, `info`, `debug`, `trace` |

## Development

```bash
npm install
npm run watch
```

Press F5 to launch the extension development host.

### Build Commands

| Command | Description |
|---------|-------------|
| `npm run compile` | Full build with type checking and linting |
| `npm run watch` | Watch mode for development |
| `npm run check-types` | TypeScript type checking only |
| `npm run lint` | ESLint checking |
| `npm run test` | Run tests |

## License

MIT
