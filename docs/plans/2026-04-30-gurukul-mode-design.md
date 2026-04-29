# Gurukul Mode — Implementation Plan

## Context

The app is an Anki study reviewer (Vue 3 + Pinia + Hono proxy). This adds a second "mode" alongside the existing Anki study flow — a **Gurukul teaching mode** where the LLM teaches the student Socratically from their own markdown notes. The student reads the notes on one side and answers questions from the Guru on the other. Token minimization is a core requirement.

---

## Layout

Gurukul mode reuses the same 3-column `grid-cols-12` layout as Study mode:

```
[ File Browser ]  [    Q&A Chat (Guru)    ]  [ Markdown Reader ]
  col-span-2              col-span-6               col-span-4
```

- **Left — File Browser**: Folder picker + flat file list (md/txt only)
- **Center — Q&A Chat**: Socratic conversation between Guru (LLM) and Student
- **Right — Markdown Reader**: Renders selected file; section nav at top; "Quiz →" button per section

On mobile: show only center pane by default; left/right accessible via swipe or tabs.

---

## Mode Switching

Add a `Study | Gurukul` toggle in `AppHeader.vue`. Mode state lives in a tiny shared ref:

```ts
// src/stores/appMode.ts
import { ref } from 'vue'
export type AppMode = 'study' | 'gurukul'
export const appMode = ref<AppMode>('study')
```

`App.vue` uses `v-if`/`v-else` on `appMode` to swap between the two layout variants. No router changes needed.

---

## Token Optimization Techniques

### 1. Section-only context (biggest saving)
Parse the markdown file into H1/H2/H3 sections. The system prompt injects **only the active section** (not the whole file), capped at **4,000 chars (~1,000 tokens)**; minimum meaningful section is ~2,800 chars (~700 tokens). Whole-file injection would be 5–20× more tokens.

```ts
function parseSections(md: string): NoteSection[]
// Detects headings:
//   1. ATX headings:     /^#{1,3}\s+.+/m  (# ## ###)
//   2. Setext headings:  /^.+\n[=\-]{3,}/m  (underline with === or ---)
// Filters out sections with < 20 chars of content (skip stubs)
// If NO headings found: returns single section with full file content
```

### 2. History compression (after 8 turns)
The **UI always shows the full conversation**. The API payload uses a compressed version:
- Messages beyond the last 4 are summarized into a single 2-message "summary pair"
- Summary pair: `[user: "Earlier discussion: ..."] [assistant: "Understood. Continuing."]`
- Last 4 messages are sent in full

This keeps the API payload nearly constant regardless of conversation length.

```ts
function compressedMessages(): ChatMessage[] {
  if (messages.value.length <= 8) return messages.value
  const recent = messages.value.slice(-4)
  const older = messages.value.slice(0, -4)
  const summary = older
    .map(m => `${m.role === 'user' ? 'Student' : 'Guru'}: ${m.content.replace(/\n+/g, ' ').slice(0, 120)}`)
    .join('\n')
  return [
    { role: 'user', content: `[Earlier discussion]\n${summary}` },
    { role: 'assistant', content: 'Understood. Continuing.' },
    ...recent,
  ]
}
```

### 3. Guru max_tokens = 350
Enforced at the proxy. Guru questions are short by design — prevents runaway responses.

### 4. Trigger message not stored in UI
Session start sends `[{ role: 'user', content: 'Begin.' }]` to the API (so all providers get a valid non-empty messages array). This trigger is **not pushed to** `messages.value`, so it never shows in the UI chat.

### 5. Temperature = 0.7
Slightly higher than the analyzer (0.3) for natural teaching tone, but not max.

---

## System Prompt

```ts
const GURU_SYSTEM = (sectionContent: string) => `
You are a Guru teaching through the Socratic method, as in a Gurukul.

RULES:
- Ask ONE focused question at a time based only on the notes below.
- After the student answers: 1 sentence acknowledging right/wrong, then ask the next question.
- Escalate: recall → understanding → application.
- Never lecture unprompted. If asked to explain, give max 4 lines then ask a question.
- Stay within the notes. Never introduce outside knowledge.
- All responses under 120 words.

