// ---------------------------------------------------------------------------
// llmStore.ts — Pinia store (orchestration only)
// Now proxies all LLM calls through the Hono server to protect API keys.
// ---------------------------------------------------------------------------

import { defineStore } from 'pinia';
import { ref, computed, onMounted } from 'vue';

import { PROVIDERS }        from './apiConfig';
import { PROMPT_TEMPLATES } from './promptTemplates';
import { loadConfig, saveConfig } from './persistence';
import { parseResponse } from './responseParser';

import type { ProviderId, PromptMode, PromptTemplate, LLMFeedback, AnalyzeParams } from './types';

// The base URL of our Hono proxy server
const PROXY_BASE_URL = import.meta.env.VITE_PROXY_URL || '';

export const useLLMStore = defineStore('llm', () => {
  const _cfg = loadConfig();

  // ── State ──────────────────────────────────────────────────────────────
  const providerId    = ref<ProviderId>(_cfg.providerId);
  const modelId       = ref<string>(_cfg.modelId);
  const promptMode    = ref<PromptMode | 'auto'>(_cfg.promptMode);
  const customBaseUrl = ref<string>(_cfg.customBaseUrl ?? '');
  
  // Track which providers have keys on the server
  const serverProviderStatus = ref<Array<{ id: string; hasKey: boolean }>>([]);

  // ── Lifecycle ──────────────────────────────────────────────────────────
  onMounted(async () => {
    try {
      const res = await fetch(`${PROXY_BASE_URL}/api/llm/status`);
      if (res.ok) {
        const data = await res.json();
        serverProviderStatus.value = data.providers;
      }
    } catch (err) {
      console.warn('[llmStore] Failed to fetch LLM status from server:', err);
    }
  });

  // ── Derived ────────────────────────────────────────────────────────────
  const availableProviders = computed(() => {
    // If we haven't fetched status yet, show all that require keys as disabled
    // or if we have status, filter by hasKey.
    if (serverProviderStatus.value.length === 0) return PROVIDERS;
    
    return PROVIDERS.filter(p => {
      const status = serverProviderStatus.value.find(s => s.id === p.id);
      return !p.requiresKey || (status?.hasKey ?? false);
    });
  });

  const provider = computed(() => 
    availableProviders.value.find(p => p.id === providerId.value) ?? availableProviders.value[0]!
  );

  const models = computed(() => provider.value.models);

  // Full model object — carries tokenParam and other per-model metadata
  const model = computed(() =>
    models.value.find(m => m.id === modelId.value) ?? models.value[0]!
  );

  const template = computed(() => {
    if (promptMode.value === 'auto') return null; // resolved at call time
    return PROMPT_TEMPLATES.find(t => t.id === promptMode.value) ?? PROMPT_TEMPLATES[1]!;
  });

  // ── Setters ────────────────────────────────────────────────────────────
  function setProvider(id: ProviderId): void {
    providerId.value = id;
    modelId.value = PROVIDERS.find(p => p.id === id)?.models[0]?.id ?? '';
    persist();
  }
  function setModel(id: string): void            { modelId.value = id;        persist(); }
  function setPromptMode(m: PromptMode | 'auto'): void { promptMode.value = m; persist(); }
  function setCustomBaseUrl(url: string): void   { customBaseUrl.value = url; persist(); }

  function persist(): void {
    saveConfig({
      providerId: providerId.value,
      modelId: modelId.value,
      apiKey: '', 
      promptMode: promptMode.value,
      customBaseUrl: customBaseUrl.value,
    });
  }

  // ── Template resolution ────────────────────────────────────────────────
  function resolveTemplate(cardType?: 'new' | 'learn' | 'review', easeOverride?: number): PromptTemplate {
    if (promptMode.value !== 'auto') {
      return PROMPT_TEMPLATES.find(t => t.id === promptMode.value) ?? PROMPT_TEMPLATES[1]!;
    }
    if (cardType === 'new' || cardType === 'learn') return PROMPT_TEMPLATES[0]!; // lenient
    if (easeOverride !== undefined) {
      if (easeOverride <= 2) return PROMPT_TEMPLATES[0]!; // lenient
      if (easeOverride >= 4) return PROMPT_TEMPLATES[2]!; // rigorous
    }
    return PROMPT_TEMPLATES[1]!; // balanced default
  }

  // ── Proxy Caller ───────────────────────────────────────────────────────
  async function callProxy(params: {
    template: PromptTemplate;
    userMessage: string;
  }): Promise<string> {
    const res = await fetch(`${PROXY_BASE_URL}/api/llm/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: provider.value,
        model: model.value,
        template: params.template,
        userMessage: params.userMessage,
        customBaseUrl: customBaseUrl.value,
      }),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || `Server error ${res.status}`);
    }

    const data = await res.json();
    return data.text;
  }

  // ── Main analyze call ──────────────────────────────────────────────────
  async function cleanText(text: string): Promise<string> {
    const tmpl = PROMPT_TEMPLATES.find(t => t.id === 'clean')!;
    const userMsg = `Clean this voice transcript:\n\n${text}`;
    const raw = await callProxy({ template: tmpl, userMessage: userMsg });
    return raw.trim();
  }

  async function analyze(params: AnalyzeParams): Promise<LLMFeedback> {
    const tmpl    = resolveTemplate(params.cardType);
    const userMsg = [
      `QUESTION:\n${params.question}`,
      `CORRECT ANSWER (from card):\n${params.correctAnswer}`,
      `STUDENT'S ANSWER:\n${params.userAnswer}`,
      `Card type: ${params.cardType ?? 'review'}`,
      'Analyse the student\'s answer against the correct answer. Return JSON.',
    ].join('\n\n');

    const raw = await callProxy({ template: tmpl, userMessage: userMsg });
    return parseResponse(raw, tmpl);
  }

  // ── Public API ─────────────────────────────────────────────────────────
  return {
    providerId, modelId, promptMode, customBaseUrl,
    provider, models, model, template, availableProviders,
    setProvider, setModel, setPromptMode, setCustomBaseUrl,
    resolveTemplate, analyze, cleanText,
    PROVIDERS, PROMPT_TEMPLATES,
  };
});
