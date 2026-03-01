import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// ---------------------------------------------------------------------------
// LLM Feedback Response Schema
// This is the contract between the LLM and the UI.
// The LLM MUST return a JSON object matching this interface.
// ---------------------------------------------------------------------------

export interface Quiz {
  type: 'fill_blank' | 'multiple_choice' | 'mnemonic' | 'true_false';
  prompt: string;
  /** Blanked sentence for fill_blank, e.g. "The mitochondria is the ___ of the cell." */
  sentence?: string;
  /** Options for multiple_choice */
  options?: string[];
  /** The correct answer */
  answer: string;
  /** Memory aid for mnemonic type */
  hint?: string;
}

export interface LLMFeedback {
  /** 0–100 score of how well the student understood the concept */
  score: number;
  /** One-line verdict: "Strong grasp", "Partial recall", "Major gaps", etc. */
  verdict: string;
  /**
   * Anki rating the LLM recommends based on the answer quality.
   * 1=Again, 2=Hard, 3=Good, 4=Easy
   * Final choice always belongs to the student.
   */
  suggestedRating: 1 | 2 | 3 | 4;
  /** One sentence explaining WHY this rating was suggested */
  suggestedRatingReason: string;
  /** What the student got right — be specific, reference their words */
  strengths: string[];
  /** Key concepts, terms or points missing from the answer */
  gaps: string[];
  /** How to phrase it better — concrete rewording suggestions */
  improvements: string[];
  /** The model answer the student should aim toward */
  exemplar: string;
  /** 1–3 micro-quizzes targeting exactly the gaps identified */
  quizzes: Quiz[];
  /** Overall tone of feedback: lenient | balanced | rigorous */
  mode: 'lenient' | 'balanced' | 'rigorous';
}

// ---------------------------------------------------------------------------
// Provider & Model Catalogue
// ---------------------------------------------------------------------------

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'ollama';

export interface ModelOption {
  id: string;
  label: string;
  contextK: number;
}

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  baseUrl: string;
  apiKeyLabel: string;
  models: ModelOption[];
  /** Whether this provider needs an API key */
  requiresKey: boolean;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyLabel: 'OpenAI API Key',
    requiresKey: true,
    models: [
      { id: 'gpt-5.2',           label: 'GPT-5.2',           contextK: 400 },
      { id: 'gpt-5-mini',      label: 'GPT-5 Mini',      contextK: 400 },
      { id: 'gpt-5-nano',      label: 'GPT-5 Nano',      contextK: 400 },
      { id: 'gpt-3.5-turbo',    label: 'GPT-3.5 Turbo',    contextK: 16  },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyLabel: 'Anthropic API Key',
    requiresKey: true,
    models: [
      { id: 'claude-opus-4-6',     label: 'Claude Opus 4.6',     contextK: 200 },
      { id: 'claude-sonnet-4-6',   label: 'Claude Sonnet 4.6',   contextK: 200 },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', contextK: 200 },
    ],
  },
  {
    id: 'google',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyLabel: 'Google AI API Key',
    requiresKey: true,
    models: [
      { id: 'gemini-2.0-flash',       label: 'Gemini 2.0 Flash',       contextK: 1000 },
      { id: 'gemini-1.5-pro',         label: 'Gemini 1.5 Pro',         contextK: 1000 },
      { id: 'gemini-1.5-flash',       label: 'Gemini 1.5 Flash',       contextK: 1000 },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyLabel: 'OpenRouter API Key',
    requiresKey: true,
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct',  label: 'Llama 3.3 70B',         contextK: 128 },
      { id: 'deepseek/deepseek-r1',                label: 'DeepSeek R1',            contextK: 64  },
      { id: 'mistralai/mistral-large',             label: 'Mistral Large',          contextK: 128 },
      { id: 'qwen/qwen-2.5-72b-instruct',          label: 'Qwen 2.5 72B',           contextK: 128 },
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    apiKeyLabel: 'Not required',
    requiresKey: false,
    models: [
      { id: 'llama3.2',   label: 'Llama 3.2',   contextK: 128 },
      { id: 'mistral',    label: 'Mistral 7B',  contextK: 32  },
      { id: 'qwen2.5',    label: 'Qwen 2.5',    contextK: 128 },
      { id: 'phi4',       label: 'Phi-4',       contextK: 16  },
    ],
  },
];