[NOTES]
${sectionContent.slice(0, 4000)}
[/NOTES]

Begin by asking your first question.`.trim()
```

---

## Files to Create

### `src/stores/appMode.ts`
Single exported ref: `appMode: Ref<'study' | 'gurukul'>`. Imported by `App.vue` and `AppHeader.vue`.

### `src/stores/gurukulStore.ts`

**Types:**
```ts
interface NoteFile    { name: string; path: string; content: string }
interface NoteSection { level: number; title: string; content: string; startLine: number }
interface ChatMessage { role: 'user' | 'assistant'; content: string }
```

**State:**
- `files: Ref<NoteFile[]>` — loaded from folder picker
- `selectedFile: Ref<NoteFile | null>`
- `sections: ComputedRef<NoteSection[]>` — derived from `selectedFile.content`
- `activeSection: Ref<NoteSection | null>` — section loaded into Guru context
- `messages: Ref<ChatMessage[]>` — full conversation (UI display only)
- `isThinking: Ref<boolean>`
- `error: Ref<string | null>`
- `sessionStarted: Ref<boolean>`

**Methods:**
- `openFolder()` — File System Access API (`showDirectoryPicker()`); catches cancellation silently
- `loadFilesFromInput(fileList: FileList)` — fallback for Firefox / older Safari
- `selectFile(file)` — sets selectedFile, resets session state
- `selectSection(section)` — sets activeSection, resets session state
- `startSession()` — sends `[{role:'user', content:'Begin.'}]` to proxy, pushes Guru's first question to `messages`
- `sendMessage(text)` — pushes user msg to `messages`, calls proxy with `compressedMessages()`, pushes Guru response
- `resetSession()` — clears `messages`, `sessionStarted`, `error`

**Proxy base URL:** `const PROXY_BASE_URL = window.location.origin` (same pattern as llmStore)

### `src/components/GurukulFileBrowser.vue`
Left pane. Matches `QueuePane.vue` visual style.

- Header: "Notes" label + file count badge (same as Queue pane header)
- "Open Folder" button — tries FSA API; if unavailable or cancelled, triggers hidden file input
- Hidden `<input type="file" accept=".md,.txt" multiple webkitdirectory ref="fileInput">` as fallback
- File list: `file.path` as label; active file uses `glass-card--active` class (reused from QueuePane)
- Group files by first directory segment (show folder name as a small label above group)
- Empty state: same ∅ icon pattern as QueuePane

**Lazy loading:** On folder scan, store only `{ name: string, path: string, fileHandle: File }` — no content read yet. Content (`fileHandle.text()`) is fetched only when user clicks a file. Fast for large folders.

### `src/components/GurukulReader.vue`
Right pane. Shows selected file content.

- **Section nav** at top: horizontal scrollable pill list of section titles; active pill is filled sakura-pink; clicking scrolls to section + calls `gurukulStore.selectSection(s)`
- Each pill has a small `▶` quiz button on hover
- **Content**: full markdown rendered with `marked` via `v-html`
- **Placeholder**: "Select a file from the left panel" when no file selected
- Uses `watch(selectedFile)` to re-render when file changes

**Active section highlight (aesthetic choice):**
The currently quizzed section is visually separated from the rest of the document:
- A semi-transparent sakura-pink overlay layer (`bg-pink-100/30 dark:bg-pink-900/20`) wraps the active section's content block
- A 2px left border in the sakura accent color marks the section start
- All other sections are dimmed slightly (`opacity-50`) — the active section "comes forward"
- A sticky "Now studying" label at the top of the reader shows the active section title in small caps
- Smooth scroll to the active section heading on section change (`scrollIntoView({ behavior: 'smooth' })`)

### `src/components/GurukulChat.vue`
Center pane. The main teaching interface.

