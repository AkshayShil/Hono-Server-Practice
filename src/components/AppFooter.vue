<script setup lang="ts">
import { useCardStore } from '@/stores/cardStore'

const store = useCardStore()
</script>

<template>
    <footer class="h-10 bg-sakura-dark border-t border-white/5 flex items-center justify-between px-6 md:px-12">
        <div class="hidden sm:flex items-center gap-3">
            <span class="text-[8px] tracking-[0.2em] uppercase text-sakura-white/20">Session ID:</span>
            <span class="text-[8px] tracking-[0.2em] uppercase text-sakura-white/40">{{ store.sessionId.slice(0, 8) }}</span>
        </div>

        <div class="flex items-center gap-3">
            <span class="text-[8px] tracking-[0.2em] uppercase text-sakura-white/20">Name:</span>
            <input
                v-model="store.sessionName"
                type="text"
                class="bg-transparent border-none p-0 text-[9px] tracking-[0.2em] uppercase text-sakura-white/50 focus:outline-none focus:text-sakura-white/90 w-40 placeholder:text-sakura-white/10"
                placeholder="UNNAMED SESSION"
            />
        </div>

        <div class="text-[8px] tracking-[0.4em] uppercase text-sakura-white/20 hidden md:block">
            System Active // Mindful Learning
        </div>
    </footer>
</template>
