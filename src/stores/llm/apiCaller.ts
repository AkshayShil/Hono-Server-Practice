// ---------------------------------------------------------------------------
// apiCaller.ts — Thin fetch wrappers, one per provider family.
// Each function returns the raw text from the model.
//
// TRUNCATION POLICY:
//   finish_reason: "length" / "MAX_TOKENS" means the model answered but ran
//   out of output tokens mid-response. We return the partial content and let
//   responseParser.attemptRepair() close any open JSON brackets. This gives
//   the best chance of a usable result. We only throw for truly empty
//   responses or hard refusals (content_filter / SAFETY).
// ---------------------------------------------------------------------------

import { INFERENCE_DEFAULTS } from './apiConfig';
import type { ModelOption, PromptTemplate } from './types';

interface CallParams {
  baseUrl: string;
  apiKey: string;
  model: ModelOption;
  template: PromptTemplate;
  userMessage: string;
}

// ── Anthropic ────────────────────────────────────────────────────────────────

export async function callAnthropic({
  baseUrl, apiKey, model, template, userMessage,
}: CallParams): Promise<string> {
  const res = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model.id,
      max_tokens: INFERENCE_DEFAULTS.maxTokens,
      temperature: INFERENCE_DEFAULTS.temperature,
      top_p: INFERENCE_DEFAULTS.topP,
      system: template.systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);

  const data = await res.json() as {
    content: Array<{ type: string; text: string }>;
    stop_reason: string;
  };

  if (data.stop_reason === 'max_tokens') {
    // Truncated — log and return partial content for repair
    console.warn('[apiCaller] Anthropic: stop_reason=max_tokens — response truncated, attempting repair');
  }

  const text = data.content.find(b => b.type === 'text')?.text ?? '';
  if (!text) throw new Error(`Anthropic returned an empty response (stop_reason: ${data.stop_reason})`);
  return text;
}

// ── Google Gemini ────────────────────────────────────────────────────────────

export async function callGoogle({
  baseUrl, apiKey, model, template, userMessage,
}: CallParams): Promise<string> {
  const url = `${baseUrl}/models/${model.id}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: template.systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: {
        maxOutputTokens: INFERENCE_DEFAULTS.maxTokens,
        temperature: INFERENCE_DEFAULTS.temperature,
        topP: INFERENCE_DEFAULTS.topP,
      },
    }),
  });

  if (!res.ok) throw new Error(`Google API error ${res.status}: ${await res.text()}`);

  const data = await res.json() as {
    candidates: Array<{
      content: { parts: Array<{ text: string }> };
      finishReason: string;
    }>;
  };

  const candidate = data.candidates[0];
  const finishReason = candidate?.finishReason ?? 'UNKNOWN';

  if (finishReason === 'SAFETY') {
    throw new Error('Google blocked this response due to safety filters. Try rephrasing your answer.');
  }
  if (finishReason === 'MAX_TOKENS') {
    // Truncated — log and let repair handle it
    console.warn('[apiCaller] Google: finishReason=MAX_TOKENS — response truncated, attempting repair');
  }

  const text = candidate?.content.parts[0]?.text ?? '';
  if (!text) throw new Error(`Google returned an empty response (finishReason: ${finishReason})`);
  return text;
}

// ── OpenAI-compatible (OpenAI / OpenRouter / Ollama) ────────────────────────

interface OpenAICompatParams extends CallParams {
  providerId: string;
  requiresKey: boolean;
}

export async function callOpenAICompat({
  baseUrl, apiKey, model, template, userMessage, providerId, requiresKey,
}: OpenAICompatParams): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (apiKey && requiresKey) headers['Authorization'] = `Bearer ${apiKey}`;
  if (providerId === 'openrouter') {
    headers['HTTP-Referer'] = 'https://anki-sakura-reviewer';
    headers['X-Title'] = 'Anki // 桜';
  }

  const tokenParam = model.tokenParam ?? 'max_tokens';

  // GPT-5 / o-series only accept their default sampling params — omit entirely.
  const samplingParams = model.fixedSampling
    ? {}
    : { temperature: INFERENCE_DEFAULTS.temperature, top_p: INFERENCE_DEFAULTS.topP };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model.id,
      [tokenParam]: INFERENCE_DEFAULTS.maxTokens,
      ...samplingParams,
      messages: [
        { role: 'system', content: template.systemPrompt },
        { role: 'user',   content: userMessage },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);

  const data = await res.json() as {
    choices: Array<{
      message: { content: string | null };
      finish_reason: string;
    }>;
  };

  const choice = data.choices[0];
  const finishReason = choice?.finish_reason ?? 'unknown';
  const content = choice?.message?.content ?? '';

  // Hard refusal — no content will ever come from this request
  if (finishReason === 'content_filter') {
    throw new Error(
      'OpenAI refused this response due to content filtering. Try rephrasing your answer.'
    );
  }

  // Truncation — content exists but JSON is cut off mid-stream.
  // Return the partial content and let responseParser.attemptRepair() handle it.
  // This is NOT an error — it means maxTokens needs to be raised if it happens often.
  if (finishReason === 'length') {
    console.warn(
      `[apiCaller] OpenAI: finish_reason=length — response truncated at ${INFERENCE_DEFAULTS.maxTokens} tokens.\n` +
      `Passing partial content to responseParser for repair. If this happens frequently, raise maxTokens in apiConfig.ts.`
    );
    // Fall through — content is the partial JSON, repair will handle it
  }

  // Truly empty — model returned nothing at all
  if (!content) {
    throw new Error(
      `OpenAI returned an empty response (finish_reason: "${finishReason}", model: ${model.id}).\n` +
      `This usually means the model is unavailable or the request was malformed.`
    );
  }

  return content;
}