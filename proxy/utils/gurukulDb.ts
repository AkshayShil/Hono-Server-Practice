import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'gurukul.db');

mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

// Enable foreign key constraints and WAL journal mode
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gurukul_sessions (
      id TEXT PRIMARY KEY,             -- UUID
      file_path TEXT NOT NULL,         -- e.g. "history/ancient-india.md"
      section_title TEXT,              -- active section title; NULL if whole file
      section_content TEXT,            -- first 500 chars of section (for assessment context)
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      message_count INTEGER DEFAULT 0,
      auto_summary TEXT,               -- ~100 word LLM summary, generated when session ends
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS gurukul_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES gurukul_sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_gurukul_sessions_file ON gurukul_sessions(file_path);
    CREATE INDEX IF NOT EXISTS idx_gurukul_messages_session ON gurukul_messages(session_id);
  `);
}
