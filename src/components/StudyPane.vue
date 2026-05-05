<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { StarterKit } from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Underline } from '@tiptap/extension-underline'

import { useCardStore } from '@/stores/cardStore'
import { useLLMStore } from '@/stores/llm/llmStore'

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const store = useCardStore()
const llmStore = useLLMStore()
const currentCard = computed(() => store.currentCard)

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

const editor = useEditor({
    extensions: [
        StarterKit,
        Underline,
        Table.configure({
            resizable: true,
        }),
        TableRow,
        TableHeader,
        TableCell,
        Placeholder.configure({
            placeholder: 'Write your answer here…',
        }),
    ],
    content: '',
    editorProps: {
        attributes: {
            class: 'focus:outline-none min-h-[160px] lg:min-h-[400px] max-h-[60vh] overflow-y-auto p-4 lg:p-10 font-sans text-sakura-text',
        },
        handleKeyDown: (view, event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                submitResponse()
                return true
            }
            if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
                suggestFormat()
                return true
            }
            return false
        },
    },
    onFocus: () => {
        isEditorFocused.value = true
    },
    onBlur: () => {
        setTimeout(() => {
            isEditorFocused.value = false
        }, 100)
    },
})

const editorIsEmpty = computed(() => {
    return editor.value?.isEmpty ?? true
})

const analyzeTooltip = computed(() => {
    if (!currentCard.value) return 'No card loaded to analyze'
    if (editorIsEmpty.value) return 'Please enter your reflection first'
    return 'Analyze your reflection (⌘↵)'
})

const suggestTooltip = computed(() => {
    if (!currentCard.value) return 'No card loaded'
    if (isDrafting.value) return 'Generating draft...'
    return 'Suggest a structured format (⌘D)'
})

const cleanTooltip = computed(() => {
    if (!currentCard.value) return 'No card loaded'
    if (editorIsEmpty.value) return 'Please enter text to clean'
    if (isCleaning.value) return 'Cleaning text...'
    return 'Refine voice-to-text with AI'
})

const isEditorFocused = ref(false)

const isStickyQuestion = computed(() => {
    return isEditorFocused.value && currentCard.value
})

function resetEditor(): void {
    editor.value?.commands.setContent('')
    showUndo.value = false
    isEditorFocused.value = false
    if (cleanupTimer) clearTimeout(cleanupTimer)
}

async function submitResponse(): Promise<void> {
    if (!currentCard.value || editorIsEmpty.value) return
    
    const content = editor.value?.getHTML() || ''
    resetEditor()

    store.submitReview(content).catch(err => {
        console.error('Background analysis failed:', err)
    })
}

watch(currentCard, (card) => {
    if (!card) return
    resetEditor()
    // Apply pre-fetched draft immediately if available
    if (llmStore.autoDraftEnabled) {
        const draft = store.draftCache[card.cardId]
        if (draft) editor.value?.commands.setContent(draft)
    }
})

// Apply draft when it arrives late (buffered after card became current)
watch(
    () => currentCard.value ? store.draftCache[currentCard.value.cardId] : null,
    (draft) => {
        if (!draft || !currentCard.value || !llmStore.autoDraftEnabled) return
        if (!editor.value?.isEmpty) return // don't overwrite user content
        editor.value?.commands.setContent(draft)
    }
)

function toggleAutoDraft(): void {
    llmStore.setAutoDraftEnabled(!llmStore.autoDraftEnabled)
    if (llmStore.autoDraftEnabled) {
        void store.fillDraftBuffer()
        // Apply to current card if a draft is already cached
        if (currentCard.value) {
            const draft = store.draftCache[currentCard.value.cardId]
            if (draft && editor.value?.isEmpty) editor.value?.commands.setContent(draft)
        }
    }
}

onBeforeUnmount(() => {
    editor.value?.destroy()
})

// ---------------------------------------------------------------------------
// Voice Cleaning
// ---------------------------------------------------------------------------

const isCleaning = ref(false)
const isDrafting = ref(false)
const originalText = ref('')
const showUndo = ref(false)
let cleanupTimer: ReturnType<typeof setTimeout> | null = null

async function cleanEditorText() {
    if (editorIsEmpty.value) return
    isCleaning.value = true
    originalText.value = editor.value?.getHTML() || ''

    if (cleanupTimer) clearTimeout(cleanupTimer)

    try {
        const cleaned = await llmStore.cleanText(editor.value?.getText() || '')
        editor.value?.commands.setContent(`<p>${cleaned}</p>`)
        showUndo.value = true
        cleanupTimer = setTimeout(() => {
            showUndo.value = false
        }, 8000)
    } catch (err) {
        console.error('Failed to clean text:', err)
    } finally {
        isCleaning.value = false
    }
}

