// ---------------------------------------------------------------------------
// apiConfig.ts — Provider catalogue + shared inference defaults
// Import INFERENCE_DEFAULTS wherever you build an API request body.
// ---------------------------------------------------------------------------

import type { ProviderConfig } from './types';

// ── Inference Defaults ──────────────────────────────────────────────────────
// Single place to tune generation behaviour across all providers.
// Models with fixedSampling: true will ignore temperature/topP (see apiCaller).

export const INFERENCE_DEFAULTS = {
  /** Hard cap on output tokens — keeps costs predictable */
  maxTokens: 4000,
  /** Low temperature for structured JSON output (0 = deterministic) */
  temperature: 0.3,
  /** Nucleus sampling — pair with temperature for quality/diversity balance */
  topP: 1,
} as const;

// ── Provider Catalogue ──────────────────────────────────────────────────────
// tokenParam:    'max_completion_tokens' for GPT-5 / o-series, else omit.
// fixedSampling: true for models that reject custom temperature / top_p.

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyLabel: 'OpenAI API Key',
    requiresKey: true,
    models: [
      { id: 'gpt-5.2',       label: 'GPT-5.2',       contextK: 400, tokenParam: 'max_completion_tokens', fixedSampling: true },
      { id: 'gpt-5-mini',    label: 'GPT-5 Mini',    contextK: 400, tokenParam: 'max_completion_tokens', fixedSampling: true },
      { id: 'gpt-5-nano',    label: 'GPT-5 Nano',    contextK: 400, tokenParam: 'max_completion_tokens', fixedSampling: true },
      { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', contextK: 16  },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyLabel: 'Anthropic API Key',
    requiresKey: true,
    models: [
      { id: 'claude-opus-4-6',           label: 'Claude Opus 4.6',   contextK: 200 },
      { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', contextK: 200 },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',  contextK: 200 },
    ],
  },
  {
    id: 'google',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyLabel: 'Google AI API Key',
    requiresKey: true,
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', contextK: 1000 },
      { id: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro',   contextK: 1000 },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', contextK: 1000 },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyLabel: 'OpenRouter API Key',
    requiresKey: true,
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', contextK: 128 },
      { id: 'deepseek/deepseek-r1',               label: 'DeepSeek R1',   contextK: 64  },
      { id: 'mistralai/mistral-large',            label: 'Mistral Large', contextK: 128 },
      { id: 'qwen/qwen-2.5-72b-instruct',         label: 'Qwen 2.5 72B', contextK: 128 },
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    apiKeyLabel: 'Not required',
    requiresKey: false,
    models: [
      { id: 'llama3.2', label: 'Llama 3.2',  contextK: 128 },
      { id: 'mistral',  label: 'Mistral 7B', contextK: 32  },
      { id: 'qwen2.5',  label: 'Qwen 2.5',   contextK: 128 },
      { id: 'phi4',     label: 'Phi-4',      contextK: 16  },
    ],
  },
];