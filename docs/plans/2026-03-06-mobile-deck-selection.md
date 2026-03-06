# Mobile Deck Selection Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve deck selection on mobile using a DaisyUI Bottom Sheet modal, while keeping the desktop `<select>` exactly as it is.

**Architecture:** 
- Keep existing `<select>` hidden on mobile and visible on desktop (`hidden md:inline-block`).
- Add a touch-friendly "Current Deck" button/chip visible only on mobile (`md:hidden`).
- Tapping the mobile chip opens a DaisyUI Modal (configured as a bottom sheet for mobile).
- The modal displays a list of decks with large touch targets.

**Tech Stack:** Vue 3, Tailwind CSS v4, DaisyUI v5.

---

### Task 1: Responsive Header Layout in AppHeader.vue

**Files:**
- Modify: `src/components/AppHeader.vue`

**Step 1: Implement responsive visibility for desktop select**
Add `hidden md:inline-block` to the current `<select>` element.

**Step 2: Add mobile deck selector button**
Add a new button visible only on mobile (`md:hidden`) that displays the current deck name and opens the modal.
```vue
<button 
  @click="openDeckModal"
  class="md:hidden flex items-center gap-2 bg-white/10 px-4 py-2 text-[12px] tracking-widest uppercase text-sakura-white/90 border border-white/20 active:bg-white/30"
>
  {{ store.currentDeck || 'Select Deck' }}
  <svg class="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M6 9l6 6 6-6" />
  </svg>
</button>
```

**Step 3: Update Header Padding**
Change `px-12` to `px-6 md:px-12` to accommodate mobile screen edges.

**Step 4: Commit**
```bash
git add src/components/AppHeader.vue
git commit -m "feat: implement responsive layout for AppHeader deck selection"
```

---

### Task 2: Mobile Deck Selection Modal

**Files:**
- Modify: `src/components/AppHeader.vue`

**Step 1: Implement DaisyUI Modal structure**
Add a modal at the bottom of the template.
```vue
<dialog id="deck_modal" class="modal modal-bottom sm:modal-middle">
  <div class="modal-box bg-sakura-white p-0 overflow-hidden">
    <div class="px-6 py-4 border-b border-sakura-pink/20 bg-sakura-mist flex items-center justify-between">
      <h3 class="text-[11px] tracking-[0.4em] uppercase text-sakura-muted">Select Deck</h3>
      <form method="dialog">
        <button class="text-sakura-muted hover:text-sakura-text p-2">✕</button>
      </form>
    </div>
    <div class="max-h-[60vh] overflow-y-auto py-2">
      <button 
        v-for="deck in store.decks" 
        :key="deck"
        @click="handleMobileDeckSelect(deck)"
        class="w-full px-8 py-5 text-left text-[14px] tracking-wide text-sakura-text hover:bg-sakura-pink/10 transition-colors border-b border-sakura-pink/10 last:border-0"
        :class="{ 'bg-sakura-pink/20 font-medium': deck === store.currentDeck }"
      >
        {{ deck }}
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>
```

**Step 2: Add script logic for modal**
Add `openDeckModal` and `handleMobileDeckSelect` functions.
```typescript
function openDeckModal() {
    const modal = document.getElementById('deck_modal') as HTMLDialogElement
    modal?.showModal()
}

async function handleMobileDeckSelect(deckName: string) {
    if (deckName === store.currentDeck) return
    const ok = await store.selectDeck(deckName)
    if (ok) await store.fillQueue(deckName)
    const modal = document.getElementById('deck_modal') as HTMLDialogElement
    modal?.close()
}
```

**Step 3: Commit**
```bash
git add src/components/AppHeader.vue
git commit -m "feat: add mobile deck selection modal to AppHeader"
```

---

### Task 3: Visual Polish & Cleanup

**Files:**
- Modify: `src/components/AppHeader.vue`

**Step 1: Adjust Header height & text**
- Ensure "Cards Buffered" text is also responsive or abbreviated on very small screens if needed.
- Hide "Anki // 桜" title on very small screens to give more room for the deck button.

**Step 2: Commit**
```bash
git add src/components/AppHeader.vue
git commit -m "feat: polish mobile header layout"
```
