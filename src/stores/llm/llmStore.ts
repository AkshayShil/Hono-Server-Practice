// ---------------------------------------------------------------------------
// llmStore.ts — Pinia store (orchestration only)
// All heavy lifting lives in the sibling modules.
// ---------------------------------------------------------------------------

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

import { PROVIDERS }        from './apiConfig';
import { PROMPT_TEMPLATES } from './promptTemplates';
import { loadConfig, saveConfig } from './persistence';
import { callAnthropic, callGoogle, callOpenAICompat } from './apiCaller';
import { parseResponse } from './responseParser';

import type { ProviderId, PromptMode, PromptTemplate, LLMFeedback, AnalyzeParams } from './types';

// ── Environment Keys ─────────────────────────────────────────────────────
const ENV_KEYS: Record<ProviderId, string> = {
  openai:     import.meta.env.VITE_OPENAI_API_KEY     || '',
  anthropic:  import.meta.env.VITE_ANTHROPIC_API_KEY  || '',
  google:     import.meta.env.VITE_GOOGLE_API_KEY     || '',
  openrouter: import.meta.env.VITE_OPENROUTER_API_KEY || '',
  ollama:     import.meta.env.VITE_OLLAMA_API_KEY     || '',
};

export const useLLMStore = defineStore('llm', () => {
  const _cfg = loadConfig();

  // ── State ──────────────────────────────────────────────────────────────
  const providerId    = ref<ProviderId>(_cfg.providerId);
  const modelId       = ref<string>(_cfg.modelId);
  const promptMode    = ref<PromptMode | 'auto'>(_cfg.promptMode);
  const customBaseUrl = ref<string>(_cfg.customBaseUrl ?? '');

  // ── Derived ────────────────────────────────────────────────────────────
  const availableProviders = computed(() => 
    PROVIDERS.filter(p => !p.requiresKey || !!ENV_KEYS[p.id])
  );

  const provider = computed(() => 
    availableProviders.value.find(p => p.id === providerId.value) ?? availableProviders.value[0]!
  );

  const models = computed(() => provider.value.models);

  const apiKey = computed(() => ENV_KEYS[provider.value.id]);

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
      apiKey: '', // No longer persisted in localStorage
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

  // ── User message builder ───────────────────────────────────────────────
  function buildUserMessage(params: AnalyzeParams): string {
    return [
      `QUESTION:\n${params.question}`,
      `CORRECT ANSWER (from card):\n${params.correctAnswer}`,
      `STUDENT'S ANSWER:\n${params.userAnswer}`,
      `Card type: ${params.cardType ?? 'review'}`,
      'Analyse the student\'s answer against the correct answer. Return JSON.',
    ].join('\n\n');
  }

  // ── Main analyze call ──────────────────────────────────────────────────
  async function cleanText(text: string): Promise<string> {
    const tmpl = PROMPT_TEMPLATES.find(t => t.id === 'clean')!;
    const p = provider.value;
    const m = model.value;
    const baseUrl = customBaseUrl.value.trim() || p.baseUrl;

    const userMsg = `Clean this voice transcript:\n\n${text}`;

    let raw: string;
    if (p.id === 'anthropic') {
      raw = await callAnthropic({ baseUrl, apiKey: apiKey.value, model: m, template: tmpl, userMessage: userMsg });
    } else if (p.id === 'google') {
      raw = await callGoogle({ baseUrl, apiKey: apiKey.value, model: m, template: tmpl, userMessage: userMsg });
    } else {
      raw = await callOpenAICompat({ baseUrl, apiKey: apiKey.value, model: m, template: tmpl, userMessage: userMsg, providerId: p.id, requiresKey: p.requiresKey });
    }
    return raw.trim();
  }

  async function analyze(params: AnalyzeParams): Promise<LLMFeedback> {
    const tmpl    = resolveTemplate(params.cardType);
    const userMsg = buildUserMessage(params);
    const p       = provider.value;
    const m       = model.value;
    const baseUrl = customBaseUrl.value.trim() || p.baseUrl;

    let raw: string;

    if (p.id === 'anthropic') {
      raw = await callAnthropic({ baseUrl, apiKey: apiKey.value, model: m, template: tmpl, userMessage: userMsg });
    } else if (p.id === 'google') {
      raw = await callGoogle({ baseUrl, apiKey: apiKey.value, model: m, template: tmpl, userMessage: userMsg });
    } else {
      raw = await callOpenAICompat({ baseUrl, apiKey: apiKey.value, model: m, template: tmpl, userMessage: userMsg, providerId: p.id, requiresKey: p.requiresKey });
    }

    return parseResponse(raw, tmpl);
  }

  // ── Public API ─────────────────────────────────────────────────────────
  return {
    providerId, modelId, promptMode, customBaseUrl,
    provider, models, model, template, availableProviders, apiKey,
    setProvider, setModel, setPromptMode, setCustomBaseUrl,
    resolveTemplate, analyze, cleanText,
    PROVIDERS, PROMPT_TEMPLATES,
  };
});
