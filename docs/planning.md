# Endpoint Extension - Feature Planning

## Plan 1: Code Generation

Enable "Copy as cURL/fetch/Python/etc." from any HTTP request.

### Overview

Allow users to copy HTTP requests as code snippets in various languages via context menus, command palette, and a button in the request panel webview.

### Steps

| Step | Task | Details |
|------|------|---------|
| 1 | Create `src/codegen/` module | Define `LanguageGenerator` interface: `{ id: string; name: string; generate(request: ResolvedRequest): string }`. Create `ResolvedRequest` interface with fully resolved url, headers, body, and auth. |
| 2 | Implement generators | Create `src/codegen/generators/` with: curl.ts, javascript-fetch.ts, python-requests.ts, csharp-httpclient.ts, go-nethttp.ts, php-curl.ts |
| 3 | Register command | Add `endpoint.copyAsCode` command in extension.ts and package.json menus. Add to `view/item/context` for `viewItem == request`. |
| 4 | Add webview button | Add "Copy as Code" button to RequestPanelHtml.ts next to Save button. Handle `{ type: 'copyAsCode' }` message in RequestPanel.ts. |
| 5 | Create quick-pick flow | Show available languages, resolve variables via VariableService, copy generated snippet to clipboard with notification. |
| 6 | Add extensibility | Export `registerGenerator(generator: LanguageGenerator)` API for future languages. |

### Considerations

- Option in quick-pick for resolved values vs. variable placeholders
- Start with text bodies (json, form, text, xml); note limitations for binary/multipart
- Add unit tests in `src/test/codegen.test.ts`

### Estimated Effort

Medium (2-3 days)

---

## Plan 2: OAuth 2.0 Flow

Support full OAuth 2.0 authentication with automatic token management.

### Overview

Enable OAuth 2.0 flows (Client Credentials, Authorization Code with PKCE, Password Grant) with automatic token refresh and secure token storage.

### Supported Grant Types

| Grant Type | Use Case |
|------------|----------|
| Client Credentials | Server-to-server, no user interaction |
| Authorization Code + PKCE | Web/mobile apps, requires browser |
| Password Grant | Legacy systems, direct credentials |

### Steps

| Step | Task | Details |
|------|------|---------|
| 1 | Extend Collection.ts | Add `'oauth2'` to AuthType. Create `OAuth2Config` interface with: clientId, clientSecret, authorizationUrl, tokenUrl, scopes, usePkce, callbackUri, audience, grantType. Reference tokens via tokenId. |
| 2 | Create OAuthService | New `src/oauth/OAuthService.ts` singleton with: `getAccessToken(config)`, `refreshAccessToken(tokenId)`, `startAuthorizationCodeFlow(config)`, `acquireTokenClientCredentials(config)`, `acquireTokenPassword(config, username, password)` |
| 3 | Register URI handler | In extension.ts: `vscode.window.registerUriHandler()` for `vscode://timheuer.endpoint/oauth/callback?code=...&state=...`. Maintain pending state map. |
| 4 | Add OAuth UI | In RequestPanelHtml.ts: grant type selector, client ID/secret fields, auth/token URLs, scopes, PKCE checkbox, "Authorize" button, token status display |
| 5 | Integrate in RequestPanel | In `_sendRequest()`: call `OAuthService.getAccessToken(config)` for oauth2 auth, auto-refresh if expired, add Bearer header |
| 6 | Create PKCE utilities | New `src/oauth/pkce.ts`: `generateCodeVerifier()` (64 chars, base64url), `generateCodeChallenge(verifier)` (SHA-256, base64url) |

### Token Storage

- Access tokens and refresh tokens stored in SecretStorage via `StorageService.setSecret()`
- Keys: `endpoint.oauth.{tokenId}.access`, `endpoint.oauth.{tokenId}.refresh`
- Token expiry tracked in metadata

### Considerations

- VS Code URI handler may not work in remote SSH/containers - document limitation
- Refresh tokens persist across restarts (SecretStorage)
- Collection-level token sharing (via defaultAuth) vs. per-request

### Estimated Effort

Medium-High (4-5 days)

---

## Plan 3: gRPC Support

Enable gRPC calls alongside HTTP requests.

### Overview

Add full gRPC support including unary calls, streaming (server/client/bidirectional), proto file management, and TLS/mTLS.

### Call Types

| Type | Description |
|------|-------------|
| Unary | Single request, single response |
| Server Streaming | Single request, stream of responses |
| Client Streaming | Stream of requests, single response |
| Bidirectional | Stream of requests, stream of responses |

### Steps

| Step | Task | Details |
|------|------|---------|
| 1 | Add dependencies | `@grpc/grpc-js`, `@grpc/proto-loader`, `protobufjs` (optional) |
| 2 | Extend Collection.ts | Create `GrpcRequest` interface: protoFile, serviceName, methodName, callType, metadata, message. Add `GrpcTlsConfig` for mTLS. Union type `CollectionRequest = Request \| GrpcRequest` |
| 3 | Create ProtoManager | New `src/grpc/ProtoManager.ts`: load proto files, parse services/methods, cache definitions, provide `getServices()`, `getMethods()`, `getMessageSchema()` |
| 4 | Create GrpcClient | New `src/grpc/GrpcClient.ts`: `executeUnaryCall()`, `executeServerStream()`, `executeClientStream()`, `executeBidiStream()`. Support TLS via `grpc.credentials`. |
| 5 | Create GrpcRequestPanel | New `src/webview/GrpcRequestPanel.ts` and `GrpcRequestPanelHtml.ts`: proto file selector, service/method dropdowns, message JSON editor with schema hints, metadata table, TLS config |
| 6 | Handle streaming responses | Unary: reuse response display. Server stream: scrolling message list via postMessage. Bidi: split panel with send/receive areas. |
| 7 | Update CollectionsProvider | Show gRPC requests with distinct icon (`codicon-radio-tower`). Add "New gRPC Request" command. Update HistoryProvider for gRPC history. |
| 8 | Import/export support | Import .proto files to collections. Consider Postman gRPC format compatibility. |

### Proto File Management

- Store in workspace `.endpoint/protos/` folder
- Reference by relative path in collection
- Parse on-demand, cache parsed definitions

### Considerations

- Separate UI panel vs. unified (recommend separate for clarity)
- Reflection API support for server-discovered services (future enhancement)
- Streaming cancellation and timeout handling

### Estimated Effort

High (1-2 weeks)

---

## Priority Matrix

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| Code Generation | High | Medium | P1 - High visibility |
| OAuth 2.0 | High | Medium-High | P2 - Common need |
| gRPC Support | Medium | High | P3 - Differentiator |

## Next Steps

1. Start with **Code Generation** (Plan 1) - high visibility feature
2. Then **OAuth 2.0** (Plan 2) - addresses major auth gap
3. Finally **gRPC** (Plan 3) - largest scope, can be phased
