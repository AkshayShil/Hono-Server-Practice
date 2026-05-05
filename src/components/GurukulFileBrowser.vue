<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useGurukulStore, type NoteFile } from '@/stores/gurukulStore'

const store = useGurukulStore()
const fileInput = ref<HTMLInputElement | null>(null)

// Session start UI
const showSessionInput = ref(false)
const sessionNameInput = ref('')

// Inline done-confirmation: path of the file currently being confirmed
const confirmingPath = ref<string | null>(null)

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

const sessionProgress = computed(() => {
  if (!store.macroSessionActive || store.files.length === 0) return 0
  return Math.round((store.macroSessionStudied.length / store.files.length) * 100)
})

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files) store.loadFilesFromInput(target.files)
}

function triggerFileInput() {
  fileInput.value?.click()
}

async function handleOpenFolder() {
  if (!('showDirectoryPicker' in window)) { triggerFileInput(); return }
  await store.openFolder()
}

async function beginSession() {
  const name = sessionNameInput.value.trim()
  if (!name) return
  await store.startMacroSession(name)
  sessionNameInput.value = ''
  showSessionInput.value = false
}

function handleCardClick(file: NoteFile) {
  // If this card's confirmation is open, dismiss it instead of selecting
  if (confirmingPath.value === file.path) {
    confirmingPath.value = null
    return
  }
  store.selectFile(file)
}

function requestMarkDone(file: NoteFile) {
  confirmingPath.value = file.path
}

function confirmMarkDone(file: NoteFile) {
  store.markFileStudied(file.path)
  confirmingPath.value = null
}

function cancelMarkDone() {
  confirmingPath.value = null
}

onMounted(async () => {
  await store.initFolderRestore()
  await store.initMacroSessionRestore()
})
</script>

