<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCardStore, type ProcessedCard } from '@/stores/cardStore'
import { useLLMStore } from '@/stores/llm/llmStore'
import AnalysisPanel from '@/components/AnalysisPanel.vue'

const props = defineProps<{
    card: ProcessedCard
    show: boolean
}>()

const emit = defineEmits<{
    close: []
}>()

const store = useCardStore()
const llmStore = useLLMStore()

// Challenge
const challengeText = ref('')
const isChallenging = ref(false)
const challengeError = ref('')

async function submitChallenge(): Promise<void> {
    const text = challengeText.value.trim()
    if (!text || isChallenging.value) return
    isChallenging.value = true
    challengeError.value = ''
    challengeText.value = ''
    const err = await store.submitChallenge(props.card.cardId, text)
    if (err) {
        challengeError.value = err
        challengeText.value = text
    }
    isChallenging.value = false
}

// Retry
const isRetrying = ref(false)
async function retryAnalysis(): Promise<void> {
    if (isRetrying.value) return
    isRetrying.value = true
    await store.retryAnalysis(props.card.cardId)
    isRetrying.value = false
}

// Second Opinion / Re-analyze
const reanalyzeProviderId = ref(llmStore.providerId)
const reanalyzeModelId = ref(llmStore.modelId)

// When provider changes, reset model to the first one of that provider
watch(reanalyzeProviderId, (newPid) => {
    const p = llmStore.availableProviders.find(p => p.id === newPid)
    if (p && p.models.length > 0) {
        reanalyzeModelId.value = p.models[0]!.id
    }
})

const currentReanalyzeModels = computed(() => {
    const p = llmStore.availableProviders.find(p => p.id === reanalyzeProviderId.value)
    return p ? p.models : []
})

function reanalyze(): void {
    store.reanalyzeCard(props.card.cardId, reanalyzeProviderId.value, reanalyzeModelId.value)
}

// Rating labels and their meanings
const RATINGS = [
    { value: 1, label: 'Again', hint: 'Blackout — completely forgot', color: 'rating--again' },
    { value: 2, label: 'Hard', hint: 'Remembered with serious struggle', color: 'rating--hard' },
    { value: 3, label: 'Good', hint: 'Recalled with some effort', color: 'rating--good' },
    { value: 4, label: 'Easy', hint: 'Perfect recall, no hesitation', color: 'rating--easy' },
] as const

const rating = computed(() => props.card.feedback?.rating ?? 3)
const ratingReason = computed(() => props.card.feedback?.ratingReason ?? '')

async function grade(r: number): Promise<void> {
    void store.sendRating(props.card.cardId, r)
    emit('close')
}

async function autograde(): Promise<void> {
    if (props.card.feedback?.rating) {
        await grade(props.card.feedback.rating)
    }
}

function removeCard(): void {
    store.removeProcessedCard(props.card.cardId)
    emit('close')
}

function keepAndClose(): void {
    emit('close')
}
</script>

