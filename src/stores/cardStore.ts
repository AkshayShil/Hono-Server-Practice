import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { useLLMStore, type LLMFeedback } from './llm/index';

/** AnkiConnect runs locally on this port by default. */
const ANKI_CONNECT_URL = 'http://localhost:8765';
const ANKI_CONNECT_VERSION = 6;

/** Minimum queue size before a refill is triggered. */
const QUEUE_REFILL_THRESHOLD = 5;

/** localStorage key used to persist the active deck across page refreshes. */
const STORAGE_KEY_CURRENT_DECK = 'ankiStudy:currentDeck';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface Card {
  cardId: number;
  noteId: number;
  fields: Record<string, { value: string; order: number }>;
  /** Raw HTML from AnkiConnect fields — rendered with v-html. */
  question: string;
  /** Raw HTML from AnkiConnect fields — sent as-is to LLM endpoint. */
  answer: string;
  /** Inferred from Anki queue position: new / learn / review */
  cardType: 'new' | 'learn' | 'review';
}

export interface ProcessedCard extends Card {
  status: 'analyzing' | 'success' | 'error';
  userResponse: string;
  /** Raw string fallback (for error states) */
  llmAnalysis?: string;
  /** Structured feedback — present when status === 'success' */
  feedback?: LLMFeedback;
  /** Anki card type inferred from queue position */
  cardType: 'new' | 'learn' | 'review';
  rated: boolean;
}

export interface DeckStats {
  new_count: number;
  learning_count: number;
  review_count: number;
}

export interface HealthStatus {
  status: 'ok' | 'error';
  anki_connect_version?: number;
  message?: string;
}

// ---------------------------------------------------------------------------
// AnkiConnect raw response shapes (internal — not exported)
// ---------------------------------------------------------------------------

interface AnkiCardInfo {
  cardId: number;
  note: number;
  fields: Record<string, { value: string; order: number }>;
  question: string;
  answer: string;
  css: string;
}

interface AnkiDeckStats {
  new_count: number;
  learn_count: number;
  review_count: number;
}

// ---------------------------------------------------------------------------
// AnkiConnect transport
// ---------------------------------------------------------------------------

async function invoke<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ANKI_CONNECT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, version: ANKI_CONNECT_VERSION, params }),
  });

  if (!res.ok) {
    throw new Error(`AnkiConnect HTTP error: ${res.status}`);
  }

  const body = await res.json() as { result: T; error: string | null };

  if (body.error !== null) {
    throw new Error(`AnkiConnect [${action}]: ${body.error}`);
  }

  return body.result;
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function readPersistedDeck(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_CURRENT_DECK) ?? '';
  } catch {
    return '';
  }
}

