<script setup lang="ts">
import { computed } from 'vue'
import { useCardStore } from '@/stores/cardStore'

const store = useCardStore()
const processedCards = computed(() => store.processedCards)

const rateCard = (cardId: number, rating: number) => {
    store.sendRating(cardId, rating)
}
</script>

<template>
    <section class="col-span-5 bg-sakura-mist border-l border-sakura-pink/20 p-12 overflow-y-auto">
        <h3 class="text-[10px] tracking-[0.5em] uppercase text-sakura-muted mb-12 text-center">
            Session History
        </h3>

        <div class="space-y-16">
            <div
                v-for="card in processedCards"
                :key="card.cardId"
                class="group transition-all duration-1000"
                :class="[
                    card.status === 'analyzing'
                        ? 'opacity-30 translate-x-2'
                        : 'opacity-100 translate-x-0',
                ]"
            >
                <div
                    class="text-xs font-medium mb-3 text-sakura-text border-l border-sakura-pink/50 pl-4"
                    v-html="card.question"
                ></div>

                <p
                    v-if="card.llmAnalysis"
                    class="text-[11px] text-sakura-muted leading-relaxed pl-4 italic"
                >
                    {{ card.llmAnalysis }}
                </p>

                <div v-if="card.status === 'success' && !card.rated" class="mt-6 pl-4 flex gap-6">
                    <button
                        v-for="n in [1, 2, 3, 4]"
                        :key="n"
                        @click="rateCard(card.cardId, n)"
                        class="text-[9px] uppercase tracking-widest text-sakura-muted hover:text-sakura-pink transition-colors cursor-pointer"
                    >
                        Grade {{ n }}
                    </button>
                </div>
                <div
                    v-else-if="card.rated"
                    class="mt-4 pl-4 text-[9px] uppercase tracking-widest text-sakura-pink/60"
                >
                    Recorded
                </div>
            </div>
        </div>
    </section>
</template>
