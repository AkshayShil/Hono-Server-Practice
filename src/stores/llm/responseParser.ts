// ---------------------------------------------------------------------------
// responseParser.ts — Parse and sanitise raw LLM text into LLMFeedback
// ---------------------------------------------------------------------------

import type { LLMFeedback, PromptTemplate } from './types';

export function parseResponse(raw: string, template: PromptTemplate): LLMFeedback {
  if (!raw || !raw.trim()) {
    throw new Error('LLM returned an empty response. The output may have been cut off — try a shorter answer or switch models.');
  }

  // Strip markdown fences if the model ignored instructions
  let cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  // If the JSON was truncated mid-stream, attempt a best-effort recovery
  // by closing any open arrays/objects before parsing.
  if (!isLikelyComplete(cleaned)) {
    cleaned = attemptRepair(cleaned);
  }

  let feedback: LLMFeedback;
  try {
    feedback = JSON.parse(cleaned) as LLMFeedback;
  } catch (err) {
    // Surface the raw text so the developer can see exactly what came back
    const preview = raw.length > 300 ? raw.slice(0, 300) + '…' : raw;
    throw new Error(
      `Failed to parse LLM response as JSON.\n` +
      `Cause: ${(err as Error).message}\n` +
      `Raw response (first 300 chars):\n${preview}`
    );
  }

  // ── Safety clamps ────────────────────────────────────────────────────────
  feedback.score = Math.max(0, Math.min(100, feedback.score ?? 0));
  feedback.mode  = template.id;

  const r = Number(feedback.suggestedRating);
  feedback.suggestedRating     = ([1, 2, 3, 4].includes(r) ? r : 3) as 1 | 2 | 3 | 4;
  feedback.suggestedRatingReason = feedback.suggestedRatingReason ?? '';
  feedback.verdict              = feedback.verdict              ?? '';
  feedback.exemplar             = feedback.exemplar             ?? '';
  feedback.strengths    = feedback.strengths?.slice(0, 4)    ?? [];
  feedback.gaps         = feedback.gaps?.slice(0, 4)         ?? [];
  feedback.improvements = feedback.improvements?.slice(0, 4) ?? [];
  feedback.quizzes      = feedback.quizzes?.slice(0, 3)      ?? [];

  return feedback;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Quick heuristic — does the string end with a closing brace/bracket? */
function isLikelyComplete(json: string): boolean {
  const last = json.trimEnd().slice(-1);
  return last === '}' || last === ']';
}

/**
 * Best-effort repair for truncated JSON.
 * Closes any unclosed arrays/objects so JSON.parse has a chance to succeed.
 * Not guaranteed — a heavily truncated response will still throw, but the
 * error message above will tell you exactly what came back.
 */
function attemptRepair(json: string): string {
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (const ch of json) {
    if (escape)          { escape = false; continue; }
    if (ch === '\\')     { escape = true;  continue; }
    if (ch === '"')      { inString = !inString; continue; }
    if (inString)        { continue; }
    if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    if (ch === '}' || ch === ']') stack.pop();
  }

  // Close any unclosed string first, then close brackets in reverse order
  return json + (inString ? '"' : '') + stack.reverse().join('');
}