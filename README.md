# 🚀 Endpoint

**The REST Client that feels like home in VS Code**

Test APIs without leaving your editor. Beautiful native GUI. Zero context switching.

<img alt="vscode-endpoint" src="https://github.com/user-attachments/assets/3f439a97-397e-4b2d-9a4d-6bc48f15734c" />

---

## ✨ Why Endpoint?

| | |
|---|---|
| 🎨 **Native Look & Feel** | Built with VS Code's design language — no jarring external windows |
| 📁 **Portable `.http` Files** | Your requests are just text files. Version control them, share them, import them anywhere |
| 🔗 **Request Chaining** | Use one response in the next request — perfect for OAuth and multi-step flows |
| 🌍 **Environment Variables** | Switch between dev, staging, and prod with a single click |
| 📦 **Collections** | Organize requests with shared defaults for headers and auth |
| ⏱️ **History** | Never lose a request — automatic tracking of everything you send |

---

## 🎯 Features

### 🛠️ Full-Featured Request Builder

Build any HTTP request with an intuitive tabbed interface:

- **Methods**: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- **Query Params**: Visual key-value editor
- **Headers**: Add, remove, enable/disable with toggles
- **Auth**: None, Basic, Bearer Token, API Key
- **Body**: JSON, Form Data, Raw Text, XML

### 🔗 Request Chaining

Chain requests together — grab a token from one response and use it in the next.

**How to use:**

1. **Name your first request** — Enter a name in the "Name" field (e.g., `login`)
2. **Send the request** — The response is automatically stored in memory
3. **Reference in the next request** — Use `{{requestName.response.body.path}}` in URL, headers, or body

```http
### Login
# Name: "login"
POST {{baseUrl}}/auth/login
Content-Type: application/json

{"username": "admin", "password": "secret"}

### Use the token
GET {{baseUrl}}/protected/resource
Authorization: Bearer {{login.response.body.token}}
```

| Reference | Returns |
|-----------|---------|
| `{{name.response.body}}` | Entire response body |
| `{{name.response.body.token}}` | JSON property |
| `{{name.response.body.data[0].id}}` | Array access |
| `{{name.response.headers.X-Custom}}` | Header value |
| `{{name.response.status}}` | Status code |

> **Note:** Responses are session-scoped and cleared when VS Code restarts.

### 🌍 Smart Variables

Variables resolve automatically with intelligent precedence:

1. 🔹 Request-level (`@baseUrl = ...`)
2. 🔹 Active environment
3. 🔹 Collection defaults
4. 🔹 Built-in dynamic values

**Built-in variables:**

| Variable | What it does |
|----------|--------------|
| `{{$timestamp}}` | ISO 8601 timestamp |
| `{{$guid}}` | Fresh UUID v4 |
| `{{$randomint}}` | Random integer |
| `{{$env:VAR_NAME}}` | System env variable |

### 📦 Collection Defaults

Set default headers and auth for an entire collection — individual requests can override:

1. Right-click collection → **Collection Settings**
2. Add default headers or auth
3. All requests inherit these automatically

---

## ⚡ Quick Start

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| ➕ New Request | `Cmd+Shift+R` | `Ctrl+Shift+R` |
| 📥 Import .http | `Cmd+Shift+I` | `Ctrl+Shift+I` |
| 📤 Export Collection | `Cmd+Shift+E` | `Ctrl+Shift+E` |

Or use the **Collections** sidebar — click ➕ to create, right-click to export.

---

## 📄 File Format

Standard `.http` format — works with other tools too:

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

---

## ⚙️ Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `endpoint.logLevel` | `info` | Logging: `off`, `error`, `warn`, `info`, `debug`, `trace` |
| `endpoint.timeout` | `30000` | Request timeout in milliseconds (0 for no timeout) |
| `endpoint.followRedirects` | `true` | Follow HTTP redirects |
| `endpoint.maxRedirects` | `10` | Maximum number of redirects to follow (0-50) |
| `endpoint.rejectUnauthorized` | `true` | Reject unauthorized SSL certificates |
| `endpoint.historyLimit` | `20` | Maximum number of history items to retain (0-1000) |
| `endpoint.defaultContentType` | `json` | Default body type: `json`, `form`, `xml`, `text`, `none` |

---

<details>
<summary>📚 Full Variable Reference</summary>

### Variable Syntax

Use `{{variableName}}` anywhere — URLs, headers, body.

### Built-in Variables

| Variable | Alias | Description |
|----------|-------|-------------|
| `{{$timestamp}}` | `{{$datetime}}` | ISO 8601 timestamp |
| `{{$timestamp_unix}}` | `{{$unix}}` | Unix timestamp (seconds) |
| `{{$date}}` | | Date only (YYYY-MM-DD) |
| `{{$time}}` | | Time only (HH:MM:SS) |
| `{{$guid}}` | `{{$uuid}}` | UUID v4 |
| `{{$randomint}}` | | Random integer (0-999999) |
| `{{$env:VAR_NAME}}` | | System environment variable |

### Setting Up Environments

1. Open **Environments** in the sidebar
2. Click ➕ to create an environment
3. Right-click → "Add Variable"
4. Right-click → "Set as Active"

</details>

<details>
<summary>🔧 Development</summary>

```bash
npm install
npm run watch
```

Press **F5** to launch the extension development host.

### Commands

| Command | Description |
|---------|-------------|
| `npm run compile` | Full build |
| `npm run watch` | Watch mode |
| `npm run check-types` | Type check |
| `npm run lint` | Lint |
| `npm run test` | Run tests |

### Project Structure

```
src/
├── commands/         # Import/Export
├── http/             # HTTP client
├── models/           # Data interfaces
├── parser/           # .http parser
├── providers/        # Sidebar views
├── storage/          # Persistence
└── webview/          # Request panel
```

</details>

---

## 📝 License

MIT
