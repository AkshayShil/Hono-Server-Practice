# Design: History Pane Cleanup & Re-analysis (2026-04-09)

## Goal
Improve the clarity of the Session History (Right Pane) by removing redundant labels, preventing misclicks between grading and clearing, and allowing users to request a "Second Opinion" from a different LLM model.

## 1. Second Opinion: Re-analysis Feature
Users can re-trigger analysis for a specific card if the initial result is unsatisfactory.

### Component: `CardDetailDialog.vue`
- **Model Selector**: A dropdown listing all models available for the active provider.
- **Re-analyze Button**: Triggers a fresh analysis for the current card using the selected model.
- **Logic**: 
    - Add `reanalyzeCard(cardId, modelId)` to `cardStore.ts`.
    - This action calls `llmStore.analyze` with the specific `modelId` override.
    - Updates the `ProcessedCard` feedback and status in place.

## 2. Right Pane (Session History) Refinement
Reducing "UI Noise" and physically separating destructive actions (Clear) from productive ones (Grade).

### Misclick Prevention
- **Top Header (Cleanup)**: Move "Clear all" and "Clear graded" buttons to the top of the history pane, next to the "History" label.
- **Bottom Footer (Action)**: Keep "Autograde" as the sole primary action at the bottom of the list.
- **Mobile Drawer**: Ensure `App.vue` drawer headers are updated to match this separation.

### UI Noise Audit (Pruning)
- **Moved to Settings Gear**:
    - **Mode Switcher**: (Lenient, Balanced, Rigorous, Auto) toggles.
    - **Provider Badge**: The "Gemini · 1.5 Flash · auto" status line.
- **Removed from History Cards**:
    - "Tap to review & grade →" hint text.
    - "Awaiting grade" / "Graded" text labels (redundant with dots and tags).
- **Rationale**: Frees up vertical space and mental load, especially on mobile, while keeping the information accessible in the Settings modal.

## 3. Implementation Plan
1. Update `cardStore.ts` with `reanalyzeCard` action.
2. Modify `CardDetailDialog.vue` to add the model selector and re-analyze button.
3. Refactor `SessionHistory.vue` to move "Clear" buttons to the header and remove pruned labels.
4. Move Mode Switcher and Provider Badge from `SessionHistory.vue` to `LLMSettings.vue`.
5. Update `App.vue` mobile drawer headers for consistency.
