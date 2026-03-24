import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { fsrsRouter } from './fsrs'
import { db, initSchema } from '../utils/db'

describe('FSRS Server Router SQLite Tests', () => {
  const TEST_CARD_ID = 999999

  beforeAll(async () => {
    initSchema()
  })

  beforeEach(async () => {
    // 1. Ensure foreign key requirements are met
    // Profiles
    db.prepare("INSERT OR IGNORE INTO profiles (id, name) VALUES (1, 'Test Profile')").run()
    // Decks
    db.prepare("INSERT OR IGNORE INTO decks (id, profile_id, name) VALUES (1, 1, 'Test Deck')").run()
    // Cards
    db.prepare("INSERT OR IGNORE INTO cards (id, deck_id) VALUES (?, 1)").run(TEST_CARD_ID)

    // 2. Clean up FSRS tables for a clean test state
    db.prepare("DELETE FROM fsrs_state").run()
    db.prepare("DELETE FROM review_history").run()
  })

  it('handles rapid concurrent reviews without corruption', async () => {
    // Simulate 20 concurrent review requests for the SAME card
    // Since each request runs in its own transaction, they should all succeed,
    // though the final state will depend on the last one to commit.
    const requests = Array.from({ length: 20 }).map((_, i) => 
      fsrsRouter.request('/review', {
        method: 'POST',
        body: JSON.stringify({ cardId: TEST_CARD_ID, rating: (i % 4) + 1 })
      })
    )

    const responses = await Promise.all(requests)
    responses.forEach(res => expect(res.status).toBe(200))

    // Verify DB integrity
    const row = db.prepare('SELECT * FROM fsrs_state WHERE card_id = ?').get(TEST_CARD_ID) as any
    expect(row).toBeDefined()
    expect(row.reps).toBeGreaterThan(0)
    
    const history = db.prepare('SELECT count(*) as count FROM review_history WHERE card_id = ?').get(TEST_CARD_ID) as any
    expect(history.count).toBe(20)
  })

  it('properly rehydrates dates from database strings', async () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
    db.prepare(`
      INSERT INTO fsrs_state (
        card_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review
      ) VALUES (?, ?, 1, 1, 1, 1, 1, 0, 2, ?)
    `).run(TEST_CARD_ID, pastDate, pastDate)

    const res = await fsrsRouter.request('/review', {
      method: 'POST',
      body: JSON.stringify({ cardId: TEST_CARD_ID, rating: 3 })
    })

    const data = await res.json()
    // If rehydration failed, ts-fsrs would throw or return invalid results
    expect(data.card.reps).toBe(2)
    expect(new Date(data.card.last_review).getTime()).toBeGreaterThan(new Date(pastDate).getTime())
  })

  it('returns empty object when no state exists', async () => {
    const res = await fsrsRouter.request('/state')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })
})
