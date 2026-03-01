<script setup lang="ts">
import { computed } from 'vue'
import { useCardStore } from '@/stores/cardStore'

const store = useCardStore()

const bufferedCount = computed(() => store.cardQueue.length)

/**
 * Writable computed so the <select> can use v-model directly.
 * The setter calls selectDeck (which clears the old queue) then
 * immediately fills the queue for the newly selected deck.
 */
const selectedDeck = computed({
    get: () => store.currentDeck,
    set: async (deckName: string) => {
        if (!deckName || deckName === store.currentDeck) return
        const ok = await store.selectDeck(deckName)
        if (ok) await store.fillQueue(deckName)
    },
})
</script>

<template>
    <header class="h-16 bg-sakura-dark flex items-center justify-between px-12 shadow-sm z-10">
        <div class="flex items-center gap-6">
            <h1 class="text-sm font-light tracking-[0.3em] uppercase text-sakura-white/90">
                Anki // 桜
            </h1>

            <select
                v-model="selectedDeck"
                class="bg-white/10 text-[10px] border border-white/20 px-3 py-1 text-sakura-white/80 rounded-none focus:outline-none cursor-pointer uppercase tracking-widest hover:bg-white/20 transition-colors"
            >
                <option
                    v-for="deck in store.decks"
                    :key="deck"
                    :value="deck"
                    class="text-sakura-text bg-sakura-white"
                >
                    {{ deck }}
                </option>
            </select>
        </div>

        <div class="text-[10px] tracking-[0.2em] text-sakura-white/40 uppercase">
            {{ bufferedCount }} Cards Buffered
        </div>
    </header>
</template>
