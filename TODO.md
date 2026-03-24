# FSRS Integration TODO

## Architecture
- Anki = card content only (question/answer/deck list). Never write scheduling back to it.
- This app owns all scheduling via ts-fsrs, persisted to `proxy/data/fsrs-state.json`
- All devices hitting the same server share the same FSRS state file

---

## Step 0 — Install

```bash
pnpm install ts-fsrs
```

Add `proxy/data/` to `.gitignore`.

---

## Step 1 — Server: `proxy/routes/fsrs.ts`

Framework is **Hono** (not Express). Follow the pattern of `proxy/routes/llm.ts`.

```ts
import { Hono } from 'hono'
import { readFile, writeFile, mkdir, rename } from 'fs/promises'
import { createEmptyCard, fsrs, Rating, type Card as FSRSCard } from 'ts-fsrs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../data')
const STATE_FILE = path.join(DATA_DIR, 'fsrs-state.json')

type StateMap = Record<string, FSRSCard>

async function readState(): Promise<StateMap> {
  try {
    const raw = await readFile(STATE_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function writeState(state: StateMap): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  // Atomic write: tmp file then rename avoids corruption on concurrent writes
  const tmp = STATE_FILE + '.tmp'
  await writeFile(tmp, JSON.stringify(state, null, 2))
  await rename(tmp, STATE_FILE)
}

export const fsrsRouter = new Hono()

// GET /fsrs/state — return full state map { [cardId]: FSRSCard }
fsrsRouter.get('/state', async (c) => {
  const state = await readState()
  return c.json(state)
})

// POST /fsrs/review — { cardId: number, rating: 1|2|3|4 }
// Returns { card: FSRSCard, log: ReviewLog }
fsrsRouter.post('/review', async (c) => {
  const { cardId, rating } = await c.req.json<{ cardId: number; rating: 1 | 2 | 3 | 4 }>()
  const key = String(cardId)
  const state = await readState()

  const existing = state[key]
  // Dates are serialised as strings — rehydrate
  const card: FSRSCard = existing
    ? {
        ...existing,
        due: new Date(existing.due),
        last_review: existing.last_review ? new Date(existing.last_review) : undefined,
      }
    : createEmptyCard()

  const ratingMap = { 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy }
  const f = fsrs()
  const result = f.next(card, new Date(), ratingMap[rating])

  state[key] = result.card
  await writeState(state)

  return c.json({ card: result.card, log: result.log })
})

// GET /fsrs/due — optional utility endpoint, not used by the client
// (client filters due cards from its cached /fsrs/state instead)
// Keep for debugging or future use.
```

---

## Step 2 — Register route in `proxy/server.ts`

Add after the existing `app.route('/api/llm', llmProxy)` line:

```ts
import { fsrsRouter } from './routes/fsrs'
// ...
app.route('/fsrs', fsrsRouter)
```

Also add to `initLogs()` (or a new `initData()`) the data dir creation:
```ts
await mkdir(path.resolve(__dirname, '../data'), { recursive: true })
```

---

## Step 3 — Client: `src/stores/fsrsStore.ts`

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Card as FSRSCard } from 'ts-fsrs'

export const useFsrsStore = defineStore('fsrs', () => {
  // Local cache of server state: cardId (as string) → FSRSCard
  const state = ref<Record<string, FSRSCard>>({})

  async function loadState(): Promise<void> {
    const res = await fetch('/fsrs/state')
    state.value = await res.json()
  }

  // Returns cardIds that are due NOW according to server-side state
  // Also returns ids with NO state yet (new cards — always due)
  function getDueIds(allCardIds: number[]): number[] {
    const now = new Date()
    return allCardIds.filter((id) => {
      const card = state.value[String(id)]
      if (!card) return true // never reviewed = due immediately
      return new Date(card.due) <= now
    })
  }

  async function submitRating(cardId: number, rating: 1 | 2 | 3 | 4): Promise<void> {
    const res = await fetch('/fsrs/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId, rating }),
    })
    const { card } = await res.json()
    state.value[String(cardId)] = card
  }

  // Returns FSRS state for a specific card (or null if unseen)
  function getCardState(cardId: number): FSRSCard | null {
    return state.value[String(cardId)] ?? null
  }

  return { state, loadState, getDueIds, submitRating, getCardState }
})
```

---

## Step 4 — Refactor `src/stores/cardStore.ts`

### 4a. `fillQueue` — fetch ALL cards, filter by FSRS due

**Current** query: `deck:"${targetDeck}" (is:due OR is:new)`
**New** query: `deck:"${targetDeck}"`

After getting all cardIds from Anki, filter them through `fsrsStore.getDueIds()`.
Also exclude cards already in `processedCards` (submitted but not yet rated — FSRS hasn't been called for them yet, so they'd still appear due):

```ts
// After: const cardIds = await invoke<number[]>('findCards', { query })
const fsrsStore = useFsrsStore()
const dueIds = fsrsStore.getDueIds(cardIds)

