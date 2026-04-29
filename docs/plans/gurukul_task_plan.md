# Task Plan - Gurukul Mode Implementation

## Goal
Implement "Gurukul Mode", a Socratic teaching mode where an LLM teaches the student from their own markdown notes.

## Phases
- [x] Phase 1: Foundation & Mode Switching `status: complete`
- [x] Phase 2: Stores & Basic Layout `status: complete`
- [x] Phase 3: Gurukul UI Components (File Browser, Reader, Chat) `status: complete`
- [x] Phase 4: Proxy Implementation & Persistence (SQLite) `status: complete`
- [x] Phase 5: Vector Search & Progress Assessment (LanceDB) `status: complete`
- [x] Phase 6: Verification & Refinement `status: complete`

## Tasks
### Phase 1: Foundation & Mode Switching
- [x] Create `src/stores/appMode.ts`.
- [x] Modify `src/components/AppHeader.vue` to include mode toggle.
- [x] Modify `src/App.vue` to handle mode switching and layout.

### Phase 2: Stores & Basic Layout
- [x] Create `src/stores/gurukulStore.ts` with basic file and session state.
- [x] Implement markdown parsing into sections in the store.
- [x] Implement history compression logic.

### Phase 3: Gurukul UI Components
- [x] Create `src/components/GurukulFileBrowser.vue`.
- [x] Create `src/components/GurukulReader.vue` with section navigation.
- [x] Create `src/components/GurukulChat.vue`.

### Phase 4: Proxy Implementation & Persistence
- [x] Create `proxy/utils/gurukulDb.ts` for session persistence.
- [x] Create `proxy/routes/gurukul.ts` for session and message management.
- [x] Modify `proxy/routes/llm.ts` to add `/gurukul` endpoint with token optimization.
- [x] Register new routes in `proxy/server.ts`.

### Phase 5: Vector Search & Progress Assessment
- [x] Create `proxy/utils/lancedb.ts` for vector search using Gemini embeddings.
- [x] Implement auto-summary generation on session end.
- [x] Implement progress assessment feature.

### Phase 6: Verification
- [x] Verify folder picking and markdown rendering.
- [x] Verify Socratic chat flow with different LLM providers.
- [x] Verify session persistence and history.
- [x] Verify vector-based assessment.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Duplicate styles/returns | 1 | Manually fixed files |
| PS syntax for cp | 1 | Used ; instead of && |
