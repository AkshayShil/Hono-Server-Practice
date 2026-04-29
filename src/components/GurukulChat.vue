<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import { useGurukulStore } from '@/stores/gurukulStore'

const store = useGurukulStore()
const messageInput = ref('')
const messageListEl = ref<HTMLElement | null>(null)
const showHistory = ref(false)
const showSettings = ref(false)

function scrollToBottom() {
  nextTick(() => {
    if (messageListEl.value) {
      messageListEl.value.scrollTop = messageListEl.value.scrollHeight
    }
  })
}

watch(() => store.messages.length, scrollToBottom)
watch(() => store.isThinking, (val) => {
  if (val) scrollToBottom()
})

async function handleSend() {
  if (!messageInput.value.trim() || store.isThinking) return
  const text = messageInput.value
  messageInput.value = ''
  await store.sendMessage(text)
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function toggleHistory() {
  showHistory.value = !showHistory.value
  if (showHistory.value && store.selectedFile) {
    store.loadPastSessions(store.selectedFile.path)
  }
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

onMounted(() => {
  store.initResumeCheck()
})
</script>

<template>
  <section class="gurukul-chat flex flex-col h-full overflow-hidden bg-sakura-mist/20">
    <!-- Header -->
    <header class="shrink-0 px-6 py-4 border-b border-sakura-pink/20 flex flex-col bg-white/40 backdrop-blur-md">
      <div class="flex items-center justify-between">
        <div class="flex flex-col">
          <p class="text-[9px] tracking-[0.3em] uppercase text-sakura-muted/60 mb-0.5">Gurukul Session</p>
          <h3 class="text-sm font-medium text-sakura-dark truncate max-w-[200px]">
            {{ store.activeSection?.title || 'No section selected' }}
          </h3>
        </div>
        
        <div class="flex items-center gap-4">
          <button 
            @click="toggleHistory"
            class="text-sakura-muted hover:text-sakura-dark transition-colors"
            title="History"
          >
            <span class="text-lg">🕒</span>
          </button>
          
          <button 
            @click="showSettings = !showSettings"
            class="text-sakura-muted hover:text-sakura-dark transition-colors"
            title="Settings"
          >
            <span class="text-lg">⚙️</span>
          </button>

          <button
            v-if="store.sessionStarted"
            @click="store.endSession()"
            class="text-[10px] uppercase tracking-wider text-sakura-muted hover:text-sakura-dark transition-colors flex items-center gap-1.5"
          >
            <span>↺</span> New Session
          </button>
        </div>
      </div>

      <!-- Settings Panel -->
      <div v-if="showSettings" class="mt-4 p-3 bg-white/50 rounded-lg border border-sakura-pink/10">
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" v-model="store.allowAssessment" class="rounded border-sakura-pink text-sakura-pink focus:ring-sakura-pink">
          <span class="text-[11px] text-sakura-dark font-medium">Allow LLM to assess my progress across sessions</span>
        </label>
      </div>

      <!-- History Panel -->
      <div v-if="showHistory" class="mt-4 space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pb-2">
        <p class="text-[9px] tracking-[0.1em] uppercase text-sakura-muted/40 mb-2">Past Sessions</p>
        <div v-if="store.pastSessionsForFile.length === 0" class="text-[10px] text-sakura-muted/50 italic py-2">
          No past sessions for this file.
        </div>
        <div 
          v-for="session in store.pastSessionsForFile" 
          :key="session.id"
          class="p-2 bg-white/40 rounded border border-sakura-pink/5 hover:border-sakura-pink/20 transition-all cursor-default"
        >
          <div class="flex items-center justify-between mb-1">
            <span class="text-[10px] font-bold text-sakura-dark">[{{ formatDate(session.started_at) }}]</span>
            <span class="text-[9px] text-sakura-muted">§{{ session.section_title || 'Whole File' }} · {{ session.message_count }} turns</span>
          </div>
          <p v-if="session.auto_summary" class="text-[10px] text-sakura-text line-clamp-2 leading-relaxed italic">
            "{{ session.auto_summary }}"
          </p>
        </div>
      </div>
    </header>

    <!-- Chat Body -->
    <div class="flex-1 overflow-hidden flex flex-col relative">
      <!-- Assessment Trigger (when allowAssessment is on) -->
      <div 
        v-if="store.allowAssessment && !store.sessionStarted && store.selectedFile" 
        class="absolute top-4 left-0 right-0 z-10 flex justify-center"
      >
        <button 
          @click="store.assessProgress(store.selectedFile.path)"
          :disabled="store.isAssessing"
          class="bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-sakura-pink/30 text-[10px] font-bold uppercase tracking-widest text-sakura-dark shadow-sm hover:bg-white transition-all flex items-center gap-2"
        >
          <span v-if="store.isAssessing" class="animate-spin text-xs">🌀</span>
          <span>Assess Progress</span>
        </button>
      </div>

      <!-- Assessment Result Overlay -->
      <div 
        v-if="store.assessmentResult" 
        class="absolute inset-x-6 top-16 bottom-20 z-20 bg-white/95 backdrop-blur-lg border border-sakura-pink/30 rounded-2xl p-6 shadow-2xl flex flex-col"
      >
        <div class="flex items-center justify-between mb-4 border-b border-sakura-pink/10 pb-2">
          <h4 class="text-xs font-bold uppercase tracking-widest text-sakura-dark">Learning Assessment</h4>
          <button @click="store.assessmentResult = null" class="text-sakura-muted hover:text-sakura-dark">✕</button>
        </div>
        <div class="flex-1 overflow-y-auto custom-scrollbar text-[12px] leading-relaxed text-sakura-text whitespace-pre-wrap">
          {{ store.assessmentResult }}
        </div>
      </div>

      <!-- Messages -->
      <div 
        ref="messageListEl"
        class="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar"
      >
        <template v-if="store.sessionStarted">
          <div 
            v-for="(msg, i) in store.messages" 
            :key="i"
            class="flex w-full"
            :class="msg.role === 'assistant' ? 'justify-start' : 'justify-end'"
          >
            <div 
              class="max-w-[85%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed shadow-sm"
              :class="msg.role === 'assistant' 
                ? 'bg-sakura-mist text-sakura-dark rounded-tl-none border border-sakura-pink/20' 
                : 'bg-white text-sakura-text rounded-tr-none border border-sakura-pink/30'"
            >
              <div class="whitespace-pre-wrap">{{ msg.content }}</div>
            </div>
          </div>

          <!-- Thinking -->
          <div v-if="store.isThinking" class="flex justify-start">
            <div class="bg-sakura-mist/50 px-4 py-3 rounded-2xl rounded-tl-none border border-sakura-pink/10">
              <div class="flex gap-1">
                <span class="w-1.5 h-1.5 bg-sakura-muted/40 rounded-full animate-bounce" style="animation-delay: 0s"></span>
                <span class="w-1.5 h-1.5 bg-sakura-muted/40 rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
                <span class="w-1.5 h-1.5 bg-sakura-muted/40 rounded-full animate-bounce" style="animation-delay: 0.4s"></span>
              </div>
            </div>
          </div>
        </template>

        <!-- Resume Banner -->
        <div
          v-if="store.pendingResume"
          class="mx-6 mt-6 p-4 bg-white/80 backdrop-blur-md border border-sakura-pink/30 rounded-xl shadow-sm flex flex-col gap-3"
        >
          <div>
            <p class="text-[9px] uppercase tracking-widest text-sakura-muted/60 mb-1">Unfinished session found</p>
            <p class="text-[12px] text-sakura-dark font-medium">
              §{{ store.pendingResume.sectionTitle || 'Unknown section' }}
            </p>
            <p class="text-[10px] text-sakura-muted/60 truncate">{{ store.pendingResume.filePath }}</p>
          </div>
          <div class="flex gap-2">
            <button
              @click="store.resumeSession()"
              class="flex-1 py-2 text-[10px] uppercase tracking-widest bg-sakura-pink/20 text-sakura-dark rounded-lg hover:bg-sakura-pink/30 transition-colors font-medium"
            >
              Resume
            </button>
            <button
              @click="store.discardPendingSession()"
              class="flex-1 py-2 text-[10px] uppercase tracking-widest bg-white text-sakura-muted rounded-lg border border-sakura-pink/20 hover:bg-red-50 hover:text-red-400 hover:border-red-100 transition-colors"
            >
              Discard
            </button>
          </div>
        </div>

        <!-- Placeholder -->
        <div v-else-if="!store.sessionStarted" class="h-full flex flex-col items-center justify-center text-center px-10">
          <div class="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-sakura-pink/20 mb-4">
            <span class="text-2xl">🎓</span>
          </div>
          <h4 class="text-sakura-dark font-medium mb-2">Ready to begin?</h4>
          <p class="text-xs text-sakura-muted leading-relaxed max-w-[200px]">
            Select a section from the reader and click 
            <span class="inline-flex items-center justify-center w-5 h-5 bg-sakura-pink/30 rounded-full text-[10px] mx-1">▶</span>
            to start your Socratic session.
          </p>
        </div>
      </div>

      <!-- Error Banner -->
      <div v-if="store.error" class="absolute bottom-24 left-6 right-6 bg-red-50 border border-red-100 p-3 rounded-lg flex items-center gap-3 shadow-lg z-20">
        <span class="text-red-400 text-lg">⚠️</span>
        <p class="text-[11px] text-red-600 flex-1">{{ store.error }}</p>
        <button @click="store.error = null" class="text-red-400 hover:text-red-600">✕</button>
      </div>

      <!-- Input Area -->
      <footer class="shrink-0 p-4 bg-white/60 backdrop-blur-md border-t border-sakura-pink/15">
        <div class="relative flex items-end gap-2 bg-white rounded-xl border border-sakura-pink/30 p-2 shadow-inner-sm">
          <textarea
            v-model="messageInput"
            @keydown="handleKeyDown"
            placeholder="Answer the Guru..."
            class="flex-1 bg-transparent border-none focus:ring-0 resize-none py-2 px-2 text-[13px] min-h-[40px] max-h-[120px] custom-scrollbar"
            :disabled="!store.sessionStarted || store.isThinking"
          ></textarea>
          
          <button 
            @click="handleSend"
            :disabled="!store.sessionStarted || store.isThinking || !messageInput.trim()"
            class="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all"
            :class="messageInput.trim() && !store.isThinking ? 'bg-sakura-pink text-sakura-dark' : 'bg-sakura-mist text-sakura-muted/30'"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div class="mt-2 flex items-center justify-between">
           <p class="text-[9px] text-sakura-muted/40 uppercase tracking-widest">
            Enter to send • Shift+Enter for newline
          </p>
          <button 
            v-if="store.sessionStarted"
            @click="store.endSession()" 
            class="text-[9px] font-bold uppercase tracking-widest text-red-400 hover:text-red-600 transition-colors"
          >
            End Session
          </button>
        </div>
      </footer>
    </div>
  </section>
</template>

<style lang="less" scoped>
.gurukul-chat {
  height: 100%;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(244, 207, 223, 0.4);
  border-radius: 4px;
}

.shadow-inner-sm {
  box-shadow: inset 0 1px 2px rgba(94, 82, 86, 0.03);
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
.animate-bounce {
  animation: bounce 0.6s infinite ease-in-out;
}
</style>
