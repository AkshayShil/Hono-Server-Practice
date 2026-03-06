<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { QuillEditor } from '@vueup/vue-quill'
import '@vueup/vue-quill/dist/vue-quill.snow.css'
import { useCardStore } from '@/stores/cardStore'
import { useLLMStore } from '@/stores/llm/llmStore'

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const store = useCardStore()
const currentCard = computed(() => store.currentCard)

// ---------------------------------------------------------------------------
// Editor
// VueQuill manages its own lifecycle — no manual onMounted/ref juggling.
// v-model:content binds the HTML string directly.
// ---------------------------------------------------------------------------

const editorContent = ref('')
const editorIsEmpty = computed(
    () => editorContent.value.replace(/<[^>]*>/g, '').trim().length === 0,
)

const toolbarOptions = [
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['blockquote', 'code-block'],
    ['clean'],
]

function resetEditor(): void {
    editorContent.value = ''
    showUndo.value = false
    if (cleanupTimer) clearTimeout(cleanupTimer)
}

async function submitResponse(): Promise<void> {
    if (!currentCard.value || editorIsEmpty.value) return
    await store.submitReview(editorContent.value)
    resetEditor()
}

watch(currentCard, (card) => {
    if (card) resetEditor()
})

// ---------------------------------------------------------------------------
// Voice Cleaning
// ---------------------------------------------------------------------------

const isCleaning = ref(false)
const originalText = ref('')
const showUndo = ref(false)
let cleanupTimer: ReturnType<typeof setTimeout> | null = null

