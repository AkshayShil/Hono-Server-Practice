<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCardStore, type ProcessedCard } from '@/stores/cardStore'
import { useLLMStore, PROMPT_TEMPLATES, type PromptMode } from '@/stores/llm/index'
import Carddetaildialog from './Carddetaildialog.vue'
import LLMSettings from '@/components/LLMSettings.vue'

const store = useCardStore()
const llm = useLLMStore()

const processedCards = computed(() => [...store.processedCards])
const hasRated = computed(() => store.processedCards.some((c) => c.rated))
const hasAny = computed(() => store.processedCards.length > 0)

// ── Dialog state ───────────────────────────────────────────────────────────
// We store only the cardId, then look up the live card object from the store
// via a computed. This means the dialog always reflects the current state
// (e.g. 'analyzing' → 'success') rather than a frozen snapshot.
const selectedCardId = ref<number | null>(null)

const selectedCard = computed<ProcessedCard | null>(() => {
    if (selectedCardId.value === null) return null
    return store.processedCards.find((c) => c.cardId === selectedCardId.value) ?? null
})

function openCard(card: ProcessedCard): void {
    selectedCardId.value = card.cardId
}

function closeCard(): void {
    selectedCardId.value = null
}
</script>

<template>
    <div class="flex-1 flex flex-col overflow-hidden">
        <!-- ── Toolbar ─────────────────────────────────────────────────── -->
        <div class="toolbar">
            <div class="mode-switcher">
                <button
                    @click="llm.setPromptMode('auto')"
                    class="mode-chip"
                    :class="{ 'mode-chip--active': llm.promptMode === 'auto' }"
                >
                    Auto
                </button>
                <button
                    v-for="t in PROMPT_TEMPLATES"
                    :key="t.id"
                    @click="llm.setPromptMode(t.id as PromptMode)"
                    class="mode-chip"
                    :class="[
                        `mode-chip--${t.id}`,
                        { 'mode-chip--active': llm.promptMode === t.id },
                    ]"
                >
                    {{ t.label }}
                </button>
            </div>
            <LLMSettings />
        </div>

        <!-- ── Provider badge ──────────────────────────────────────────── -->
        <div class="provider-badge">
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                class="w-2.5 h-2.5"
            >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4l3 3" />
            </svg>
            {{ llm.provider.label }} · {{ llm.modelId }}
            <span class="mode-hint"
                >· {{ llm.promptMode === 'auto' ? 'auto' : llm.promptMode }}</span
            >
        </div>

        <!-- ── Bulk delete controls ────────────────────────────────────── -->
        <div v-if="hasAny" class="delete-bar">
            <button v-if="hasRated" @click="store.removeRatedCards()" class="del-btn">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    class="w-3 h-3"
                >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
                Clear graded
            </button>
            <button @click="store.clearProcessedCards()" class="del-btn del-btn--all">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    class="w-3 h-3"
                >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                </svg>
                Clear all
            </button>
        </div>

        <!-- ── Card list ───────────────────────────────────────────────── -->
        <div class="flex-1 overflow-y-auto px-4 py-3">
            <TransitionGroup name="push" tag="div" class="space-y-2.5">
                <div
                    v-for="card in processedCards"
                    :key="card.cardId"
                    class="history-card"
                    :class="{
                        'history-card--analyzing': card.status === 'analyzing',
                        'history-card--rated': card.rated,
                    }"
                    @click="openCard(card)"
                    role="button"
                    tabindex="0"
                    @keydown.enter="openCard(card)"
                >
                    <!-- Status row -->
                    <div class="status-row">
                        <span
                            class="status-dot"
                            :class="{
                                'status-dot--analyzing': card.status === 'analyzing',
                                'status-dot--success': card.status === 'success',
                                'status-dot--error': card.status === 'error',
                            }"
                        />
                        <span class="status-label">
                            {{
                                card.status === 'analyzing'
                                    ? 'Analyzing…'
                                    : card.rated
                                      ? 'Graded'
                                      : 'Awaiting grade'
                            }}
                        </span>
                        <span class="card-type-chip" :class="`ctype--${card.cardType}`">{{
                            card.cardType
                        }}</span>

                        <!-- Score pill -->
                        <span
                            v-if="card.feedback"
                            class="score-pill"
                            :class="{
                                'score-pill--high': card.feedback.score >= 80,
                                'score-pill--mid':
                                    card.feedback.score >= 55 && card.feedback.score < 80,
                                'score-pill--low': card.feedback.score < 55,
                            }"
                            >{{ card.feedback.score }}</span
                        >
                    </div>

                    <!-- Question preview -->
                    <div class="card-q" v-html="card.question" />

                    <!-- Verdict line -->
                    <p v-if="card.feedback" class="verdict-line">{{ card.feedback.verdict }}</p>

                    <!-- Analyzing spinner -->
                    <div v-if="card.status === 'analyzing'" class="analyzing-row">
                        <svg
                            class="w-3 h-3 animate-spin shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        Sending to {{ llm.provider.label }}…
                    </div>

                    <!-- Error -->
                    <p v-if="card.status === 'error'" class="error-msg">
                        ⚠ {{ card.llmAnalysis || 'Analysis failed' }}
                    </p>

                    <!-- AI rating suggestion + tap hint -->
                    <div v-if="card.feedback && !card.rated" class="card-footer">
                        <span class="suggested-chip">
                            AI:
                            {{
                                ['Again', 'Hard', 'Good', 'Easy'][card.feedback.suggestedRating - 1]
                            }}
                        </span>
                        <span class="tap-hint">Tap to review & grade →</span>
                    </div>
                    <div v-else-if="card.rated" class="rated-tag">✓ Graded</div>
                </div>
            </TransitionGroup>

            <div v-if="processedCards.length === 0" class="empty-state">
                <p>No history yet</p>
                <p class="empty-sub">Answer a card to see AI feedback here</p>
            </div>
        </div>

        <!-- ── Detail dialog ───────────────────────────────────────────── -->
        <!--
          The component stays mounted so Teleport + Transition work correctly.
          The 'show' prop toggles visibility inside the component, where v-if
          sits directly under <Transition> as Vue requires.
          'selectedCard' is a computed that looks up the live object from the
          store, so the dialog always shows up-to-date feedback as it arrives.
        -->
        <Carddetaildialog
            v-if="selectedCard"
            :card="selectedCard"
            :show="selectedCardId !== null"
            @close="closeCard"
        />
    </div>