<template>
    <Teleport to="body">
        <Transition name="dialog-fade">
            <div v-if="show" class="backdrop" @click.self="keepAndClose">
                <div class="dialog">
                    <!-- Header -->
                    <div class="dialog-header">
                        <div class="header-left">
                            <span class="card-type-chip" :class="`ctype--${card.cardType}`">{{
                                card.cardType
                            }}</span>
                            <span class="status-chip" :class="`status--${card.status}`">
                                {{ card.status === 'analyzing' ? 'Analyzing…' : card.status }}
                            </span>
                        </div>
                        <button @click="keepAndClose" class="close-btn">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                class="w-4 h-4"
                            >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>

                    <!-- Scrollable body -->
                    <div class="dialog-body">
                        <!-- Question -->
                        <section class="section">
                            <p class="section-label">Question</p>
                            <div class="question-text" v-html="card.question" />
                        </section>

                        <!-- Deck answer — always shown as reference -->
                        <section class="section">
                            <p class="section-label">Deck answer</p>
                            <div class="deck-answer-text" v-html="card.answer || '—'" />
                        </section>

                        <!-- Your answer -->
                        <section class="section">
                            <p class="section-label">Your answer</p>
                            <p class="answer-text">{{ card.userResponse || '—' }}</p>
                        </section>

                        <!-- AI Feedback -->
                        <section v-if="card.feedback" class="section">
                            <p class="section-label">AI Feedback</p>
                            <AnalysisPanel :feedback="card.feedback" />
                        </section>

                        <!-- Analyzing state -->
                        <div v-else-if="card.status === 'analyzing'" class="analyzing-block">
                            <svg
                                class="w-4 h-4 animate-spin shrink-0"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                            <span>Waiting for AI analysis…</span>
                        </div>

                        <!-- Error state with retry -->
                        <div v-else-if="card.status === 'error'" class="error-block">
                            <p class="error-message">
                                ⚠ {{ card.llmAnalysis || 'Analysis failed' }}
                            </p>
                            <button @click="retryAnalysis" :disabled="isRetrying" class="retry-btn">
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    class="w-3.5 h-3.5"
                                    :class="{ 'animate-spin': isRetrying }"
                                >
                                    <path d="M1 4v6h6M23 20v-6h-6" />
                                    <path
                                        d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"
                                    />
                                </svg>
                                {{ isRetrying ? 'Retrying…' : 'Retry Analysis' }}
                            </button>
                        </div>

                        <!-- ── Challenge Rating ──────────────────────────────────────── -->
                        <section v-if="card.status === 'success' && card.feedback" class="section challenge-section">
                            <p class="section-label">Challenge the Rating</p>

                            <!-- Previous challenges -->
                            <div v-if="card.challengeThread?.length" class="challenge-thread">
                                <div v-for="(entry, i) in card.challengeThread" :key="i" class="challenge-entry">
                                    <p class="challenge-student-text">{{ entry.challenge }}</p>
                                    <div class="challenge-response">
                                        <span class="challenge-response-label">Reconsidered</span>
                                        <span class="challenge-response-verdict">{{ entry.reconsideration.verdict }}</span>
                                    </div>
                                </div>
                            </div>

                            <textarea
                                v-model="challengeText"
                                class="challenge-input"
                                placeholder="Argue your case — point to specific parts of your answer the AI may have missed or misread…"
                                rows="3"
                                :disabled="isChallenging"
                            />
                            <button
                                @click="submitChallenge"
                                :disabled="!challengeText.trim() || isChallenging"
                                class="challenge-btn"
                            >
                                <svg v-if="isChallenging" class="w-3 h-3 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                                {{ isChallenging ? 'Reconsidering…' : 'Submit Challenge' }}
                            </button>
                            <p v-if="challengeError" class="challenge-error">⚠ {{ challengeError }}</p>
                        </section>

                        <!-- ── Second Opinion ────────────────────────────────────────── -->
                        <section v-if="card.status === 'success'" class="section second-opinion-section">
                            <p class="section-label">Second Opinion</p>
                            <div class="second-opinion-row">
                                <select v-model="reanalyzeProviderId" class="model-select">
                                    <option v-for="p in llmStore.availableProviders" :key="p.id" :value="p.id">
                                        {{ p.label }}
                                    </option>
                                </select>
                                <select v-model="reanalyzeModelId" class="model-select">
                                    <option v-for="m in currentReanalyzeModels" :key="m.id" :value="m.id">
                                        {{ m.label }}
                                    </option>
                                </select>
                                <button @click="reanalyze" class="reanalyze-btn">
                                    Re-analyze
                                </button>
                            </div>
                        </section>

                        <!-- ── Rating section ─────────────────────────────────────── -->
                        <section v-if="!card.rated" class="section rating-section">
                            <p class="section-label">Rate your recall</p>

                            <!-- AI suggestion banner -->
                            <div v-if="card.feedback" class="suggestion-banner">
                                <div class="flex items-center justify-between gap-3">
                                    <div class="suggestion-label">AI suggests</div>
                                    <button
                                        @click="autograde"
                                        class="hidden md:flex items-center gap-1.5 px-3 py-1 bg-sakura-pink text-sakura-text rounded-lg text-[10px] tracking-wider uppercase font-bold hover:bg-sakura-pink/80 transition-all border border-sakura-pink shadow-sm"
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2.5"
                                            class="w-3 h-3"
                                        >
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                        Auto-grade
                                    </button>
                                </div>
                                <div class="suggestion-body">
                                    <span
                                        class="suggestion-rating"
                                        :class="
                                            RATINGS.find((r) => r.value === rating)?.color
                                        "
                                    >
                                        {{
                                            RATINGS.find((r) => r.value === rating)?.label
                                        }}
                                    </span>
                                    <span class="suggestion-reason">{{ ratingReason }}</span>
                                </div>
                                <p class="suggestion-note">You have the final say.</p>
                            </div>

                            <!-- Rating buttons -->
                            <div class="rating-grid">
                                <button
                                    v-for="r in RATINGS"
                                    :key="r.value"
                                    @click="grade(r.value)"
                                    class="rating-btn"
                                    :class="[
                                        r.color,
                                        {
                                            'rating-btn--suggested':
                                                r.value === rating && !!card.feedback,
                                        },
                                    ]"
                                >
                                    <span class="rating-label">{{ r.label }}</span>
                                    <span class="rating-hint">{{ r.hint }}</span>
                                    <span
                                        v-if="r.value === rating && card.feedback"
                                        class="ai-tag"
                                        >AI pick</span
                                    >
                                </button>
                            </div>
                        </section>

                        <!-- Already rated -->
                        <div v-else class="rated-block">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                class="w-4 h-4"
                            >
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            This card has been graded and recorded in Anki.
                        </div>
                    </div>

                    <!-- Footer actions -->
                    <div class="dialog-footer">
                        <button @click="removeCard" class="btn-remove">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.75"
                                class="w-3.5 h-3.5"
                            >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                            Remove from history
                        </button>
                        <button @click="keepAndClose" class="btn-keep">Keep & Close</button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style lang="less" scoped>
