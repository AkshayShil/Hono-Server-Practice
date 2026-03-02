<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LLMFeedback, Quiz } from '@/stores/llm/'

const props = defineProps<{
    feedback: LLMFeedback
}>()

// Score class
const scoreClass = computed(() => {
    if (props.feedback.score >= 80) return 'score--high'
    if (props.feedback.score >= 55) return 'score--mid'
    return 'score--low'
})

// Quiz interaction state
const quizAnswers = ref<Record<number, string>>({})
const quizRevealed = ref<Record<number, boolean>>({})

function revealQuiz(i: number): void {
    quizRevealed.value[i] = true
}
function isCorrect(quiz: Quiz, i: number): boolean {
    return (quizAnswers.value[i] ?? '').trim().toLowerCase() === quiz.answer.toLowerCase()
}
</script>

<template>
    <div class="analysis-panel">
        <!-- Score bar -->
        <div class="score-row">
            <div class="score-circle" :class="scoreClass">
                <span class="score-num">{{ feedback.score }}</span>
                <span class="score-denom">/100</span>
            </div>
            <div class="verdict-block">
                <p class="verdict">{{ feedback.verdict }}</p>
                <span class="mode-chip" :class="`mode-chip--${feedback.mode}`">
                    {{ feedback.mode }}
                </span>
            </div>
        </div>

        <!-- Score bar fill -->
        <div class="bar-track">
            <div class="bar-fill" :class="scoreClass" :style="{ width: feedback.score + '%' }" />
        </div>

        <!-- Strengths -->
        <div v-if="feedback.strengths.length" class="detail-block">
            <p class="detail-label detail-label--good">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="w-3 h-3"
                >
                    <polyline points="20 6 9 17 4 12" />
                </svg>
                What you got right
            </p>
            <ul class="detail-list">
                <li v-for="(s, i) in feedback.strengths" :key="i">{{ s }}</li>
            </ul>
        </div>

        <!-- Gaps -->
        <div v-if="feedback.gaps.length" class="detail-block">
            <p class="detail-label detail-label--gap">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="w-3 h-3"
                >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Gaps to fill
            </p>
            <ul class="detail-list detail-list--gap">
                <li v-for="(g, i) in feedback.gaps" :key="i">{{ g }}</li>
            </ul>
        </div>

        <!-- Improvements -->
        <div v-if="feedback.improvements.length" class="detail-block">
            <p class="detail-label detail-label--improve">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="w-3 h-3"
                >
                    <path d="M12 20V10m0 0l-3 3m3-3l3 3" />
                    <path d="M5 3h14" />
                </svg>
                How to improve
            </p>
            <ul class="detail-list">
                <li v-for="(im, i) in feedback.improvements" :key="i">{{ im }}</li>
            </ul>
        </div>

        <!-- Exemplar -->
        <div v-if="feedback.exemplar" class="exemplar-block">
            <p class="detail-label">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="w-3 h-3"
                >
                    <path
                        d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01z"
                    />
                </svg>
                Model answer
            </p>
            <p class="exemplar-text">{{ feedback.exemplar }}</p>
        </div>

        <!-- Quizzes -->
        <div v-if="feedback.quizzes.length" class="quizzes-section">
            <p class="detail-label">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="w-3 h-3"
                >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Practice quizzes
            </p>

            <div v-for="(quiz, qi) in feedback.quizzes" :key="qi" class="quiz-card">
                <span class="quiz-type-chip">{{ quiz.type.replace('_', ' ') }}</span>
                <p class="quiz-prompt">{{ quiz.prompt }}</p>

                <!-- Fill blank -->
                <div v-if="quiz.type === 'fill_blank'" class="quiz-interaction">
                    <p class="quiz-sentence">{{ quiz.sentence }}</p>
                    <div class="quiz-input-row">
                        <input
                            v-model="quizAnswers[qi]"
                            :disabled="quizRevealed[qi]"
                            type="text"
                            placeholder="Fill in the blank…"
                            class="quiz-input"
                            :class="{
                                'quiz-input--correct': quizRevealed[qi] && isCorrect(quiz, qi),
                                'quiz-input--wrong': quizRevealed[qi] && !isCorrect(quiz, qi),
                            }"
                            @keydown.enter="revealQuiz(qi)"
                        />
                        <button
                            v-if="!quizRevealed[qi]"
                            @click="revealQuiz(qi)"
                            class="quiz-reveal-btn"
                        >
                            Check
                        </button>
                    </div>
                    <p v-if="quizRevealed[qi]" class="quiz-answer-reveal">
                        Answer: <strong>{{ quiz.answer }}</strong>
                    </p>
                </div>

                <!-- Multiple choice -->
                <div v-else-if="quiz.type === 'multiple_choice'" class="quiz-interaction">
                    <div class="mc-options">
                        <button
                            v-for="(opt, oi) in quiz.options"
                            :key="oi"
                            @click="((quizAnswers[qi] = opt), revealQuiz(qi))"
                            :disabled="quizRevealed[qi]"
                            class="mc-option"
                            :class="{
                                'mc-option--correct': quizRevealed[qi] && opt === quiz.answer,
                                'mc-option--wrong':
                                    quizRevealed[qi] &&
                                    quizAnswers[qi] === opt &&
                                    opt !== quiz.answer,
                            }"
                        >
                            {{ opt }}
                        </button>
                    </div>
                </div>

                <!-- True / False -->
                <div v-else-if="quiz.type === 'true_false'" class="quiz-interaction">
                    <div class="tf-row">
                        <button
                            v-for="opt in ['True', 'False']"
                            :key="opt"
                            @click="((quizAnswers[qi] = opt), revealQuiz(qi))"
                            :disabled="quizRevealed[qi]"
                            class="tf-btn"
                            :class="{
                                'tf-btn--correct': quizRevealed[qi] && opt === quiz.answer,
                                'tf-btn--wrong':
                                    quizRevealed[qi] &&
                                    quizAnswers[qi] === opt &&
                                    opt !== quiz.answer,
                            }"
                        >
                            {{ opt }}
                        </button>
                    </div>
                    <p v-if="quizRevealed[qi]" class="quiz-answer-reveal">
                        Answer: <strong>{{ quiz.answer }}</strong>
                    </p>
                </div>

                <!-- Mnemonic -->
                <div v-else-if="quiz.type === 'mnemonic'" class="quiz-interaction">
                    <div class="mnemonic-box">
                        <span class="mnemonic-label">Memory hook</span>
                        <p class="mnemonic-text">{{ quiz.hint }}</p>
                    </div>
                    <p class="quiz-answer-reveal">
                        Remember: <strong>{{ quiz.answer }}</strong>
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>

