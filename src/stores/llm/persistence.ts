// ---------------------------------------------------------------------------
// persistence.ts — Load / save LLM config from localStorage
// ---------------------------------------------------------------------------

import type { PersistedLLMConfig } from './types';

const STORAGE_KEY = 'ankiStudy:llm';

const DEFAULTS: PersistedLLMConfig = {
  providerId: 'openai',
  modelId: 'gpt-5-mini',
  apiKey: (import.meta.env.LLM_API_KEY as string) || '',
  promptMode: 'auto',
};

export function loadConfig(): PersistedLLMConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PersistedLLMConfig;
  } catch { /* ignore parse / access errors */ }
  return { ...DEFAULTS };
}

export function saveConfig(cfg: PersistedLLMConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch { /* ignore quota / access errors */ }
}