const existingIds = new Set(cardQueue.value.map((c) => c.cardId))
const processedIds = new Set(processedCards.value.map((c) => c.cardId))  // <-- add this
const freshIds = dueIds.filter((id) => !existingIds.has(id) && !processedIds.has(id))  // <-- exclude both
// Use freshIds for the cardsInfo call (replaces current freshIds logic)
```

### 4b. `cardType` — derive from FSRS state instead of Anki queue

**Current**: reads `raw.queue` from AnkiConnect cardsInfo
**New**: map FSRS `State` enum (0=New, 1=Learning, 2=Review, 3=Relearning):

```ts
import { State as FSRSState } from 'ts-fsrs'

// In the cards.map():
const fsrsCard = fsrsStore.getCardState(raw.cardId)
const fsrsState = fsrsCard?.state ?? FSRSState.New
const cardType: 'new' | 'learn' | 'review' =
  fsrsState === FSRSState.New ? 'new'
  : fsrsState === FSRSState.Review ? 'review'
  : 'learn'  // Learning + Relearning both map to 'learn'
```

### 4c. `sendRating` — replace AnkiConnect `answerCards` with FSRS

**Current** `sendRating` calls `answerCard` which calls AnkiConnect `answerCards`.
**New**: call `fsrsStore.submitRating()` instead.

```ts
async function sendRating(cardId: number, ease: number): Promise<void> {
  const fsrs = useFsrsStore()
  await fsrs.submitRating(cardId, ease as 1 | 2 | 3 | 4)
  // Remove card from queue (keep this part)
  const index = cardQueue.value.findIndex((c) => c.cardId === cardId)
  if (index > -1) cardQueue.value.splice(index, 1)
  // Mark as rated in history (keep this part)
  const entry = processedCards.value.find((c) => c.cardId === cardId)
  if (entry) entry.rated = true
  // Refill if low (keep this part)
  if (cardQueue.value.length < QUEUE_REFILL_THRESHOLD && currentDeck.value) {
    void fillQueue(currentDeck.value)
  }
}
```

### 4d. `answerCard` — keep only for suspend/bury, remove scheduling use

`answerCard` (the raw AnkiConnect `answerCards` caller) is no longer called for normal rating.
Keep it only if you want to log to Anki for completeness — otherwise delete it.

### 4e. `selectDeck` — remove `guiDeckReview` call

`guiDeckReview` tells Anki's GUI to open the deck. Since we're decoupled, remove it:
```ts
async function selectDeck(deckName: string): Promise<boolean> {
  cardQueue.value = []
  currentDeck.value = deckName
  return true
}
```

### 4f. `init` — load FSRS state on startup

```ts
async function init(): Promise<void> {
  const fsrs = useFsrsStore()
  await fsrs.loadState()   // <-- add this line
  // ... rest of existing deck loading
}
```

---

## Step 5 — No UI changes needed

`Carddetaildialog.vue` already has `RATINGS` with values 1/2/3/4 (Again/Hard/Good/Easy).
These map directly to ts-fsrs `Rating.Again=1, Hard=2, Good=3, Easy=4`. No change required.

The `cardType` chip (`new` / `learn` / `review`) still works — it's now driven by FSRS state.

---

## Integration Checklist (verify these work end-to-end)

- [ ] `npm install ts-fsrs` succeeds
- [ ] Server starts without error; `proxy/data/` dir is created automatically
- [ ] `GET /fsrs/state` returns `{}` on first run
- [ ] `POST /fsrs/review` with a cardId creates an entry in `fsrs-state.json`
- [ ] Second device accessing same server URL sees same FSRS state
- [ ] `fillQueue` now returns only FSRS-due cards (not Anki's due filter)
- [ ] New cards (no FSRS entry yet) appear in queue immediately
- [ ] After rating a card, it disappears from queue and its FSRS state is updated in the file
- [ ] `cardType` badge shows correct value (new/learn/review) based on FSRS state
- [ ] `resetSession` still works (clears queue/history, refetches from Anki+FSRS)
- [ ] Anki's own scheduling is completely untouched (no `answerCards` calls)

---

## Notes

- `ts-fsrs` dates must be rehydrated from strings after JSON parse (see Step 1 server code)
- Atomic write (tmp → rename) prevents JSON corruption if server is killed mid-write
- The `fsrs-state.json` file is the source of truth. Back it up if needed.
- `proper-lockfile` npm package can be added later if heavy concurrent write load is expected
- `QUEUE_REFILL_THRESHOLD = 5` is still valid — no change needed
- LLM analysis pipeline (`submitReview`, `retryAnalysis`, `syncAnalysisToServer`) is **completely unchanged**
