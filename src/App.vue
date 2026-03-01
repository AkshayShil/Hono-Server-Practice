<script setup lang="ts">
import { onMounted } from 'vue'
import AppFooter from '@/components/AppFooter.vue'
import AppHeader from '@/components/AppHeader.vue'
import Queuepane from '@/components/Queuepane.vue'
import SessionHistory from '@/components/SessionHistory.vue'
import StudyPane from '@/components/StudyPane.vue'
import { useCardStore } from '@/stores/cardStore'

const store = useCardStore()

onMounted(async () => {
    await store.init()
    await store.fillQueue()
})
</script>

<template>
    <div
        class="min-h-screen flex flex-col font-sans selection:bg-sakura-pink selection:text-sakura-text"
    >
        <AppHeader />

        <!-- 25 / 50 / 25 — grid-cols-12: 3 + 6 + 3 -->
        <main class="flex-1 grid grid-cols-12 w-full overflow-hidden">
            <!-- Left: Queue (25%) -->
            <Queuepane />

            <!-- Centre: Study editor (50%) -->
            <StudyPane />

            <!-- Right: Session history (25%) -->
            <aside
                class="col-span-2 bg-sakura-mist flex flex-col overflow-hidden border-l border-sakura-pink/15"
            >
                <!-- Panel header -->
                <div
                    class="px-6 py-5 border-b border-sakura-pink/15 flex items-center justify-between shrink-0"
                >
                    <p class="text-[9px] tracking-[0.5em] uppercase text-sakura-muted/70">
                        History
                    </p>
                    <button
                        v-if="store.processedCards.length > 0"
                        @click="store.clearProcessedCards()"
                        class="flex items-center gap-1.5 text-[8px] tracking-[0.3em] uppercase text-sakura-muted/45 hover:text-sakura-muted transition-colors duration-300 cursor-pointer"
                        title="Clear session history"
                    >
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

                <SessionHistory />
            </aside>
        </main>

        <AppFooter />
    </div>
</template>

<style scoped>
/* Thin scrollbars across all panels */
:deep(*::-webkit-scrollbar) {
    width: 2px;
}
:deep(*::-webkit-scrollbar-thumb) {
    background-color: rgba(179, 153, 162, 0.15);
    border-radius: 2px;
}
</style>