- **Placeholder state** (no session): centered instruction text — "Select a section and click Quiz → to begin"
- **Header**: active section title + small "↺ New Session" reset button
- **Message list**: 
  - Guru messages — left-aligned, subtle `bg-sakura-mist` bubble
  - Student messages — right-aligned, `bg-white` bubble with border
  - Thinking indicator: three animated dots when `isThinking`
  - Error banner when `error` is set
- **Input area** (bottom):
  - `<textarea>` — `Enter` submits, `Shift+Enter` inserts newline
  - Send button (disabled when `isThinking` or empty)
- `watch(messages)` → `nextTick` → scroll message list to bottom on new message

---

## Files to Modify

### `proxy/routes/llm.ts`
Add a `/gurukul` POST endpoint **after** the existing `/call` route.

**Request body:**
```ts
{
  provider: { id: string; baseUrl: string; requiresKey: boolean; label: string },
  model: { id: string; tokenParam?: string; fixedSampling?: boolean },
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  customBaseUrl?: string
}
```

**Constant at top of file (add alongside `INFERENCE_DEFAULTS`):**
```ts
const GURU_MAX_TOKENS = 350
```

**Per-provider call logic:**

Anthropic:
```ts
body: { model, max_tokens: GURU_MAX_TOKENS, temperature: 0.7, system: systemPrompt, messages }
```

Google — map `assistant` → `model` role:
```ts
const contents = messages.map(m => ({
  role: m.role === 'assistant' ? 'model' : 'user',
  parts: [{ text: m.content }],
}))
// generationConfig: { maxOutputTokens: GURU_MAX_TOKENS, temperature: 0.7 }
```

OpenAI — use `/chat/completions` (not `/responses` which is the single-turn endpoint):
```ts
messages: [{ role: 'system', content: systemPrompt }, ...messages]
// max_tokens: GURU_MAX_TOKENS, temperature: 0.7
```

OpenAI-compat (openrouter, deepseek, ollama) — same as OpenAI chat completions.

**Note:** The existing `callAnthropic`, `callGoogle`, `callOpenAI`, `callOpenAICompat` helpers are single-turn only. The gurukul endpoint implements its own inline fetch calls to avoid refactoring the existing helpers.

### `src/App.vue`

1. Import `appMode` from `./stores/appMode`
2. Import `GurukulFileBrowser`, `GurukulChat`, `GurukulReader`
3. Wrap existing main grid in `<template v-if="appMode === 'study'">`
4. Add `<template v-else>` with Gurukul grid:

```html
<main class="flex-1 grid grid-cols-12 w-full overflow-hidden min-h-0">
  <GurukulFileBrowser class="hidden md:flex md:col-span-2" />
  <GurukulChat class="col-span-12 md:col-span-6" />
  <GurukulReader class="hidden md:flex md:col-span-4" />
</main>
```

### `src/components/AppHeader.vue`

Add a mode toggle pill between the logo `h1` and the existing Sync/Reset/Deck controls:

```html
<div class="hidden md:flex items-center border border-white/20 overflow-hidden">
  <button @click="appMode = 'study'"
    class="px-3 py-1 text-[9px] tracking-[0.3em] uppercase transition-colors"
    :class="appMode === 'study' ? 'bg-white/20 text-sakura-white' : 'text-sakura-white/40 hover:text-sakura-white/70'">
    Study
  </button>
  <button @click="appMode = 'gurukul'"
    class="px-3 py-1 text-[9px] tracking-[0.3em] uppercase transition-colors"
    :class="appMode === 'gurukul' ? 'bg-white/20 text-sakura-white' : 'text-sakura-white/40 hover:text-sakura-white/70'">
    Gurukul
  </button>
</div>
```

---

## File System Access API Notes

- `showDirectoryPicker()`: Chrome 86+, Edge 86+, Safari 15.2+ (partial)
- Firefox: no support — use `<input webkitdirectory>` fallback
- `webkitRelativePath` on each File object gives `folder/subfolder/file.md` for path reconstruction
- `readDirectory()` recursively reads subdirectories, collects `.md` and `.txt` files only

---

## Chat Persistence & Progress Assessment

