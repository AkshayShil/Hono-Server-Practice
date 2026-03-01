<script setup lang="ts">
import { ref, computed } from 'vue'
import {
    useLLMStore,
    PROVIDERS,
    PROMPT_TEMPLATES,
    type ProviderId,
    type PromptMode,
} from '@/stores/llmStore'

const llm = useLLMStore()
const open = ref(false)

// Test connection state
const testStatus = ref<'idle' | 'testing' | 'ok' | 'error'>('idle')
const testError = ref('')

async function testConnection(): Promise<void> {
    testStatus.value = 'testing'
    testError.value = ''
    try {
        await llm.analyze({
            question: 'What is 2 + 2?',
            correctAnswer: '4',
            userAnswer: '4',
            cardType: 'review',
        })
        testStatus.value = 'ok'
    } catch (err) {
        testStatus.value = 'error'
        testError.value = err instanceof Error ? err.message : 'Unknown error'
    }
}

const selectedProviderConfig = computed(() => PROVIDERS.find((p) => p.id === llm.providerId))
</script>

<template>
    <!-- Gear trigger -->
    <button @click="open = true" class="settings-trigger" title="LLM Settings">
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            class="w-3.5 h-3.5"
        >
            <circle cx="12" cy="12" r="3" />
            <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
        </svg>
    </button>

    <!-- Modal backdrop -->
    <Transition name="fade">
        <div v-if="open" class="modal-backdrop" @click.self="open = false">
            <div class="modal-panel">
                <!-- Header -->
                <div class="modal-header">
                    <div>
                        <p class="modal-title">AI Analysis</p>
                        <p class="modal-sub">Configure your LLM provider and prompt strategy</p>
                    </div>
                    <button @click="open = false" class="close-btn">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            class="w-4 h-4"
                        >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div class="modal-body">
                    <!-- ── Provider ───────────────────────────────────────── -->
                    <section class="settings-section">
                        <h3 class="section-title">Provider</h3>
                        <div class="provider-grid">
                            <button
                                v-for="p in PROVIDERS"
                                :key="p.id"
                                @click="llm.setProvider(p.id as ProviderId)"
                                class="provider-btn"
                                :class="{ 'provider-btn--active': llm.providerId === p.id }"
                            >
                                {{ p.label }}
                            </button>
                        </div>
                    </section>

                    <!-- ── Model ──────────────────────────────────────────── -->
                    <section class="settings-section">
                        <h3 class="section-title">Model</h3>
                        <div class="model-grid">
                            <button
                                v-for="m in llm.models"
                                :key="m.id"
                                @click="llm.setModel(m.id)"
                                class="model-btn"
                                :class="{ 'model-btn--active': llm.modelId === m.id }"
                            >
                                <span class="model-name">{{ m.label }}</span>
                                <span class="model-ctx">{{ m.contextK }}k</span>
                            </button>
                        </div>
                    </section>

                    <!-- ── API Key ─────────────────────────────────────────── -->
                    <section v-if="selectedProviderConfig?.requiresKey" class="settings-section">
                        <h3 class="section-title">{{ selectedProviderConfig.apiKeyLabel }}</h3>
                        <input
                            :value="llm.apiKey"
                            @input="llm.setApiKey(($event.target as HTMLInputElement).value)"
                            type="password"
                            class="text-input"
                            placeholder="sk-…"
                            autocomplete="off"
                        />
                    </section>

                    <!-- ── Custom Base URL (Ollama / self-hosted) ─────────── -->
                    <section class="settings-section">
                        <h3 class="section-title">
                            Base URL
                            <span class="section-hint">
                                (leave blank for default: {{ selectedProviderConfig?.baseUrl }})
                            </span>
                        </h3>
                        <input
                            :value="llm.customBaseUrl"
                            @input="llm.setCustomBaseUrl(($event.target as HTMLInputElement).value)"
                            type="text"
                            class="text-input"
                            :placeholder="selectedProviderConfig?.baseUrl"
                        />
                    </section>

                    <!-- ── Prompt Mode ─────────────────────────────────────── -->
                    <section class="settings-section">
                        <h3 class="section-title">Analysis Mode</h3>
                        <div class="prompt-grid">
                            <!-- Auto -->
                            <button
                                @click="llm.setPromptMode('auto')"
                                class="prompt-btn"
                                :class="{ 'prompt-btn--active': llm.promptMode === 'auto' }"
                            >
                                <span class="prompt-name">Auto</span>
                                <span class="prompt-desc">Picks mode based on card difficulty</span>
                            </button>
                            <!-- Manual modes -->
                            <button
                                v-for="t in PROMPT_TEMPLATES"
                                :key="t.id"
                                @click="llm.setPromptMode(t.id as PromptMode)"
                                class="prompt-btn"
                                :class="{ 'prompt-btn--active': llm.promptMode === t.id }"
                            >
                                <span class="prompt-name">{{ t.label }}</span>
                                <span class="prompt-desc">{{ t.description }}</span>
                            </button>
                        </div>

                        <!-- Auto-trigger legend -->
                        <div v-if="llm.promptMode === 'auto'" class="auto-legend">
                            <div v-for="t in PROMPT_TEMPLATES" :key="t.id" class="auto-legend-row">
                                <span class="mode-pill" :class="`mode-pill--${t.id}`">{{
                                    t.label
                                }}</span>
                                <span>{{ t.autoTrigger }}</span>
                            </div>
                        </div>
                    </section>

                    <!-- ── Test ───────────────────────────────────────────── -->
                    <section class="settings-section">
                        <button
                            @click="testConnection"
                            :disabled="testStatus === 'testing'"
                            class="test-btn"
                        >
                            <svg
                                v-if="testStatus === 'testing'"
                                class="w-3 h-3 animate-spin"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                            <svg
                                v-else-if="testStatus === 'ok'"
                                class="w-3 h-3 text-green-500"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <svg
                                v-else
                                class="w-3 h-3"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                            {{
                                testStatus === 'testing'
                                    ? 'Testing…'
                                    : testStatus === 'ok'
                                      ? 'Connection OK'
                                      : 'Test Connection'
                            }}
                        </button>
                        <p v-if="testStatus === 'error'" class="test-error">{{ testError }}</p>
                    </section>
                </div>
            </div>
        </div>
    </Transition>
