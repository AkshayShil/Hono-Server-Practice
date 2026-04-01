#!/usr/bin/env zsh

# ---------------------------------------------------------------------------
# setup-and-run.sh — Automated Installer and Runner for Anki Reviewer
# ---------------------------------------------------------------------------

LOG_FILE="setup_error.log"
exec 2> >(tee -a "$LOG_FILE" >&2)

echo "------------------------------------------------"
echo "  ANKI REVIEWER - SETUP & RUN"
echo "------------------------------------------------"
echo "Logging errors to: $LOG_FILE"

# 1. Check for Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed. Please install it first."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

# 2. Check for .env file
if [[ ! -f ".env" ]]; then
    echo "[WARNING] No .env file found. Creating a template..."
    cat <<EOF > .env
DEEPSEEK_API_KEY=
GOOGLE_API_KEY=
OPENROUTER_API_KEY=
OPENAI_API_KEY=
EOF
    echo "[ACTION] Please open the .env file and add your API keys before running again."
    exit 1
fi

# 3. Install Production Dependencies
echo "[1/2] Installing dependencies (Production mode)..."
if npm install --production; then
    echo "[SUCCESS] Dependencies installed."
else
    echo "[ERROR] Failed to install dependencies. Check $LOG_FILE for details."
    exit 1
fi

# 4. Start the Application
echo "[2/2] Launching the Proxy Server..."
echo "------------------------------------------------"
echo "  Connect to: http://localhost:5173"
echo "  Ensure Anki Desktop is OPEN with AnkiConnect"
echo "------------------------------------------------"

# Run the start command
npm run start