// ---------------------------------------------------------------------------
// Prompt Templates
// Prompt mode is auto-selected based on card difficulty, or manually set.
// ---------------------------------------------------------------------------

export type PromptMode = 'lenient' | 'balanced' | 'rigorous';

export interface PromptTemplate {
  id: PromptMode;
  label: string;
  description: string;
  /** When this is auto-selected based on card stats */
  autoTrigger: string;
  systemPrompt: string;
}

const JSON_SCHEMA = `
Return ONLY valid JSON — no markdown fences, no preamble.
Schema:
{
  "score": <0–100 integer>,
  "verdict": "<one punchy line>",
  "suggestedRating": <1|2|3|4>,
  "suggestedRatingReason": "<one sentence: why this Anki rating fits>",
  "strengths": ["<what they got right, citing their words>", ...],
  "gaps": ["<missing concept or term>", ...],
  "improvements": ["<concrete rephrasing suggestion>", ...],
  "exemplar": "<model answer they should aim toward>",
  "quizzes": [
    {
      "type": "fill_blank" | "multiple_choice" | "mnemonic" | "true_false",
      "prompt": "<instruction to student>",
      "sentence": "<for fill_blank only: sentence with ___ gap>",
      "options": ["<for multiple_choice only>", ...],
      "answer": "<correct answer>",
      "hint":   "<for mnemonic only: memory hook>"
    }
  ],
  "mode": "lenient" | "balanced" | "rigorous"
}
Rules:
- strengths, gaps, improvements: 1–4 items each
- quizzes: 1–3 items, target exactly the gaps found
- exemplar: 2–4 sentences, accurate and concise
- score 0–100: 70+ means pass
- suggestedRating: 1=Again (major gaps), 2=Hard (partial recall), 3=Good (solid), 4=Easy (complete+precise)
- suggestedRatingReason: one sentence referencing the specific gap or strength that determined the rating
- mode must match the system prompt mode
`.trim();

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'lenient',
    label: 'Lenient',
    description: 'For hard/new cards. Rewards conceptual grasp even if terminology is rough.',
    autoTrigger: 'Auto-selected for new or hard cards (ease ≤ 2)',
    systemPrompt: `You are a kind study coach reviewing a student's answer to a flashcard.
The student is struggling with this material — it is marked as difficult.

Evaluation philosophy (LENIENT mode):
- Award points generously for correct concepts even if technical vocabulary is missing or imprecise
- If they got the core idea right in plain language, that counts
- Do NOT penalise for missing minor details — focus on the central concept
- Score ≥ 60 if the main idea is present, even partially
- Strengths should be warm and specific — quote their words
- Gaps should name only the 1–2 most important missing pieces, not everything
- Improvements should be gentle rewording suggestions, never corrections
- Quizzes must target ONLY the most critical gap — prefer fill_blank or mnemonic types
- Mnemonic hints should be creative, memorable, and fun

${JSON_SCHEMA}`,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Default mode. Fair assessment expecting reasonable recall and terminology.',
    autoTrigger: 'Auto-selected for cards with normal difficulty (ease 3)',
    systemPrompt: `You are an experienced tutor reviewing a student's flashcard answer.

Evaluation philosophy (BALANCED mode):
- Expect correct concepts AND reasonable use of terminology
- Award partial credit for partially correct answers
- Score 70–85 for solid answers with minor gaps
- Strengths: note 1–3 things they clearly understood
- Gaps: name the 2–3 most important missing concepts or terms
- Improvements: suggest how to make the answer more precise and complete
- Quizzes: 2 quizzes mixing fill_blank and multiple_choice targeting the gaps
- Exemplar: write a thorough, well-structured model answer

${JSON_SCHEMA}`,
  },
  {
    id: 'rigorous',
    label: 'Rigorous',
    description: 'For easy/mature cards. Expects precision, correct terminology, full coverage.',
    autoTrigger: 'Auto-selected for easy/mature cards (ease ≥ 4)',
    systemPrompt: `You are a strict academic examiner reviewing a student's answer.
This card is well-established in the student's memory — hold them to a high standard.

Evaluation philosophy (RIGOROUS mode):
- Expect correct, precise terminology throughout
- Vague or imprecise language should reduce the score
- Missing any significant concept is a meaningful gap
- Score 90+ only for answers that are accurate, complete, and well-expressed
- Strengths: acknowledge only genuinely strong elements
- Gaps: list all missing concepts, terms, or nuances
- Improvements: demand precision — suggest exact technical language
- Quizzes: 2–3 quizzes using multiple_choice and true_false to probe edge-case understanding
- Exemplar: write a comprehensive, exam-quality model answer

${JSON_SCHEMA}`,
  },
];

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'ankiStudy:llm';