async function suggestFormat() {
    if (!currentCard.value) return
    isDrafting.value = true

    try {
        const draftHtml = await llmStore.generateFormat({
            question: currentCard.value.question,
            correctAnswer: currentCard.value.answer
        })
        editor.value?.commands.setContent(draftHtml)
    } catch (err) {
        console.error('Failed to generate format:', err)
    } finally {
        isDrafting.value = false
    }
}

function undoClean() {

    editor.value?.commands.setContent(originalText.value)
    showUndo.value = false
    if (cleanupTimer) clearTimeout(cleanupTimer)
}

// ---------------------------------------------------------------------------
// Queue fetch with feedback
// ---------------------------------------------------------------------------

type FetchStatus = 'idle' | 'fetching' | 'success' | 'error' | 'no-deck'

const fetchStatus = ref<FetchStatus>('idle')
const fetchedCount = ref(0)
let feedbackTimer: ReturnType<typeof setTimeout> | null = null

function clearFeedback(): void {
    fetchStatus.value = 'idle'
    fetchedCount.value = 0
}

async function fetchCards(): Promise<void> {
    if (feedbackTimer) clearTimeout(feedbackTimer)

    if (!store.currentDeck) {
        fetchStatus.value = 'no-deck'
        feedbackTimer = setTimeout(clearFeedback, 4000)
        return
    }

    fetchStatus.value = 'fetching'
    const before = store.cardQueue.length

    try {
        await store.fillQueue()
        fetchedCount.value = store.cardQueue.length - before
        fetchStatus.value = 'success'
    } catch {
        fetchStatus.value = 'error'
    }

    feedbackTimer = setTimeout(clearFeedback, 4000)
}
</script>

