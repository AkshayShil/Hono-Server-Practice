# Task Plan - Fix 33 ESLint Errors

## Goal
Fix 33 reported ESLint errors including component renaming, unused variable removal, and replacing 'any' with appropriate types.

## Phases
| Phase | Description | Status |
|-------|-------------|--------|
| 1. Research | Identify all imports for renaming and current 'any' usages | todo |
| 2. Rename Components | Rename Carddetaildialog.vue and Queuepane.vue and update imports | todo |
| 3. Clean up Unused | Remove 'errorLog' from SessionHistory.vue | todo |
| 4. Fix 'any' Types | Replace 'any' in specified files | todo |
| 5. Verification | Run ESLint to confirm all 33 errors are resolved | todo |

## Progress Tracking
- [ ] Rename Carddetaildialog.vue -> CardDetailDialog.vue
- [ ] Update imports for CardDetailDialog.vue
- [ ] Rename Queuepane.vue -> QueuePane.vue
- [ ] Update imports for QueuePane.vue
- [ ] Remove unused errorLog in SessionHistory.vue
- [ ] Fix 'any' in proxy/routes/fsrs.spec.ts
- [ ] Fix 'any' in proxy/routes/fsrs.ts
- [ ] Fix 'any' in proxy/routes/llm.ts
- [ ] Fix 'any' in proxy/routes/sync.ts
- [ ] Fix 'any' in proxy/utils/anki.ts
- [ ] Fix 'any' in proxy/utils/migrate.ts
- [ ] Fix 'any' in src/components/AnalysisPanel.vue
- [ ] Fix 'any' in src/main.ts
- [ ] Fix 'any' in src/stores/fsrsStore.ts
