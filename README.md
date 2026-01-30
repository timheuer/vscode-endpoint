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
| ⚡ **Quick Launcher** | Fuzzy search and run any request instantly with `Ctrl+Shift+X` |
| 🔍 **Variable Diagnostics** | Problems panel warns about undefined variables before you hit send |

---

## 🎯 Features

### 🛠️ Full-Featured Request Builder

Build any HTTP request with an intuitive tabbed interface:

- **Methods**: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- **Query Params**: Visual key-value editor
- **Headers**: Add, remove, enable/disable with toggles
- **Auth**: None, Basic, Bearer Token, API Key (header or query param)
- **Body**: JSON, Form Data, Raw Text, XML
- **Resizable Split Pane**: Drag the divider between request and response to customize your view
- **Response Compression**: Automatic gzip/deflate decompression
- **Syntax Highlighting**: Beautiful code highlighting for JSON, XML, HTML responses

### ⚡ Pre-Request Execution (chaining)

Run another request automatically before your main request — perfect for auth token refresh:

1. Open a request's **Settings** tab
2. Select a "Pre-Request" from the dropdown
3. The pre-request runs first, storing its response for chaining

Cycle detection prevents infinite loops (A→B→A chains are blocked).

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

### 📋 Copy as Code

Generate code snippets in 6 languages — right-click any request or use the Command Palette:

| Language | Library |
|----------|---------|
| cURL | Command line |
| JavaScript | fetch API |
| Python | requests |
| C# | HttpClient |
| Go | net/http |
| PHP | curl |

**Variable handling:** Choose to resolve variables with current values or keep `{{placeholders}}` — placeholders convert to language-specific environment variable syntax (e.g., `process.env.VAR` for JavaScript).

### 🌍 Smart Variables

Variables resolve automatically with intelligent precedence:

1. 🔹 Request-level (`@baseUrl = ...`)
2. 🔹 Active environment
3. 🔹 Collection-level variables
4. 🔹 `.env` file (workspace root)
5. 🔹 Built-in dynamic values

**`.env` file support:** Place a `.env` file in your workspace root and variables are automatically available:

```env
# .env
BASE_URL=https://api.example.com
API_KEY=your-secret-key
```

**Built-in variables:**

| Variable | What it does | Example |
|----------|--------------|---------|
| `{{$timestamp}}` | ISO 8601 timestamp | `2026-01-30T12:00:00.000Z` |
| `{{$timestamp -1 d}}` | Timestamp with offset | Yesterday's timestamp |
| `{{$guid}}` | Fresh UUID v4 | `a1b2c3d4-...` |
| `{{$randomInt 1 100}}` | Random integer (min, max) | Random number 1-100 |
| `{{$env:VAR_NAME}}` | System env variable | Value from environment |

### 📦 Collection Defaults

Set default headers, auth, and variables for an entire collection — individual requests can override:

1. Right-click collection → **Collection Settings**
2. Add default headers, auth, or collection-level variables
3. All requests inherit these automatically

**Inheritance controls:**

- Requests can disable individual inherited headers
- Auth can be set to "Inherit from Collection" or overridden per-request

### 📂 Repo-Based Collections

Share collections with your team via version control:

1. Right-click a collection → **Store in Repository**
2. Collection is saved to `.endpoint/collections/` as JSON
3. Commit and push — team members get the collection automatically

**What gets shared:**

- ✅ Requests (URL, method, headers, body)
- ✅ Collection structure and metadata
- ✅ Non-sensitive configuration

**What stays local:**

