// ---------------------------------------------------------------------------
// promptTemplates.ts — System prompts + JSON schema contract for the LLM
// ---------------------------------------------------------------------------

import type { PromptTemplate } from './types';

// ---------------------------------------------------------------------------
// Shared: schema + global constraints (injected once per call)
// ---------------------------------------------------------------------------
const GLOBAL_SCHEMA = `
Return raw JSON only. No markdown.
{
  "score": number(0-100),
  "verdict": "string",
  "rating": 1|2|3|4,
  "ratingReason": "string",
  "strengths": ["string"],
  "gaps": ["string"],
  "improvements": ["string"],
  "mode": "lenient"|"balanced"|"rigorous"
}
Constraints:
- score: 70+ = pass. 1=Again 2=Hard 3=Good 4=Easy
- Max 3 items each: strengths, gaps, improvements
- gaps: each gap must be a single plain text string. Format: "Gap: [description of omission/error] | Fact: [the correct information]". Prioritise by UPSC exam relevance: factual errors first, missing critical provisions second, nice-to-have elaborations last or omit entirely. Never list a gap for a claim that is actually correct. Example: "Gap: Student omitted Article 61 | Fact: Article 61 governs Presidential impeachment."
- mode must match specified MODE
UPSC CSE context: Evaluate on factual accuracy and completeness of coverage — the same lens as a UPSC examiner.
PENALISE only: wrong facts, genuinely missing key points, broken or absent causal links.
DO NOT PENALISE: spelling variants of the same term, year-level date accuracy (month not required), synonymous phrasing, partial terminology when the underlying concept is clearly understood.
improvements must be UPSC-relevant: frame as "what would score higher in the exam" — specific missing fact or dimension, not generic "be more precise".
SCORING ANCHORS:
- 90–100: Core concept correct + source/origin + governing provisions + well explained
- 70–89: Core concept correct but missing 1–2 secondary dimensions
- 50–69: Core concept present but contains exactly one factual error
- below 50: Multiple factual errors or core concept wrong
CRITICAL: Before penalising any claim, verify it is factually incorrect. Do not penalise a correct statement simply because it was unexpected or phrased unusually.
`.trim();

// ---------------------------------------------------------------------------
// Mode-specific constraints (delta only — no repeated schema)
// ---------------------------------------------------------------------------
const MODE_CONSTRAINTS = {
  lenient: `MODE: lenient
Context: UPSC CSE — new or difficult card (ease ≤ 2). Student is still learning this topic.
Role: Encouraging tutor. Reward what was recalled; do not punish what was missed.
- Pass (score ≥ 60) if the core concept or central mechanism is present, even if incomplete or roughly phrased
- Ignore: partial enumeration, missing secondary details, imprecise terminology, rough phrasing
- gaps: at most 1–2 facts whose absence fundamentally distorts the concept (e.g. stated wrong organ, wrong causal direction)
- improvements: one key thing to add to the mental model to make recall stronger next time`,

  balanced: `MODE: balanced
Context: UPSC CSE — familiar card (ease 3). Student has studied this topic.
Role: UPSC Mains examiner checking a standard answer.
- Pass (score ≥ 70) if the answer covers the major dimensions the question asked for
- Check: are key cause-effect links correct? Are the main sub-points present (even if not exhaustive)?
- gaps: important points a UPSC examiner would expect that are genuinely absent — not wording differences
- improvements: specific missing fact or dimension that would push this from an average to a good UPSC answer`,

  rigorous: `MODE: rigorous
Context: UPSC CSE — well-known card (ease ≥ 4). Student should be able to nail this.
Role: Senior UPSC examiner checking a comprehensive answer.
- Pass (score ≥ 70) only if all key dimensions are covered and no factual errors are present
- Check: completeness across all sub-points asked, correct causal chains, no wrong facts, no important omissions
- gaps: any key fact or dimension missing that would cost marks in UPSC; flag factual errors explicitly
- improvements: what separates a 7/10 UPSC answer from a 9/10 here — name the specific missing element`,
} as const;

