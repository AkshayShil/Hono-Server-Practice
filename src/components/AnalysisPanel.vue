<script setup lang="ts">
import { computed, defineComponent, h } from 'vue'
import { marked } from 'marked'
import type { LLMFeedback } from '@/stores/llm/'

const props = defineProps<{
    feedback: LLMFeedback
}>()

/** Helper to render simple inline markdown for lists */
function renderMd(text: string): string {
    if (!text) return ''
    // parseInline is faster for short strings and avoids wrapping in <p> tags
    return marked.parseInline(text) as string
}

// Score class
const scoreClass = computed(() => {
    if (props.feedback.score >= 80) return 'score--high'
    if (props.feedback.score >= 55) return 'score--mid'
    return 'score--low'
})

/**
 * Sub-component to render a single gap item which might be:
 * 1. A string: "Gap: ... | Fact: ..."
 * 2. A JSON string: '{"gap": "...", "fact": "..."}'
 * 3. A raw object: { gap: "...", fact: "..." }
 */
const GapItem = defineComponent({
    props: {
        item: { type: [String, Object], required: true }
    },
    setup(props) {
        return () => {
            let gapText = '';
            let factText = '';

            const it = props.item;

            if (typeof it === 'string') {
                // Try parsing as JSON first
                if (it.trim().startsWith('{')) {
                    try {
                        const parsed = JSON.parse(it);
                        gapText = parsed.gap || parsed.description || '';
                        factText = parsed.fact || parsed.correct || '';
                    } catch {
                        // Not valid JSON, treat as plain string
                        gapText = it;
                    }
                } else if (it.includes('|')) {
                    // "Gap: ... | Fact: ..." format
                    const parts = it.split('|');
                    gapText = parts[0]!.trim();
                    factText = parts[1]!.trim();
                    // Clean up prefixes
                    gapText = gapText.replace(/^(gap|omission):\s*/i, '');
                    factText = factText.replace(/^fact:\s*/i, '');
                } else {
                    gapText = it;
                }
            } else if (typeof it === 'object' && it !== null) {
                // Raw object (sometimes happens if JSON.parse in store didn't deep-validate)
                const obj = it as any;
                gapText = obj.gap || obj.description || '';
                factText = obj.fact || obj.correct || '';
            }

            if (factText) {
                return h('div', { class: 'gap-item' }, [
                    h('span', { class: 'gap-desc', innerHTML: renderMd(gapText) }),
                    h('div', { class: 'fact-bubble' }, [
                        h('span', { class: 'fact-label' }, 'Fact: '),
                        h('span', { class: 'fact-content', innerHTML: renderMd(factText) })
                    ])
                ]);
            }

            return h('span', { class: 'gap-desc', innerHTML: renderMd(gapText) });
        }
    }
})
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
                <li v-for="(s, i) in feedback.strengths" :key="i" v-html="renderMd(s)"></li>
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
                <li v-for="(g, i) in feedback.gaps" :key="i">
                    <GapItem :item="g" />
                </li>
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
                <li v-for="(im, i) in feedback.improvements" :key="i" v-html="renderMd(im)"></li>
            </ul>
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
    gap: 16px;
    padding: 16px 18px;
    margin-top: 10px;
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
    padding: 10px 16px;
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
    font-size: 28px;
    font-weight: 600;
    line-height: 1;
}
.score-denom {
    font-size: 13px;
    opacity: 0.6;
}

.verdict-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.verdict {
    font-size: 15px;
    font-weight: 500;
    color: @text;
    line-height: 1.3;
}

.mode-chip {
    display: inline-block;
    font-size: 11px;
    letter-spacing: 0.1em;
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
    height: 5px;
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
    gap: 6px;
    font-size: 12px;
    letter-spacing: 0.1em;
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
        font-size: 15px;
        color: rgba(44, 36, 38, 0.82);
        line-height: 1.65;
        list-style-position: outside;
        padding-left: 4px;
    }

    &--gap li {
        color: rgba(160, 70, 55, 0.8);
        list-style: none;
        padding-left: 0;
        margin-bottom: 8px;
    }
}

.gap-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.gap-desc {
    font-size: 15px;
    line-height: 1.5;
    color: rgba(160, 70, 55, 0.9);
}

.fact-bubble {
    font-size: 14px;
    background: rgba(255, 255, 255, 0.6);
    padding: 6px 12px;
    border-radius: 6px;
    border-left: 3px solid rgba(80, 160, 100, 0.6);
    color: rgba(44, 36, 38, 0.85);
    line-height: 1.5;

    .fact-label {
        font-weight: 700;
        color: #3e7b4e;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
}
</style>
