import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { useLLMStore, type LLMFeedback } from './llm/index';
import { useErrorLogStore } from './errorLogStore';

/** AnkiConnect proxy endpoint handled by the Express middleman. */
const ANKI_CONNECT_URL = '/anki';
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

/**
 * Sends a single action to AnkiConnect and returns the `result` field.
 * Throws if the HTTP request fails or AnkiConnect returns a non-null error.
 */
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

  // Persist the active deck whenever it changes.
  watch(currentDeck, persistDeck);

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  /**
   * Loads all deck names from AnkiConnect and restores the persisted active
   * deck (falling back to the first deck alphabetically).
   *
   * AnkiConnect action: deckNamesAndIds → { deckName: deckId }
   */
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

  /**
   * Finds due + new card IDs via AnkiConnect's card browser query, fetches
   * their full info, and appends unseen cards to the local queue.
   *
   * AnkiConnect actions:
   *   findCards  → number[]          (card IDs matching a search query)
   *   cardsInfo  → AnkiCardInfo[]    (full card data for given IDs)
   */
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

      console.debug('[fillQueue] cardsInfo returned', rawCards.length, 'cards');
      if (rawCards[0]) {
        const fieldKeys = Object.keys(rawCards[0].fields);
        const firstKey = fieldKeys[0];
        console.debug('[fillQueue] field keys on first card:', fieldKeys);
        if (firstKey) {
          console.debug('[fillQueue] first field value:', rawCards[0].fields[firstKey]?.value?.slice(0, 200));
        }
      }

      const cards: Card[] = rawCards.map((raw) => {
        // Fields are ordered — sort by .order and take front/back by position.
        const ordered = Object.values(raw.fields).sort((a, b) => a.order - b.order);
        const question = ordered[0]?.value ?? '';
        const answer   = ordered[1]?.value ?? '';
        // AnkiConnect cardsInfo doesn't expose queue type directly.
        // We use the queue field: 0=new, 1=learning, 2=review, 3=day-learn
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

      console.debug('[fillQueue] first card question:', cards[0]?.question?.slice(0, 200));
      cardQueue.value.push(...cards);
    } catch (err) {
      console.error('CardStore.fillQueue:', err);
      throw err; // Re-throw so the UI can show an error banner.
    } finally {
      isFetching.value = false;
    }
  }

  // -------------------------------------------------------------------------
  // Review Actions
  // -------------------------------------------------------------------------

  /**
   * Submits an ease rating directly to AnkiConnect, removes the card from
   * the local queue, and triggers a background refill if running low.
   *
   * AnkiConnect action: answerCards → boolean
   *
   * @param ease - 1 (Again), 2 (Hard), 3 (Good), 4 (Easy).
   */
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
   * Moves the current card to session history and sends the user's answer to
   * the LLM analysis endpoint for grading.
   *
   * The card's question and correct answer come directly from the already-
   * fetched card data — no extra AnkiConnect call is needed.
   *
   * @param markdownResponse - User's answer, pre-converted to Markdown.
   */
  async function submitReview(htmlResponse: string): Promise<void> {
    if (!currentCard.value) return;
    const llm = useLLMStore();

    const cardToAnalyze: Card = { ...currentCard.value };

    // Strip HTML tags for plain-text LLM input
    const plainText = htmlResponse.replace(/<[^>]*>/g, '').trim();

    const processedEntry: ProcessedCard = {
      ...cardToAnalyze,
      status: 'analyzing',
      userResponse: plainText,
      cardType: cardToAnalyze.cardType,
      rated: false,
    };
    processedCards.value.unshift(processedEntry);

    // Remove from queue
    const queueIndex = cardQueue.value.findIndex(c => c.cardId === cardToAnalyze.cardId);
    if (queueIndex > -1) cardQueue.value.splice(queueIndex, 1);

    try {
      const feedback = await llm.analyze({
        question:      cardToAnalyze.question.replace(/<[^>]*>/g, ''),
        correctAnswer: cardToAnalyze.answer.replace(/<[^>]*>/g, ''),
        userAnswer:    plainText,
        cardType:      cardToAnalyze.cardType,
      });

      const entry = processedCards.value.find(c => c.cardId === cardToAnalyze.cardId);
      if (entry) {
        entry.status      = 'success';
        entry.feedback    = feedback;
        entry.llmAnalysis = feedback.verdict;
      }

      // Log full review so student can download session notes
      const errorLog = useErrorLogStore();
      errorLog.captureSuccess({
        cardId:          cardToAnalyze.cardId,
        question:        cardToAnalyze.question.replace(/<[^>]*>/g, ''),
        userAnswer:      plainText,
        provider:        llm.provider.label,
        model:           llm.modelId,
        score:           feedback.score,
        verdict:         feedback.verdict,
        strengths:       feedback.strengths,
        gaps:            feedback.gaps,
        improvements:    feedback.improvements,
        exemplar:        feedback.exemplar,
        suggestedRating: feedback.suggestedRating,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      console.error(`CardStore.submitReview (cardId=${cardToAnalyze.cardId}):`, err);
      const entry = processedCards.value.find(c => c.cardId === cardToAnalyze.cardId);
      if (entry) {
        entry.status      = 'error';
        entry.llmAnalysis = message;
      }
      const errorLog = useErrorLogStore();
      errorLog.captureError({
        cardId:       cardToAnalyze.cardId,
        question:     cardToAnalyze.question.replace(/<[^>]*>/g, ''),
        userAnswer:   plainText,
        errorMessage: message,
        provider:     llm.provider.label,
        model:        llm.modelId,
      });
    }
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

  /**
   * Resets a failed card to 'analyzing' and re-fires the LLM call.
   * Called from the Retry button in CardDetailDialog.
   */
  function retryAnalysis(cardId: number): void {
    const entry = processedCards.value.find(c => c.cardId === cardId);
    if (!entry || entry.status === 'analyzing') return;

    const llm = useLLMStore();
    entry.status = 'analyzing';
    entry.llmAnalysis = undefined;
    entry.feedback = undefined;

    void (async () => {
      try {
        const feedback = await llm.analyze({
          question:      entry.question.replace(/<[^>]*>/g, ''),
          correctAnswer: entry.answer.replace(/<[^>]*>/g, ''),
          userAnswer:    entry.userResponse,
          cardType:      entry.cardType,
        });
        const e = processedCards.value.find(c => c.cardId === cardId);
        if (e) { e.status = 'success'; e.feedback = feedback; e.llmAnalysis = feedback.verdict; }

        const errorLog = useErrorLogStore();
        errorLog.captureSuccess({
          cardId,
          question:        entry.question.replace(/<[^>]*>/g, ''),
          userAnswer:      entry.userResponse,
          provider:        llm.provider.label,
          model:           llm.modelId,
          score:           feedback.score,
          verdict:         feedback.verdict,
          strengths:       feedback.strengths,
          gaps:            feedback.gaps,
          improvements:    feedback.improvements,
          exemplar:        feedback.exemplar,
          suggestedRating: feedback.suggestedRating,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Analysis failed';
        const e = processedCards.value.find(c => c.cardId === cardId);
        if (e) { e.status = 'error'; e.llmAnalysis = message; }
        const errorLog = useErrorLogStore();
        errorLog.captureError({
          cardId,
          question:     entry.question.replace(/<[^>]*>/g, ''),
          userAnswer:   entry.userResponse,
          errorMessage: `[RETRY] ${message}`,
          provider:     llm.provider.label,
          model:        llm.modelId,
        });
      }
    })();
  }

  /** Clears the in-session processed-cards history. */
  function clearProcessedCards(): void {
    processedCards.value = [];
  }

  /** Remove a single card from processed history by cardId. */
  function removeProcessedCard(cardId: number): void {
    const idx = processedCards.value.findIndex(c => c.cardId === cardId);
    if (idx > -1) processedCards.value.splice(idx, 1);
  }

  /** Remove only cards that have already been rated (graded). */
  function removeRatedCards(): void {
    for (let i = processedCards.value.length - 1; i >= 0; i--) {
      if (processedCards.value[i]!.rated) processedCards.value.splice(i, 1);
    }
  }

  // -------------------------------------------------------------------------
  // Deck Management
  // -------------------------------------------------------------------------

  /**
   * Returns new / learning / review counts for a single deck.
   *
   * AnkiConnect action: getDeckStats → { [deckId]: AnkiDeckStats }
   */
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

  /**
   * Switches the active deck locally, clears the stale card queue, and tells
   * Anki's GUI to open the deck's review screen.
   *
   * AnkiConnect action: guiDeckReview
   */
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

  /**
   * Suspends a card and removes it from the local queue.
   *
   * AnkiConnect action: suspend
   */
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

  /**
   * Buries a card until tomorrow and removes it from the local queue.
   *
   * AnkiConnect action: bury
   */
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

  /**
   * Updates one or more fields on a note.
   *
   * AnkiConnect action: updateNoteFields
   *
   * @param noteId - The note (not card) ID — available as `card.noteId`.
   * @param fields - Map of field name → new HTML string value.
   */
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

  /**
   * Checks whether AnkiConnect is reachable using its lightest action.
   *
   * AnkiConnect action: version → number
   */
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

  /**
   * Triggers Anki's built-in sync with AnkiWeb.
   *
   * AnkiConnect action: sync
   */
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
    retryAnalysis,
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