</template>

<style lang="less" scoped>
@glass-bg: rgba(255, 255, 255, 0.85);
@glass-border: rgba(244, 207, 223, 0.4);
@pink: #f4cfdf;
@muted: #b399a2;
@text: #2c2426;
@blur-val: blur(20px);

// ── Trigger ───────────────────────────────────────────────────────────────
.settings-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    color: rgba(179, 153, 162, 0.6);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
        background: rgba(244, 207, 223, 0.3);
        color: @muted;
    }
}

// ── Backdrop & panel ──────────────────────────────────────────────────────
.modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(44, 36, 38, 0.25);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 24px;
}

.modal-panel {
    width: 100%;
    max-width: 540px;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    border-radius: 16px;
    background: @glass-bg;
    backdrop-filter: @blur-val;
    -webkit-backdrop-filter: @blur-val;
    border: 1px solid @glass-border;
    box-shadow:
        0 24px 64px rgba(44, 36, 38, 0.16),
        0 4px 16px rgba(44, 36, 38, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 0.9);
    overflow: hidden;
}

.modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid rgba(244, 207, 223, 0.3);
    flex-shrink: 0;
}

.modal-title {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: @text;
}

.modal-sub {
    font-size: 10px;
    letter-spacing: 0.03em;
    color: rgba(179, 153, 162, 0.7);
    margin-top: 2px;
}

.close-btn {
    color: rgba(179, 153, 162, 0.5);
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px;
    transition: color 0.2s;
    &:hover {
        color: @muted;
    }
}

.modal-body {
    overflow-y: auto;
    padding: 20px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 22px;

    &::-webkit-scrollbar {
        width: 3px;
    }
    &::-webkit-scrollbar-thumb {
        background: rgba(179, 153, 162, 0.2);
        border-radius: 2px;
    }
}

// ── Section ───────────────────────────────────────────────────────────────
.settings-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.section-title {
    font-size: 9px;
    letter-spacing: 0.4em;
    text-transform: uppercase;
    color: rgba(179, 153, 162, 0.65);
    display: flex;
    align-items: center;
    gap: 6px;
}