<style lang="less" scoped>
@pink: #f4cfdf;
@muted: #b399a2;
@text: #2c2426;
@good: rgba(80, 160, 100, 0.85);
@gap: rgba(190, 100, 80, 0.8);
@mid: rgba(190, 150, 60, 0.85);

// ── Panel wrapper ─────────────────────────────────────────────────────────
.analysis-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 14px;
    margin-top: 8px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.3);
    border: 1px solid rgba(244, 207, 223, 0.25);
}

// ── Score ─────────────────────────────────────────────────────────────────
.score-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.score-circle {
    display: flex;
    align-items: baseline;
    gap: 1px;
    flex-shrink: 0;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid;

    &.score--high {
        background: rgba(80, 160, 100, 0.12);
        border-color: rgba(80, 160, 100, 0.3);
        color: rgba(50, 130, 70, 0.9);
    }
    &.score--mid {
        background: rgba(190, 150, 60, 0.12);
        border-color: rgba(190, 150, 60, 0.3);
        color: rgba(150, 110, 30, 0.9);
    }
    &.score--low {
        background: rgba(190, 100, 80, 0.12);
        border-color: rgba(190, 100, 80, 0.3);
        color: rgba(160, 70, 55, 0.9);
    }
}

.score-num {
    font-size: 20px;
    font-weight: 600;
    line-height: 1;
}
.score-denom {
    font-size: 9px;
    opacity: 0.6;
}

.verdict-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.verdict {
    font-size: 12px;
    font-weight: 500;
    color: @text;
    line-height: 1.3;
}

.mode-chip {
    display: inline-block;
    font-size: 8px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 10px;
    width: fit-content;

    &--lenient {
        background: rgba(144, 190, 144, 0.25);
        color: #4a7a4a;
    }
    &--balanced {
        background: rgba(179, 153, 162, 0.2);
        color: #7a5a62;
    }
    &--rigorous {
        background: rgba(190, 144, 144, 0.25);
        color: #7a4a4a;
    }
}

// ── Score bar ─────────────────────────────────────────────────────────────
.bar-track {
    height: 3px;
    background: rgba(244, 207, 223, 0.3);
    border-radius: 2px;
    overflow: hidden;
}

.bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 1s cubic-bezier(0.34, 1.2, 0.64, 1);

    &.score--high {
        background: rgba(80, 160, 100, 0.7);
    }
    &.score--mid {
        background: rgba(190, 150, 60, 0.7);
    }
    &.score--low {
        background: rgba(190, 100, 80, 0.7);
    }
}

// ── Detail blocks ─────────────────────────────────────────────────────────
.detail-block {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.detail-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 8px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: rgba(179, 153, 162, 0.65);

    &--good {
        color: rgba(80, 150, 90, 0.75);
    }
    &--gap {
        color: rgba(180, 90, 70, 0.75);
    }
    &--improve {
        color: rgba(130, 100, 170, 0.75);
    }
}

