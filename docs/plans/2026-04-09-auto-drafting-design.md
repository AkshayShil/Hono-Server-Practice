# Design: Auto-Drafting & UI Refinement (2026-04-09)

## Goal
Improve the study experience by preloading LLM-generated answer structures and cleaning up the editor interface to reduce "noise" and separate destructive actions from productive ones.

## 1. Background Preloading Architecture
To avoid API latency when starting a new card, we will implement a "Top 2" background buffer.

### State Management
- **`llmStore.autoDraftEnabled`**: A persisted boolean (localStorage) that toggles the feature.
- **`cardStore.draftCache`**: A `Map<number, string>` where keys are `cardId` and values are generated HTML drafts.

### Buffering Workflow
1. A watcher in the `cardStore` (or a dedicated service) monitors `cardQueue`.
2. When the queue changes or `autoDraftEnabled` is toggled ON:
    - Identify `queue[0]` and `queue[1]`.
    - For each, if not already in `draftCache`, trigger `llmStore.generateFormat(card)`.
    - Store the resulting HTML in `draftCache`.
3. When `currentCard` changes:
    - If `autoDraftEnabled` is true, check `draftCache` for `currentCard.cardId`.
    - If found, immediately set the Tiptap editor content.
    - If not found (e.g., slow API), the editor remains empty (manual mode fallback).

## 2. UI Component Audit & Placement
We are streamlining the `StudyPane.vue` to focus on the writing and analysis cycle.

### Tiptap Toolbar
- **Auto-Draft Toggle**: A new button with a magic-wand (✨) or sparkle icon.
- **Visual State**: When active, uses a soft sakura-pink border or glow to indicate it is "Armed."

### Editor Header (Top-Right)
- **Reset Button**: Moved from the footer to the top-right corner of the editor container, next to the "Your Reflection" label. 
- **Rationale**: Separates "Clear Editor" (destructive) from "Analyze" (productive), preventing accidental clicks and reducing footer clutter.

### Footer Actions
- **Primary Buttons**: "Analyze" (Main action) and "Suggest Format" (Manual fallback).
- **Removal of Fetch**: The "Fetch Cards" button is removed from the footer when a card is active. Auto-refill logic makes this redundant in the study flow. It remains in the App Header and Empty State.

## 3. Success Criteria
- [ ] Toggling "Auto-Draft" on immediately starts pre-fetching for the next 2 cards.
- [ ] Loading a new card with Auto-Draft ON results in instant (or near-instant) structure loading.
- [ ] Interface feels cleaner with "Reset" and "Fetch" moved/removed from the main action row.
- [ ] `draftCache` is cleared on session reset.
