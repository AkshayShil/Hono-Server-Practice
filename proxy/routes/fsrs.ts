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
  const tmp = STATE_FILE + '.' + Math.random().toString(36).slice(2) + '.tmp'
  
  // Retry loop for concurrent renames
  let attempts = 0
  const maxAttempts = 5
  
  while (attempts < maxAttempts) {
    try {
      await writeFile(tmp, JSON.stringify(state, null, 2))
      await rename(tmp, STATE_FILE)
      return
    } catch (err) {
      attempts++
      if (attempts >= maxAttempts) throw err
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50 * attempts))
    }
  }
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
