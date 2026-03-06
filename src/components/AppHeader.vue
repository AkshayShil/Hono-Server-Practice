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

const openDeckModal = () => {
    const modal = document.getElementById('deck_modal') as HTMLDialogElement
    if (modal) modal.showModal()
}

const handleMobileDeckSelect = async (deckName: string) => {
    if (!deckName || deckName === store.currentDeck) return
    const ok = await store.selectDeck(deckName)
    if (ok) {
        await store.fillQueue(deckName)
        const modal = document.getElementById('deck_modal') as HTMLDialogElement
        if (modal) modal.close()
    }
}
</script>

<template>
    <header class="h-16 bg-sakura-dark flex items-center justify-between px-6 md:px-12 shadow-sm z-10">
        <div class="flex items-center gap-6">
            <h1 class="hidden sm:block text-sm font-light tracking-[0.3em] uppercase text-sakura-white/90">
                Anki // 桜
            </h1>

            <select
                v-model="selectedDeck"
                class="hidden md:inline-block bg-white/10 text-[10px] border border-white/20 px-3 py-1 text-sakura-white/80 rounded-none focus:outline-none cursor-pointer uppercase tracking-widest hover:bg-white/20 transition-colors"
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

            <button
                class="md:hidden bg-white/10 text-[10px] border border-white/20 px-3 py-1 text-sakura-white/80 rounded-none focus:outline-none cursor-pointer uppercase tracking-widest hover:bg-white/20 transition-colors"
                @click="openDeckModal"
            >
                {{ store.currentDeck || 'Select Deck' }}
            </button>
        </div>

        <div class="text-[10px] tracking-[0.2em] text-sakura-white/40 uppercase">
            {{ bufferedCount }} Cards <span class="hidden sm:inline">Buffered</span>
        </div>
    </header>

    <dialog id="deck_modal" class="modal">
        <div class="modal-box bg-sakura-white p-0 rounded-none border-t-4 border-sakura-dark">
            <div class="p-4 border-b border-sakura-pink/20 bg-sakura-white/50">
                <h3 class="font-bold text-xs uppercase tracking-[0.2em] text-sakura-text/80">
                    Select Deck
                </h3>
            </div>
            <div class="max-h-[60vh] overflow-y-auto">
                <div
                    v-for="deck in store.decks"
                    :key="deck"
                    class="p-4 cursor-pointer hover:bg-sakura-pink/10 transition-colors flex items-center justify-between group"
                    @click="handleMobileDeckSelect(deck)"
                >
                    <span
                        class="text-xs uppercase tracking-widest text-sakura-text/70 group-hover:text-sakura-text font-medium"
                    >
                        {{ deck }}
                    </span>
                    <div
                        v-if="deck === store.currentDeck"
                        class="w-1.5 h-1.5 rounded-full bg-sakura-dark"
                    ></div>
                </div>
            </div>
            <div class="modal-action p-4 border-t border-sakura-pink/10 m-0">
                <form method="dialog" class="w-full">
                    <button
                        class="w-full text-[10px] uppercase tracking-[0.3em] font-light py-2 border border-sakura-text/20 hover:bg-sakura-text hover:text-white transition-all"
                    >
                        Close
                    </button>
                </form>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>close</button>
        </form>
    </dialog>
</template>