### Overview

Gurukul uses its **own separate SQLite DB** at `proxy/data/gurukul.db` — completely isolated from `anki_reviewer.db`. Managed by a new `proxy/utils/gurukulDb.ts` utility (same `DatabaseSync` pattern, separate file). No risk of interfering with Anki sync, FSRS state, or profiles.

The student can optionally allow the LLM to review past sessions to surface weaknesses across sessions.

---

### Database Schema (`proxy/utils/gurukulDb.ts` → `initSchema()`)

```sql
-- One row per Gurukul teaching session
CREATE TABLE IF NOT EXISTS gurukul_sessions (
  id TEXT PRIMARY KEY,             -- UUID (generated client-side, same pattern as review_history)
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

-- Individual messages within a session
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
```

---

### Session Lifecycle

Sessions stay **open until the student explicitly closes them** — tab close does NOT end a session. This allows resuming across browser restarts.

1. **Session starts** (`startSession()`) → `POST /api/gurukul/sessions` → creates row (`ended_at = NULL`), returns `id` → stored as `currentSessionId` in `localStorage` key `gurukul:activeSessionId`
2. **Each message** → `POST /api/gurukul/sessions/:id/messages` → inserted immediately (both Guru and Student messages)
3. **On app load** → check `localStorage` for `gurukul:activeSessionId` → if found, `GET /api/gurukul/sessions/:id/messages` → restore `messages` array → offer resume banner: *"Resume your session on §[section]?"* with Resume / Discard buttons
4. **Session closes** (student clicks "End Session" explicitly):
   - If `message_count >= 4`: trigger auto-summary (async) → show "Saving…" indicator → once saved, clear state
   - If `message_count < 4`: close immediately, no summary
   - Either way: set `ended_at`, clear `localStorage` key

**Auto-summary generation:**
- Triggered on explicit session close if `message_count >= 4`
- Takes last 10 messages only (not full history)
- Uses **whatever LLM provider + model is currently selected** in the app settings
- Result (~100 words) stored in `auto_summary`; then LanceDB upsert (best-effort)
- `PUT /api/gurukul/sessions/:id/end` handles SQLite write → LanceDB upsert in sequence

**Summary prompt:**
```
Summarize this teaching session in under 80 words.
Focus on: topics covered, where the student showed confusion or errors, what they understood well.
Plain text only, no headers or bullets.

Session:
{last 10 messages formatted as "Guru: ..." / "Student: ..."}
```

---

### New Proxy Route File: `proxy/routes/gurukul.ts`

Separate from `llm.ts` to keep LLM inference separate from data persistence.

**Routes:**

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/gurukul/sessions` | Create new session |
| `PUT` | `/api/gurukul/sessions/:id/end` | Close session, store summary |
| `GET` | `/api/gurukul/sessions` | List sessions (query: `?filePath=&limit=20`) |
| `POST` | `/api/gurukul/sessions/:id/messages` | Save a message |
| `GET` | `/api/gurukul/sessions/:id/messages` | Load full transcript |
| `POST` | `/api/gurukul/assess` | Run cross-session LLM assessment |

Register in `proxy/server.ts` as `app.route('/api/gurukul', gurukulRouter)`.

---

### Progress Assessment Feature

**Student consent toggle** (stored in `localStorage` key `gurukul:allowAssessment`):
- Default: **off** (privacy-first)
- Exposed in `LLMSettings.vue` or a new small settings area in `GurukulChat.vue` header
- When off: "Assess Progress" button is hidden

**`POST /api/gurukul/assess` request body:**
```ts
{
  filePath?: string,        // scope to one file, or omit for all topics
  provider: ProviderConfig,
  model: ModelOption,
  customBaseUrl?: string
}
```

**Assessment logic (server-side):**
1. Fetch last 15 `auto_summary` values for the given `filePath` (or all) — summaries only, never full transcripts
2. Build a compact assessment prompt (~1200 tokens total input max)
3. Call LLM, `max_tokens: 400`
4. Return structured response

**Assessment prompt:**
```
You are reviewing a student's recent Gurukul learning sessions.
Below are session summaries (most recent first).

