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
        class="drawer drawer-end h-screen font-sans selection:bg-sakura-pink selection:text-sakura-text"
    >
        <input id="history-drawer" type="checkbox" class="drawer-toggle" />

        <div class="drawer-content flex flex-col h-full overflow-hidden">
            <AppHeader />

            <!-- Mobile Drawer Toggle: Visible only on small screens -->
            <label
                for="history-drawer"
                class="md:hidden fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-sakura-pink/80 text-sakura-text p-2 rounded-l-xl shadow-lg border border-r-0 border-sakura-pink/30 backdrop-blur-sm cursor-pointer transition-all hover:bg-sakura-pink"
            >
                <svg
                    class="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path d="M15 18l-6-6 6-6" />
                </svg>
            </label>

            <!-- 25 / 50 / 25 — grid-cols-12: 3 + 6 + 3 (approx) -->
            <main class="flex-1 grid grid-cols-12 w-full overflow-hidden min-h-0">
                <!-- Left: Queue (Hidden on mobile) -->
                <Queuepane class="hidden md:flex md:col-span-2" />

                <!-- Centre: Study editor (Full width on mobile) -->
                <StudyPane class="col-span-12 md:col-span-8" />

                <!-- Right: Session history (Desktop only) -->
                <aside
                    class="hidden md:flex md:col-span-2 bg-sakura-mist flex flex-col overflow-hidden min-h-0 border-l border-sakura-pink/15"
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

        <!-- Mobile Drawer Side: Contains history for smaller screens -->
        <div class="drawer-side z-50">
            <label for="history-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
            <aside class="w-80 min-h-full bg-sakura-mist flex flex-col border-l border-sakura-pink/15">
                <!-- Mobile Panel header -->
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
        </div>
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
