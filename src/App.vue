<script setup lang="ts">
import { onMounted } from 'vue'
import AppFooter from '@/components/AppFooter.vue'
import AppHeader from '@/components/AppHeader.vue'
import SessionHistory from '@/components/SessionHistory.vue'
import StudyPane from '@/components/StudyPane.vue'
import { useCardStore } from '@/stores/cardStore'

const store = useCardStore()

onMounted(async () => {
    // init() restores the persisted deck from localStorage before fetching.
    await store.init()
    await store.fillQueue()
})
</script>

<template>
    <div
        class="min-h-screen flex flex-col font-sans selection:bg-sakura-pink selection:text-sakura-text"
    >
        <AppHeader />

        <main class="flex-1 grid grid-cols-12 w-full overflow-hidden">
            <StudyPane />

            <!-- Session History panel with its own clear button -->
            <aside class="col-span-5 bg-sakura-mist flex flex-col overflow-hidden">
                <!-- Panel header with dustbin -->
                <div
                    class="flex items-center justify-between px-8 py-5 border-b border-sakura-pink/20"
                >
                    <p class="text-[10px] tracking-[0.4em] uppercase text-sakura-muted">
                        Session History
                    </p>

                    <button
                        v-if="store.processedCards.length > 0"
                        @click="store.clearProcessedCards()"
                        class="flex items-center gap-1.5 text-[9px] tracking-[0.3em] uppercase text-sakura-muted/60 hover:text-sakura-muted transition-colors duration-300 cursor-pointer"
                        title="Clear session history"
                    >
                        <!-- Trash icon -->
                        <svg
                            class="w-3 h-3"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.75"
                        >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                        Clear
                    </button>
                </div>

                <!-- Delegate card rendering to SessionHistory, minus its own header -->
                <SessionHistory class="flex-1 overflow-y-auto" />
            </aside>
        </main>

        <AppFooter />
    </div>
</template>

<style scoped>
section::-webkit-scrollbar,
aside::-webkit-scrollbar {
    width: 3px;
}
section::-webkit-scrollbar-thumb,
aside::-webkit-scrollbar-thumb {
    background-color: rgba(179, 153, 162, 0.15);
}
</style>
