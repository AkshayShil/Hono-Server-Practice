# Findings - Fix 403 on POST /anki

## Discovery Log
- **2026-03-06**: `POST /anki` returns 403 from Anki-Connect.
- **2026-03-06**: Proxy implementation is manual in `proxy/index.ts`.
- **2026-03-06**: `host` and `content-length` headers are deleted before forwarding.
- **2026-03-06**: Anki-Connect configuration whitelists `http://localhost` and `http://localhost:5173`.
- **2026-03-06**: User confirmed the fix (Origin override) is working.

## Root Cause
Anki-Connect enforces CORS checks based on the `Origin` header. The proxy was forwarding the frontend's origin (`http://localhost:3020`), which was not in Anki-Connect's whitelist (`webCorsOriginList`). This resulted in a `403 Forbidden` error.

## Fix
The proxy now overrides the `Origin` header to `http://localhost` (which is whitelisted) and sets the `Host` header to `127.0.0.1:8765`. This makes the request appear as if it's coming from a whitelisted local client.

```typescript
headers.set('host', '127.0.0.1:8765');
headers.set('origin', 'http://localhost');
```
