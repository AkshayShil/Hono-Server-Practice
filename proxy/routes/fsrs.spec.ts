import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fsrsRouter } from './fsrs'
import { readFile, writeFile, rm, mkdir } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../data')
const STATE_FILE = path.join(DATA_DIR, 'fsrs-state.json')

describe('FSRS Server Router Stress Tests', () => {
  beforeEach(async () => {
    await mkdir(DATA_DIR, { recursive: true })
    await writeFile(STATE_FILE, JSON.stringify({}))
  })

  afterEach(async () => {
    try {
      await rm(STATE_FILE, { force: true })
    } catch (e) {}
  })

  it('handles rapid concurrent reviews without corruption', async () => {
    const cardId = 999
    // Simulate 20 concurrent review requests for the SAME card
    // Note: FSRS state depends on the previous state, so concurrent updates 
    // to the same card ID in a real world "race" would result in the last write winning.
    // Here we test that the FILE remains valid JSON and the server doesn't crash.
    const requests = Array.from({ length: 20 }).map((_, i) => 
      fsrsRouter.request('/review', {
        method: 'POST',
        body: JSON.stringify({ cardId, rating: (i % 4) + 1 })
      })
    )

    const responses = await Promise.all(requests)
    responses.forEach(res => expect(res.status).toBe(200))

    // Verify file integrity
    const content = await readFile(STATE_FILE, 'utf-8')
    const state = JSON.parse(content)
    expect(state).toHaveProperty(String(cardId))
    expect(state[String(cardId)].reps).toBeGreaterThan(0)
  })

  it('properly rehydrates dates from JSON strings', async () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
    await writeFile(STATE_FILE, JSON.stringify({
      "123": {
        due: pastDate,
        stability: 1,
        difficulty: 1,
        elapsed_days: 1,
        scheduled_days: 1,
        reps: 1,
        lapses: 0,
        state: 2, // Review
        last_review: pastDate
      }
    }))

    const res = await fsrsRouter.request('/review', {
      method: 'POST',
      body: JSON.stringify({ cardId: 123, rating: 3 })
    })

    const data = await res.json()
    // If rehydration failed, ts-fsrs would throw or return invalid results
    expect(data.card.reps).toBe(2)
    expect(new Date(data.card.last_review).getTime()).toBeGreaterThan(new Date(pastDate).getTime())
  })

  it('returns empty object when state file is missing', async () => {
    await rm(STATE_FILE, { force: true })
    const res = await fsrsRouter.request('/state')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })
})
