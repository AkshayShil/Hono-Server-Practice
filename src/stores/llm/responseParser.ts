// ---------------------------------------------------------------------------
// responseParser.ts — Parse and sanitise raw LLM text into LLMFeedback
// ---------------------------------------------------------------------------

import type { LLMFeedback, PromptTemplate } from './types';

export function parseResponse(raw: string, template: PromptTemplate): LLMFeedback {
  if (!raw || !raw.trim()) {
    throw new Error(
      'LLM returned an empty response. ' +
      'The model may be unavailable — try the Retry button, or switch to a different model.'
    );
  }

  // Strip markdown fences if the model ignored instructions
  let cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  // If the JSON was truncated mid-stream (finish_reason: "length"),
  // attempt a best-effort recovery before trying to parse.
  if (!isLikelyComplete(cleaned)) {
    console.warn('[responseParser] JSON appears incomplete — attempting repair');
    cleaned = attemptRepair(cleaned);
  }

  let feedback: LLMFeedback;
  try {
    feedback = JSON.parse(cleaned) as LLMFeedback;
  } catch (err) {
    const preview = raw.length > 400 ? raw.slice(0, 400) + '…' : raw;
    throw new Error(
      `Failed to parse LLM response as JSON.\n` +
      `Cause: ${(err as Error).message}\n\n` +
      `This usually means the response was truncated too severely to repair.\n` +
      `Try the Retry button — the model may return a complete response next time.\n\n` +
      `Raw response (first 400 chars):\n${preview}`
    );
  }

  // ── Safety clamps — fill any missing fields so the UI never crashes ───────
  feedback.score = Math.max(0, Math.min(100, Number(feedback.score) || 0));
  feedback.mode  = template.id;

  const r = Number(feedback.suggestedRating);
  feedback.suggestedRating       = ([1, 2, 3, 4].includes(r) ? r : 3) as 1 | 2 | 3 | 4;
  feedback.suggestedRatingReason = feedback.suggestedRatingReason ?? '';
  feedback.verdict               = feedback.verdict               ?? '';
  feedback.exemplar              = feedback.exemplar              ?? '';
  feedback.strengths             = Array.isArray(feedback.strengths)    ? feedback.strengths.slice(0, 4)    : [];
  feedback.gaps                  = Array.isArray(feedback.gaps)         ? feedback.gaps.slice(0, 4)         : [];
  feedback.improvements          = Array.isArray(feedback.improvements) ? feedback.improvements.slice(0, 4) : [];
  feedback.quizzes               = Array.isArray(feedback.quizzes)      ? feedback.quizzes.slice(0, 3)      : [];

  // Sanitise each quiz so the UI never crashes on a partial quiz object
  feedback.quizzes = feedback.quizzes.map(q => ({
    type:     q.type     ?? 'fill_blank',
    prompt:   q.prompt   ?? '',
    sentence: q.sentence ?? '',
    options:  Array.isArray(q.options) ? q.options : [],
    answer:   q.answer   ?? '',
    hint:     q.hint     ?? '',
  }));

  return feedback;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Does the string end with a closing brace or bracket? */
function isLikelyComplete(json: string): boolean {
  const trimmed = json.trimEnd();
  return trimmed.endsWith('}') || trimmed.endsWith(']');
}

/**
 * Best-effort repair for truncated JSON (finish_reason: "length").
 *
 * Strategy:
 *   1. Walk the string tracking open brackets/braces and string state.
 *   2. If we ended mid-string, close it with a neutral value.
 *   3. Close any open arrays with an empty sentinel, then close objects.
 *
 * This handles the most common truncation patterns:
 *   - Cut off mid-string value  → close the string
 *   - Cut off mid-array         → close the array
 *   - Cut off mid-object        → close the object
 */
function attemptRepair(json: string): string {
  const stack: Array<'{' | '['> = [];
  let inString = false;
  let escape = false;

  for (const ch of json) {
    if (escape)      { escape = false; continue; }
    if (ch === '\\') { escape = true;  continue; }
    if (ch === '"')  { inString = !inString; continue; }
    if (inString)    { continue; }

    if (ch === '{' || ch === '[') stack.push(ch);
    if (ch === '}' || ch === ']') stack.pop();
  }

  let suffix = '';

  // Close an open string value with an ellipsis to signal truncation
  if (inString) suffix += '…"';

  // Close open structures in reverse order
  for (let i = stack.length - 1; i >= 0; i--) {
    suffix += stack[i] === '{' ? '}' : ']';
  }

  return json + suffix;
}