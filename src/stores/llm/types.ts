// ---------------------------------------------------------------------------
// types.ts — All shared interfaces and type aliases for the LLM module
// ---------------------------------------------------------------------------

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'deepseek' | 'ollama';
export type PromptMode = 'lenient' | 'balanced' | 'rigorous' | 'clean' | 'format';

export interface LLMFormat {
  draft: string;
}

// ── Provider / Model ────────────────────────────────────────────────────────

export interface ModelOption {
  id: string;
  label: string;
  contextK: number;
  /**
   * GPT-5 / o-series use 'max_completion_tokens'; everything else uses 'max_tokens'.
   * Defaults to 'max_tokens' when omitted.
   */
  tokenParam?: 'max_tokens' | 'max_completion_tokens';
  /**
   * Set to true for models that reject custom temperature / top_p values
   * and only accept their defaults (e.g. GPT-5 family).
   */
  fixedSampling?: boolean;
}

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  baseUrl: string;
  apiKeyLabel: string;
  models: ModelOption[];
  requiresKey: boolean;
}

// ── Prompt Templates ────────────────────────────────────────────────────────

export interface PromptTemplate {
  id: PromptMode;
  label?: string;
  name?: string;
  description?: string;
  autoTrigger?: string;
  systemPrompt: string;
}

// ── LLM Response Contract ───────────────────────────────────────────────────

export interface Quiz {
  type: 'fill_blank' | 'multiple_choice' | 'mnemonic' | 'true_false';
  prompt: string;
  sentence?: string;
  options?: string[];
  answer: string;
  hint?: string;
}

export interface LLMFeedback {
  score: number;
  verdict: string;
  rating: 1 | 2 | 3 | 4;
  ratingReason: string;
  strengths: string[];
  gaps: string[];
  improvements: string[];
  mode: PromptMode;
}

// ── Challenge / Reconsideration ─────────────────────────────────────────────

export interface ChallengeEntry {
  challenge: string;
  reconsideration: LLMFeedback;
}

// ── Analyse Call Params ─────────────────────────────────────────────────────

export interface AnalyzeParams {
  question: string;
  correctAnswer: string;
  userAnswer: string;
  cardType?: 'new' | 'learn' | 'review';
  /** Override the active provider/model for this specific call (used by Re-analyze). */
  providerIdOverride?: ProviderId;
  modelIdOverride?: string;
}

// ── Persisted Config ────────────────────────────────────────────────────────

export interface PersistedLLMConfig {
  providerId: ProviderId;
  modelId: string;
  apiKey: string;
  promptMode: PromptMode | 'auto';
  submissionFormat: 'text' | 'markdown';
  customBaseUrl?: string;
}