- 🔒 Passwords, tokens, API keys (stored in VS Code's secure storage)
- Team members configure their own credentials

**`.gitignore` recommendations:**

By default, `.endpoint/collections/*.json` files are safe to commit. If you need to exclude specific collections:

```gitignore
# Exclude specific collections
.endpoint/collections/my-local-only.json

# Or exclude all (not recommended)
.endpoint/collections/
```

### 📜 History Management

Every request you send is automatically tracked:

- **Replay**: Click any history item to reopen and resend
- **Save to Collection**: Right-click → Save to preserve a useful request
- **Delete**: Remove individual items or clear all history
- **Configurable Limit**: Control how many items to retain in settings

### ⚡ Quick Run Request

Instantly search and execute any request across all collections:

- **Keyboard Shortcut**: `Ctrl+Shift+X` (Mac: `Cmd+Shift+X`)
- **Command Palette**: "Endpoint: Quick Run Request"

Features:

- Fuzzy search across request names, methods, URLs, and collection names
- HTTP method icons for quick visual scanning
- Sends the request immediately upon selection

### 🔍 Variable Diagnostics

Catch undefined variables before you send — no more debugging "variable not found" errors:

- **Problems Panel Integration**: View → Problems (`Ctrl+Shift+M`) shows undefined variable warnings
- **Scans All Sources**: Checks against active environment, `.env` file, and collection variables
- **Request Coverage**: Checks URLs, headers, body, and auth configuration

Diagnostics update automatically when you:

- Switch environments
- Add/edit/delete variables
- Modify collections or requests

### 🌐 Status Bar Environment Switcher

See your active environment at a glance and switch instantly:

- **Status Bar**: Shows current environment name with globe icon (bottom left)
- **One-Click Switch**: Click to open environment quick picker
- **Clear Option**: Easily deactivate all environments

### 👋 Welcome Views

Friendly onboarding when you're getting started:

- **Empty Collections**: Shows "Create Collection" and "Import" links
- **Empty Environments**: Explains what environments are and how to create one

### 📥 Smart Import

Import `.http` and `.rest` files with intelligent processing:

- **Auth Detection**: `Authorization: Bearer` and `Authorization: Basic` headers are automatically converted to proper auth configuration
- **Variable Extraction**: File-level variables are detected and can create a new environment
- **Import Summary**: Detailed report showing what was imported and recommended next steps
- **REST Client Compatibility**: `{{$dotenv VAR}}` syntax is automatically converted to `{{VAR}}`

### 🔄 Settings Sync

Your collections and environment metadata sync across machines via VS Code's built-in Settings Sync:

- ✅ Collections (all requests, headers, structure)
- ✅ Environment names and variable names
- ❌ Environment variable **values** stay local (stored in OS secure storage)
- ❌ History (machine-specific)

---

## ⚡ Quick Start

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| ➕ New Request | `Cmd+Shift+R` | `Ctrl+Shift+R` |
| ⚡ Quick Run Request | `Cmd+Shift+X` | `Ctrl+Shift+X` |
| 📥 Import .http | `Cmd+Shift+I` | `Ctrl+Shift+I` |
| 📤 Export Collection | `Cmd+Shift+E` | `Ctrl+Shift+E` |

**Status bar:** Click the environment name in the bottom left to quickly switch environments.

**Context menus:** Right-click on collections, requests, environments, and history items for all available actions including Copy as Code, Save to Collection, Duplicate, and more.

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

| Variable | Alias | Description | Example |
|----------|-------|-------------|---------|
| `{{$timestamp}}` | `{{$datetime}}` | ISO 8601 timestamp | `2026-01-30T12:00:00.000Z` |
| `{{$timestamp offset unit}}` | | Timestamp with offset | `{{$timestamp -1 d}}` = yesterday |
| `{{$timestamp_unix}}` | `{{$unix}}` | Unix timestamp (seconds) | `1738238400` |
| `{{$timestamp_unix offset unit}}` | | Unix timestamp with offset | `{{$unix -1 d}}` = yesterday |
| `{{$date}}` | | Date only (YYYY-MM-DD) | `2026-01-30` |
| `{{$date offset unit}}` | | Date with offset | `{{$date -7 d}}` = 7 days ago |
| `{{$time}}` | | Time only (HH:MM:SS) | `12:00:00` |
| `{{$time offset unit}}` | | Time with offset | `{{$time 2 h}}` = 2 hours from now |
| `{{$guid}}` | `{{$uuid}}` | UUID v4 | `a1b2c3d4-e5f6-...` |
| `{{$randomInt}}` | | Random integer (0-999999) | `542893` |
| `{{$randomInt min max}}` | | Random integer in range | `{{$randomInt 1 100}}` |
| `{{$localDatetime}}` | | Local datetime (ISO 8601) | With timezone offset |
| `{{$localDatetime rfc1123}}` | | Local datetime (RFC 1123) | HTTP date format |
| `{{$env:VAR_NAME}}` | | System environment variable | Value from environment |

**Time offset units:** `y` (years), `M` (months), `w` (weeks), `d` (days), `h` (hours), `m` (minutes), `s` (seconds), `ms` (milliseconds)

**Examples:**
- `{{$timestamp -7 d}}` = 7 days ago
- `{{$timestamp 2 h}}` = 2 hours from now
- `{{$date -1 d}}` = Yesterday's date
- `{{$unix 1 w}}` = Unix timestamp 1 week from now
- `{{$randomInt 1000 9999}}` = Random 4-digit number
- `{{$localDatetime -1 d}}` = Yesterday in local time

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
├── codegen/          # Code generation (6 languages)
├── commands/         # Import/Export/Copy as Code
├── http/             # HTTP client & syntax highlighting
├── models/           # Data interfaces
├── parser/           # .http parser & variable resolver
├── providers/        # Sidebar views & decorations
├── storage/          # Persistence & .env support
└── webview/          # Request panel UI
```

</details>

---

## 📝 License

MIT
