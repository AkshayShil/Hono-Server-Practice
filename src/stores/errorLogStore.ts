// ---------------------------------------------------------------------------
// errorLogStore.ts — Session log for all LLM reviews + errors.
//
// Saves as JSON so the data is structured and can be imported into Excel,
// processed by scripts, or used to generate Word/PDF study reports later.
//
// Download modes:
//   Browser  → .json file download via <a> click
//   Desktop  → Auto-writes to disk on every update when Tauri or Electron
//              is detected (window.__TAURI__ / window.electronAPI)
// ---------------------------------------------------------------------------

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReviewLogEntry {
  type: 'success' | 'error';
  timestamp: string;
  cardId: number;
  question: string;
  userAnswer: string;
  provider: string;
  model: string;
  // Populated on success
  score?: number;
  verdict?: string;
  strengths?: string[];
  gaps?: string[];
  improvements?: string[];
  rating?: number;
  ratingReason?: string;
  // Populated on error
  errorMessage?: string;
}

export interface SessionLog {
  meta: {
    sessionStart: string;
    exportedAt: string;
    totalReviews: number;
    successCount: number;
    errorCount: number;
    averageScore: number | null;
    appVersion: string;
  };
  reviews: ReviewLogEntry[];
}

// ---------------------------------------------------------------------------
// Desktop bridge
// ---------------------------------------------------------------------------

interface TauriFs {
  writeTextFile(path: string, contents: string): Promise<void>;
}
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
// Helpers
// ---------------------------------------------------------------------------

const SESSION_START = new Date();

function makeFilename(): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = SESSION_START;
  return `anki-sakura-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

function buildSessionLog(entries: ReviewLogEntry[]): SessionLog {
  const successes = entries.filter(e => e.type === 'success');
  const errors    = entries.filter(e => e.type === 'error');
  const scores    = successes.map(e => e.score ?? 0).filter(s => s > 0);
  const avgScore  = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  return {
    meta: {
      sessionStart:  SESSION_START.toISOString(),
      exportedAt:    new Date().toISOString(),
      totalReviews:  entries.length,
      successCount:  successes.length,
      errorCount:    errors.length,
      averageScore:  avgScore,
      appVersion:    'anki-sakura-1.0',
    },
    reviews: entries,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useErrorLogStore = defineStore('errorLog', () => {
  const entries    = ref<ReviewLogEntry[]>([]);
  const hasErrors  = computed(() => entries.value.some(e => e.type === 'error'));
  const count      = computed(() => entries.value.length);
  const errorCount = computed(() => entries.value.filter(e => e.type === 'error').length);

  /** Capture a successful review with full AI feedback */
  function captureSuccess(entry: Omit<ReviewLogEntry, 'timestamp' | 'type'>): void {
    entries.value.push({ ...entry, type: 'success', timestamp: new Date().toISOString() });
    void autoWriteIfDesktop();
  }

  /** Capture an LLM failure */
  function captureError(entry: Omit<ReviewLogEntry,
    'timestamp' | 'type' | 'score' | 'verdict' | 'strengths' |
    'gaps' | 'improvements' | 'rating' | 'ratingReason'>
  ): void {
    entries.value.push({ ...entry, type: 'error', timestamp: new Date().toISOString() });
    void autoWriteIfDesktop();
  }

  // Backwards-compat alias for any old callers
  function capture(entry: {
    cardId: number; question: string; userAnswer: string;
    errorMessage: string; provider: string; model: string;
  }): void {
    captureError(entry);
  }

  function clear(): void {
    entries.value = [];
  }

  // ── Browser download ──────────────────────────────────────────────────────

  function downloadLog(): void {
    const log     = buildSessionLog(entries.value);
    const json    = JSON.stringify(log, null, 2);
    const blob    = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = makeFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Desktop auto-write ────────────────────────────────────────────────────
  // Rewrites the file on every new entry so it's always up to date mid-session.

  async function autoWriteIfDesktop(): Promise<void> {
    const mode    = detectDesktopMode();
    const json    = JSON.stringify(buildSessionLog(entries.value), null, 2);
    const filename = makeFilename();
    try {
      if (mode === 'tauri') {
        // Requires fs plugin in tauri.conf.json:
        // "plugins": { "fs": { "scope": ["$APPDATA/**"] } }
        await window.__TAURI__!.fs!.writeTextFile(filename, json);
      } else if (mode === 'electron') {
        // Expose in preload.js:
        // contextBridge.exposeInMainWorld('electronAPI', {
        //   writeFile: (p, d) => ipcRenderer.invoke('write-file', p, d),
        //   getAppDir: ()    => ipcRenderer.invoke('get-app-dir'),
        // })
        const dir = await window.electronAPI!.getAppDir();
        await window.electronAPI!.writeFile(`${dir}/${filename}`, json);
      }
    } catch (err) {
      console.warn('[errorLogStore] Auto-write failed:', err);
    }
  }

  return {
    entries, hasErrors, count, errorCount,
    captureSuccess, captureError, capture,
    clear, downloadLog,
  };
});