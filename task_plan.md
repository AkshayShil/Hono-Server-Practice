# Task Plan - Session Restart Bug, UI Cleanup, and Shortcut Key

## Goal
Fix a session restart bug where deck details are lost, remove redundant UI text in the right pane, and add a keyboard shortcut for "Suggest Format".

## Phases
- [x] Phase 1: Research & Reproduction (Bug & UI) `status: complete`
- [ ] Phase 2: Implementation - Bug Fix (Deck Detail Persistence) `status: pending`
- [ ] Phase 3: Implementation - UI Cleanup (Right Pane) `status: pending`
- [ ] Phase 4: Implementation - Feature (Shortcut Key) `status: pending`
- [ ] Phase 5: Verification `status: pending`

## Tasks
### Phase 1: Research & Reproduction
- [x] Investigate session restart logic in `AppHeader.vue` and `cardStore.ts`.
- [x] Identify redundant text in `AnalysisPanel.vue` (or equivalent).
- [x] Research keyboard shortcut implementation in the project.
- [x] Reproduce the deck detail loss bug (mentally identified as race condition/over-aggressive clearing in `init()`).

### Phase 2: Implementation - Bug Fix
- [ ] Prevent `currentDeck` from being cleared in `cardStore.init()` if `syncDecks()` fails or returns empty.

### Phase 3: Implementation - UI Cleanup
- [ ] Filter out "clean" and "format" templates from `SessionHistory.vue` and `LLMSettings.vue`.

### Phase 4: Implementation - Feature
- [ ] Add shortcut key (e.g., `Alt+S` or `Ctrl+D`) for "Suggest Format" in `StudyPane.vue`.
- [ ] Add tooltip hint for the shortcut key.

### Phase 5: Verification
- [ ] Verify deck selection persists after restart/refresh.
- [ ] Verify right pane UI only shows true analysis modes (Lenient, Balanced, Rigorous).
- [ ] Verify shortcut key triggers "Suggest Format".

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| | | |
