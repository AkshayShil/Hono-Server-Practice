import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from '../App.vue'

// Mock the store to avoid network requests and Pinia initialization issues
vi.mock('@/stores/cardStore', () => ({
  useCardStore: vi.fn(() => ({
    init: vi.fn(),
    fillQueue: vi.fn(),
    decks: [],
    currentDeck: '',
    cardQueue: [],
    processedCards: [],
    isFetching: false,
    currentCard: null,
    clearProcessedCards: vi.fn(),
    removeRatedCards: vi.fn()
  }))
}))

// Mock other stores that might be used by child components
// Using vi.importActual to keep constants like PROMPT_TEMPLATES while mocking the store function
vi.mock('@/stores/llm/index', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    useLLMStore: vi.fn(() => ({
      analyze: vi.fn(),
      provider: { label: 'mock-provider' },
      modelId: 'mock-model',
      promptMode: 'auto',
      setPromptMode: vi.fn()
    }))
  }
})

vi.mock('@/stores/errorLogStore', () => ({
  useErrorLogStore: vi.fn(() => ({
    captureSuccess: vi.fn(),
    captureError: vi.fn(),
    count: 0,
    errorCount: 0,
    hasErrors: false,
    downloadLog: vi.fn()
  }))
}))

describe('App', () => {
  it('mounts renders properly', () => {
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia],
        stubs: {
          // Stub third-party components that might be tricky to render in unit tests
          QuillEditor: true
        }
      }
    })
    
    // Based on src/components/AppHeader.vue, it should contain "Anki // 桜"
    expect(wrapper.text()).toContain('Anki')
  })
})