[SUMMARIES]
{summaries joined with ---}
[/SUMMARIES]

Identify:
1. Recurring weaknesses (topics they consistently struggle with)
2. Topics they have clearly improved on across sessions
3. One concrete recommendation for their next session

Under 200 words. Plain numbered list.
```

---

### Start-of-Session Weakness Hint (optional, respects consent toggle)

When `allowAssessment` is on and a new session starts on a file the student has studied before:
- Fetch last 3 `auto_summary` values for that `file_path + section_title`
- Inject into Guru system prompt as an extra context block:

```
[PRIOR SESSION CONTEXT]
Student has studied this section before. Known weaknesses from past sessions:
{summaries}
Adjust your questioning to probe these weak areas.
[/PRIOR SESSION CONTEXT]
```

This costs ~200 extra tokens per session when enabled — well worth the personalization.

---

### `gurukulStore.ts` Additions

New state:
- `currentSessionId: Ref<string | null>`
- `allowAssessment: Ref<boolean>` — synced to `localStorage`
- `assessmentResult: Ref<string | null>`
- `isAssessing: Ref<boolean>`
- `pastSessionsForFile: Ref<SessionSummary[]>`

New methods:
- `createSession()` — called inside `startSession()`, POSTs to `/api/gurukul/sessions`
- `persistMessage(msg)` — called inside `sendMessage()` and after Guru response
- `endSession()` — called on `resetSession()` / `selectSection()` / `selectFile()`; PUTs to end endpoint
- `assessProgress(filePath?)` — POSTs to `/api/gurukul/assess`, stores result in `assessmentResult`
- `loadPastSessions(filePath)` — GETs session list for the history UI

New type:
```ts
interface SessionSummary {
  id: string
  sectionTitle: string | null
  messageCount: number
  autoSummary: string | null
  startedAt: string
}
```

---

### UI Additions

**`GurukulChat.vue` header area:**
- Small "History" toggle button (clock icon) → expands a thin panel above the message list showing `pastSessionsForFile` as compact cards (date + section + message count + first line of summary)
- "Assess Progress" button (only visible when `allowAssessment` is on) → calls `assessProgress()` → result shown in a modal or inline panel
- Settings gear icon → toggles the `allowAssessment` consent toggle inline

**Past session card:**
```
[Apr 28]  §Constitutional Amendments  · 12 turns
"Student recalled Article 368 correctly but confused...
```

Clicking a past session card loads its full transcript (`GET /api/gurukul/sessions/:id/messages`) in a read-only overlay — so student can review what was discussed.

---

## Vector Search with LanceDB (Dual-DB)

### Why

SQLite summaries are great for listing recent sessions by `file_path`. But they can't find **semantically related sessions** — e.g., the student studied "Fundamental Rights" and "Constitutional Amendments" in separate files, and both are relevant when starting a new session on "Doctrine of Basic Structure." LanceDB adds this cross-topic relevance layer.

### Dual-DB architecture

| Store | What it holds | Query pattern |
|-------|--------------|---------------|
| SQLite | Raw sessions, messages, summaries | `WHERE file_path = ? ORDER BY started_at DESC` |
| LanceDB | Vector embeddings of `auto_summary` text | Nearest-neighbour search by query embedding |

LanceDB is **derived data** — it indexes the `auto_summary` text from SQLite. If the LanceDB index is lost or corrupted it can be rebuilt from SQLite without data loss.

### Package

Already added to `package.json`: `@lancedb/lancedb` + `apache-arrow` (peer dep).

Storage: `proxy/data/lancedb/` (alongside `proxy/data/gurukul.db`). Add to `.gitignore`.

### Embedding model

**Gemini `text-embedding-004`** — the only embedder.

- API: `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent`
- Auth: reuses the existing `GOOGLE_API_KEY` env var — no extra setup if the user already has Gemini chat enabled
- Output: 768-dim vectors
- Free tier: 1,500 requests/min (generous for personal use)
- Anthropic has **no embedding API** — not an option

Note: `taskType: "RETRIEVAL_DOCUMENT"` when indexing summaries; `taskType: "RETRIEVAL_QUERY"` when embedding a search query. Gemini's embedding API requires this distinction for best quality.

If `GOOGLE_API_KEY` is absent → log a warning, skip LanceDB indexing entirely, fall back to SQLite-only queries. No hard crash.

### LanceDB table schema

One row per **file** — not per session. When a session on a file ends and a summary is generated, the existing row for that file is **replaced** (upsert by `file_path`).

```ts
// Stored in LanceDB table "gurukul_files"
interface FileVector {
  file_path: string         // PRIMARY key for upsert — e.g. "history/ancient-india.md"
  combined_summary: string  // text that was embedded (see below)
  session_count: number     // how many sessions contributed
  last_updated: string      // ISO datetime of last upsert
  vector: Float32Array      // embedding of combined_summary
}
```

**`combined_summary` construction** — built server-side on each upsert:
1. Fetch the last 5 `auto_summary` values for this `file_path` from SQLite (most recent first)
2. Concatenate them separated by `\n---\n` (max ~500 words total)
3. Embed the result — one vector that represents the student's cumulative knowledge of the file

This means the LanceDB entry always reflects the **current state of learning** for a file, not a snapshot of one session. Old sessions naturally fade out as new sessions push them beyond the last-5 window.

### Where LanceDB is called

**On session end** (`PUT /api/gurukul/sessions/:id/end`), after `auto_summary` is saved to SQLite:
1. Fetch last 5 summaries for this `file_path` from SQLite
2. Build `combined_summary`, generate embedding via Gemini
3. Upsert into LanceDB `gurukul_files` (replace existing row for `file_path`)
4. If embedder unavailable, log warning and continue — SQLite is the source of truth

**On assess / session-start weakness hint**:
- Embed the current section's content → search LanceDB `gurukul_files` for `k=5` nearest files
- Returns relevant files even if `file_path` differs — e.g. studying "Basic Structure Doctrine" surfaces the past "Fundamental Rights" and "Constitutional Amendments" file vectors

```ts
// proxy/utils/lancedb.ts
export async function upsertFileVector(
  filePath: string,
  combinedSummary: string,
  sessionCount: number
): Promise<void>