.detail-list {
    padding-left: 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    list-style: disc;

    li {
        font-size: 11px;
        color: rgba(44, 36, 38, 0.78);
        line-height: 1.55;
        list-style-position: outside;
        padding-left: 4px;
    }

    &--gap li {
        color: rgba(160, 70, 55, 0.8);
    }
}

// ── Exemplar ──────────────────────────────────────────────────────────────
.exemplar-block {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.exemplar-text {
    font-size: 11px;
    line-height: 1.65;
    color: rgba(44, 36, 38, 0.75);
    font-style: italic;
    padding: 8px 10px;
    background: rgba(252, 240, 242, 0.55);
    border-radius: 6px;
    border-left: 2px solid rgba(244, 207, 223, 0.6);
}

// ── Quizzes ───────────────────────────────────────────────────────────────
.quizzes-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.quiz-card {
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.45);
    border: 1px solid rgba(244, 207, 223, 0.3);
    display: flex;
    flex-direction: column;
    gap: 7px;
}

.quiz-type-chip {
    font-size: 7px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: rgba(179, 153, 162, 0.55);
}

.quiz-prompt {
    font-size: 11px;
    font-weight: 500;
    color: @text;
    line-height: 1.45;
}

.quiz-sentence {
    font-size: 11px;
    color: rgba(44, 36, 38, 0.75);
    font-style: italic;
    line-height: 1.5;
}

// Input
.quiz-interaction {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.quiz-input-row {
    display: flex;
    gap: 6px;
    align-items: center;
}

.quiz-input {
    flex: 1;
    padding: 5px 10px;
    border-radius: 6px;
    border: 1px solid rgba(244, 207, 223, 0.4);
    background: rgba(255, 255, 255, 0.6);
    font-size: 11px;
    color: @text;
    outline: none;
    transition: border-color 0.2s;
    &:focus {
        border-color: rgba(244, 207, 223, 0.9);
    }
    &--correct {
        border-color: rgba(80, 160, 100, 0.6);
        background: rgba(80, 160, 100, 0.08);
    }
    &--wrong {
        border-color: rgba(190, 100, 80, 0.5);
        background: rgba(190, 100, 80, 0.06);
    }
}

.quiz-reveal-btn {
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 9px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    border: 1px solid rgba(244, 207, 223, 0.5);
    background: rgba(244, 207, 223, 0.2);
    color: @muted;
    cursor: pointer;
    transition: all 0.2s;
    &:hover {
        background: rgba(244, 207, 223, 0.4);
    }
}

.quiz-answer-reveal {
    font-size: 10px;
    color: rgba(44, 36, 38, 0.55);
    strong {
        color: @text;
        font-weight: 600;
    }
}

// Multiple choice
.mc-options {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.mc-option {
    text-align: left;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 11px;
    border: 1px solid rgba(244, 207, 223, 0.3);
    background: rgba(255, 255, 255, 0.4);
    color: rgba(44, 36, 38, 0.75);
    cursor: pointer;
    transition: all 0.15s;
    &:hover:not(:disabled) {
        background: rgba(244, 207, 223, 0.25);
        border-color: rgba(244, 207, 223, 0.6);
    }
    &--correct {
        background: rgba(80, 160, 100, 0.15);
        border-color: rgba(80, 160, 100, 0.4);
        color: rgba(50, 130, 70, 0.9);
    }
    &--wrong {
        background: rgba(190, 100, 80, 0.1);
        border-color: rgba(190, 100, 80, 0.3);
        color: rgba(160, 70, 55, 0.8);
    }
}

// True / False
.tf-row {
    display: flex;
    gap: 6px;
}

.tf-btn {
    flex: 1;
    padding: 6px;
    border-radius: 6px;
    font-size: 10px;
    letter-spacing: 0.1em;
    border: 1px solid rgba(244, 207, 223, 0.35);
    background: rgba(255, 255, 255, 0.4);
    color: @muted;
    cursor: pointer;
    transition: all 0.15s;
    &:hover:not(:disabled) {
        background: rgba(244, 207, 223, 0.25);
    }
    &--correct {
        background: rgba(80, 160, 100, 0.15);
        border-color: rgba(80, 160, 100, 0.4);
        color: rgba(50, 130, 70, 0.9);
    }
    &--wrong {
        background: rgba(190, 100, 80, 0.1);
        border-color: rgba(190, 100, 80, 0.3);
        color: rgba(160, 70, 55, 0.8);
    }
}

// Mnemonic
.mnemonic-box {
    padding: 8px 10px;
    background: rgba(244, 207, 223, 0.2);
    border-radius: 6px;
    border: 1px solid rgba(244, 207, 223, 0.4);
    display: flex;
    flex-direction: column;
    gap: 3px;
}
.mnemonic-label {
    font-size: 7px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: rgba(179, 153, 162, 0.55);
}
.mnemonic-text {
    font-size: 11px;
    color: @text;
    line-height: 1.5;
    font-style: italic;
}
</style>
