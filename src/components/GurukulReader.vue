<script setup lang="ts">
import { ref, watch } from 'vue'
import { marked } from 'marked'
import { useGurukulStore, type NoteSection } from '@/stores/gurukulStore'

const store = useGurukulStore()
const readerContent = ref<HTMLElement | null>(null)

marked.setOptions({ gfm: true, breaks: true })

// marked.parse is async in v9+ — precompute to avoid [object Promise] in v-html
const renderedHtml = ref<Map<string, string>>(new Map())

watch(
  () => store.sections,
  async (sections) => {
    const map = new Map<string, string>()
    for (const s of sections) {
      map.set(s.title, await marked.parse(s.content))
    }
    renderedHtml.value = map
  },
  { immediate: true }
)

function scrollToSection(title: string) {
  const id = `section-${title.replace(/\s+/g, '-').toLowerCase()}`
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function handleSectionClick(section: NoteSection) {
  store.selectSection(section)
  scrollToSection(section.title)
}

function startQuiz(section: NoteSection) {
  store.selectSection(section)
  store.startSession()
}

// Watch for file selection to reset scroll
watch(() => store.selectedFile, () => {
  if (readerContent.value) {
    readerContent.value.scrollTop = 0
  }
})
</script>

<template>
  <main class="gurukul-reader flex flex-col h-full overflow-hidden bg-white/50 backdrop-blur-sm">
    <!-- Section Navigation -->
    <nav v-if="store.sections.length > 0" class="section-nav shrink-0 border-b border-sakura-pink/20 px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar">
      <div 
        v-for="section in store.sections" 
        :key="section.title"
        class="group relative"
      >
        <button 
          @click="handleSectionClick(section)"
          class="pill-btn whitespace-nowrap"
          :class="{ 'pill-btn--active': store.activeSection?.title === section.title }"
        >
          {{ section.title || 'Introduction' }}
        </button>
        <button 
          @click.stop="startQuiz(section)"
          class="quiz-trigger-small"
          title="Start Quiz"
        >
          ▶
        </button>
      </div>
    </nav>

    <!-- Content Area -->
    <div ref="readerContent" class="flex-1 overflow-y-auto custom-scrollbar">
      <div v-if="store.selectedFile" class="max-w-3xl mx-auto px-8 py-10 space-y-12 pb-32">
        <div 
          v-for="section in store.sections" 
          :key="section.title"
          :id="`section-${section.title.replace(/\s+/g, '-').toLowerCase()}`"
          class="section-container relative transition-all duration-300"
          :class="{ 
            'section--active': store.activeSection?.title === section.title,
            'section--dimmed': store.activeSection && store.activeSection.title !== section.title
          }"
        >
          <!-- Active Section Indicator -->
          <div 
            v-if="store.activeSection?.title === section.title" 
            class="sticky-label"
          >
            Now studying
          </div>

          <!-- Section Heading -->
          <h2 v-if="section.title" class="text-xl font-serif font-semibold mb-4 text-sakura-dark">
            {{ section.title }}
          </h2>

          <!-- Section Content -->
          <div
            class="markdown-body max-w-none"
            v-html="renderedHtml.get(section.title) || ''"
          ></div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="h-full flex flex-col items-center justify-center text-sakura-muted/40 gap-4">
        <div class="text-4xl">📖</div>
        <p class="text-sm tracking-widest uppercase">Select a file from the left panel</p>
      </div>
    </div>
  </main>
</template>

<style lang="less" scoped>
.gurukul-reader {
  border-left: 1px solid rgba(244, 207, 223, 0.15);
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.pill-btn {
  padding: 5px 14px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
  background: rgba(244, 207, 223, 0.15);
  color: #9e8289;
  border: 1px solid rgba(244, 207, 223, 0.3);
  transition: all 0.2s ease;

  &:hover {
    background: rgba(244, 207, 223, 0.25);
    color: #5e5256;
  }

  &--active {
    background: #f4cfdf;
    color: #2c2426;
    border-color: #f4cfdf;
    box-shadow: 0 2px 8px rgba(244, 207, 223, 0.4);
  }
}

.quiz-trigger-small {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 16px;
  height: 16px;
  background: #f4cfdf;
  border-radius: 50%;
  font-size: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  cursor: pointer;
  color: #2c2426;
  z-index: 5;

  .group:hover & {
    opacity: 1;
    transform: scale(1);
  }

  &:hover {
    background: #eeb9d1;
    transform: scale(1.1);
  }
}

.section-container {
  padding: 24px;
  border-radius: 12px;
  border-left: 2px solid transparent;

  &.section--active {
    background-color: rgba(244, 207, 223, 0.15);
    border-left-color: #f4cfdf;
    box-shadow: inset 0 0 40px rgba(244, 207, 223, 0.05);
  }

  &.section--dimmed {
    opacity: 0.4;
    filter: grayscale(0.2);
  }
}

.sticky-label {
  position: sticky;
  top: 0;
  float: right;
  background: #f4cfdf;
  color: #2c2426;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 4px 10px;
  border-radius: 0 0 0 8px;
  margin-top: -24px;
  margin-right: -24px;
  z-index: 10;
  box-shadow: 0 2px 6px rgba(244, 207, 223, 0.3);
}

.markdown-body {
  font-size: 15px;
  line-height: 1.7;
  color: #4a4446;

  :deep(p) { margin-bottom: 1.25em; }
  :deep(h1), :deep(h2), :deep(h3) {
    color: #2c2426;
    font-weight: 600;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
  }
  :deep(ul), :deep(ol) {
    margin-bottom: 1.25em;
    padding-left: 1.5em;
  }
  :deep(ul) { list-style-type: disc; }
  :deep(ol) { list-style-type: decimal; }
  :deep(li) { margin-bottom: 0.5em; }
  :deep(blockquote) {
    border-left: 4px solid #f4cfdf;
    padding-left: 1em;
    font-style: italic;
    color: #9e8289;
    margin: 1.5em 0;
  }
  :deep(code) {
    background: rgba(244, 207, 223, 0.2);
    padding: 0.2em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
  }
  :deep(pre) {
    background: #fcf0f2;
    padding: 1.5em;
    border-radius: 8px;
    overflow-x: auto;
    margin: 1.5em 0;
  }
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(244, 207, 223, 0.4);
  border-radius: 4px;
}
</style>
