<script setup lang="ts">
import { computed } from 'vue'
import { useCardStore } from '@/stores/cardStore'
import { appMode } from '@/stores/appMode'

const store = useCardStore()

const bufferedCount = computed(() => store.cardQueue.length)

const currentDeckId = computed(() => {
    return store.decks.find(d => d.name === store.currentDeck)?.id
})

/**
 * Writable computed so the <select> can use v-model directly.
 * The setter calls selectDeck (which clears the old queue and syncs cards)
 */
const selectedDeck = computed({
    get: () => currentDeckId.value,
    set: async (deckId: number) => {
        if (!deckId || deckId === currentDeckId.value) return
        await store.selectDeck(deckId)
    },
})

const openDeckModal = () => {
    const modal = document.getElementById('deck_modal') as HTMLDialogElement
    if (modal) modal.showModal()
}

const handleMobileDeckSelect = async (deckId: number) => {
    if (!deckId || deckId === currentDeckId.value) return
    const ok = await store.selectDeck(deckId)
    if (ok) {
        const modal = document.getElementById('deck_modal') as HTMLDialogElement
        if (modal) modal.close()
    }
}

const openResetModal = () => {
    const modal = document.getElementById('reset_modal') as HTMLDialogElement
    if (modal) modal.showModal()
}

const handleReset = async () => {
    await store.resetSession()
    const modal = document.getElementById('reset_modal') as HTMLDialogElement
    if (modal) modal.close()
}
</script>

<template>
    <header class="h-16 bg-sakura-dark flex items-center justify-between px-6 md:px-12 shadow-sm z-10">
        <div class="flex items-center gap-6">
            <h1 class="hidden sm:block text-sm font-light tracking-[0.3em] uppercase text-sakura-white/90">
                Anki // 桜
            </h1>
            
            <button 
                @click="store.syncDecks"
                class="hidden md:flex items-center gap-1.5 text-[9px] tracking-[0.3em] uppercase text-sakura-white/40 hover:text-sakura-white transition-colors duration-300 cursor-pointer disabled:opacity-50"
                title="Sync with Anki"
                :disabled="store.isSyncing"
            >
                <svg v-if="!store.isSyncing" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 2v6h-6" />
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                    <path d="M3 22v-6h6" />
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
                <div v-else class="w-3 h-3 border border-sakura-white/40 border-t-sakura-white rounded-full animate-spin"></div>
                Sync
            </button>

            <button 
                @click="openResetModal"
                class="hidden md:flex items-center gap-1.5 text-[9px] tracking-[0.3em] uppercase text-sakura-white/40 hover:text-sakura-white transition-colors duration-300 cursor-pointer"
                title="Reset Session"
            >
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                </svg>
                Reset
            </button>

            <div class="hidden md:flex items-center border border-white/20 overflow-hidden rounded-md h-7">
                <button @click="appMode = 'study'"
                    class="px-3 h-full text-[9px] tracking-[0.3em] uppercase transition-colors cursor-pointer"
                    :class="appMode === 'study' ? 'bg-white/20 text-sakura-white' : 'text-sakura-white/40 hover:text-sakura-white/70'">
                    Study
                </button>
                <button @click="appMode = 'gurukul'"
                    class="px-2 h-full text-[9px] tracking-[0.3em] uppercase transition-colors border-l border-white/20 cursor-pointer"
                    :class="appMode === 'gurukul' ? 'bg-white/20 text-sakura-white' : 'text-sakura-white/40 hover:text-sakura-white/70'">
                    Gurukul
                </button>
            </div>

            <select
                v-model="selectedDeck"
                class="hidden md:inline-block bg-white/10 text-[10px] border border-white/20 px-3 py-1 text-sakura-white/80 rounded-none focus:outline-none cursor-pointer uppercase tracking-widest hover:bg-white/20 transition-colors"
            >
                <option
                    v-for="deck in store.decks"
                    :key="deck.id"
                    :value="deck.id"
                    class="text-sakura-text bg-sakura-white"
                >
                    {{ deck.name }}
                </option>
            </select>

            <button
                class="md:hidden bg-white/10 text-[10px] border border-white/20 px-3 py-1 text-sakura-white/80 rounded-none focus:outline-none cursor-pointer uppercase tracking-widest hover:bg-white/20 transition-colors"
                @click="openDeckModal"
            >
                {{ store.currentDeck || 'Select Deck' }}
            </button>

            <button
                class="md:hidden bg-white/10 text-sakura-white/80 border border-white/20 p-2 hover:bg-white/20 transition-colors disabled:opacity-50"
                @click="store.syncDecks"
                :disabled="store.isSyncing"
                title="Sync with Anki"
            >
                <svg v-if="!store.isSyncing" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 2v6h-6" />
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                    <path d="M3 22v-6h6" />
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
                <div v-else class="w-3.5 h-3.5 border border-sakura-white/40 border-t-sakura-white rounded-full animate-spin"></div>
            </button>

            <button
                class="md:hidden bg-white/10 text-sakura-white/80 border border-white/20 p-2 hover:bg-white/20 transition-colors"
                @click="openResetModal"
                title="Reset Session"
            >
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                </svg>
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
                    :key="deck.id"
                    class="p-4 cursor-pointer hover:bg-sakura-pink/10 transition-colors flex items-center justify-between group"
                    @click="handleMobileDeckSelect(deck.id)"
                >
                    <span
                        class="text-xs uppercase tracking-widest text-sakura-text/70 group-hover:text-sakura-text font-medium"
                    >
                        {{ deck.name }}
                    </span>
                    <div
                        v-if="deck.name === store.currentDeck"
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

    <dialog id="reset_modal" class="modal">
        <div class="modal-box bg-sakura-white p-0 rounded-none border-t-4 border-sakura-dark max-w-xs">
            <div class="p-6 text-center">
                <h3 class="font-bold text-xs uppercase tracking-[0.2em] text-sakura-text mb-4">
                    Reset Session?
                </h3>
                <p class="text-[10px] text-sakura-text/60 uppercase tracking-widest leading-relaxed mb-6">
                    This will clear your current queue and history.
                </p>
                <div class="flex gap-3">
                    <form method="dialog" class="flex-1">
                        <button class="w-full text-[9px] uppercase tracking-[0.2em] py-2 border border-sakura-text/10 hover:bg-sakura-pink/10 transition-all">
                            Cancel
                        </button>
                    </form>
                    <button 
                        @click="handleReset"
                        class="flex-1 text-[9px] uppercase tracking-[0.2em] py-2 bg-sakura-dark text-white hover:bg-sakura-text transition-all"
                    >
                        Reset
                    </button>
                </div>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>close</button>
        </form>
    </dialog>
</template>
