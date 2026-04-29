<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGurukulStore, type NoteFile } from '@/stores/gurukulStore'

const store = useGurukulStore()
const fileInput = ref<HTMLInputElement | null>(null)

const groupedFiles = computed(() => {
  const groups: Record<string, NoteFile[]> = {}
  store.files.forEach(file => {
    const parts = file.path.split('/')
    const groupName = (parts.length > 1 ? parts[0] : undefined) ?? 'Root'
    if (!groups[groupName]) groups[groupName] = []
    groups[groupName]!.push(file)
  })
  return groups
})

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files) {
    store.loadFilesFromInput(target.files)
  }
}

function triggerFileInput() {
  fileInput.value?.click()
}

async function handleOpenFolder() {
  if (!('showDirectoryPicker' in window)) {
    triggerFileInput()
    return
  }
  await store.openFolder()
}
</script>

<template>
  <aside class="gurukul-file-browser flex flex-col overflow-hidden min-h-0">
    <!-- Header -->
    <div class="px-6 py-5 border-b border-sakura-pink/15 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2">
        <p class="text-[9px] tracking-[0.5em] uppercase text-sakura-muted/70">Notes</p>
        <span class="count-badge">{{ store.files.length }}</span>
      </div>
      <button
        @click="handleOpenFolder()"
        class="text-[10px] uppercase tracking-wider text-sakura-muted hover:text-sakura-dark transition-colors"
      >
        Open Folder
      </button>
      <input 
        type="file" 
        accept=".md,.txt" 
        multiple 
        webkitdirectory 
        ref="fileInput" 
        class="hidden" 
        @change="onFileChange"
      />
    </div>

    <!-- File List -->
    <div class="flex-1 overflow-y-auto px-4 py-4 space-y-6">
      <div v-if="store.files.length > 0" class="space-y-6">
        <div v-for="(files, groupName) in groupedFiles" :key="groupName" class="space-y-2.5">
          <p class="text-[8px] tracking-[0.2em] uppercase text-sakura-muted/40 px-2">{{ groupName }}</p>
          <div 
            v-for="file in files" 
            :key="file.path"
            @click="store.selectFile(file)"
            class="glass-card cursor-pointer"
            :class="{ 'glass-card--active': store.selectedFile?.path === file.path }"
          >
            <div class="card-text truncate font-medium">{{ file.name }}</div>
            <div class="text-[9px] text-sakura-muted/60 truncate">{{ file.path }}</div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="flex flex-col items-center justify-center py-16 gap-3">
        <div class="empty-icon">∅</div>
        <div class="text-center space-y-1">
          <p class="text-[9px] uppercase tracking-[0.4em] text-sakura-muted/35">No notes loaded</p>
          <button 
            @click="triggerFileInput"
            class="text-[10px] text-sakura-muted/60 hover:text-sakura-muted underline underline-offset-4 decoration-sakura-pink/30"
          >
            Select directory
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<style lang="less" scoped>
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

.gurukul-file-browser {
  background: linear-gradient(170deg, @pane-bg-from 0%, @pane-bg-to 100%);
  border-right: 1px solid rgba(244, 207, 223, 0.18);
  height: 100%;

  &::-webkit-scrollbar { width: 2px; }
  &::-webkit-scrollbar-thumb { background: rgba(179, 153, 162, 0.18); border-radius: 2px; }
}

.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 20px;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.02em;
  background: rgba(244, 207, 223, 0.45);
  color: @muted;
  border: 1px solid rgba(244, 207, 223, 0.5);
}

.glass-card {
  position: relative;
  padding: 10px 12px;
  border-radius: 10px;
  overflow: hidden;
  background: @glass-bg;
  backdrop-filter: @blur-val;
  -webkit-backdrop-filter: @blur-val;
  border: 1px solid @glass-border;
  box-shadow: @glass-shadow, inset 0 1px 0 @glass-highlight;
  transition: all 0.22s ease;

  &:hover {
    transform: translateY(-1px);
    background: @glass-bg-hover;
    border-color: rgba(244, 207, 223, 0.5);
  }

  &--active {
    background: linear-gradient(135deg, rgba(244, 207, 223, 0.35) 0%, rgba(255, 255, 255, 0.6) 100%);
    border-color: rgba(244, 207, 223, 0.6);
    box-shadow: 0 4px 12px rgba(244, 207, 223, 0.2);
  }
}

.card-text {
  font-size: 11px;
  color: @text;
}

.empty-icon {
  font-size: 24px;
  color: rgba(179, 153, 162, 0.2);
}
</style>