<template>
    <section class="bg-sakura-white overflow-y-auto flex flex-col">
        <!-- ── Fetch-feedback banner ─────────────────────────────────────────── -->
        <Transition name="banner">
            <div v-if="fetchStatus !== 'idle'" class="shrink-0 px-6 md:px-16 pt-6">
                <div class="max-w-2xl mx-auto">
                    <div
                        v-if="fetchStatus === 'fetching'"
                        class="flex items-center gap-3 px-5 py-3 border border-sakura-pink/40 bg-sakura-mist text-[13px] tracking-[0.1em] uppercase text-sakura-muted"
                    >
                        <svg class="w-3 h-3 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        Fetching from « {{ store.currentDeck }} »…
                    </div>

                    <div
                        v-else-if="fetchStatus === 'success'"
                        class="flex items-center gap-3 px-5 py-3 border border-sakura-pink/40 bg-sakura-mist text-[13px] tracking-[0.1em] uppercase text-sakura-text"
                    >
                        <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span v-if="fetchedCount > 0">
                            {{ fetchedCount }} card{{ fetchedCount !== 1 ? 's' : '' }} added —
                            {{ store.cardQueue.length }} total
                        </span>
                        <span v-else>Queue up to date — {{ store.cardQueue.length }} card{{ store.cardQueue.length !== 1 ? 's' : '' }} ready</span>
                    </div>

                    <div
                        v-else-if="fetchStatus === 'no-deck'"
                        class="flex items-center gap-3 px-5 py-3 border border-sakura-muted/30 bg-sakura-mist text-[13px] tracking-[0.1em] uppercase text-sakura-muted"
                    >
                        <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        No deck selected — choose one from the header
                    </div>

                    <div
                        v-else-if="fetchStatus === 'error'"
                        class="flex items-center gap-3 px-5 py-3 border border-sakura-muted/30 bg-sakura-mist text-[13px] tracking-[0.1em] uppercase text-sakura-muted"
                    >
                        <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                        Could not reach AnkiConnect — is Anki running?
                    </div>
                </div>
            </div>
        </Transition>

        <!-- ── Main layout ───────────────────────────────────────────────────── -->
        <div class="flex-1 px-4 md:px-16 pt-6 pb-12 md:pb-6 flex flex-col">
            <!-- Sticky Question for Mobile -->
            <div 
                v-if="isStickyQuestion" 
                class="md:hidden sticky top-0 z-20 bg-sakura-white/95 backdrop-blur-sm border-b border-sakura-pink/20 py-3 -mx-4 px-4 shadow-sm animate-fade-in"
            >
                <p class="text-[10px] tracking-[0.1em] uppercase text-sakura-muted/60 mb-1">Question</p>
                <div class="text-sm line-clamp-3 italic text-sakura-text/90" v-html="currentCard?.question"></div>
            </div>

            <div class="max-w-2xl lg:max-w-5xl mx-auto w-full flex flex-col gap-6">
                <!-- Question — only visible when a card is loaded -->
                <div v-if="currentCard" class="animate-fade-in space-y-4" :class="{ 'opacity-20 pointer-events-none md:opacity-100': isStickyQuestion, 'hidden md:block': isStickyQuestion }">
                    <p class="text-[13px] tracking-[0.15em] uppercase text-sakura-muted">
                        Question
                    </p>
                    <div class="card-question" v-html="currentCard.question" />
                </div>

                <!-- Empty state -->
                <div v-else class="flex-1 flex flex-col items-center justify-center gap-6">
                    <p class="text-[13px] uppercase tracking-[0.2em] text-sakura-muted">
                        No cards in queue
                    </p>
                    <button
                        @click="fetchCards"
                        :disabled="fetchStatus === 'fetching'"
                        class="fetch-btn flex items-center gap-2 px-10 py-3"
                    >
                        <svg class="w-3 h-3" :class="{ 'animate-spin': fetchStatus === 'fetching' }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 4v6h6M23 20v-6h-6" />
                            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                        </svg>
                        {{ fetchStatus === 'fetching' ? 'Fetching…' : 'Fetch Cards' }}
                    </button>
                </div>

                <!-- ── Tiptap Editor ────────────────────────────────────────────── -->
                <div class="border-t border-sakura-pink/30 pt-6 md:pt-8 space-y-4 md:space-y-5 mt-auto">
                    <div class="flex items-center justify-between">
                        <p class="text-[13px] tracking-[0.15em] uppercase text-sakura-muted">
                            Your Reflection
                        </p>
                        <div class="flex items-center gap-3">
                            <span class="text-[12px] uppercase tracking-wider text-sakura-muted/60">⌘↵ to Analyze</span>
                            <button
                                @click="resetEditor"
                                :disabled="editorIsEmpty"
                                class="px-3 py-1 text-[11px] tracking-[0.1em] uppercase border border-sakura-muted/30 text-sakura-muted hover:bg-sakura-mist hover:text-sakura-text disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 cursor-pointer"
                            >
                                Reset
                            </button>
                        </div>
                    </div>

                    <div v-if="editor" class="tiptap-container">
                        <!-- Toolbar -->
                        <div class="tiptap-toolbar">
                            <button @click="editor.chain().focus().toggleBold().run()" :class="{ 'is-active': editor.isActive('bold') }" title="Bold">
                                <b>B</b>
                            </button>
                            <button @click="editor.chain().focus().toggleItalic().run()" :class="{ 'is-active': editor.isActive('italic') }" title="Italic">
                                <i>I</i>
                            </button>
                            <button @click="editor.chain().focus().toggleUnderline().run()" :class="{ 'is-active': editor.isActive('underline') }" title="Underline">
                                <u>U</u>
                            </button>
                            <div class="v-divider"></div>
                            <button @click="editor.chain().focus().toggleOrderedList().run()" :class="{ 'is-active': editor.isActive('orderedList') }" title="Ordered List">
                                1.
                            </button>
                            <button @click="editor.chain().focus().toggleBulletList().run()" :class="{ 'is-active': editor.isActive('bulletList') }" title="Bullet List">
                                •
                            </button>
                            <button 
                                @click="editor.chain().focus().sinkListItem('listItem').run()" 
                                :disabled="!editor.can().sinkListItem('listItem')"
                                title="Indent List (Tab)"
                            >
                                →
                            </button>
                            <button 
                                @click="editor.chain().focus().liftListItem('listItem').run()" 
                                :disabled="!editor.can().liftListItem('listItem')"
                                title="Outdent List (Shift+Tab)"
                            >
                                ←
                            </button>
                            <button @click="editor.chain().focus().toggleBlockquote().run()" :class="{ 'is-active': editor.isActive('blockquote') }" title="Quote">
                                “
                            </button>
                            <div class="v-divider"></div>
                            <button @click="editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()" title="Insert Table">
                                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <line x1="3" y1="9" x2="21" y2="9" />
                                    <line x1="3" y1="15" x2="21" y2="15" />
                                    <line x1="9" y1="3" x2="9" y2="21" />
                                    <line x1="15" y1="3" x2="15" y2="21" />
                                </svg>
                            </button>
                            <div class="v-divider"></div>
                            <button
                                @click="toggleAutoDraft"
                                :class="{ 'auto-draft-armed': llmStore.autoDraftEnabled }"
                                :title="llmStore.autoDraftEnabled ? 'Auto-Draft: Armed — click to disarm' : 'Auto-Draft: Off — click to arm'"
                                class="auto-draft-btn"
                            >✨ Auto</button>
                            <template v-if="editor.isActive('table')">
                                <button @click="editor.chain().focus().addColumnBefore().run()" title="Add Column Before">C←</button>
                                <button @click="editor.chain().focus().addColumnAfter().run()" title="Add Column After">C→</button>
                                <button @click="editor.chain().focus().deleteColumn().run()" title="Delete Column">C×</button>
                                <button @click="editor.chain().focus().addRowBefore().run()" title="Add Row Before">R↑</button>
                                <button @click="editor.chain().focus().addRowAfter().run()" title="Add Row After">R↓</button>
                                <button @click="editor.chain().focus().deleteRow().run()" title="Delete Row">R×</button>
                                <button @click="editor.chain().focus().deleteTable().run()" title="Delete Table" class="text-red-400">T×</button>
                            </template>
                        </div>

                        <!-- Editor -->
                        <EditorContent :editor="editor" class="tiptap-content" />
                    </div>

                    <div class="pt-5 flex flex-col md:flex-row items-stretch md:items-center justify-end gap-3 md:gap-4">
                        <button
                            v-if="showUndo"
                            @click="undoClean"
                            class="px-6 py-3 text-[13px] tracking-[0.1em] uppercase border border-sakura-pink bg-sakura-pink/10 text-sakura-text hover:bg-sakura-pink transition-all duration-500 cursor-pointer w-full md:w-auto"
                        >
                            Undo Clean
                        </button>
                        <button
                            v-else
                            @click="cleanEditorText"
                            :disabled="editorIsEmpty || !currentCard || isCleaning"
                            :title="cleanTooltip"
                            class="px-6 py-3 text-[13px] tracking-[0.1em] uppercase border border-sakura-muted/50 text-sakura-muted hover:bg-sakura-mist hover:text-sakura-text disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-500 cursor-pointer w-full md:w-auto"
                        >
                            {{ isCleaning ? 'Cleaning…' : 'Clean Voice Text' }}
                        </button>

                        <button
                            @click="suggestFormat"
                            :disabled="!currentCard || isDrafting"
                            :title="suggestTooltip"
                            class="px-6 py-3 text-[13px] tracking-[0.1em] uppercase border border-sakura-muted/50 text-sakura-muted hover:bg-sakura-mist hover:text-sakura-text disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-500 cursor-pointer w-full md:w-auto"
                        >
                            {{ isDrafting ? 'Drafting…' : 'Suggest Format' }}
                        </button>
                        <button
                            @click="submitResponse"
                            :disabled="editorIsEmpty || !currentCard"
                            :title="analyzeTooltip"
                            class="px-10 py-3 text-[13px] tracking-[0.1em] uppercase border border-sakura-muted text-sakura-muted hover:bg-sakura-pink hover:border-sakura-pink hover:text-sakura-text disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-500 cursor-pointer w-full md:w-auto"
                        >
                            Analyze
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>

