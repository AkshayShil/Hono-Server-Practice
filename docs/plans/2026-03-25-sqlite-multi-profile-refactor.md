# SQLite & Multi-Profile Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transition the app's backend from file-based JSON storage to a structured SQLite database to support multiple Anki profiles, robust card caching, and historical review tracking.

**Architecture:** A central SQLite database (`proxy/data/anki_reviewer.db`) will act as the source of truth for card metadata, FSRS scheduling, and review history. The Hono backend will manage the sync logic between Anki-Connect and the local cache, ensuring the frontend only interacts with a fast, local data source.

**Tech Stack:** Node.js v24 (`node:sqlite`), Hono (Backend), Pinia (Frontend), `ts-fsrs` (Scheduling logic).

---

### Task 1: Database Utility & Schema Initialization

**Files:**
- Create: `proxy/utils/db.ts`
- Modify: `proxy/server.ts`

**Step 1: Create the database utility and initial schema**

```typescript
// proxy/utils/db.ts
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'anki_reviewer.db');

mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

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
  `);
}
```

**Step 2: Initialize DB on server start**

In `proxy/server.ts`:
```typescript
import { initSchema } from './utils/db.ts';
initSchema();
```

**Step 3: Commit**

```bash
git add proxy/utils/db.ts proxy/server.ts
git commit -m "feat(db): initialize SQLite database and schema"
```

---

### Task 2: Data Migration (JSON to SQLite)

**Files:**
- Create: `proxy/utils/migrate.ts`
- Modify: `proxy/server.ts`

**Step 1: Write migration logic to import \`fsrs-state.json\`**

Read `proxy/data/fsrs-state.json`, iterate through keys, and insert into `fsrs_state` table. Ensure `profiles` table has at least one default profile.

**Step 2: Commit**

```bash
git add proxy/utils/migrate.ts
git commit -m "feat(db): add migration logic for legacy JSON data"
```

---

### Task 3: Backend Sync API

**Files:**
- Create: `proxy/routes/sync.ts`
- Modify: `proxy/server.ts`

**Step 1: Implement Incremental Sync logic**
- Fetch deck list from Anki.
- Compare \`mod\` timestamps.
- Fetch \`cardsInfo\` for new/updated cards.
- Update \`cards\` table.

**Step 2: Commit**

```bash
git add proxy/routes/sync.ts
git commit -m "feat(api): implement incremental sync from Anki to SQLite"
```

---

### Task 4: Update FSRS Store & Review API

**Files:**
- Modify: `proxy/routes/fsrs.ts`
- Modify: `src/stores/fsrsStore.ts`

**Step 1: Update backend endpoints to use DB**
Update `GET /fsrs/state` and `POST /fsrs/review` to query/update SQLite instead of JSON.

**Step 2: Commit**

```bash
git add proxy/routes/fsrs.ts src/stores/fsrsStore.ts
git commit -m "feat(api): migrate FSRS endpoints to SQLite"
```

---

### Task 5: Frontend UI (Sync Button & Profile Info)

**Files:**
- Modify: `src/components/AppHeader.vue`
- Modify: `src/stores/cardStore.ts`

**Step 1: Add Sync button and status indicator**
**Step 2: Trigger sync on deck selection**

**Step 3: Commit**

```bash
git add src/components/AppHeader.vue src/stores/cardStore.ts
git commit -m "feat(ui): add manual sync button and trigger sync on load"
```
