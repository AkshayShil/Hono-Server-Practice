# Findings - Gurukul Mode

## Requirements
- Socratic teaching mode (Guru vs Student).
- Side-by-side layout: File Browser | Chat | Reader.
- Token optimization: Section-only context, history compression, max_tokens=350.
- Persistence: SQLite for sessions, LanceDB for semantic search.
- Embedding: Gemini `text-embedding-004`.

## Research Findings
- FSA API (`showDirectoryPicker`) is preferred for folder access.
- Fallback to `<input webkitdirectory>` for Firefox.
- Section parsing: ATX and Setext headings.
- History compression: Summarize beyond last 4 messages.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Vue 3 + Pinia | Existing tech stack. |
| SQLite (separate DB) | Isolation from Anki data. |
| LanceDB | High-performance vector search, easy to set up. |
| Gemini Embeddings | Native support, high quality. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| | |
