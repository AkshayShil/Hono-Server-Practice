# Session Reset Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Reset Session" feature that clears the card queue and history, then refetches cards, with a confirmation dialog.

**Architecture:** 
- Add `resetSession` logic to `cardStore`.
- Update `AppHeader.vue` to include a "Reset" button for both PC (left side) and Mobile views.
- Implement a confirmation dialog using the native `<dialog>` element in `AppHeader.vue`.

**Tech Stack:** Vue 3 (Composition API), Pinia, Tailwind CSS.

---

### Task 1: Update Card Store

**Files:**
- Modify: `src/stores/cardStore.ts`

**Step 1: Add `resetSession` function**

Add the following function to the `cardStore` and export it:

```typescript
  /**
   * Clears the current session (queue and history) and refetches cards for the current deck.
   */
  async function resetSession(): Promise<void> {
    cardQueue.value = [];
    processedCards.value = [];
    await fillQueue();
  }
```

**Step 2: Export `resetSession` in the returned object**

Ensure `resetSession` is included in the `return` statement of `useCardStore`.

**Step 3: Commit**

```bash
git add src/stores/cardStore.ts
git commit -m "feat(store): add resetSession to cardStore"
```

### Task 2: Add Reset Button and Dialog to AppHeader

**Files:**
- Modify: `src/components/AppHeader.vue`

**Step 1: Add reset logic and dialog controls**

In `<script setup>`, add:

```typescript
const openResetModal = () => {
    const modal = document.getElementById('reset_modal') as HTMLDialogElement
    if (modal) modal.showModal()
}

const handleReset = async () => {
    await store.resetSession()
    const modal = document.getElementById('reset_modal') as HTMLDialogElement
    if (modal) modal.close()
}
```

**Step 2: Add Reset Button for PC view**

Insert the reset button next to the "Anki // 桜" title:

```html
            <h1 class="hidden sm:block text-sm font-light tracking-[0.3em] uppercase text-sakura-white/90">
                Anki // 桜
            </h1>
            
            <button 
                @click="openResetModal"
                class="hidden md:flex items-center gap-1.5 text-[9px] tracking-[0.3em] uppercase text-sakura-white/40 hover:text-sakura-white transition-colors duration-300 cursor-pointer"
                title="Reset Session"
            >
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                </svg>
                Reset
            </button>
```

**Step 3: Add Reset Button for Mobile view**

Add an icon button next to the deck selection button:

```html
            <button
                class="md:hidden bg-white/10 text-sakura-white/80 border border-white/20 p-2 hover:bg-white/20 transition-colors"
                @click="openResetModal"
                title="Reset Session"
            >
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                </svg>
            </button>
```

**Step 4: Add Confirmation Dialog**

Add the dialog at the end of the `<template>`:

```html
    <dialog id="reset_modal" class="modal">
        <div class="modal-box bg-sakura-white p-0 rounded-none border-t-4 border-sakura-dark max-w-xs">
            <div class="p-6 text-center">
                <h3 class="font-bold text-xs uppercase tracking-[0.2em] text-sakura-text mb-4">
                    Reset Session?
                </h3>
                <p class="text-[10px] text-sakura-text/60 uppercase tracking-widest leading-relaxed mb-6">
                    This will clear your current queue and history.
                </p>
                <div class="flex gap-3">
                    <form method="dialog" class="flex-1">
                        <button class="w-full text-[9px] uppercase tracking-[0.2em] py-2 border border-sakura-text/10 hover:bg-sakura-pink/10 transition-all">
                            Cancel
                        </button>
                    </form>
                    <button 
                        @click="handleReset"
                        class="flex-1 text-[9px] uppercase tracking-[0.2em] py-2 bg-sakura-dark text-white hover:bg-sakura-text transition-all"
                    >
                        Reset
                    </button>
                </div>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>close</button>
        </form>
    </dialog>
```

**Step 5: Commit**

```bash
git add src/components/AppHeader.vue
git commit -m "feat(ui): add session reset button and confirmation dialog"
```

### Task 3: Verification

**Step 1: Verify Reset Logic**

1. Open the application.
2. Complete some cards so they appear in history.
3. Click the "Reset" button.
4. Confirm in the dialog.
5. Verify that:
   - The queue is cleared and refetched.
   - The session history is cleared.
   - No errors appear in the console.

**Step 2: Verify Responsive Layout**

1. Check that the Reset button is visible on Desktop (next to title).
2. Check that the Reset button is visible on Mobile (next to deck selector).
3. Verify the dialog looks good on both screen sizes.
