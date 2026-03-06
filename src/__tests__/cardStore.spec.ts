import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCardStore } from '../stores/cardStore';

describe('cardStore persistence', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should initialize with empty queue and history when localStorage is empty', () => {
    const store = useCardStore();
    expect(store.cardQueue).toEqual([]);
    expect(store.processedCards).toEqual([]);
  });

  it('should save to localStorage when cardQueue changes', async () => {
    const store = useCardStore();
    const mockCard = {
      cardId: 1,
      noteId: 1,
      fields: {},
      question: 'Q',
      answer: 'A',
      cardType: 'new' as const,
    };

    // We need to trigger the watch. In Pinia with refs, we can push to the array.
    // However, cardQueue is exposed as Readonly in the public API return, 
    // but inside the store it's a ref. Let's check how it's exported.
    // In cardStore.ts: cardQueue: cardQueue as Readonly<typeof cardQueue>
    
    // To test this, we might need to use a method that modifies cardQueue.
    // fillQueue is async and calls fetch. Let's mock fetch or just use a simpler way.
    
    // Actually, in the test, we can access the underlying ref if we don't use the public API 
    // or if we just bypass the readonly for the test.
    (store as any).cardQueue.push(mockCard);

    // Wait for the watch to trigger (it's async by default in Vue 3)
    await new Promise(resolve => setTimeout(resolve, 0));

    const saved = JSON.parse(localStorage.getItem('ankiStudy:sessionState') || '{}');
    expect(saved.queue).toHaveLength(1);
    expect(saved.queue[0].cardId).toBe(1);
  });

  it('should load from localStorage on initialization', () => {
    const mockData = {
      queue: [{ cardId: 2, noteId: 2, fields: {}, question: 'Q2', answer: 'A2', cardType: 'review' }],
      history: [{ cardId: 1, noteId: 1, fields: {}, question: 'Q1', answer: 'A1', cardType: 'new', status: 'success', userResponse: 'R1', rated: true }]
    };
    localStorage.setItem('ankiStudy:sessionState', JSON.stringify(mockData));

    const store = useCardStore();
    expect(store.cardQueue).toHaveLength(1);
    expect(store.cardQueue[0].cardId).toBe(2);
    expect(store.processedCards).toHaveLength(1);
    expect(store.processedCards[0].cardId).toBe(1);
  });

  it('should handle JSON parse errors gracefully', () => {
    localStorage.setItem('ankiStudy:sessionState', 'invalid-json');
    
    const store = useCardStore();
    expect(store.cardQueue).toEqual([]);
    expect(store.processedCards).toEqual([]);
  });
});
