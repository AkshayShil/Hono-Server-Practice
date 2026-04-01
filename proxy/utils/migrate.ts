import { db } from './db';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// data dir is one level up from utils
const DATA_DIR = path.resolve(__dirname, '../data');
// analysis_logs is two levels up from utils
const LOGS_DIR = path.resolve(__dirname, '../../analysis_logs');

interface LegacyFsrsState {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}

export function migrate() {
  console.log('[Migrate] Checking for legacy data to migrate...');

  // 1. Ensure Default Profile exists
  let profile = db.prepare('SELECT id FROM profiles WHERE name = ?').get('Default Profile') as { id: number } | undefined;
  if (!profile) {
    db.prepare('INSERT INTO profiles (name) VALUES (?)').run('Default Profile');
    profile = db.prepare('SELECT id FROM profiles WHERE name = ?').get('Default Profile') as { id: number };
    console.log('[Migrate] Created Default Profile');
  }
  const profileId = profile.id;

  // 2. Ensure Default Deck (id 0) exists
  const deck = db.prepare('SELECT id FROM decks WHERE id = 0').get() as { id: number } | undefined;
  if (!deck) {
    db.prepare('INSERT INTO decks (id, profile_id, name) VALUES (?, ?, ?)').run(0, profileId, 'Default Deck');
    console.log('[Migrate] Created Default Deck (id 0)');
  }

  // 3. Migrate FSRS state from fsrs-state.json
  const fsrsPath = path.join(DATA_DIR, 'fsrs-state.json');
  if (fs.existsSync(fsrsPath)) {
    try {
      const fsrsData = JSON.parse(fs.readFileSync(fsrsPath, 'utf-8'));
      const insertCard = db.prepare('INSERT OR IGNORE INTO cards (id, deck_id) VALUES (?, ?)');
      const insertFsrs = db.prepare(`
        INSERT OR IGNORE INTO fsrs_state (
          card_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let count = 0;
      for (const [cardIdStr, state] of Object.entries(fsrsData)) {
        const cardId = parseInt(cardIdStr);
        const s = state as LegacyFsrsState;
        insertCard.run(cardId, 0); // Use deck 0 as placeholder
        insertFsrs.run(
          cardId,
          s.due,
          s.stability,
          s.difficulty,
          s.elapsed_days,
          s.scheduled_days,
          s.reps,
          s.lapses,
          s.state,
          s.last_review
        );
        count++;
      }
      console.log(`[Migrate] Migrated ${count} FSRS states from fsrs-state.json`);
    } catch (err) {
      console.error('[Migrate] Error migrating FSRS state:', err);
    }
  }

  // 4. Migrate logs from analysis_logs/
  if (fs.existsSync(LOGS_DIR)) {
    try {
      const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.jsonl'));
      const insertCard = db.prepare('INSERT OR IGNORE INTO cards (id, deck_id) VALUES (?, ?)');
      const insertReview = db.prepare(`
        INSERT OR IGNORE INTO review_history (
          id, card_id, rating, review_date, fsrs_snapshot
        ) VALUES (?, ?, ?, ?, ?)
      `);

      let totalReviews = 0;
      for (const file of files) {
        const filePath = path.join(LOGS_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const log = JSON.parse(line);
            const cardId = log.cardId;
            if (!cardId) continue;

            const reviewDate = log.serverTimestamp || log.clientTimestamp || new Date().toISOString();
            // Generate a stable ID for the review to avoid duplicates if migration runs twice
            const reviewId = `migrated-${cardId}-${reviewDate}`;

            insertCard.run(cardId, 0);
            insertReview.run(
              reviewId,
              cardId,
              log.rating || 0,
              reviewDate,
              JSON.stringify(log) // Snapshot the whole log entry as it contains analysis
            );
            totalReviews++;
          } catch {
            // Skip invalid lines
          }
        }
      }
      console.log(`[Migrate] Migrated ${totalReviews} reviews from ${files.length} log files`);
    } catch (err) {
      console.error('[Migrate] Error migrating logs:', err);
    }
  }
}