interface PersistedLLMConfig {
  providerId: ProviderId;
  modelId: string;
  apiKey: string;
  promptMode: PromptMode | 'auto';
  customBaseUrl?: string;
}

function loadConfig(): PersistedLLMConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PersistedLLMConfig;
  } catch { /* ignore */ }
  return {
    providerId: 'openai',
    modelId: 'gpt-5-mini',
    apiKey: '',
    promptMode: 'auto',
  };
}

function saveConfig(cfg: PersistedLLMConfig): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}

export const useLLMStore = defineStore('llm', () => {
  const _cfg = loadConfig();

  const providerId   = ref<ProviderId>(_cfg.providerId);
  const modelId      = ref<string>(_cfg.modelId);
  const apiKey       = ref<string>(_cfg.apiKey);
  const promptMode   = ref<PromptMode | 'auto'>(_cfg.promptMode);
  const customBaseUrl = ref<string>(_cfg.customBaseUrl ?? '');

  const provider  = computed(() => PROVIDERS.find(p => p.id === providerId.value) ?? PROVIDERS[0]!);
  const models    = computed(() => provider.value.models);
  const template  = computed(() => {
    if (promptMode.value === 'auto') return null; // resolved at call time
    return PROMPT_TEMPLATES.find(t => t.id === promptMode.value) ?? PROMPT_TEMPLATES[1]!;
  });

  function setProvider(id: ProviderId): void {
    providerId.value = id;
    // Default to first model of new provider
    modelId.value = PROVIDERS.find(p => p.id === id)?.models[0]?.id ?? '';
    persist();
  }

  function setModel(id: string): void { modelId.value = id; persist(); }
  function setApiKey(key: string): void { apiKey.value = key; persist(); }
  function setPromptMode(mode: PromptMode | 'auto'): void { promptMode.value = mode; persist(); }
  function setCustomBaseUrl(url: string): void { customBaseUrl.value = url; persist(); }

  function persist(): void {
    saveConfig({
      providerId: providerId.value,
      modelId: modelId.value,
      apiKey: apiKey.value,
      promptMode: promptMode.value,
      customBaseUrl: customBaseUrl.value,
    });
  }

  /**
   * Resolve which prompt template to use.
   * If mode is 'auto', pick based on card ease (from AnkiConnect getDeckStats
   * we don't have per-card ease yet, so we infer from the card type string).
   * cardType: 'new' | 'learn' | 'review'
   */
  function resolveTemplate(cardType?: 'new' | 'learn' | 'review', easeOverride?: number): PromptTemplate {
    if (promptMode.value !== 'auto') {
      return PROMPT_TEMPLATES.find(t => t.id === promptMode.value) ?? PROMPT_TEMPLATES[1]!;
    }
    // Auto-selection heuristic
    if (cardType === 'new' || cardType === 'learn') return PROMPT_TEMPLATES[0]!; // lenient
    if (easeOverride !== undefined) {
      if (easeOverride <= 2) return PROMPT_TEMPLATES[0]!; // lenient
      if (easeOverride >= 4) return PROMPT_TEMPLATES[2]!; // rigorous
    }
    return PROMPT_TEMPLATES[1]!; // balanced default
  }

  /**
   * Build the user message payload from card context.
   */
  function buildUserMessage(params: {
    question: string;
    correctAnswer: string;
    userAnswer: string;
    cardType?: 'new' | 'learn' | 'review';
  }): string {
    return `QUESTION:
${params.question}

CORRECT ANSWER (from card):
${params.correctAnswer}

STUDENT'S ANSWER:
${params.userAnswer}

Card type: ${params.cardType ?? 'review'}

Analyse the student's answer against the correct answer. Return JSON.`;
  }

  /**
   * Call the configured LLM provider and return parsed LLMFeedback.
   * Handles OpenAI-compatible, Anthropic, and Google APIs.
   */
  async function analyze(params: {
    question: string;
    correctAnswer: string;
    userAnswer: string;
    cardType?: 'new' | 'learn' | 'review';
  }): Promise<LLMFeedback> {
    const tmpl = resolveTemplate(params.cardType);
    const userMsg = buildUserMessage(params);
    const p = provider.value;

    const baseUrl = customBaseUrl.value.trim() || p.baseUrl;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    let raw: string;

    if (p.id === 'anthropic') {
      headers['x-api-key'] = apiKey.value;
      headers['anthropic-version'] = '2023-06-01';

      const body = {
        model: modelId.value,
        max_tokens: 1500,
        system: tmpl.systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      };

      const res = await fetch(`${baseUrl}/messages`, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
      const data = await res.json() as { content: Array<{ type: string; text: string }> };
      raw = data.content.find(b => b.type === 'text')?.text ?? '';

    } else if (p.id === 'google') {
      const url = `${baseUrl}/models/${modelId.value}:generateContent?key=${apiKey.value}`;
      const body = {
        systemInstruction: { parts: [{ text: tmpl.systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { maxOutputTokens: 1500, temperature: 0.3 },
      };
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`Google API error ${res.status}: ${await res.text()}`);
      const data = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
      raw = data.candidates[0]?.content.parts[0]?.text ?? '';

    } else {
      // OpenAI-compatible (OpenAI, OpenRouter, Ollama)
      if (apiKey.value && p.requiresKey) headers['Authorization'] = `Bearer ${apiKey.value}`;
      if (p.id === 'openrouter') {
        headers['HTTP-Referer'] = 'https://anki-sakura-reviewer';
        headers['X-Title'] = 'Anki // 桜';
      }

      const body = {
        model: modelId.value,
        max_tokens: 1500,
        temperature: 0.3,
        messages: [
          { role: 'system', content: tmpl.systemPrompt },
          { role: 'user',   content: userMsg },
        ],
      };

      const res = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
      const data = await res.json() as { choices: Array<{ message: { content: string } }> };
      raw = data.choices[0]?.message.content ?? '';
    }

    // Strip markdown fences if model ignored instructions
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const feedback = JSON.parse(cleaned) as LLMFeedback;

    // Safety clamp
    feedback.score = Math.max(0, Math.min(100, feedback.score));
    feedback.mode = tmpl.id;
    // Clamp suggestedRating to valid Anki values 1–4
    const r = Number(feedback.suggestedRating);
    feedback.suggestedRating = ([1, 2, 3, 4].includes(r) ? r : 3) as 1 | 2 | 3 | 4;
    feedback.suggestedRatingReason = feedback.suggestedRatingReason ?? '';
    feedback.strengths    = feedback.strengths?.slice(0, 4) ?? [];
    feedback.gaps         = feedback.gaps?.slice(0, 4) ?? [];
    feedback.improvements = feedback.improvements?.slice(0, 4) ?? [];
    feedback.quizzes      = feedback.quizzes?.slice(0, 3) ?? [];

    return feedback;
  }

  return {
    // State
    providerId, modelId, apiKey, promptMode, customBaseUrl,
    // Derived
    provider, models, template,
    // Actions
    setProvider, setModel, setApiKey, setPromptMode, setCustomBaseUrl,
    resolveTemplate, analyze,
    // Catalogue
    PROVIDERS, PROMPT_TEMPLATES,
  };
});