async function cleanEditorText() {
    if (editorIsEmpty.value) return
    isCleaning.value = true
    originalText.value = editorContent.value

    if (cleanupTimer) clearTimeout(cleanupTimer)

    try {
        const llm = useLLMStore()
        const cleaned = await llm.cleanText(editorContent.value.replace(/<[^>]*>/g, '').trim())
        editorContent.value = `<p>${cleaned}</p>`
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

function undoClean() {
    editorContent.value = originalText.value
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
                        <svg
                            class="w-3 h-3 animate-spin shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        Fetching from « {{ store.currentDeck }} »…
                    </div>

                    <div
                        v-else-if="fetchStatus === 'success'"
                        class="flex items-center gap-3 px-5 py-3 border border-sakura-pink/40 bg-sakura-mist text-[13px] tracking-[0.1em] uppercase text-sakura-text"
                    >
                        <svg
                            class="w-3 h-3 shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span v-if="fetchedCount > 0">
                            {{ fetchedCount }} card{{ fetchedCount !== 1 ? 's' : '' }} added —
                            {{ store.cardQueue.length }} total
                        </span>
                        <span v-else
                            >Queue up to date — {{ store.cardQueue.length }} card{{
                                store.cardQueue.length !== 1 ? 's' : ''
                            }}
                            ready</span
                        >
                    </div>

                    <div
                        v-else-if="fetchStatus === 'no-deck'"
                        class="flex items-center gap-3 px-5 py-3 border border-sakura-muted/30 bg-sakura-mist text-[13px] tracking-[0.1em] uppercase text-sakura-muted"
                    >
                        <svg
                            class="w-3 h-3 shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
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
                        <svg
                            class="w-3 h-3 shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
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
        <div class="flex-1 px-6 md:px-16 py-6 flex flex-col">
            <div class="max-w-2xl mx-auto w-full flex flex-col gap-6">
                <!-- Question — only visible when a card is loaded -->
                <div v-if="currentCard" class="animate-fade-in space-y-4">
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
                        <svg
                            class="w-3 h-3"
                            :class="{ 'animate-spin': fetchStatus === 'fetching' }"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path d="M1 4v6h6M23 20v-6h-6" />
                            <path
                                d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"
                            />
                        </svg>
                        {{ fetchStatus === 'fetching' ? 'Fetching…' : 'Fetch Cards' }}
                    </button>
                </div>

                <!-- ── Editor — always in DOM ──────────────────────────────────────
             This section must NOT be inside a v-if. Quill mounts into
             quillContainer on onMounted; if the div doesn't exist yet,
             the ref will be null and Quill will never initialize.        -->
                <div class="border-t border-sakura-pink/30 pt-8 space-y-5 mt-auto">
                    <div class="flex items-center justify-between">
                        <p class="text-[13px] tracking-[0.15em] uppercase text-sakura-muted">
                            Your Reflection
                        </p>
                        <span class="text-[12px] uppercase tracking-wider text-sakura-muted/60"
                            >⌘↵ to Analyze</span
                        >
                    </div>

                    <QuillEditor
                        v-model:content="editorContent"
                        content-type="html"
                        theme="snow"
                        placeholder="Write your answer here…"
                        :toolbar="toolbarOptions"
                        class="quill-sakura"
                        @keydown.ctrl.enter="submitResponse"
                        @keydown.meta.enter="submitResponse"
                    />

                    <div class="pt-5 flex items-center justify-between">
                        <button
                            @click="fetchCards"
                            :disabled="fetchStatus === 'fetching'"
                            class="fetch-btn flex items-center gap-2 px-5 py-2.5"
                        >
                            <svg
                                class="w-3 h-3"
                                :class="{ 'animate-spin': fetchStatus === 'fetching' }"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <path d="M1 4v6h6M23 20v-6h-6" />
                                <path
                                    d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"
                                />
                            </svg>
                            Fetch Cards
                        </button>

                        <div class="flex items-center gap-4">
                            <button
                                v-if="showUndo"
                                @click="undoClean"
                                class="px-6 py-3 text-[13px] tracking-[0.1em] uppercase border border-sakura-pink bg-sakura-pink/10 text-sakura-text hover:bg-sakura-pink transition-all duration-500 cursor-pointer"
                            >
                                Undo Clean
                            </button>
                            <button
                                v-else
                                @click="cleanEditorText"
                                :disabled="editorIsEmpty || !currentCard || isCleaning"
                                class="px-6 py-3 text-[13px] tracking-[0.1em] uppercase border border-sakura-muted/50 text-sakura-muted hover:bg-sakura-mist hover:text-sakura-text disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-500 cursor-pointer"
                            >
                                {{ isCleaning ? 'Cleaning…' : 'Clean Voice Text' }}
                            </button>

                            <button
                                @click="submitResponse"
                                :disabled="editorIsEmpty || !currentCard"
                                class="px-10 py-3 text-[13px] tracking-[0.1em] uppercase border border-sakura-muted text-sakura-muted hover:bg-sakura-pink hover:border-sakura-pink hover:text-sakura-text disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-500 cursor-pointer"
                            >
                                Analyze
                            </button>
                        </div>
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
    from {
        opacity: 0;
        transform: translateY(5px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

// ── Question text ────────────────────────────────────────────────────────
:deep(.card-question) {
    font-size: 1.5rem;
    font-weight: 400;
    line-height: 1.85;
    color: @color-text-dark;

    p {
        margin: 0 0 0.5em;
        &:last-child {
            margin-bottom: 0;
        }
    }
    b,
    strong {
        font-weight: 700;
    }
    i,
    em {
        font-style: italic;
    }
    ul,
    ol {
        padding-left: 1.5em;
        margin: 0.4em 0;
    }
    li {
        margin: 0.25em 0;
    }
    img {
        max-width: 100%;
        height: auto;
    }

    .cloze {
        border-bottom: 2px solid @color-accent-pink;
        color: @color-text-muted;
    }
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

    &:hover:not(:disabled) {
        border-color: #9e8289;
        color: @color-text-dark;
    }
    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
}

// ── Banner transition ────────────────────────────────────────────────────
.banner {
    &-enter-active,
    &-leave-active {
        transition:
            opacity 0.3s ease,
            transform 0.3s ease;
    }
    &-enter-from,
    &-leave-to {
        opacity: 0;
        transform: translateY(-4px);
    }
}

// ── VueQuill / Quill (Sakura skin) ───────────────────────────────────────
// VueQuill renders the toolbar and editor as sibling divs inside .quill-sakura.
// We override the snow theme colours to match the sakura palette.
:deep(.quill-sakura) {
    box-shadow: 0 0 0 1px rgba(179, 153, 162, 0.25);
    border-radius: 2px;
    background: white;

    .ql-toolbar {
        border: none;
        border-bottom: 1px solid rgba(179, 153, 162, 0.2);
        background: @color-sakura-bg;
        padding: 6px 10px;

        button:hover,
        button.ql-active {
            .ql-stroke {
                stroke: #b399a2;
            }
            .ql-fill {
                fill: #b399a2;
            }
        }
    }

    .ql-container {
        border: none;
        font-size: 16px;
        color: @color-text-dark;
    }

    .ql-editor {
        min-height: 180px;
        padding: 18px 22px;
        line-height: 1.75;
        font-size: 1.2em;
        font-family: 'Google Sans';

        &.ql-blank::before {
            color: rgba(179, 153, 162, 0.6);
            font-style: normal;
            font-size: 15px;
        }
    }
}
</style>
