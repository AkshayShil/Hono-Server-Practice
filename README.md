# Anki Card Server: Headless Bridge

A production-quality Flask API that acts as a headless bridge between external user interfaces and the Anki-Connect add-on. This bridge provides a clean JSON interface for deck management, card reviews, and system synchronization.

## Prerequisites

1.  **Anki Desktop**: Must be installed and running.
2.  **Anki-Connect Add-on**: Install the [Anki-Connect](https://ankiweb.net/shared/info/2055492159) add-on in Anki.
    *   Ensure Anki-Connect is configured to listen on `http://localhost:8765` (default).

## Installation

1.  Ensure you have Python 3.10+ installed.
2.  Install the required dependencies:
    ```bash
    pip install flask flask-cors requests pydantic
    ```

## Running the Server

Start the bridge server from the project root:
```bash
python index.py
```
The server will run on `http://localhost:5000` by default.

---

## API Documentation

All requests and responses use **Strict JSON**.

### 1. Deck Management

#### `GET /decks`
Returns a list of all available deck names.
*   **Response**: `["Default", "Languages::Spanish", ...]`

#### `GET /deck/stats/<deck_name>`
Returns review statistics for a specific deck.
*   **Response**: 
    ```json
    {
      "new_count": 10,
      "learning_count": 5,
      "review_count": 25
    }
    ```

#### `POST /deck/select`
Sets the active deck in the Anki GUI.
*   **Payload**: `{"deck": "Spanish"}`
*   **Response**: `{"status": "success", "message": "Deck 'Spanish' selected"}`

### 2. Review Engine

#### `GET /queue/<deck_name>`
Fetches all cards currently due for review or new in the specified deck.
*   **Response**: Array of card objects.
    ```json
    [
      {
        "cardId": 123456789,
        "fields": { "Front": { "value": "Hello", "order": 0 }, ... },
        "question": "HTML string",
        "answer": "HTML string",
        "css": "Card CSS"
      }
    ]
    ```

#### `POST /answer`
Logs a review for a specific card.
*   **Payload**: 
    ```json
    {
      "card_id": 123456789,
      "ease": 3,
      "sync_gui": false
    }
    ```
    *   `ease`: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy).
    *   `sync_gui`: If `true`, attempts to use Anki's GUI to answer (useful if the desktop app is visible).
*   **Response**: `{"status": "success", "method": "headless|gui"}`

### 3. Card Modification

#### `POST /card/suspend`
Suspends a card so it no longer appears in the queue.
*   **Payload**: `{"card_id": 123456789}`

#### `POST /card/bury`
Buries a card until the next day.
*   **Payload**: `{"card_id": 123456789}`

#### `PUT /card/edit`
Updates the text fields of a specific note.
*   **Payload**:
    ```json
    {
      "note_id": 987654321,
      "fields": {
        "Front": "New Question Text",
        "Back": "New Answer Text"
      }
    }
    ```

### 4. System & Sync

#### `GET /health`
Checks if the bridge can communicate with Anki-Connect.
*   **Success (200)**: `{"status": "ok", "anki_connect_version": 6}`
*   **Failure (503)**: `{"status": "error", "message": "Anki-Connect unreachable"}`

#### `POST /sync`
Triggers Anki's internal synchronization with AnkiWeb.
*   **Response**: `{"status": "success", "message": "Sync triggered"}`

---

## Project Structure

```text
anki-card-server/
├── index.py              # Application entry point
├── anki_bridge/          # Core package
│   ├── models/           # Pydantic data models
│   ├── routes/           # Flask Blueprints (decks, cards, system)
│   ├── services/         # Anki-Connect client logic
│   └── utils/            # Helper utilities
└── tasks.md              # Project requirements tracking
```

## Error Handling

The API returns standard HTTP status codes:
- **200**: Success
- **400**: Bad Request (Invalid JSON or validation error)
- **404**: Resource not found (e.g., Deck not found)
- **503**: Service Unavailable (Anki Desktop is closed or Anki-Connect is missing)
