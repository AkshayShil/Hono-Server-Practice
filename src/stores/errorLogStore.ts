// ---------------------------------------------------------------------------
// errorLogStore.ts — Captures LLM analysis errors for the session.
//
// Two output modes:
//   Browser   → Blob download via <a> click (always available)
//   Desktop   → Auto-writes a .txt file next to the app executable when
//               window.__TAURI__ (Tauri) or window.electronAPI (Electron)
//               is detected. No extra config needed — just works when bundled.
// ---------------------------------------------------------------------------

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ErrorLogEntry {
  /** ISO timestamp of when the error occurred */
  timestamp: string;
  cardId: number;
  /** Plain-text question (HTML stripped) */
  question: string;
  /** The user's answer that triggered the failure */
  userAnswer: string;
  /** Error message from the LLM caller or response parser */
  errorMessage: string;
  /** Which provider/model was active */
  provider: string;
  model: string;
}

// ---------------------------------------------------------------------------
// Desktop bridge — detects Tauri or Electron at runtime
// ---------------------------------------------------------------------------

/** Tauri v2 fs plugin shape (subset we need) */
interface TauriFs {
  writeTextFile(path: string, contents: string): Promise<void>;
}

/** Electron preload bridge shape */
interface ElectronAPI {
  writeFile(path: string, contents: string): Promise<void>;
  getAppDir(): Promise<string>;
}

declare global {
  interface Window {
    __TAURI__?: { fs?: TauriFs };
    electronAPI?: ElectronAPI;
  }
}

type DesktopMode = 'tauri' | 'electron' | 'browser';

function detectDesktopMode(): DesktopMode {
  if (window.__TAURI__?.fs) return 'tauri';
  if (window.electronAPI?.writeFile) return 'electron';
  return 'browser';
}

// ---------------------------------------------------------------------------
// Log file helpers
// ---------------------------------------------------------------------------

const SESSION_START = new Date();

/** Generates the log filename: errors-YYYY-MM-DD-HH-MM.txt */
function makeFilename(): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = SESSION_START;
  return `anki-sakura-errors-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}.txt`;
}

/** Formats all log entries into a human-readable plain-text report */
function formatLog(entries: ErrorLogEntry[]): string {
  const header = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║           Anki // 桜  —  LLM Error Log                      ║',
    '╚══════════════════════════════════════════════════════════════╝',
    `Session started : ${SESSION_START.toLocaleString()}`,
    `Report generated: ${new Date().toLocaleString()}`,
    `Total errors    : ${entries.length}`,
    '',
    '━'.repeat(64),
    '',
  ].join('\n');

  if (entries.length === 0) {
    return header + 'No errors recorded this session.\n';
  }

  const body = entries.map((e, i) => [
    `[${i + 1}] ${e.timestamp}`,
    `Card ID  : ${e.cardId}`,
    `Provider : ${e.provider} — ${e.model}`,
    `Question : ${e.question.slice(0, 200)}${e.question.length > 200 ? '…' : ''}`,
    `Answer   : ${e.userAnswer.slice(0, 200)}${e.userAnswer.length > 200 ? '…' : ''}`,
    `Error    : ${e.errorMessage}`,
    '─'.repeat(64),
  ].join('\n')).join('\n');

  return header + body + '\n';
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useErrorLogStore = defineStore('errorLog', () => {
  const entries = ref<ErrorLogEntry[]>([]);
  const hasErrors = computed(() => entries.value.length > 0);
  const count = computed(() => entries.value.length);

  /** Called by cardStore whenever an LLM analysis fails */
  function capture(entry: Omit<ErrorLogEntry, 'timestamp'>): void {
    entries.value.push({
      ...entry,
      timestamp: new Date().toLocaleString(),
    });

    // In desktop mode, auto-write the updated log file on every new error
    void autoWriteIfDesktop();
  }

  /** Clears all logged errors */
  function clear(): void {
    entries.value = [];
  }

  // ── Browser download ─────────────────────────────────────────────────────

  function downloadLog(): void {
    const content = formatLog(entries.value);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = makeFilename();
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Desktop auto-write ───────────────────────────────────────────────────
  // When running as a Tauri or Electron app, silently write the log file
  // next to the binary every time a new error is captured.
  // The file is recreated (not appended) so it always reflects the full
  // session — safe to open in any text editor mid-session.

  async function autoWriteIfDesktop(): Promise<void> {
    const mode = detectDesktopMode();
    const content = formatLog(entries.value);
    const filename = makeFilename();

    try {
      if (mode === 'tauri') {
        // Tauri v2: write to the app's local data directory
        // Requires `fs` plugin in tauri.conf.json:
        //   "plugins": { "fs": { "scope": ["$APPDATA/**"] } }
        await window.__TAURI__!.fs!.writeTextFile(filename, content);

      } else if (mode === 'electron') {
        // Electron: delegate to preload bridge
        // In your preload.js expose:
        //   contextBridge.exposeInMainWorld('electronAPI', {
        //     writeFile: (path, data) => ipcRenderer.invoke('write-file', path, data),
        //     getAppDir: () => ipcRenderer.invoke('get-app-dir'),
        //   })
        const dir = await window.electronAPI!.getAppDir();
        await window.electronAPI!.writeFile(`${dir}/${filename}`, content);
      }
      // browser mode: no auto-write, user triggers downloadLog() manually
    } catch (err) {
      // Never let a logging failure surface to the user
      console.warn('[errorLogStore] Auto-write failed:', err);
    }
  }

  return {
    entries,
    hasErrors,
    count,
    capture,
    clear,
    downloadLog,
  };
});