@pink: #f4cfdf;
@muted: #b399a2;
@text: #2c2426;
@blur: blur(20px);

// ── Backdrop ──────────────────────────────────────────────────────────────
.backdrop {
    position: fixed;
    inset: 0;
    background: rgba(44, 36, 38, 0.3);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 24px;
}

// ── Dialog panel ──────────────────────────────────────────────────────────
.dialog {
    width: 100%;
    max-width: 600px;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    border-radius: 18px;
    background: rgba(255, 252, 253, 0.92);
    backdrop-filter: @blur;
    -webkit-backdrop-filter: @blur;
    border: 1px solid rgba(244, 207, 223, 0.45);
    box-shadow:
        0 32px 80px rgba(44, 36, 38, 0.18),
        0 4px 20px rgba(44, 36, 38, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 0.95);
    overflow: hidden;
}

// ── Header ────────────────────────────────────────────────────────────────
.dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 22px 14px;
    border-bottom: 1px solid rgba(244, 207, 223, 0.25);
    flex-shrink: 0;
}

.header-left {
    display: flex;
    align-items: center;
    gap: 8px;
}

.card-type-chip {
    font-size: 8px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 10px;
    &.ctype--new {
        background: rgba(100, 160, 220, 0.15);
        color: rgba(60, 100, 180, 0.8);
    }
    &.ctype--learn {
        background: rgba(220, 160, 60, 0.15);
        color: rgba(160, 100, 30, 0.8);
    }
    &.ctype--review {
        background: rgba(179, 153, 162, 0.15);
        color: rgba(100, 80, 90, 0.8);
    }
}

.status-chip {
    font-size: 8px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 10px;
    &.status--analyzing {
        background: rgba(179, 153, 162, 0.15);
        color: @muted;
    }
    &.status--success {
        background: rgba(80, 160, 100, 0.15);
        color: rgba(50, 130, 70, 0.8);
    }
    &.status--error {
        background: rgba(200, 80, 60, 0.1);
        color: rgba(170, 60, 40, 0.8);
    }
}

.close-btn {
    color: rgba(179, 153, 162, 0.5);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    transition: all 0.18s;
    &:hover {
        background: rgba(244, 207, 223, 0.25);
        color: @muted;
    }
}

// ── Body ──────────────────────────────────────────────────────────────────
.dialog-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px 22px;
    display: flex;
    flex-direction: column;
    gap: 20px;

    &::-webkit-scrollbar {
        width: 3px;
    }
    &::-webkit-scrollbar-thumb {
        background: rgba(179, 153, 162, 0.18);
        border-radius: 2px;
    }
}

// ── Sections ──────────────────────────────────────────────────────────────
.section {
    display: flex;
    flex-direction: column;
    gap: 7px;
}

.section-label {
    font-size: 8px;
    letter-spacing: 0.4em;
    text-transform: uppercase;
    color: rgba(179, 153, 162, 0.6);
}

.question-text {
    font-size: 15px;
    line-height: 1.75;
    color: @text;
    font-weight: 400;
    :deep(b),
    :deep(strong) {
        font-weight: 600;
    }
    :deep(.cloze) {
        border-bottom: 2px solid @pink;
        color: @muted;
    }
}

.answer-text {
    font-size: 13px;
    line-height: 1.7;
    color: rgba(44, 36, 38, 0.75);
    padding: 10px 14px;
    background: rgba(252, 240, 242, 0.5);
    border-radius: 8px;
    border-left: 2px solid rgba(244, 207, 223, 0.5);
    white-space: pre-wrap;
}

.analyzing-block {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: @muted;
    padding: 12px 0;
}