<style lang="less" scoped>
// ── Variables ────────────────────────────────────────────────────────────
@color-text-dark: #2c2426;
@color-text-muted: #5e5256;
@color-accent-pink: #f4cfdf;
@color-border-soft: rgba(179, 153, 162, 0.3);
@color-sakura-bg: #fcf0f2;
@transition-base: all 0.3s;

// ── Fade-in ──────────────────────────────────────────────────────────────
.animate-fade-in {
    animation: fadeIn 0.6s ease-out both;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(5px); }
    to { opacity: 1; transform: translateY(0); }
}

// ── Question text ────────────────────────────────────────────────────────
:deep(.card-question) {
    font-family: 'Lora', Georgia, serif;
    font-size: 1em;
    font-weight: 400;
    line-height: 1.6;
    color: @color-text-dark;

    @media (min-width: 768px) {
        font-size: 1.5rem;
        line-height: 1.85;
    }

    p { margin: 0 0 0.5em; &:last-child { margin-bottom: 0; } }
    b, strong { font-weight: 700; }
    i, em { font-style: italic; }
    ul, ol { padding-left: 1.5em; margin: 0.4em 0; }
    li { margin: 0.25em 0; }
    img { max-width: 100%; height: auto; }

    .cloze { border-bottom: 2px solid @color-accent-pink; color: @color-text-muted; }
}

