<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppFooter from '@/components/AppFooter.vue'
import AppHeader from '@/components/AppHeader.vue'
import QueuePane from '@/components/QueuePane.vue'
import SessionHistory from '@/components/SessionHistory.vue'
import StudyPane from '@/components/StudyPane.vue'
import GurukulChat from '@/components/GurukulChat.vue'
import GurukulFileBrowser from '@/components/GurukulFileBrowser.vue'
import GurukulReader from '@/components/GurukulReader.vue'
import { useCardStore } from '@/stores/cardStore'
import { useGurukulStore } from '@/stores/gurukulStore'
import { appMode } from '@/stores/appMode'

const store = useCardStore()
const gurukulStore = useGurukulStore()

const touchStartX = ref(0)
const touchStartY = ref(0)
const minSwipeDistance = 50

function handleTouchStart(e: TouchEvent) {
    const touch = e.changedTouches[0]
    if (!touch) return
    touchStartX.value = touch.screenX
    touchStartY.value = touch.screenY
}

function handleTouchEnd(e: TouchEvent) {
    const touch = e.changedTouches[0]
    if (!touch) return
    const touchEndX = touch.screenX
    const touchEndY = touch.screenY

    const dx = touchStartX.value - touchEndX
    const dy = touchStartY.value - touchEndY

    // Only trigger if horizontal swipe is dominant and exceeds threshold
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > minSwipeDistance) {
        if (window.innerWidth < 768) {
            const drawerToggle = document.getElementById('history-drawer') as HTMLInputElement
            if (drawerToggle) {
                if (dx > 0 && !drawerToggle.checked) {
                    // Swipe left (right-to-left) -> Open
                    drawerToggle.checked = true
                } else if (dx < 0 && drawerToggle.checked) {
                    // Swipe right (left-to-right) -> Close
                    drawerToggle.checked = false
                }
            }
        }
    }
}

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

        <div
            class="drawer-content flex flex-col h-full overflow-hidden"
            @touchstart="handleTouchStart"
            @touchend="handleTouchEnd"
        >
            <AppHeader />

            <!-- Mobile Drawer Toggle: Visible only on small screens -->
            <label
                v-if="appMode === 'study'"
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
            <template v-if="appMode === 'study'">
                <main class="flex-1 grid grid-cols-12 w-full overflow-hidden min-h-0">
                    <!-- Left: Queue (Hidden on mobile) -->
                    <QueuePane class="hidden md:flex md:col-span-2" />

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
                        </div>

                        <SessionHistory />
                    </aside>
                </main>
            </template>
            <template v-else>
                <main class="flex-1 flex w-full overflow-hidden min-h-0">
                    <GurukulFileBrowser class="hidden md:flex shrink-0 w-48" />
                    <GurukulChat class="flex-1 min-w-0" />
                    <!-- Collapse handle -->
                    <button
                        @click="gurukulStore.readerCollapsed = !gurukulStore.readerCollapsed"
                        class="hidden md:flex shrink-0 items-center justify-center w-4 bg-sakura-mist/20 hover:bg-sakura-pink/20 border-x border-sakura-pink/15 transition-colors cursor-pointer"
                        :title="gurukulStore.readerCollapsed ? 'Expand reader' : 'Collapse reader'"
                    >
                        <svg
                            class="w-3 h-3 text-sakura-muted/50 transition-transform duration-300"
                            :class="{ 'rotate-180': gurukulStore.readerCollapsed }"
                            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                        >
                            <path d="M15 18l-6-6 6-6" />
                        </svg>
                    </button>
                    <!-- Reader panel — width transitions to 0 when collapsed -->
                    <div
                        class="hidden md:block overflow-hidden shrink-0 transition-[width] duration-300"
                        :style="{ width: gurukulStore.readerCollapsed ? '0' : '33.33%' }"
                    >
                        <GurukulReader class="h-full" />
                    </div>
                </main>
            </template>

            <AppFooter />
        </div>

        <!-- Mobile Drawer Side: Contains history for smaller screens -->
        <div
            class="drawer-side z-50"
            @touchstart="handleTouchStart"
            @touchend="handleTouchEnd"
        >
            <label for="history-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
            <aside class="w-80 min-h-full bg-sakura-mist flex flex-col border-l border-sakura-pink/15">
                <!-- Mobile Panel header -->
                <div
                    class="px-6 py-5 border-b border-sakura-pink/15 flex items-center justify-between shrink-0"
                >
                    <p class="text-[9px] tracking-[0.5em] uppercase text-sakura-muted/70">
                        History
                    </p>
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