</template>

<style lang="less" scoped>
@pink: #f4cfdf;
@muted: #b399a2;
@text: #2c2426;
@blur: blur(12px);

// ── Toolbar ───────────────────────────────────────────────────────────────
.toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px 6px;
    border-bottom: 1px solid rgba(244, 207, 223, 0.2);
    flex-shrink: 0;
}
.mode-switcher {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
}
.mode-chip {
    padding: 3px 8px;
    border-radius: 12px;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border: 1px solid rgba(244, 207, 223, 0.35);
    background: transparent;
    color: rgba(179, 153, 162, 0.6);
    cursor: pointer;
    transition: all 0.18s;
    &:hover {
        border-color: rgba(244, 207, 223, 0.7);
        color: @muted;
    }
    &--active {
        background: rgba(244, 207, 223, 0.3);
        border-color: rgba(244, 207, 223, 0.7);
        color: @text;
        font-weight: 500;
    }
    &--lenient.mode-chip--active {
        background: rgba(144, 190, 144, 0.2);
        border-color: rgba(144, 190, 144, 0.4);
        color: #4a7a4a;
    }
    &--balanced.mode-chip--active {
        background: rgba(179, 153, 162, 0.2);
        border-color: rgba(179, 153, 162, 0.4);
        color: #7a5a62;
    }
    &--rigorous.mode-chip--active {
        background: rgba(190, 144, 144, 0.2);
        border-color: rgba(190, 144, 144, 0.4);
        color: #7a4a4a;
    }
}

// ── Provider badge ────────────────────────────────────────────────────────
.provider-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px 6px;
    font-size: 11px;
    letter-spacing: 0.05em;
    color: rgba(44, 36, 38, 0.75);
    flex-shrink: 0;
}
.mode-hint {
    color: rgba(179, 153, 162, 0.35);
}

// ── Delete bar ────────────────────────────────────────────────────────────
.delete-bar {
    display: flex;
    gap: 6px;
    padding: 6px 12px 8px;
    border-bottom: 1px solid rgba(244, 207, 223, 0.15);
    flex-shrink: 0;
}
.del-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(179, 153, 162, 0.55);
    background: transparent;
    border: 1px solid rgba(244, 207, 223, 0.3);
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
    transition: all 0.18s;
    &:hover {
        color: rgba(190, 80, 60, 0.8);
        border-color: rgba(200, 80, 60, 0.3);
        background: rgba(200, 80, 60, 0.05);
    }
    &--all:hover {
        color: rgba(170, 50, 40, 0.9);
        border-color: rgba(180, 50, 40, 0.4);
        background: rgba(180, 50, 40, 0.07);
    }
}

