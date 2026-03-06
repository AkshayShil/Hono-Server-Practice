# Task Plan - Fix 403 on POST /anki

## Goal
Identify and fix the root cause of the 403 Forbidden error when making a POST request to `/anki` (proxied to Anki-Connect).

## Status
- [x] Phase 1: Root Cause Investigation `complete`
- [x] Phase 2: Pattern Analysis `complete`
- [x] Phase 3: Hypothesis and Testing `complete`
- [x] Phase 4: Implementation `complete`

## Phases

### Phase 1: Root Cause Investigation
- [x] Analyze logs (Done in user request - `[Proxy] Anki-Connect responded with 403`)
- [x] Inspect `proxy/index.ts` for header manipulation
- [x] Research Anki-Connect 403 error causes (CORS, Host header, Origin header)
- [x] Reproduce the issue with diagnostic logging (Added detailed header logging to `proxy/index.ts`)

### Phase 2: Pattern Analysis
- [x] Check how `http-proxy-middleware` handled headers (if it worked before)
- [x] Compare current manual proxy implementation with successful Anki-Connect proxy examples

### Phase 3: Hypothesis and Testing
- [x] Formulate hypothesis (Origin/Host header mismatch)
- [x] Test minimally by modifying headers in `proxy/index.ts` (Setting Origin to whitelisted `http://localhost`)

### Phase 4: Implementation
- [x] Apply the fix (Override Origin to whitelisted domain, set Host to `127.0.0.1:8765`)
- [x] Verify the fix (User confirmed it is working)

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| POST /anki 403 | 1 | Stripped Origin/Referer headers |
| POST /anki 403 | 2 | Set Origin to http://localhost and Host to 127.0.0.1:8765 |
