<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import { marked } from 'marked'
import { useGurukulStore } from '@/stores/gurukulStore'
import { useLLMStore } from '@/stores/llm'

marked.setOptions({ gfm: true, breaks: true })

const store = useGurukulStore()
const llmStore = useLLMStore()
const messageInput = ref('')
const messageListEl = ref<HTMLElement | null>(null)
const showHistory = ref(false)
const showSettings = ref(false)
const sessionJustEnded = ref(false)
const renderedMessages = ref<Map<number, string>>(new Map())

const quickChips = [
  { label: 'Give me a mnemonic', message: 'I keep forgetting this — can you give me a mnemonic or memory trick?' },
  { label: 'Explain this', message: 'I\'m confused. Can you explain this concept?' },
  { label: 'Hint', message: 'Give me a small hint without revealing the full answer.' },
]

watch(
  () => store.messages.length,
  async () => {
    const map = new Map<number, string>()
    for (let i = 0; i < store.messages.length; i++) {
      const msg = store.messages[i]
      if (msg && msg.role === 'assistant') {
        map.set(i, await marked.parse(msg.content))
      }
    }
    renderedMessages.value = map
  },
  { immediate: true }
)

async function sendChip(message: string) {
  if (store.isThinking) return
  messageInput.value = ''
  await store.sendMessage(message)
}

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