<template>
  <aside class="gurukul-file-browser flex flex-col overflow-hidden min-h-0">

    <!-- ── Top bar ─────────────────────────────────────────────────────────── -->
    <div class="px-4 py-4 border-b border-sakura-pink/15 flex items-center justify-between shrink-0 gap-2">
      <div class="flex items-center gap-1.5 min-w-0">
        <p class="text-[11px] tracking-[0.5em] uppercase text-sakura-muted/70 shrink-0">Notes</p>
        <span class="count-badge shrink-0">{{ store.files.length }}</span>
        <span v-if="store.macroSessionStudied.length > 0" class="done-count-badge shrink-0" title="Studied this session">
          ✓{{ store.macroSessionStudied.length }}
        </span>
      </div>
      <button
        @click="handleOpenFolder()"
        class="text-[11px] uppercase tracking-wider text-sakura-muted hover:text-sakura-dark transition-colors shrink-0"
      >
        Open
      </button>
      <input type="file" accept=".md,.txt" multiple webkitdirectory ref="fileInput" class="hidden" @change="onFileChange" />
    </div>

    <!-- ── Active macro session banner ───────────────────────────────────────── -->
    <div v-if="store.macroSessionActive" class="shrink-0 px-4 py-3 bg-sakura-pink/8 border-b border-sakura-pink/15">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="min-w-0">
          <p class="text-[11px] font-bold text-sakura-dark truncate">{{ store.macroSessionName }}</p>
          <p class="text-[10px] text-sakura-muted/60 mt-0.5">
            {{ store.macroSessionStudied.length }}&nbsp;/&nbsp;{{ store.files.length }}&nbsp;studied
          </p>
        </div>
        <button
          @click="store.endMacroSession()"
          class="shrink-0 text-[10px] uppercase tracking-wider font-semibold text-red-400 hover:text-red-600 transition-colors mt-0.5"
        >
          End
        </button>
      </div>
      <!-- Progress bar -->
      <div class="h-1 bg-sakura-pink/15 rounded-full overflow-hidden">
        <div
          class="h-full bg-sakura-pink/60 rounded-full transition-all duration-500"
          :style="{ width: sessionProgress + '%' }"
        ></div>
      </div>
    </div>

    <!-- ── Start session UI ───────────────────────────────────────────────── -->
    <div v-else class="shrink-0 px-4 pt-3 pb-2 border-b border-sakura-pink/10">
      <!-- Name input -->
      <div v-if="showSessionInput" class="space-y-2">
        <input
          v-model="sessionNameInput"
          @keydown.enter="beginSession"
          @keydown.escape="showSessionInput = false"
          placeholder="Session name…"
          class="w-full text-[12px] bg-white/70 border border-sakura-pink/30 rounded-lg px-3 py-1.5 text-sakura-dark placeholder-sakura-muted/40 focus:outline-none focus:border-sakura-pink/60"
          autofocus
        />
        <div class="flex gap-1.5">
          <button
            @click="beginSession"
            :disabled="!sessionNameInput.trim()"
            class="flex-1 text-[11px] uppercase tracking-wider font-semibold py-1.5 rounded-lg transition-all"
            :class="sessionNameInput.trim()
              ? 'bg-sakura-pink/30 text-sakura-dark hover:bg-sakura-pink/50'
              : 'bg-sakura-mist/30 text-sakura-muted/40 cursor-not-allowed'"
          >
            Begin
          </button>
          <button
            @click="showSessionInput = false; sessionNameInput = ''"
            class="text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-lg text-sakura-muted hover:text-sakura-dark border border-sakura-pink/20 hover:border-sakura-pink/40 transition-all"
          >
            ✕
          </button>
        </div>
      </div>
      <!-- Start button -->
      <button
        v-else
        @click="showSessionInput = true"
        class="w-full text-[11px] uppercase tracking-wider text-sakura-muted/60 hover:text-sakura-dark py-1.5 rounded-lg border border-dashed border-sakura-pink/25 hover:border-sakura-pink/50 hover:bg-sakura-pink/5 transition-all"
      >
        + New Session
      </button>
    </div>

    <!-- ── File list ──────────────────────────────────────────────────────── -->
    <div class="flex-1 overflow-y-auto px-3 py-3 space-y-5">
      <div v-if="store.files.length > 0" class="space-y-5">
        <div v-for="(files, groupName) in groupedFiles" :key="groupName" class="space-y-2">
          <p class="text-[10px] tracking-[0.2em] uppercase text-sakura-muted/40 px-1">{{ groupName }}</p>

          <div
            v-for="file in files"
            :key="file.path"
            class="glass-card cursor-pointer group"
            :class="{
              'glass-card--active':   store.selectedFile?.path === file.path && !store.macroSessionStudied.includes(file.path),
              'glass-card--studied':  store.macroSessionStudied.includes(file.path),
            }"
            @click="handleCardClick(file)"
          >
            <!-- Name row -->
            <div class="flex items-center gap-1.5 min-w-0">
              <!-- State indicator -->
              <span v-if="store.macroSessionStudied.includes(file.path)"
                class="shrink-0 w-2 h-2 rounded-full bg-teal-400/80 ring-2 ring-teal-200/60"
                title="Studied this session"></span>
              <span v-else-if="store.discussedFiles.includes(file.path)"
                class="shrink-0 w-1.5 h-1.5 rounded-full bg-sakura-pink/70"
                title="Previously discussed"></span>

              <span class="card-text truncate flex-1 font-medium">{{ file.name }}</span>

              <!-- Session badge -->
              <span
                v-if="store.macroSessionStudied.includes(file.path)"
                class="shrink-0 text-[9px] uppercase tracking-wider font-bold text-teal-600 bg-teal-50 border border-teal-200/60 px-1.5 py-0.5 rounded-full"
              >done</span>
            </div>

            <!-- Path -->
            <div class="text-[10px] text-sakura-muted/50 truncate mt-0.5 pl-3.5">{{ file.path }}</div>

            <!-- Confirmation / action row — visible on hover or when confirming this card -->
            <div
              class="mt-2 flex items-center gap-1.5 pl-0.5"
              :class="confirmingPath === file.path ? 'flex' : 'hidden group-hover:flex'"
              @click.stop
            >
              <template v-if="confirmingPath === file.path">
                <span class="text-[10px] text-sakura-muted/60 mr-0.5">Mark done?</span>
                <button @click="confirmMarkDone(file)" class="action-btn action-btn--confirm">Yes</button>
                <button @click="cancelMarkDone()" class="action-btn action-btn--cancel">✕</button>
              </template>
              <template v-else>
                <button
                  v-if="!store.macroSessionStudied.includes(file.path)"
                  @click="requestMarkDone(file)"
                  :disabled="!store.macroSessionActive"
                  class="action-btn action-btn--mark"
                  :title="store.macroSessionActive ? 'Mark as studied this session' : 'Start a session first'"
                >✓ Done</button>
                <button
                  v-else
                  @click="store.unmarkFileStudied(file.path)"
                  class="action-btn action-btn--unmark"
                >↩ Undo</button>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Empty state ──────────────────────────────────────────────────── -->
      <div v-else class="flex flex-col items-center justify-center py-12 gap-3">
        <div class="empty-icon">∅</div>
        <div class="text-center space-y-2 w-full px-2">
          <p class="text-[10px] uppercase tracking-[0.4em] text-sakura-muted/35">No notes loaded</p>
          <button
            v-if="store.hasSavedFolder"
            @click="store.restoreFolder()"
            class="block w-full text-[11px] text-sakura-dark/70 hover:text-sakura-dark bg-sakura-pink/10 hover:bg-sakura-pink/20 border border-sakura-pink/25 rounded-lg px-3 py-1.5 transition-colors"
          >
            ↺ {{ store.savedFolderName }}
          </button>
          <button
            @click="triggerFileInput"
            class="block w-full text-[11px] text-sakura-muted/60 hover:text-sakura-muted underline underline-offset-4 decoration-sakura-pink/30"
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
@glass-shadow: 0 2px 12px rgba(94, 82, 86, 0.07), 0 1px 2px rgba(94, 82, 86, 0.04);
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