export async function searchRelevantFiles(
  queryText: string,
  k?: number
): Promise<FileVector[]>
```

### Graceful degradation

- If `@lancedb/lancedb` throws on open (table not created yet, model unreachable) → catch, warn, return `[]`
- Assessment and session-start always fall back to SQLite query if LanceDB returns nothing
- LanceDB indexing is **best-effort** — never blocks a session from saving

### New `proxy/utils/lancedb.ts`

Standalone utility module (not a Hono route). Exposes two functions: `indexSummary` and `searchRelevantSummaries`. Called from `proxy/routes/gurukul.ts`. Keeps all vector logic isolated so it can be disabled or replaced without touching routes.

---

## Verification Steps

1. `pnpm run dev:all` — starts Vite + Hono proxy
2. Click **Gurukul** tab → layout switches to 3-column Gurukul layout
3. Click **Open Folder** → pick a folder with `.md` files → files appear in left pane
4. Click a file → markdown renders in right pane with section nav
5. Click **Quiz →** next to a section → Guru asks first question in center pane
6. Type an answer + Enter → Guru gives feedback + next question
7. After 9+ turns → open browser network tab → verify API payload is compressed (not full history)
8. Reset session → verify `gurukul_sessions` row has `ended_at` set and `auto_summary` populated (DB Browser or `sqlite3` CLI)
9. Start a new session on the same section → session history panel shows the previous session
10. Enable "Allow Assessment" toggle → click "Assess Progress" → verify assessment response appears
11. Test with Anthropic provider — verify multi-turn messages format
12. Test with Google provider — verify `assistant` → `model` role mapping
13. Test folder fallback: use Firefox or a browser where FSA API is unavailable
