# Anki Akshay Reviewer

A Vue 3 single-page application with a Node.js proxy backend for reviewing Anki flashcards with LLM-powered feedback. Built for UPSC preparation — supports free-text answers that are graded by an AI model.

## How it works

1. **Frontend** — Vue 3 + Pinia SPA served from `./dist`
2. **Proxy** — Hono server on port `3020` that:
   - Proxies requests to Anki-Connect (keeps Anki Desktop as the source of truth)
   - Routes LLM calls through the server so API keys stay off the client
   - Persists FSRS scheduling data and session history in SQLite
3. **Anki Desktop** — must be running with the Anki-Connect add-on installed

## Prerequisites

- **Node.js** `^20.19.0` or `>=22.12.0`
- **pnpm** (package manager)
- **Anki Desktop** running with [Anki-Connect](https://ankiweb.net/shared/info/2055492159) add-on (default: `http://localhost:8765`)
- At least one LLM API key (see `.env` setup below)

## Setup

```bash
pnpm install
```

Create a `.env` file in the project root:

```env
# Required: at least one provider key
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
OPENROUTER_API_KEY=...
DEEPSEEK_API_KEY=...

# Optional
PORT=3020
```

## Development

```bash
# Start Vite dev server + proxy backend together
pnpm dev:all

# Or start them separately
pnpm dev          # Vite frontend only (hot reload)
pnpm backend      # Proxy server only
```

## Production

```bash
# Build the frontend
pnpm build

# Start the proxy (serves the built frontend + API)
pnpm start
```

Access the app at `http://localhost:3020`. On the same network, use the printed `Network:` URL to review from a phone or tablet.

## LLM Providers

The proxy supports five providers. Configure your preferred one in the app's settings panel — the API key is stored in the browser and sent with each request to the proxy.

| Provider   | Env Var                |
|------------|------------------------|
| OpenAI     | `OPENAI_API_KEY`       |
| Anthropic  | `ANTHROPIC_API_KEY`    |
| Google     | `GOOGLE_API_KEY`       |
| OpenRouter | `OPENROUTER_API_KEY`   |
| DeepSeek   | `DEEPSEEK_API_KEY`     |
| Ollama     | *(no key required)*    |

## Grading modes

| Mode      | Description                                                |
|-----------|------------------------------------------------------------|
| Lenient   | Awards partial credit; rewards effort and direction        |
| Balanced  | Standard UPSC-style evaluation                             |
| Rigorous  | Strict — penalises vague or incomplete answers             |
| Clean     | Reformats the card's answer field (no grading)             |
| Format    | Drafts a structured answer format for the question         |

## Project structure

```
anki-akshay-reviewer/
├── proxy/
│   ├── index.ts          # Entry point — starts Hono server
│   ├── server.ts         # App definition, middleware, routes
│   ├── routes/
│   │   ├── ankiProxy.ts  # Forwards requests to Anki-Connect
│   │   ├── llm.ts        # LLM provider proxy (keeps keys server-side)
│   │   ├── fsrs.ts       # FSRS scheduling endpoints
│   │   └── sync.ts       # Anki ↔ SQLite sync
│   └── utils/
│       ├── db.ts         # SQLite schema + queries
│       ├── migrate.ts    # Legacy data migration
│       ├── anki.ts       # Anki-Connect helpers
│       ├── logger.ts     # Pino logger
│       └── network.ts    # Local IP detection
├── src/
│   ├── App.vue           # Root layout, swipe gesture handling
│   ├── components/
│   │   ├── AppHeader.vue        # Deck selector, session controls
│   │   ├── StudyPane.vue        # Card display, answer input, LLM trigger
│   │   ├── AnalysisPanel.vue    # LLM feedback display
│   │   ├── QueuePane.vue        # Due card list
│   │   ├── SessionHistory.vue   # Past answers & re-analysis
│   │   ├── CardDetailDialog.vue # Full card detail view
│   │   ├── LLMSettings.vue      # Provider / model / mode configuration
│   │   └── AppFooter.vue
│   └── stores/
│       ├── cardStore.ts         # Deck, queue, and review state
│       └── llm/
│           ├── llmStore.ts      # LLM calls, feedback state
│           ├── types.ts         # Shared interfaces
│           ├── persistence.ts   # LocalStorage config persistence
│           └── promptTemplates.ts
├── analysis_logs/        # Per-session JSONL logs (gitignored)
├── client_errors/        # Client-side error logs (gitignored)
└── proxy/data/           # SQLite database (gitignored)
```

## Scripts

| Script              | Description                                      |
|---------------------|--------------------------------------------------|
| `pnpm dev`          | Vite dev server with hot reload                  |
| `pnpm dev:all`      | Vite + proxy backend in parallel                 |
| `pnpm build`        | Type-check + build frontend to `./dist`          |
| `pnpm start`        | Start production proxy (serves built frontend)   |
| `pnpm lint`         | Run oxlint + ESLint with auto-fix                |
| `pnpm format`       | Format source files with oxfmt                   |
| `pnpm test:unit`    | Run Vitest unit tests                            |
| `pnpm test:e2e`     | Run Playwright end-to-end tests                  |
