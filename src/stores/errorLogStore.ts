// ---------------------------------------------------------------------------
// errorLogStore.ts — Session log for all LLM reviews + errors.
//
// Captures every completed review (success or failure) so the student can
// download a full session report showing what was asked, what they wrote,
// the AI score/feedback, and any errors that occurred.
//
// Download modes:
//   Browser  → Blob download via <a> click
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
  exemplar?: string;
  suggestedRating?: number;
  // Populated on error
  errorMessage?: string;
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
// Formatting
// ---------------------------------------------------------------------------

const SESSION_START = new Date();

function makeFilename(): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = SESSION_START;
  return `anki-sakura-session-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}.txt`;
}

const RATINGS = ['', 'Again', 'Hard', 'Good', 'Easy'];
const LINE = '─'.repeat(66);

function formatLog(entries: ReviewLogEntry[]): string {
  const successCount = entries.filter(e => e.type === 'success').length;
  const errorCount   = entries.filter(e => e.type === 'error').length;
  const avgScore = successCount > 0
    ? Math.round(entries.filter(e => e.type === 'success' && e.score != null)
        .reduce((sum, e) => sum + (e.score ?? 0), 0) / successCount)
    : null;

  const header = [
    '╔════════════════════════════════════════════════════════════════════╗',
    '║              Anki // 桜  —  Session Review Log                     ║',
    '╚════════════════════════════════════════════════════════════════════╝',
    '',
    `Session started : ${SESSION_START.toLocaleString()}`,
    `Report generated: ${new Date().toLocaleString()}`,
    `Reviews logged  : ${entries.length}  (${successCount} analysed, ${errorCount} failed)`,
    avgScore != null ? `Average score   : ${avgScore}/100` : '',
    '',
    '═'.repeat(66),
    '',
  ].filter(l => l !== null).join('\n');

  if (entries.length === 0) {
    return header + 'No reviews recorded this session yet.\n';
  }

  const body = entries.map((e, i) => {
    const lines: string[] = [];
    lines.push(`[${String(i + 1).padStart(2, '0')}]  ${e.timestamp}  ·  ${e.type === 'error' ? '⚠ ERROR' : '✓ ANALYSED'}`);
    lines.push(`Provider : ${e.provider} — ${e.model}`);
    lines.push(`Card ID  : ${e.cardId}`);
    lines.push('');
    lines.push('QUESTION');
    lines.push(e.question || '(no question)');
    lines.push('');
    lines.push('YOUR ANSWER');
    lines.push(e.userAnswer || '(no answer)');

    if (e.type === 'success') {
      lines.push('');
      lines.push(`SCORE    : ${e.score ?? '?'}/100   AI rating: ${RATINGS[e.suggestedRating ?? 3] ?? '?'}`);
      lines.push(`VERDICT  : ${e.verdict ?? ''}`);

      if (e.strengths?.length) {
        lines.push('');
        lines.push('WHAT YOU GOT RIGHT');
        e.strengths.forEach((s, n) => lines.push(`  ${n + 1}. ${s}`));
      }
      if (e.gaps?.length) {
        lines.push('');
        lines.push('GAPS TO FILL');
        e.gaps.forEach((g, n) => lines.push(`  ${n + 1}. ${g}`));
      }
      if (e.improvements?.length) {
        lines.push('');
        lines.push('HOW TO IMPROVE');
        e.improvements.forEach((im, n) => lines.push(`  ${n + 1}. ${im}`));
      }
      if (e.exemplar) {
        lines.push('');
        lines.push('MODEL ANSWER');
        lines.push(e.exemplar);
      }
    } else {
      lines.push('');
      lines.push('ERROR');
      lines.push(e.errorMessage ?? 'Unknown error');
    }

    lines.push('');
    lines.push(LINE);
    return lines.join('\n');
  }).join('\n');

  return header + body + '\n';
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useErrorLogStore = defineStore('errorLog', () => {
  const entries   = ref<ReviewLogEntry[]>([]);
  const hasErrors = computed(() => entries.value.some(e => e.type === 'error'));
  const count     = computed(() => entries.value.length);
  const errorCount = computed(() => entries.value.filter(e => e.type === 'error').length);

  /** Capture a successful review with full AI feedback */
  function captureSuccess(entry: Omit<ReviewLogEntry, 'timestamp' | 'type'>): void {
    entries.value.push({ ...entry, type: 'success', timestamp: new Date().toLocaleString() });
    void autoWriteIfDesktop();
  }

  /** Capture an LLM failure */
  function captureError(entry: Omit<ReviewLogEntry, 'timestamp' | 'type' | 'score' | 'verdict' | 'strengths' | 'gaps' | 'improvements' | 'exemplar' | 'suggestedRating'>): void {
    entries.value.push({ ...entry, type: 'error', timestamp: new Date().toLocaleString() });
    void autoWriteIfDesktop();
  }

  // Keep old capture() for backwards compat with any callers
  function capture(entry: { cardId: number; question: string; userAnswer: string; errorMessage: string; provider: string; model: string }): void {
    captureError(entry);
  }

  function clear(): void {
    entries.value = [];
  }

  // ── Browser download ──────────────────────────────────────────────────────

  function downloadLog(): void {
    const content = formatLog(entries.value);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = makeFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Desktop auto-write ────────────────────────────────────────────────────

  async function autoWriteIfDesktop(): Promise<void> {
    const mode     = detectDesktopMode();
    const content  = formatLog(entries.value);
    const filename = makeFilename();
    try {
      if (mode === 'tauri') {
        await window.__TAURI__!.fs!.writeTextFile(filename, content);
      } else if (mode === 'electron') {
        const dir = await window.electronAPI!.getAppDir();
        await window.electronAPI!.writeFile(`${dir}/${filename}`, content);
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