import { Hono } from 'hono'
import { createEmptyCard, fsrs, Rating, type Card as FSRSCard } from 'ts-fsrs'
import { db } from '../utils/db'
import crypto from 'node:crypto'

export const fsrsRouter = new Hono()

// GET /fsrs/state — return full state map { [cardId]: FSRSCard }
fsrsRouter.get('/state', async (c) => {
  try {
    const rows = db.prepare('SELECT * FROM fsrs_state').all() as any[]
    const state: Record<string, FSRSCard> = {}
    
    for (const row of rows) {
      state[String(row.card_id)] = {
        due: new Date(row.due),
        stability: row.stability,
        difficulty: row.difficulty,
        elapsed_days: row.elapsed_days,
        scheduled_days: row.scheduled_days,
        reps: row.reps,
        lapses: row.lapses,
        state: row.state,
        last_review: row.last_review ? new Date(row.last_review) : undefined,
      }
    }
    
    return c.json(state)
  } catch (error: any) {
    console.error('[FSRS] GET /state failed:', error)
    return c.json({ error: error.message }, 500)
  }
})

// POST /fsrs/review — { cardId: number, rating: 1|2|3|4 }
// Returns { card: FSRSCard, log: ReviewLog }
fsrsRouter.post('/review', async (c) => {
  try {
    const { cardId, rating } = await c.req.json<{ cardId: number; rating: 1 | 2 | 3 | 4 }>()
    
    const row = db.prepare('SELECT * FROM fsrs_state WHERE card_id = ?').get(cardId) as any
    
    const card: FSRSCard = row
      ? {
          due: new Date(row.due),
          stability: row.stability,
          difficulty: row.difficulty,
          elapsed_days: row.elapsed_days,
          scheduled_days: row.scheduled_days,
          reps: row.reps,
          lapses: row.lapses,
          state: row.state,
          last_review: row.last_review ? new Date(row.last_review) : undefined,
        }
      : createEmptyCard()

    const ratingMap = { 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy }
    const f = fsrs()
    const now = new Date()
    const result = f.next(card, now, ratingMap[rating])
    
    const nextCard = result.card
    const reviewId = crypto.randomUUID()

    db.exec('BEGIN TRANSACTION')
    try {
      // Update fsrs_state table (using INSERT OR REPLACE)
      db.prepare(`
        INSERT OR REPLACE INTO fsrs_state (
          card_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        cardId,
        nextCard.due.toISOString(),
        nextCard.stability,
        nextCard.difficulty,
        nextCard.elapsed_days,
        nextCard.scheduled_days,
        nextCard.reps,
        nextCard.lapses,
        nextCard.state,
        nextCard.last_review?.toISOString() ?? null
      )

      // Insert into review_history table
      db.prepare(`
        INSERT INTO review_history (id, card_id, rating, review_date, fsrs_snapshot)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        reviewId,
        cardId,
        rating,
        now.toISOString(),
        JSON.stringify(nextCard)
      )

      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }

    return c.json({ card: nextCard, log: result.log })
  } catch (error: any) {
    console.error('[FSRS] POST /review failed:', error)
    return c.json({ error: error.message }, 500)
  }
})
