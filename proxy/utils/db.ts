import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'anki_reviewer.db');

mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

// Enable foreign key constraints and WAL journal mode
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      last_synced_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS decks (
      id INTEGER PRIMARY KEY,
      profile_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      anki_mod INTEGER,
      config TEXT,
      FOREIGN KEY (profile_id) REFERENCES profiles(id)
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY,
      deck_id INTEGER NOT NULL,
      model_id INTEGER,
      model_name TEXT,
      ord INTEGER,
      fields TEXT, -- JSON
      tags TEXT, -- JSON
      anki_mod INTEGER,
      content_hash TEXT,
      type INTEGER,
      queue INTEGER,
      is_archived INTEGER DEFAULT 0,
      FOREIGN KEY (deck_id) REFERENCES decks(id)
    );

    CREATE TABLE IF NOT EXISTS fsrs_state (
      card_id INTEGER PRIMARY KEY,
      due DATETIME NOT NULL,
      stability REAL NOT NULL,
      difficulty REAL NOT NULL,
      elapsed_days INTEGER NOT NULL,
      scheduled_days INTEGER NOT NULL,
      reps INTEGER NOT NULL,
      lapses INTEGER NOT NULL,
      state INTEGER NOT NULL,
      last_review DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (card_id) REFERENCES cards(id)
    );

    CREATE TABLE IF NOT EXISTS review_history (
      id TEXT PRIMARY KEY,
      card_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      review_date DATETIME NOT NULL,
      review_duration_ms INTEGER,
      fsrs_snapshot TEXT, -- JSON
      FOREIGN KEY (card_id) REFERENCES cards(id)
    );

    CREATE TABLE IF NOT EXISTS anki_sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      profile_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      synced_at DATETIME
    );
  `);
}