// ── History card (clickable) ──────────────────────────────────────────────
.history-card {
    position: relative;
    padding: 11px 13px;
    border-radius: 10px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.38);
    backdrop-filter: @blur;
    -webkit-backdrop-filter: @blur;
    border: 1px solid rgba(244, 207, 223, 0.32);
    box-shadow:
        0 2px 8px rgba(94, 82, 86, 0.05),
        inset 0 1px 0 rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: all 0.2s ease;

    &::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, transparent 55%);
        pointer-events: none;
    }

    &:hover {
        transform: translateY(-1px);
        box-shadow:
            0 6px 18px rgba(94, 82, 86, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.7);
        border-color: rgba(244, 207, 223, 0.55);
    }

    &:focus-visible {
        outline: 2px solid rgba(244, 207, 223, 0.8);
        outline-offset: 2px;
    }

    &--analyzing {
        opacity: 0.65;
    }
    &--rated {
        border-color: rgba(244, 207, 223, 0.5);
        background: linear-gradient(
            135deg,
            rgba(244, 207, 223, 0.18) 0%,
            rgba(255, 248, 250, 0.35) 100%
        );
    }
}

.status-row {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 5px;
}

.status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    background: rgba(179, 153, 162, 0.3);
    &--analyzing {
        background: @muted;
        animation: pulse 1.4s ease-in-out infinite;
    }
    &--success {
        background: rgba(80, 160, 100, 0.6);
    }
    &--error {
        background: rgba(200, 100, 80, 0.6);
    }
}
@keyframes pulse {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.3;
    }
}

.status-label {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(179, 153, 162, 0.5);
    flex: 1;
}

.card-type-chip {
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 8px;
    &.ctype--new {
        background: rgba(100, 160, 220, 0.15);
        color: rgba(60, 100, 180, 0.7);
    }
    &.ctype--learn {
        background: rgba(220, 160, 60, 0.15);
        color: rgba(160, 100, 30, 0.7);
    }
    &.ctype--review {
        background: rgba(179, 153, 162, 0.15);
        color: rgba(100, 80, 90, 0.7);
    }
}

.score-pill {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    &--high {
        background: rgba(80, 160, 100, 0.15);
        color: rgba(50, 130, 70, 0.9);
    }
    &--mid {
        background: rgba(190, 150, 60, 0.15);
        color: rgba(150, 110, 30, 0.9);
    }
    &--low {
        background: rgba(190, 100, 80, 0.12);
        color: rgba(160, 70, 55, 0.9);
    }
}

.card-q {
    font-size: 14px;
    line-height: 1.6;
    color: rgba(44, 36, 38, 0.8);
    border-left: 2px solid rgba(244, 207, 223, 0.55);
    padding-left: 8px;
    margin-bottom: 5px;
    :deep(b),
    :deep(strong) {
        font-weight: 600;
    }
    :deep(img) {
        display: none;
    }
}

.verdict-line {
    font-size: 12px;
    color: rgba(44, 36, 38, 0.5);
    font-style: italic;
    padding-left: 10px;
    line-height: 1.5;
}

.analyzing-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: rgba(179, 153, 162, 0.65);
    padding: 3px 0;
}

.error-msg {
    font-size: 11px;
    color: rgba(190, 80, 60, 0.75);
    padding: 3px 0;
}

.card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 8px;
    margin-top: 4px;
    border-top: 1px solid rgba(244, 207, 223, 0.2);
}

.suggested-chip {
    font-size: 10px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 8px;
    background: rgba(244, 207, 223, 0.3);
    color: @muted;
}

.tap-hint {
    font-size: 10px;
    color: rgba(179, 153, 162, 0.4);
    letter-spacing: 0.05em;
}

.rated-tag {
    padding-top: 6px;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(80, 160, 100, 0.5);
}

// ── Empty ─────────────────────────────────────────────────────────────────
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 16px;
    gap: 4px;
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(179, 153, 162, 0.35);
    text-align: center;
}
.empty-sub {
    font-size: 11px;
    letter-spacing: 0.05em;
    text-transform: none;
    color: rgba(179, 153, 162, 0.25);
}

// ── Push animation ────────────────────────────────────────────────────────
.push-enter-active {
    transition: all 0.45s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.push-leave-active {
    transition: all 0.28s ease-in;
    position: absolute;
    left: 16px;
    right: 16px;
}
.push-enter-from {
    opacity: 0;
    transform: translateY(-16px) scale(0.97);
}
.push-leave-to {
    opacity: 0;
    transform: translateY(8px);
}
.push-move {
    transition: transform 0.38s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

// ── Scrollbar ─────────────────────────────────────────────────────────────
.flex-1::-webkit-scrollbar {
    width: 2px;
}
.flex-1::-webkit-scrollbar-thumb {
    background: rgba(179, 153, 162, 0.15);
    border-radius: 2px;
}
</style>