.error-block {
    font-size: 12px;
    color: rgba(190, 80, 60, 0.8);
    padding: 10px 14px;
    background: rgba(200, 80, 60, 0.06);
    border-radius: 8px;
    border-left: 2px solid rgba(200, 80, 60, 0.3);
}

// ── Rating section ────────────────────────────────────────────────────────
.rating-section {
    gap: 12px;
}

// AI suggestion banner
.suggestion-banner {
    padding: 12px 14px;
    background: rgba(244, 207, 223, 0.2);
    border: 1px solid rgba(244, 207, 223, 0.45);
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.suggestion-label {
    font-size: 8px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: rgba(179, 153, 162, 0.6);
}

.suggestion-body {
    display: flex;
    align-items: baseline;
    gap: 8px;
}

.suggestion-rating {
    font-size: 14px;
    font-weight: 600;
    &.rating--again {
        color: rgba(200, 80, 60, 0.9);
    }
    &.rating--hard {
        color: rgba(200, 140, 40, 0.9);
    }
    &.rating--good {
        color: rgba(60, 140, 100, 0.9);
    }
    &.rating--easy {
        color: rgba(60, 100, 200, 0.9);
    }
}

.suggestion-reason {
    font-size: 11px;
    color: rgba(44, 36, 38, 0.6);
    line-height: 1.5;
}

.suggestion-note {
    font-size: 9px;
    color: rgba(179, 153, 162, 0.5);
    letter-spacing: 0.05em;
}

// Rating buttons grid
.rating-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
}

.rating-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 8px;
    border-radius: 10px;
    border: 1px solid rgba(244, 207, 223, 0.3);
    background: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.34, 1.3, 0.64, 1);
    position: relative;
    gap: 3px;

    &:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(94, 82, 86, 0.1);
    }

    &--suggested {
        box-shadow: 0 0 0 2px currentColor;
    }

    // Colour variants
    &.rating--again {
        &:hover,
        &--suggested {
            border-color: rgba(200, 80, 60, 0.4);
            background: rgba(200, 80, 60, 0.08);
        }
        .rating-label {
            color: rgba(200, 80, 60, 0.9);
        }
    }
    &.rating--hard {
        &:hover,
        &--suggested {
            border-color: rgba(200, 140, 40, 0.4);
            background: rgba(200, 140, 40, 0.08);
        }
        .rating-label {
            color: rgba(200, 140, 40, 0.9);
        }
    }
    &.rating--good {
        &:hover,
        &--suggested {
            border-color: rgba(60, 140, 100, 0.4);
            background: rgba(60, 140, 100, 0.08);
        }
        .rating-label {
            color: rgba(60, 140, 100, 0.9);
        }
    }
    &.rating--easy {
        &:hover,
        &--suggested {
            border-color: rgba(60, 100, 200, 0.4);
            background: rgba(60, 100, 200, 0.08);
        }
        .rating-label {
            color: rgba(60, 100, 200, 0.9);
        }
    }
}

.rating-label {
    font-size: 12px;
    font-weight: 600;
}
.rating-hint {
    font-size: 9px;
    color: rgba(44, 36, 38, 0.4);
    text-align: center;
    line-height: 1.3;
}

.ai-tag {
    position: absolute;
    top: -6px;
    right: -6px;
    font-size: 7px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    padding: 2px 5px;
    border-radius: 6px;
    background: rgba(244, 207, 223, 0.9);
    color: @muted;
    border: 1px solid rgba(244, 207, 223, 0.7);
}

// Already rated
.rated-block {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: rgba(179, 153, 162, 0.6);
    padding: 10px 14px;
    background: rgba(80, 160, 100, 0.06);
    border-radius: 8px;
    border-left: 2px solid rgba(80, 160, 100, 0.3);
}

// ── Footer ────────────────────────────────────────────────────────────────
.dialog-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 22px 18px;
    border-top: 1px solid rgba(244, 207, 223, 0.2);
    flex-shrink: 0;
}

.btn-remove {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 9px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: rgba(179, 153, 162, 0.55);
    background: none;
    border: 1px solid rgba(244, 207, 223, 0.3);
    border-radius: 8px;
    padding: 6px 12px;
    cursor: pointer;
    transition: all 0.2s;
    &:hover {
        color: rgba(190, 80, 60, 0.8);
        border-color: rgba(200, 80, 60, 0.3);
        background: rgba(200, 80, 60, 0.05);
    }
}

.btn-keep {
    font-size: 9px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: @muted;
    background: rgba(244, 207, 223, 0.25);
    border: 1px solid rgba(244, 207, 223, 0.5);
    border-radius: 8px;
    padding: 6px 16px;
    cursor: pointer;
    transition: all 0.2s;
    &:hover {
        background: rgba(244, 207, 223, 0.45);
        color: @text;
    }
}