async function handleEndSession() {
  await store.endSession()
  sessionJustEnded.value = true
  setTimeout(() => { sessionJustEnded.value = false }, 3000)
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
          <p class="text-[11px] tracking-[0.3em] uppercase text-sakura-muted/60 mb-0.5">Gurukul Session</p>
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
            @click="handleEndSession()"
            class="text-[12px] uppercase tracking-wider text-sakura-muted hover:text-sakura-dark transition-colors flex items-center gap-1.5"
          >
            <span>✓</span> End Session
          </button>
        </div>
      </div>

      <!-- Settings Panel -->
      <div v-if="showSettings" class="mt-4 p-4 bg-white/50 rounded-xl border border-sakura-pink/10 space-y-4">
        <!-- Provider + Model -->
        <div class="space-y-3">
          <p class="text-[11px] tracking-[0.2em] uppercase text-sakura-muted/60">LLM Provider</p>
          <div class="flex gap-2">
            <select
              :value="store.gurukulProviderId"
              @change="store.setGurukulProvider(($event.target as HTMLSelectElement).value)"
              class="flex-1 text-[13px] bg-white border border-sakura-pink/30 rounded-lg px-3 py-1.5 text-sakura-dark focus:outline-none focus:border-sakura-pink/60"
            >
              <option
                v-for="p in llmStore.availableProviders"
                :key="p.id"
                :value="p.id"
              >{{ p.label }}</option>
            </select>
            <select
              :value="store.gurukulModelId"
              @change="store.setGurukulModel(($event.target as HTMLSelectElement).value)"
              class="flex-1 text-[13px] bg-white border border-sakura-pink/30 rounded-lg px-3 py-1.5 text-sakura-dark focus:outline-none focus:border-sakura-pink/60"
            >
              <option
                v-for="m in store.gurukulProvider.models"
                :key="m.id"
                :value="m.id"
              >{{ m.label }}</option>
            </select>
          </div>
        </div>
        <!-- Assessment toggle -->
        <div class="border-t border-sakura-pink/10 pt-3">
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" v-model="store.allowAssessment" class="rounded border-sakura-pink text-sakura-pink focus:ring-sakura-pink">
            <span class="text-[13px] text-sakura-dark font-medium">Allow LLM to assess my progress across sessions</span>
          </label>
        </div>
      </div>

      <!-- History Panel -->
      <div v-if="showHistory" class="mt-4 space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pb-2">
        <p class="text-[11px] tracking-[0.1em] uppercase text-sakura-muted/40 mb-2">Past Sessions</p>
        <div v-if="store.pastSessionsForFile.length === 0" class="text-[12px] text-sakura-muted/50 italic py-2">
          No past sessions for this file.
        </div>
        <div 
          v-for="session in store.pastSessionsForFile" 
          :key="session.id"
          class="p-2 bg-white/40 rounded border border-sakura-pink/5 hover:border-sakura-pink/20 transition-all cursor-default"
        >
          <div class="flex items-center justify-between mb-1">
            <span class="text-[12px] font-bold text-sakura-dark">[{{ formatDate(session.started_at) }}]</span>
            <span class="text-[11px] text-sakura-muted">§{{ session.section_title || 'Whole File' }} · {{ session.message_count }} turns</span>
          </div>
          <p v-if="session.auto_summary" class="text-[12px] text-sakura-text line-clamp-2 leading-relaxed italic">
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
          class="bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-sakura-pink/30 text-[12px] font-bold uppercase tracking-widest text-sakura-dark shadow-sm hover:bg-white transition-all flex items-center gap-2"
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
        <div class="flex-1 overflow-y-auto custom-scrollbar text-[14px] leading-relaxed text-sakura-text whitespace-pre-wrap">
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
              class="max-w-[85%] px-4 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm"
              :class="msg.role === 'assistant' 
                ? 'bg-sakura-mist text-sakura-dark rounded-tl-none border border-sakura-pink/20' 
                : 'bg-white text-sakura-text rounded-tr-none border border-sakura-pink/30'"
            >
              <div v-if="msg.role === 'assistant'" class="chat-markdown" v-html="renderedMessages.get(i) || msg.content"></div>
              <div v-else class="whitespace-pre-wrap">{{ msg.content }}</div>
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

          <!-- Inline error card -->
          <div v-if="store.error" class="flex justify-start">
            <div class="max-w-[85%] space-y-2">
              <div class="px-4 py-3 rounded-2xl rounded-tl-none bg-red-50 border border-red-200 text-[13px]">
                <div class="flex items-center justify-between gap-3 mb-1">
                  <span class="font-semibold text-red-600 flex items-center gap-1.5">
                    <span>⚠</span> Guru unreachable
                  </span>
                  <button @click="store.error = null" class="text-red-300 hover:text-red-500 leading-none">✕</button>
                </div>
                <p class="text-red-500/80 text-[12px] leading-relaxed break-all">{{ store.error }}</p>
              </div>
              <button
                v-if="store.canRetry"
                @click="store.retryLastMessage()"
                class="flex items-center gap-1.5 px-3 py-1.5 text-[12px] uppercase tracking-wider border border-red-200 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium"
              >
                <span>↺</span> Retry
              </button>
            </div>
          </div>
        </template>

        <!-- Resume Banner -->
        <div
          v-if="store.pendingResume"
          class="mx-6 mt-6 p-4 bg-white/80 backdrop-blur-md border border-sakura-pink/30 rounded-xl shadow-sm flex flex-col gap-3"
        >
          <div>
            <p class="text-[11px] uppercase tracking-widest text-sakura-muted/60 mb-1">Unfinished session found</p>
            <p class="text-[14px] text-sakura-dark font-medium">
              §{{ store.pendingResume.sectionTitle || 'Unknown section' }}
            </p>
            <p class="text-[12px] text-sakura-muted/60 truncate">{{ store.pendingResume.filePath }}</p>
          </div>
          <div class="flex gap-2">
            <button
              @click="store.resumeSession()"
              class="flex-1 py-2 text-[12px] uppercase tracking-widest bg-sakura-pink/20 text-sakura-dark rounded-lg hover:bg-sakura-pink/30 transition-colors font-medium"
            >
              Resume
            </button>
            <button
              @click="store.discardPendingSession()"
              class="flex-1 py-2 text-[12px] uppercase tracking-widest bg-white text-sakura-muted rounded-lg border border-sakura-pink/20 hover:bg-red-50 hover:text-red-400 hover:border-red-100 transition-colors"
            >
              Discard
            </button>
          </div>
        </div>

        <!-- Placeholder / Section picker -->
        <div v-else-if="!store.sessionStarted" class="h-full flex flex-col">

          <!-- No file selected -->
          <div v-if="!store.selectedFile" class="flex-1 flex flex-col items-center justify-center text-center">
            <div class="text-4xl mb-4">📖</div>
            <p class="text-sm text-sakura-muted/60">Select a file from the left panel</p>
          </div>

          <!-- File selected: section picker -->
          <template v-else>
            <!-- Session saved feedback -->
            <div v-if="sessionJustEnded" class="shrink-0 mb-4 p-3 bg-teal-50 border border-teal-200/60 rounded-xl text-center">
              <p class="text-[12px] font-semibold text-teal-700 flex items-center justify-center gap-1.5">
                <span>✓</span> Session saved · note marked as studied
              </p>
            </div>

            <p class="shrink-0 text-[11px] tracking-[0.3em] uppercase text-sakura-muted/60 mb-3">Choose a section</p>

            <div class="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar">
              <button
                v-for="section in store.sections"
                :key="section.title"
                @click="store.selectSection(section)"
                class="w-full text-left px-4 py-3 rounded-xl border transition-all text-[13px]"
                :class="store.activeSection?.title === section.title
                  ? 'bg-sakura-pink/20 border-sakura-pink/50 text-sakura-dark font-medium'
                  : 'bg-white/50 border-sakura-pink/15 text-sakura-muted hover:bg-sakura-pink/10 hover:border-sakura-pink/30'"
              >
                {{ section.title || 'Introduction' }}
              </button>
              <div v-if="store.sections.length === 0" class="py-6 text-center">
                <p class="text-[12px] text-sakura-muted/40">No sections found in this file</p>
              </div>
            </div>

            <div class="shrink-0 pt-3">
              <button
                v-if="store.activeSection"
                @click="store.startSession()"
                class="w-full py-3 rounded-xl bg-sakura-pink/30 hover:bg-sakura-pink/50 text-sakura-dark font-semibold text-[13px] uppercase tracking-widest transition-all border border-sakura-pink/30"
              >
                ▶ Start · {{ store.activeSection.title || 'Introduction' }}
              </button>
              <p v-else class="text-center text-[12px] text-sakura-muted/40 py-2">Select a section above to begin</p>
            </div>
          </template>
        </div>
      </div>

      <!-- Input Area -->
      <footer class="shrink-0 p-4 bg-white/60 backdrop-blur-md border-t border-sakura-pink/15">
        <div class="relative flex items-end gap-2 bg-white rounded-xl border border-sakura-pink/30 p-2 shadow-inner-sm">
          <textarea
            v-model="messageInput"
            @keydown="handleKeyDown"
            placeholder="Answer the Guru..."
            class="flex-1 bg-transparent border-none outline-none focus:ring-0 resize-none py-2 px-2 text-[15px] min-h-[40px] max-h-[120px] custom-scrollbar"
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
        <!-- Quick-action chips -->
        <div v-if="store.sessionStarted && !store.isThinking" class="mt-2 flex items-center gap-2 flex-wrap">
          <button
            v-for="chip in quickChips"
            :key="chip.label"
            @click="sendChip(chip.message)"
            class="text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full border border-sakura-pink/30 text-sakura-muted hover:bg-sakura-pink/10 hover:text-sakura-dark transition-all"
          >
            {{ chip.label }}
          </button>
          <span class="ml-auto text-[11px] text-sakura-muted/40 uppercase tracking-widest hidden sm:block">Enter to send</span>
        </div>
        <div v-else class="mt-2 flex items-center justify-between">
          <p class="text-[11px] text-sakura-muted/40 uppercase tracking-widest">
            Enter to send • Shift+Enter for newline
          </p>
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

.chat-markdown {
  font-size: 15px;
  line-height: 1.65;

  :deep(p) { margin-bottom: 0.75em; &:last-child { margin-bottom: 0; } }
  :deep(h1), :deep(h2), :deep(h3) { font-weight: 600; margin: 0.75em 0 0.35em; color: #2c2426; }
  :deep(ul), :deep(ol) { padding-left: 1.4em; margin-bottom: 0.75em; }
  :deep(ul) { list-style-type: disc; }
  :deep(ol) { list-style-type: decimal; }
  :deep(li) { margin-bottom: 0.25em; }
  :deep(code) { background: rgba(244, 207, 223, 0.3); padding: 0.15em 0.35em; border-radius: 4px; font-size: 0.875em; }
  :deep(pre) { background: rgba(244, 207, 223, 0.15); padding: 0.75em 1em; border-radius: 8px; overflow-x: auto; margin: 0.75em 0; }
  :deep(pre code) { background: none; padding: 0; }
  :deep(blockquote) { border-left: 3px solid #f4cfdf; padding-left: 0.75em; color: #9e8289; margin: 0.5em 0; font-style: italic; }
  :deep(strong) { font-weight: 600; color: #2c2426; }
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
.animate-bounce {
  animation: bounce 0.6s infinite ease-in-out;
}
</style>