.section-hint {
    font-size: 8px;
    letter-spacing: 0.02em;
    text-transform: none;
    color: rgba(179, 153, 162, 0.45);
}

// ── Provider grid ─────────────────────────────────────────────────────────
.provider-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.provider-btn {
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 10px;
    letter-spacing: 0.04em;
    border: 1px solid rgba(244, 207, 223, 0.4);
    background: rgba(255, 255, 255, 0.5);
    color: @muted;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
        border-color: rgba(244, 207, 223, 0.8);
        background: rgba(244, 207, 223, 0.2);
    }

    &--active {
        background: rgba(244, 207, 223, 0.45);
        border-color: rgba(244, 207, 223, 0.8);
        color: @text;
        font-weight: 500;
    }
}

// ── Model grid ────────────────────────────────────────────────────────────
.model-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.model-btn {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 7px 12px;
    border-radius: 8px;
    border: 1px solid rgba(244, 207, 223, 0.3);
    background: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    transition: all 0.18s ease;

    &:hover {
        border-color: rgba(244, 207, 223, 0.6);
        background: rgba(255, 255, 255, 0.65);
    }

    &--active {
        border-color: rgba(244, 207, 223, 0.8);
        background: rgba(244, 207, 223, 0.25);

        .model-name {
            color: @text;
            font-weight: 500;
        }
    }
}

.model-name {
    font-size: 11px;
    color: @muted;
}
.model-ctx {
    font-size: 9px;
    color: rgba(179, 153, 162, 0.45);
    letter-spacing: 0.05em;
}

// ── Inputs ────────────────────────────────────────────────────────────────
.text-input {
    width: 100%;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid rgba(244, 207, 223, 0.4);
    background: rgba(255, 255, 255, 0.6);
    font-size: 12px;
    color: @text;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;

    &:focus {
        border-color: rgba(244, 207, 223, 0.9);
        background: rgba(255, 255, 255, 0.85);
    }
    &::placeholder {
        color: rgba(179, 153, 162, 0.4);
    }
}

// ── Prompt grid ───────────────────────────────────────────────────────────
.prompt-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.prompt-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 9px 12px;
    border-radius: 8px;
    border: 1px solid rgba(244, 207, 223, 0.3);
    background: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    text-align: left;
    transition: all 0.18s ease;

    &:hover {
        border-color: rgba(244, 207, 223, 0.6);
        background: rgba(255, 255, 255, 0.65);
    }

    &--active {
        border-color: rgba(244, 207, 223, 0.8);
        background: rgba(244, 207, 223, 0.2);
        .prompt-name {
            color: @text;
            font-weight: 500;
        }
    }
}

.prompt-name {
    font-size: 11px;
    color: @muted;
    margin-bottom: 2px;
}
.prompt-desc {
    font-size: 10px;
    color: rgba(179, 153, 162, 0.55);
    line-height: 1.4;
}

// ── Auto legend ───────────────────────────────────────────────────────────
.auto-legend {
    background: rgba(252, 240, 242, 0.6);
    border: 1px solid rgba(244, 207, 223, 0.3);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.auto-legend-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    color: rgba(44, 36, 38, 0.55);
}

.mode-pill {
    font-size: 8px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 10px;
    flex-shrink: 0;

    &--lenient {
        background: rgba(144, 190, 144, 0.25);
        color: #4a7a4a;
    }
    &--balanced {
        background: rgba(179, 153, 162, 0.25);
        color: #7a5a62;
    }
    &--rigorous {
        background: rgba(190, 144, 144, 0.25);
        color: #7a4a4a;
    }
}

// ── Test button ───────────────────────────────────────────────────────────
.test-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 8px;
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    border: 1px solid rgba(244, 207, 223, 0.5);
    background: rgba(255, 255, 255, 0.5);
    color: @muted;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
        background: rgba(244, 207, 223, 0.3);
        border-color: rgba(244, 207, 223, 0.8);
        color: @text;
    }
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}

.test-error {
    font-size: 10px;
    color: rgba(190, 80, 80, 0.8);
    margin-top: 4px;
    line-height: 1.5;
}

// ── Transitions ───────────────────────────────────────────────────────────
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