.count-badge, .done-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
}
.count-badge {
  background: rgba(244, 207, 223, 0.45);
  color: @muted;
  border: 1px solid rgba(244, 207, 223, 0.5);
}
.done-count-badge {
  background: rgba(134, 239, 172, 0.2);
  color: #16a34a;
  border: 1px solid rgba(134, 239, 172, 0.35);
  font-weight: 600;
}

.glass-card {
  position: relative;
  padding: 8px 10px;
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

  // Studied this session: teal tint
  &--studied {
    background: linear-gradient(135deg, rgba(20, 184, 166, 0.08) 0%, rgba(255, 255, 255, 0.55) 100%);
    border-color: rgba(20, 184, 166, 0.25);
    box-shadow: 0 2px 10px rgba(20, 184, 166, 0.08);
  }

}

.card-text {
  font-size: 12px;
  color: @text;
  line-height: 1.3;
}

.empty-icon {
  font-size: 22px;
  color: rgba(179, 153, 162, 0.2);
}

.action-btn {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: 5px;
  border: 1px solid transparent;
  transition: all 0.15s ease;
  cursor: pointer;
  line-height: 1.4;

  &--mark {
    background: rgba(134, 239, 172, 0.12);
    color: #16a34a;
    border-color: rgba(134, 239, 172, 0.3);
    &:hover { background: rgba(134, 239, 172, 0.28); }
  }
  &--unmark {
    background: rgba(244, 207, 223, 0.12);
    color: @muted;
    border-color: rgba(244, 207, 223, 0.3);
    &:hover { background: rgba(244, 207, 223, 0.28); }
  }
  &--confirm {
    background: rgba(134, 239, 172, 0.18);
    color: #15803d;
    border-color: rgba(134, 239, 172, 0.38);
    &:hover { background: rgba(134, 239, 172, 0.35); }
  }
  &--cancel {
    background: rgba(244, 207, 223, 0.12);
    color: @muted;
    border-color: rgba(244, 207, 223, 0.25);
    &:hover { background: rgba(244, 207, 223, 0.28); color: #c0526a; border-color: rgba(192, 82, 106, 0.3); }
  }
}
</style>