function persistDeck(deckName: string): void {
  try {
    if (deckName) {
      localStorage.setItem(STORAGE_KEY_CURRENT_DECK, deckName);
    } else {
      localStorage.removeItem(STORAGE_KEY_CURRENT_DECK);
    }
  } catch {
    // Silently ignore quota / private-browsing errors.
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCardStore = defineStore('cardStore', () => {
  const decks = ref<string[]>([]);
  const currentDeck = ref<string>(readPersistedDeck());
  const cardQueue = ref<Card[]>([]);
  const processedCards = ref<ProcessedCard[]>([]);
  const isFetching = ref(false);

  const currentCard = computed<Card | null>(() => cardQueue.value[0] ?? null);

  watch(currentDeck, persistDeck);

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  async function init(): Promise<void> {
    try {
      const deckMap = await invoke<Record<string, number>>('deckNamesAndIds');
      const allDecks = Object.keys(deckMap)
        .filter((d) => d !== 'Default')
        .sort();

      decks.value = allDecks;

      const persisted = readPersistedDeck();
      if (persisted && allDecks.includes(persisted)) {
        currentDeck.value = persisted;
      } else {
        currentDeck.value = allDecks[0] ?? '';
      }
    } catch (err) {
      console.error('CardStore.init:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Queue Management
  // -------------------------------------------------------------------------

  async function fillQueue(deckName?: string): Promise<void> {
    const targetDeck = deckName ?? currentDeck.value;
    if (isFetching.value || !targetDeck) return;

    isFetching.value = true;
    try {
      const query = `deck:"${targetDeck}" (is:due OR is:new)`;
      const cardIds = await invoke<number[]>('findCards', { query });

      if (cardIds.length === 0) return;

      const existingIds = new Set(cardQueue.value.map((c) => c.cardId));
      const freshIds = cardIds.filter((id) => !existingIds.has(id));

      if (freshIds.length === 0) return;

      const rawCards = await invoke<AnkiCardInfo[]>('cardsInfo', { cards: freshIds });

      const cards: Card[] = rawCards.map((raw) => {
        const ordered = Object.values(raw.fields).sort((a, b) => a.order - b.order);
        const question = ordered[0]?.value ?? '';
        const answer   = ordered[1]?.value ?? '';
        const queueNum = (raw as unknown as { queue?: number }).queue ?? 2;
        const cardType: 'new' | 'learn' | 'review' =
          queueNum === 0 ? 'new' : queueNum === 1 || queueNum === 3 ? 'learn' : 'review';
        return {
          cardId: raw.cardId,
          noteId: raw.note,
          fields: raw.fields,
          question,
          answer,
          cardType,
        };
      });

      cardQueue.value.push(...cards);
    } catch (err) {
      console.error('CardStore.fillQueue:', err);
      throw err;
    } finally {
      isFetching.value = false;
    }
  }

  // -------------------------------------------------------------------------
  // Review Actions
  // -------------------------------------------------------------------------

  async function answerCard(cardId: number, ease: number): Promise<boolean> {
    try {
      await invoke<boolean>('answerCards', {
        answers: [{ cardId, ease }],
      });

      const index = cardQueue.value.findIndex((c) => c.cardId === cardId);
      if (index > -1) cardQueue.value.splice(index, 1);

      if (cardQueue.value.length < QUEUE_REFILL_THRESHOLD && currentDeck.value) {
        void fillQueue(currentDeck.value);
      }

      return true;
    } catch (err) {
      console.error(`CardStore.answerCard (cardId=${cardId}):`, err);
      return false;
    }
  }

  /**
   * Moves the current card to session history, advances the queue immediately,
   * then kicks off LLM analysis in the background (non-blocking).
   *
   * The caller does NOT need to await this — the card entry in processedCards
   * starts as 'analyzing' and is mutated in-place when the LLM responds,
   * which Vue's reactivity will pick up automatically.
   */
  function submitReview(htmlResponse: string): void {
    if (!currentCard.value) return;
    const llm = useLLMStore();

    const cardToAnalyze: Card = { ...currentCard.value };
    const plainText = htmlResponse.replace(/<[^>]*>/g, '').trim();

    // 1. Add to history immediately with 'analyzing' status
    const processedEntry: ProcessedCard = {
      ...cardToAnalyze,
      status: 'analyzing',
      userResponse: plainText,
      cardType: cardToAnalyze.cardType,
      rated: false,
    };
    processedCards.value.unshift(processedEntry);

    // 2. Advance the queue immediately — next card is now currentCard
    const queueIndex = cardQueue.value.findIndex(c => c.cardId === cardToAnalyze.cardId);
    if (queueIndex > -1) cardQueue.value.splice(queueIndex, 1);

    // 3. Fire-and-forget LLM analysis — mutates the entry in-place when done
    void (async () => {
      try {
        const feedback = await llm.analyze({
          question:      cardToAnalyze.question.replace(/<[^>]*>/g, ''),
          correctAnswer: cardToAnalyze.answer.replace(/<[^>]*>/g, ''),
          userAnswer:    plainText,
          cardType:      cardToAnalyze.cardType,
        });

        // Find by cardId — safe even if the array was reordered
        const entry = processedCards.value.find(c => c.cardId === cardToAnalyze.cardId);
        if (entry) {
          entry.status      = 'success';
          entry.feedback    = feedback;
          entry.llmAnalysis = feedback.verdict;
        }
      } catch (err) {
        console.error(`CardStore.submitReview (cardId=${cardToAnalyze.cardId}):`, err);
        const entry = processedCards.value.find(c => c.cardId === cardToAnalyze.cardId);
        if (entry) {
          entry.status      = 'error';
          entry.llmAnalysis = err instanceof Error ? err.message : 'Analysis failed';
        }
      }
    })();
  }

  /**
   * Rates a card that has already been AI-analyzed and marks it as rated
   * in session history.
   */
  async function sendRating(cardId: number, ease: number): Promise<void> {
    const success = await answerCard(cardId, ease);
    if (!success) return;
    const entry = processedCards.value.find((c) => c.cardId === cardId);
    if (entry) entry.rated = true;
  }

  function clearProcessedCards(): void {
    processedCards.value = [];
  }

  function removeProcessedCard(cardId: number): void {
    const idx = processedCards.value.findIndex(c => c.cardId === cardId);
    if (idx > -1) processedCards.value.splice(idx, 1);
  }

  function removeRatedCards(): void {
    // Splice in reverse so indices stay valid
    for (let i = processedCards.value.length - 1; i >= 0; i--) {
      if (processedCards.value[i]!.rated) processedCards.value.splice(i, 1);
    }
  }

  // -------------------------------------------------------------------------
  // Deck Management
  // -------------------------------------------------------------------------

  async function getDeckStats(deckName: string): Promise<DeckStats | null> {
    try {
      const result = await invoke<Record<string, AnkiDeckStats>>('getDeckStats', {
        decks: [deckName],
      });
      const stats = Object.values(result)[0];
      if (!stats) return null;
      return {
        new_count: stats.new_count,
        learning_count: stats.learn_count,
        review_count: stats.review_count,
      };
    } catch (err) {
      console.error(`CardStore.getDeckStats (deck=${deckName}):`, err);
      return null;
    }
  }

  async function selectDeck(deckName: string): Promise<boolean> {
    try {
      await invoke<null>('guiDeckReview', { name: deckName });
      cardQueue.value = [];
      currentDeck.value = deckName;
      return true;
    } catch (err) {
      console.error(`CardStore.selectDeck (deck=${deckName}):`, err);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Card Modification
  // -------------------------------------------------------------------------

  async function suspendCard(cardId: number): Promise<boolean> {
    try {
      await invoke<boolean>('suspend', { cards: [cardId] });
      const index = cardQueue.value.findIndex((c) => c.cardId === cardId);
      if (index > -1) cardQueue.value.splice(index, 1);
      return true;
    } catch (err) {
      console.error(`CardStore.suspendCard (cardId=${cardId}):`, err);
      return false;
    }
  }

  async function buryCard(cardId: number): Promise<boolean> {
    try {
      await invoke<boolean>('bury', { cards: [cardId] });
      const index = cardQueue.value.findIndex((c) => c.cardId === cardId);
      if (index > -1) cardQueue.value.splice(index, 1);
      return true;
    } catch (err) {
      console.error(`CardStore.buryCard (cardId=${cardId}):`, err);
      return false;
    }
  }

  async function editCard(noteId: number, fields: Record<string, string>): Promise<boolean> {
    try {
      await invoke<null>('updateNoteFields', {
        note: { id: noteId, fields },
      });
      return true;
    } catch (err) {
      console.error(`CardStore.editCard (noteId=${noteId}):`, err);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // System
  // -------------------------------------------------------------------------

  async function getHealth(): Promise<HealthStatus | null> {
    try {
      const version = await invoke<number>('version');
      return { status: 'ok', anki_connect_version: version };
    } catch (err) {
      console.error('CardStore.getHealth:', err);
      return {
        status: 'error',
        message: err instanceof Error ? err.message : 'Could not reach AnkiConnect',
      };
    }
  }

  async function syncAnki(): Promise<boolean> {
    try {
      await invoke<null>('sync');
      return true;
    } catch (err) {
      console.error('CardStore.syncAnki:', err);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  return {
    decks: decks as Readonly<typeof decks>,
    currentDeck,
    cardQueue: cardQueue as Readonly<typeof cardQueue>,
    processedCards: processedCards as Readonly<typeof processedCards>,
    isFetching: isFetching as Readonly<typeof isFetching>,
    currentCard,

    init,
    fillQueue,
    answerCard,
    submitReview,
    sendRating,
    clearProcessedCards,
    removeProcessedCard,
    removeRatedCards,
    getDeckStats,
    selectDeck,
    suspendCard,
    buryCard,
    editCard,
    getHealth,
    syncAnki,
  };
});