// ── Transitions ───────────────────────────────────────────────────────────
.dialog-fade-enter-active {
    transition: all 0.28s cubic-bezier(0.34, 1.3, 0.64, 1);
}
.dialog-fade-leave-active {
    transition: all 0.18s ease-in;
}
.dialog-fade-enter-from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
}
.dialog-fade-leave-to {
    opacity: 0;
    transform: scale(0.98) translateY(4px);
}

// ── Deck answer ───────────────────────────────────────────────────────────
.deck-answer-text {
    font-size: 15px;
    line-height: 1.75;
    color: rgba(44, 36, 38, 0.82);
    padding: 12px 16px;
    background: rgba(244, 207, 223, 0.15);
    border-radius: 8px;
    border-left: 3px solid rgba(244, 207, 223, 0.7);
    :deep(b),
    :deep(strong) {
        font-weight: 600;
    }
    :deep(.cloze) {
        border-bottom: 2px solid @pink;
        color: @muted;
    }
}
// ── Challenge Rating ──────────────────────────────────────────────────────
.challenge-section {
    gap: 10px;
}

.challenge-thread {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 4px;
}

.challenge-entry {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.challenge-student-text {
    font-size: 12px;
    line-height: 1.55;
    color: rgba(44, 36, 38, 0.65);
    padding: 6px 10px;
    background: rgba(252, 240, 242, 0.5);
    border-radius: 6px;
    border-left: 2px solid rgba(244, 207, 223, 0.6);
    font-style: italic;
}

.challenge-response {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.55);
    border-radius: 6px;
    border-left: 2px solid rgba(80, 160, 100, 0.4);
}

.challenge-response-label {
    font-size: 8px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: rgba(80, 160, 100, 0.7);
}

.challenge-response-verdict {
    font-size: 12px;
    line-height: 1.55;
    color: rgba(44, 36, 38, 0.75);
}

.challenge-input {
    width: 100%;
    padding: 10px 12px;
    font-size: 13px;
    line-height: 1.6;
    font-family: inherit;
    color: @text;
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(244, 207, 223, 0.4);
    border-radius: 8px;
    resize: vertical;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;

    &::placeholder {
        color: rgba(179, 153, 162, 0.5);
    }

    &:focus {
        border-color: rgba(244, 207, 223, 0.85);
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}

.challenge-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    padding: 7px 16px;
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    border: 1px solid rgba(179, 153, 162, 0.35);
    background: rgba(252, 240, 242, 0.4);
    color: @muted;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
        background: rgba(244, 207, 223, 0.35);
        border-color: rgba(244, 207, 223, 0.8);
        color: @text;
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
}

.challenge-error {
    font-size: 12px;
    color: rgba(190, 70, 50, 0.85);
    background: rgba(190, 70, 50, 0.07);
    border-left: 2px solid rgba(190, 70, 50, 0.3);
    border-radius: 4px;
    padding: 6px 10px;
}

// ── Second Opinion ────────────────────────────────────────────────────────
.second-opinion-section {
    gap: 8px;
}

.second-opinion-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.model-select {
    flex: 1;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid rgba(244, 207, 223, 0.4);
    background: rgba(255, 255, 255, 0.6);
    font-size: 11px;
    color: @text;
    outline: none;
    cursor: pointer;
    appearance: none;
    transition: border-color 0.2s;

    &:focus {
        border-color: rgba(244, 207, 223, 0.9);
    }
}

.reanalyze-btn {
    display: inline-flex;
    align-items: center;
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    border: 1px solid rgba(244, 207, 223, 0.5);
    background: rgba(244, 207, 223, 0.15);
    color: @muted;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;

    &:hover {
        background: rgba(244, 207, 223, 0.35);
        border-color: rgba(244, 207, 223, 0.8);
        color: @text;
    }
}

// ── Retry button ──────────────────────────────────────────────────────────
.error-block {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.error-message {
    font-size: 13px;
    line-height: 1.5;
}
.retry-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    align-self: flex-start;
    padding: 7px 16px;
    font-size: 12px;
    letter-spacing: 0.05em;
    border-radius: 8px;
    border: 1px solid rgba(200, 80, 60, 0.35);
    background: rgba(200, 80, 60, 0.08);
    color: rgba(180, 60, 40, 0.9);
    cursor: pointer;
    transition: all 0.2s;
    &:hover:not(:disabled) {
        background: rgba(200, 80, 60, 0.15);
        border-color: rgba(200, 80, 60, 0.55);
    }
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}
</style>