// ── Fetch button ─────────────────────────────────────────────────────────
.fetch-btn {
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #9e8289;
    border: 1px solid @color-border-soft;
    transition: @transition-base;
    cursor: pointer;

    &:hover:not(:disabled) { border-color: #9e8289; color: @color-text-dark; }
    &:disabled { opacity: 0.4; cursor: not-allowed; }
}

// ── Banner transition ────────────────────────────────────────────────────
.banner {
    &-enter-active, &-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
    &-enter-from, &-leave-to { opacity: 0; transform: translateY(-4px); }
}

// ── Tiptap Styles ────────────────────────────────────────────────────────
.tiptap-container {
    background: white;
    border-radius: 2px;
    box-shadow: 0 0 0 1px rgba(179, 153, 162, 0.25);
    overflow: hidden;
}

.tiptap-toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 6px 10px;
    background: @color-sakura-bg;
    border-bottom: 1px solid rgba(179, 153, 162, 0.2);
    
    // Mobile: Scrollable toolbar
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none; // Firefox
    &::-webkit-scrollbar { display: none; } // Chrome/Safari

    @media (min-width: 768px) {
        flex-wrap: wrap;
        overflow-x: visible;
    }

    button {
        padding: 4px 8px;
        font-size: 13px;
        color: @color-text-muted;
        border-radius: 4px;
        transition: all 0.2s;
        cursor: pointer;

        &:hover { background: rgba(179, 153, 162, 0.1); color: @color-text-dark; }
        &.is-active { background: rgba(179, 153, 162, 0.2); color: @color-text-dark; font-weight: 600; }
    }

    .v-divider { width: 1px; height: 16px; background: rgba(179, 153, 162, 0.2); margin: 0 6px; }

    .auto-draft-btn {
        font-size: 12px;
        padding: 3px 8px;
        border-radius: 4px;
        transition: all 0.2s;
        cursor: pointer;
        color: @color-text-muted;
        opacity: 0.85;
        letter-spacing: 0.03em;

        &:hover { opacity: 1; background: rgba(179, 153, 162, 0.1); }

        &.auto-draft-armed {
            opacity: 1;
            background: rgba(244, 207, 223, 0.25);
            box-shadow: 0 0 0 1.5px @color-accent-pink;
            color: @color-text-dark;
        }
    }
}

.tiptap-content {
    :deep(.tiptap) {
        p.is-editor-empty:first-child::before {
            content: attr(data-placeholder);
            float: left;
            color: rgba(179, 153, 162, 0.6);
            pointer-events: none;
            height: 0;
            font-size: 15px;
        }

        min-height: 160px;
        line-height: 1.65;
        font-size: 1.1rem;
        font-family: 'Inter', sans-serif;

        @media (min-width: 1024px) {
            min-height: 400px;
            font-size: 1.25rem;
            line-height: 1.8;
            padding: 2.5rem !important;
        }

        ul, ol { padding-left: 1.5rem; margin: 1rem 0; }
        ul { list-style-type: disc; }
        ol { list-style-type: decimal; }
        blockquote { 
            border-left: 4px solid @color-accent-pink; 
            padding-left: 1.5rem; 
            color: @color-text-muted; 
            font-style: italic; 
            margin: 2rem 0;
            font-size: 1.1em;
        }

        table {
            border-collapse: collapse;
            table-layout: fixed;
            width: 100%;
            margin: 1.5rem 0;
            overflow: hidden;

            td, th {
                min-width: 1em;
                border: 1px solid rgba(179, 153, 162, 0.4);
                padding: 8px 12px;
                vertical-align: top;
                box-sizing: border-box;
                position: relative;

                > * { margin-bottom: 0; }
            }

            th { font-weight: bold; text-align: left; background-color: rgba(179, 153, 162, 0.05); }

            .selectedCell:after {
                z-index: 2;
                position: absolute;
                content: "";
                left: 0; right: 0; top: 0; bottom: 0;
                background: rgba(244, 207, 223, 0.2);
                pointer-events: none;
            }

            .column-resize-handle {
                position: absolute;
                right: -2px;
                top: 0;
                bottom: -2px;
                width: 4px;
                background-color: @color-accent-pink;
                pointer-events: none;
            }
        }

        .tableWrapper { overflow-x: auto; }
    }
}
</style>