// ---------------------------------------------------------------------------
// Worksheet generator prompt (fed a JSONL batch of past attempts)
// ---------------------------------------------------------------------------
export const WORKSHEET_PROMPT = `
You will receive a JSONL batch where each line is:
{"card":"string","answer":"string","gaps":["string"],"score":number,"rating":number}

Task: Generate a targeted worksheet to address the student's weaknesses.
Return raw JSON only. No markdown.
{
  "clusters": [
    {
      "concept": "string",
      "cardCount": number,
      "exercises": [
        {
          "type": "fill_blank"|"multiple_choice"|"short_answer",
          "prompt": "string",
          "sentence": "string (fill_blank only, use ___ for gap)",
          "options": ["string"] (multiple_choice only, 4 items),
          "answer": "string"
        }
      ]
    }
  ]
}
Constraints:
- Group gaps into concept clusters (merge near-duplicates)
- 2–3 exercises per cluster, escalating difficulty
- Omit clusters where score ≥ 85 on all attempts
`.trim();

// ---------------------------------------------------------------------------
// Template builder
// ---------------------------------------------------------------------------
const buildReviewerPrompt = (mode: keyof typeof MODE_CONSTRAINTS): string =>
  `${MODE_CONSTRAINTS[mode]}\n\n${GLOBAL_SCHEMA}`;

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const ANTHROPIC_FORMAT_PROMPT = `
You are a spaced-repetition learning assistant. Given a CORRECT ANSWER, generate a CLEAR scaffolded draft in Markdown that guides a student to recall the answer from memory — without revealing any of the actual content.

OBJECTIVE:
Create a structured skeleton that captures the logical framework and dimensions of the answer. Use explicit "Recall Cues" so the student knows exactly *what category* of fact belongs in each blank, while ensuring the *content* itself is never revealed.

OUTPUT FORMAT:
Return raw JSON only, no preamble, no markdown fences:
{ "draft": "<Markdown string>" }

STRUCTURE RULES:
- Use **Bolded Anchors** to define categories or segments (e.g. **Major Provision:** ____).
- Use [Contextual Cues] inside or next to blanks for clarity: (e.g. \`____ [Article: ____]\` or \`____ [Mechanism: ____]\`).
- Mix formats freely as the answer demands:
  - Bullet points for unordered features or properties.
  - Numbered lists for sequences, steps, or logical progressions.
  - Markdown tables for comparisons, multi-attribute data, or structured mappings.
  - Headers (# or ##) for distinct sections if the answer is complex.
- Maintain one blank per distinct fact or dimension to be recalled.

STRICT CONSTRAINTS:
- ZERO content leakage: never include actual facts, names, dates, values, formulas, or specific examples from the answer.
- Labels and cues must describe the *category* or *type* of data, never the data itself (e.g. use "Provision: ____" not "Right to Equality: ____").
- No synonyms, paraphrases, or hints that would let a student guess the answer without true recall.
- Ensure the layout is visually intuitive — it should look like a "Form" that needs completion.
`.trim();

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'lenient',
    label: 'Lenient',
    description: 'For hard/new cards. Rewards conceptual grasp even if terminology is rough.',
    autoTrigger: 'Auto-selected for new or hard cards (ease ≤ 2)',
    systemPrompt: buildReviewerPrompt('lenient'),
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Default mode. Fair assessment expecting reasonable recall and terminology.',
    autoTrigger: 'Auto-selected for cards with normal difficulty (ease 3)',
    systemPrompt: buildReviewerPrompt('balanced'),
  },
  {
    id: 'rigorous',
    label: 'Rigorous',
    description: 'For well-known cards. Expects precise terminology and complete recall.',
    autoTrigger: 'Auto-selected for easy cards (ease ≥ 4)',
    systemPrompt: buildReviewerPrompt('rigorous'),
  },
  {
    id: 'clean',
    label: 'Text Cleaner',
    description: 'Fixes punctuation, grammar and formatting of voice transcripts.',
    systemPrompt: 'Fix punctuation, grammar, and formatting of the transcript. Preserve meaning and terminology. Return cleaned text only.',
  },
  {
    id: 'format',
    label: 'Format Generator',
    description: 'Generates a minimal structured draft to guide student recall.',
    systemPrompt: `Analyze the CORRECT ANSWER and generate a minimal structured draft (Markdown) for the student to fill in.
The goal is to provide a scaffold that guides the student's recall without giving away the answers.
Return raw JSON only: { "draft": "string (Markdown)" }

Structure Choice:
- Feel free to use a MISHMASH of formats as the answer demands: fill-in-the-blanks (____), bullet points, numbered lists, or Markdown tables.
- Use whatever structure best captures the "shape" of the answer while requiring the student to recall the actual content.

Constraints:
- PRIORITIZE high recall: provide the least amount of structure necessary to frame the answer.
- DO NOT include actual facts, specific names, or values from the correct answer in the draft.
- Return the draft as Markdown.`,
  },
];
