<script setup lang="ts">
import { computed } from 'vue'
import { useCardStore } from '@/stores/cardStore'

const store = useCardStore()

// Index 0 is currentCard (shown in StudyPane). Everything else is the queue.
const upcomingCards = computed(() => store.cardQueue.slice(1))
</script>

<template>
    <aside class="queue-pane col-span-2 flex flex-col overflow-hidden">
        <!-- Header -->
        <div
            class="px-6 py-5 border-b border-sakura-pink/15 flex items-center justify-between shrink-0"
        >
            <p class="text-[13px] tracking-[0.2em] uppercase text-sakura-muted/80">Queue</p>
            <span class="count-badge">{{ store.cardQueue.length }}</span>
        </div>

        <!-- Cards list -->
        <div class="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
            <TransitionGroup name="pop" tag="div" class="relative space-y-2.5">
                <!-- Currently active card -->
                <div v-if="store.currentCard" key="current" class="glass-card glass-card--active">
                    <span class="card-label">Now</span>
                    <div class="card-text line-clamp-3" v-html="store.currentCard.question" />
                </div>

                <!-- Upcoming cards -->
                <div
                    v-for="(card, i) in upcomingCards"
                    :key="card.cardId"
                    class="glass-card"
                    :style="{ '--depth': i }"
                >
                    <span class="card-label">{{ String(i + 2).padStart(2, '0') }}</span>
                    <div class="card-text line-clamp-2" v-html="card.question" />
                </div>
            </TransitionGroup>

            <!-- Empty -->
            <div
                v-if="store.cardQueue.length === 0"
                class="flex flex-col items-center justify-center py-16 gap-2"
            >
                <div class="empty-icon">∅</div>
                <p class="text-[12px] uppercase tracking-[0.2em] text-sakura-muted/50">
                    No cards queued
                </p>
            </div>
        </div>
    </aside>
</template>

<style lang="less" scoped>
// ── Variables ─────────────────────────────────────────────────────────────
@pane-bg-from: rgba(252, 240, 242, 0.97);
@pane-bg-to: rgba(255, 248, 250, 0.93);
@glass-bg: rgba(255, 255, 255, 0.42);
@glass-bg-hover: rgba(255, 255, 255, 0.62);
@glass-border: rgba(244, 207, 223, 0.38);
@glass-highlight: rgba(255, 255, 255, 0.72);
@glass-shadow:
    0 2px 12px rgba(94, 82, 86, 0.07),
    0 1px 2px rgba(94, 82, 86, 0.04);
@blur-val: blur(14px);
@pink: #f4cfdf;
@muted: #b399a2;
@text: #2c2426;

// ── Pane ──────────────────────────────────────────────────────────────────
.queue-pane {
    background: linear-gradient(170deg, @pane-bg-from 0%, @pane-bg-to 100%);
    border-right: 1px solid rgba(244, 207, 223, 0.18);

    // Scrollbar
    .flex-1::-webkit-scrollbar {
        width: 2px;
    }
    .flex-1::-webkit-scrollbar-thumb {
        background: rgba(179, 153, 162, 0.18);
        border-radius: 2px;
    }
}

// ── Count badge ───────────────────────────────────────────────────────────
.count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    padding: 0 7px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.02em;
    background: rgba(244, 207, 223, 0.45);
    color: @muted;
    border: 1px solid rgba(244, 207, 223, 0.5);
}

// ── Glass card — Apple liquid glass ───────────────────────────────────────
.glass-card {
    position: relative;
    padding: 14px 16px 16px;
    border-radius: 12px;
    overflow: hidden;

    // Frosted glass base
    background: @glass-bg;
    backdrop-filter: @blur-val;
    -webkit-backdrop-filter: @blur-val;

    // Border with subtle pink tint
    border: 1px solid @glass-border;

    // Layered shadow: ambient + inner top highlight
    box-shadow:
        @glass-shadow,
        inset 0 1px 0 @glass-highlight,
        inset 0 -1px 0 rgba(244, 207, 223, 0.15);

    transition:
        transform 0.22s cubic-bezier(0.34, 1.2, 0.64, 1),
        box-shadow 0.22s ease,
        background 0.22s ease;

    // Specular sheen (top-left glint)
    &::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: linear-gradient(
            138deg,
            rgba(255, 255, 255, 0.5) 0%,
            rgba(255, 255, 255, 0) 55%
        );
        pointer-events: none;
    }

    // Depth tint — cards further down are slightly more opaque
    &[style*='--depth'] {
        background: rgba(255, 255, 255, calc(0.42 - var(--depth, 0) * 0.015));
    }

    &:hover {
        transform: translateY(-2px) scale(1.008);
        background: @glass-bg-hover;
        box-shadow:
            0 6px 20px rgba(94, 82, 86, 0.11),
            0 2px 5px rgba(94, 82, 86, 0.06),
            inset 0 1px 0 rgba(255, 255, 255, 0.82),
            inset 0 -1px 0 rgba(244, 207, 223, 0.2);
    }

    // Active (current) card — warm pink tint
    &--active {
        background: linear-gradient(
            135deg,
            rgba(244, 207, 223, 0.38) 0%,
            rgba(255, 248, 250, 0.55) 100%
        );
        border-color: rgba(244, 207, 223, 0.55);

        .card-label {
            color: rgba(179, 153, 162, 0.9);
        }
    }
}

// ── Card internals ────────────────────────────────────────────────────────
.card-label {
    display: block;
    font-size: 12px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: rgba(179, 153, 162, 0.5);
    margin-bottom: 5px;
}

.card-text {
    font-size: 14px;
    line-height: 1.6;
    color: rgba(44, 36, 38, 0.75);

    // Strip any bold/large Anki styling — this is just a preview
    :deep(b),
    :deep(strong) {
        font-weight: 500;
    }
    :deep(img) {
        display: none;
    }
    :deep(.cloze) {
        text-decoration: underline;
        text-decoration-style: dotted;
        text-decoration-color: @pink;
        text-underline-offset: 2px;
        font-style: normal;
    }
}

// ── Empty state ───────────────────────────────────────────────────────────
.empty-icon {
    font-size: 28px;
    color: rgba(179, 153, 162, 0.25);
    line-height: 1;
}

// ── Pop animation (card exits upward when it becomes current) ─────────────
.pop-enter-active {
    transition: all 0.42s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.pop-leave-active {
    transition: all 0.3s cubic-bezier(0.55, 0, 1, 0.45);
    position: absolute;
    left: 16px;
    right: 16px;
    z-index: 10;
}
.pop-enter-from {
    opacity: 0;
    transform: translateY(10px) scale(0.96);
}
.pop-leave-to {
    opacity: 0;
    transform: translateY(-14px) scale(0.94);
}
.pop-move {
    transition: transform 0.38s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
</style>
