# Plan: History Feature Overhaul

**TL;DR**: Transform History from a "template list" into a debugging tool. Store JSON responses (≤256KB), mask sensitive auth headers, group by date, and view via rich panel. Focus on the core use case: reviewing recent requests to troubleshoot issues. Keep security tight (local-only, no sync, masked secrets).

## Steps

### 1. Update data model in `src/models/HistoryItem.ts`
- Add `responseBody?: string` – raw JSON response body
- Add `responseHeaders?: RequestHeader[]` – response headers
- Add `sourceRequestId?: string`, `sourceCollectionId?: string` – origin tracking
- Add `responseBodyTruncated?: boolean` – flag if body was cut off

### 2. Create security sanitizer (new: `src/storage/HistorySanitizer.ts`)
- `maskAuthHeaders(headers)` – replace `Authorization`, `X-Api-Key`, `X-Auth-Token` values with `***`
- `sanitizeUrl(url)` – mask common API key patterns in query params (e.g., `?api_key=***`)
- `shouldStoreBody(contentType)` – return true only for `application/json*`
- `truncateBody(body, maxBytes=256KB)` – clip large responses, set flag

### 3. Update history creation in `src/webview/RequestPanel.ts`
- Apply sanitizer before storing
- Pass `sourceRequestId` and `sourceCollectionId` from panel context
- Store JSON response body (sanitized, truncated) + response headers

### 4. Update `HistoryProvider` in `src/providers/HistoryProvider.ts`
- Group items by date: "Today", "Yesterday", "This Week", "Older"
- Date group nodes are collapsible TreeItems
- Show method+URL+status+time in item description

### 5. Create `HistoryPanel` webview (new: `src/webview/HistoryPanel.ts`)
- Read-only panel (no editing) showing:
  - Request: method, URL, headers (masked), body
  - Response: status, headers, body (syntax-highlighted)
  - Metadata: timestamp, duration, source collection/request
- Action button: "Save to Collection" (opens collection picker → creates new request)
- Reuse `SyntaxHighlighter` for JSON formatting

### 6. Wire up commands in `src/extension.ts`
- Update `endpoint.openHistoryItem` → open `HistoryPanel` instead of `RequestPanel`
- Existing: `endpoint.saveHistoryToCollection` (already exists, verify works with new model)

### 7. Add settings in `package.json`
- `endpoint.history.storeResponses: boolean` (default: true) – master toggle for response storage
- `endpoint.history.maxResponseSize: number` (default: 262144) – bytes, user-configurable
- Keep existing `endpoint.historyLimit` (count-limited)

### 8. Clean up unused code
- Remove `endpoint.history.storeResolvedValues` setting (replaced by sanitizer approach)
- Remove related code that checks this setting

## Verification

- Run extension (F5), send various requests:
  - JSON API → verify response body stored and visible in HistoryPanel
  - Binary/HTML → verify body NOT stored
  - Request with `Authorization: Bearer token123` → verify header shows `***` in history
- Verify tree view groups by date correctly
- Verify "Save to Collection" creates valid request
- Verify storage size stays reasonable with many history items

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Panel type | Read-only HistoryPanel | History is for inspection, not editing. To re-run, save to collection first. |
| Security approach | Sanitizer (masking) | Simpler than SecretStorage and sufficient for debugging use case. |
| Response types | JSON only | Skipping binary/HTML avoids storage bloat; vast majority of debugging cases involve JSON APIs. |
| Grouping | By date | Helps locate recent requests for debugging sessions. |
| Response size limit | 256KB | Reasonable for JSON APIs without excessive storage. |
