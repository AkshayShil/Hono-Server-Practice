import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { generateUUID } from '@/utils/uuid';
import { useLLMStore, type LLMFeedback } from './llm/index';
import { useErrorLogStore } from './errorLogStore';
import { useFsrsStore } from './fsrsStore';
import { State as FSRSState } from 'ts-fsrs';

/** AnkiConnect proxy endpoint handled by the Express middleman. */
const ANKI_CONNECT_URL = '/anki';
const ANKI_CONNECT_VERSION = 6;
/** Minimum queue size before a refill is triggered. */
const QUEUE_REFILL_THRESHOLD = 5;

/** localStorage key used to persist the active deck across page refreshes. */
const STORAGE_KEY_CURRENT_DECK = 'ankiStudy:currentDeck';
/** localStorage key used to persist the card queue and processed history. */
const STORAGE_KEY_STATE = 'ankiStudy:sessionState';
/** localStorage key for current session ID. */
const STORAGE_KEY_SESSION_ID = 'ankiStudy:sessionId';
/** localStorage key for current session name. */
const STORAGE_KEY_SESSION_NAME = 'ankiStudy:sessionName';

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

export interface Deck {
  name: string;
  id: number;
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
  /** Anki internal queue: 0=new, 1=learning, 2=review, 3=day-learn */
  queue?: number;
}

interface AnkiDeckStats {
  new_count: number;
  learn_count: number;
  review_count: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strips HTML tags for plain-text LLM input. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
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

function saveSession(queue: Card[], history: ProcessedCard[]) {
  try {
    localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify({ queue, history }));
  } catch (err) {
    console.warn('Failed to save session:', err);
  }
}

function loadSession(): { queue: Card[], history: ProcessedCard[] } | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY_STATE);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export interface AnalysisSyncParams {
  cardId: number;
  question: string;
  cardAnswer: string;
  userAnswer: string;
  deckName: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useCardStore = defineStore('cardStore', () => {
  const decks = ref<Deck[]>([]);
  const currentDeck = ref<string>(readPersistedDeck());
  
  const saved = loadSession();
  const cardQueue = ref<Card[]>(saved?.queue ?? []);
  const processedCards = ref<ProcessedCard[]>(saved?.history ?? []);
  const isFetching = ref(false);
  const isSyncing = ref(false);
  let currentFetch: Promise<void> | null = null;

  // Session state
  const sessionId = ref<string>(localStorage.getItem(STORAGE_KEY_SESSION_ID) || generateUUID());
  
  const getDefaultSessionName = () => {
    const date = new Date().toISOString().split('T')[0];
    const deck = (currentDeck.value || 'DECK').split('::').pop()?.replace(/[^a-zA-Z0-9]/g, '_') || 'SESSION';
    return `${date}_${deck}`;
  };

  const sessionName = ref<string>(localStorage.getItem(STORAGE_KEY_SESSION_NAME) || getDefaultSessionName());

  // Watch for deck changes to update default session name if it hasn't been manually changed
  watch(currentDeck, (newDeck) => {
    if (!localStorage.getItem(STORAGE_KEY_SESSION_NAME)) {
      sessionName.value = getDefaultSessionName();
    }
  });

  // Persist session ID and name
  if (!localStorage.getItem(STORAGE_KEY_SESSION_ID)) {
    localStorage.setItem(STORAGE_KEY_SESSION_ID, sessionId.value);
  }
  watch(sessionName, (val) => localStorage.setItem(STORAGE_KEY_SESSION_NAME, val));

  const currentCard = computed<Card | null>(() => cardQueue.value[0] ?? null);

  /** Plays a short notification sound when an analysis completes. */
  const playAlert = () => {
    try {
      const audio = new Audio('/audio/complete.mp3');
      audio.play().catch((err) => {
        // Browsers often block autoplay until a user interacts with the page.
        // This is expected and should fail silently.
        console.debug('[Audio] Playback blocked or failed:', err);
      });
    } catch (err) {
      console.warn('[Audio] Failed to initialize audio:', err);
    }
  };

  // Persist the active deck whenever it changes.
  watch(currentDeck, persistDeck);

  // Persist session queue and history.
  watch([cardQueue, processedCards], () => {
    saveSession(cardQueue.value, processedCards.value);
  }, { deep: true });

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  /**
   * Syncs decks from Anki to SQLite and updates the local state.
   */
  async function syncDecks(): Promise<void> {
    isSyncing.value = true;
    try {
      const res = await fetch('/sync/decks');
      if (!res.ok) throw new Error('Failed to sync decks');
      const data = await res.json();
      if (data.decks) {
        decks.value = (data.decks as Deck[])
          .filter((d) => d.name !== 'Default')
          .sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch (err) {
      console.error('CardStore.syncDecks:', err);
    } finally {
      isSyncing.value = false;
    }
  }

  /**
   * Syncs cards for a specific deck from Anki to SQLite.
   */
  async function syncDeckCards(deckId: number): Promise<void> {
    isSyncing.value = true;
    try {
      const res = await fetch('/sync/deck-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId }),
      });
      if (!res.ok) throw new Error('Failed to sync deck cards');
    } catch (err) {
      console.error(`CardStore.syncDeckCards (deckId=${deckId}):`, err);
    } finally {
      isSyncing.value = false;
    }
  }

  /**
   * Loads all deck names from AnkiConnect and restores the persisted active
   * deck (falling back to the first deck alphabetically).
   */
  async function init(): Promise<void> {
    try {
      const fsrs = useFsrsStore();
      await fsrs.loadState();

      await syncDecks();

      const persisted = readPersistedDeck();
      if (persisted && decks.value.some(d => d.name === persisted)) {
        currentDeck.value = persisted;
      } else {
        currentDeck.value = decks.value[0]?.name ?? '';
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
    if (!targetDeck) return;
    if (currentFetch) return currentFetch;

    currentFetch = (async () => {
      isFetching.value = true;
      try {
        // Fetch ALL cards in the deck, not just those Anki thinks are due
        const query = `deck:"${targetDeck}"`;
        const cardIds = await invoke<number[]>('findCards', { query });

        if (cardIds.length === 0) return;

        const fsrsStore = useFsrsStore();
        const dueIds = fsrsStore.getDueIds(cardIds);

        const existingIds = new Set(cardQueue.value.map((c) => c.cardId));
        const processedIds = new Set(processedCards.value.map((c) => c.cardId));
        const freshIds = dueIds.filter((id) => !existingIds.has(id) && !processedIds.has(id));

        if (freshIds.length === 0) return;

        const rawCards = await invoke<AnkiCardInfo[]>('cardsInfo', { cards: freshIds });

        console.debug('[fillQueue] cardsInfo returned', rawCards.length, 'cards');

        const cards: Card[] = rawCards.map((raw) => {
          // Fields are ordered — sort by .order and take front/back by position.
          const ordered = Object.values(raw.fields).sort((a, b) => a.order - b.order);
          const question = ordered[0]?.value ?? '';
          const answer   = ordered[1]?.value ?? '';
          
          // Derive card type from FSRS state instead of Anki queue
          const fsrsCard = fsrsStore.getCardState(raw.cardId);
          const fsrsState = fsrsCard?.state ?? FSRSState.New;
          const cardType: 'new' | 'learn' | 'review' =
            fsrsState === FSRSState.New ? 'new'
            : fsrsState === FSRSState.Review ? 'review'
            : 'learn'; // Learning + Relearning both map to 'learn'

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
        currentFetch = null;
      }
    })();

    return currentFetch;
  }

  /**
   * Clears the current session (queue and history) and refetches cards for the current deck.
   */
  async function resetSession(): Promise<void> {
    cardQueue.value = [];
    processedCards.value = [];
    sessionId.value = generateUUID();
    localStorage.setItem(STORAGE_KEY_SESSION_ID, sessionId.value);
    await fillQueue();
  }

  // -------------------------------------------------------------------------
  // Review Actions
  // -------------------------------------------------------------------------

  /**
   * Sends successful analysis results to the server's logging endpoint.
   */
  async function syncAnalysisToServer(params: AnalysisSyncParams, feedback: LLMFeedback) {
    try {
      await fetch('/log-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          ...feedback,
          sessionId: sessionId.value,
          sessionName: sessionName.value,
          clientTimestamp: new Date().toISOString()
        }),
      });
    } catch (err) {
      console.warn('[Sync] Failed to send analysis to server:', err);
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

    // Refill queue if low
    if (cardQueue.value.length < QUEUE_REFILL_THRESHOLD && currentDeck.value) {
      void fillQueue(currentDeck.value);
    }

    try {
      const feedback = await llm.analyze({
        question:      stripHtml(cardToAnalyze.question),
        correctAnswer: stripHtml(cardToAnalyze.answer),
        userAnswer:    plainText,
        cardType:      cardToAnalyze.cardType,
      });

      const entry = processedCards.value.find(c => c.cardId === cardToAnalyze.cardId);
      if (entry) {
        entry.status      = 'success';
        entry.feedback    = feedback;
        entry.llmAnalysis = feedback.verdict;
        playAlert();
      }

      // Log full review so student can download session notes
      const errorLog = useErrorLogStore();
      errorLog.captureSuccess({
        cardId:          cardToAnalyze.cardId,
        question:        stripHtml(cardToAnalyze.question),
        userAnswer:      plainText,
        provider:        llm.provider.label,
        model:           llm.modelId,
        score:           feedback.score,
        verdict:         feedback.verdict,
        strengths:       feedback.strengths,
        gaps:            feedback.gaps,
        improvements:    feedback.improvements,
        rating: feedback.rating,
      });

      // Sync successful analysis to server for logging
      void syncAnalysisToServer({
        cardId:     cardToAnalyze.cardId,
        question:   stripHtml(cardToAnalyze.question),
        cardAnswer: stripHtml(cardToAnalyze.answer),
        userAnswer: plainText,
        deckName:   currentDeck.value,
      }, feedback);
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
        question:     stripHtml(cardToAnalyze.question),
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
    const fsrs = useFsrsStore();

    // Optimistically mark as rated and remove from queue
    const entry = processedCards.value.find((c) => c.cardId === cardId);
    if (entry) entry.rated = true;

    const index = cardQueue.value.findIndex((c) => c.cardId === cardId);
    if (index > -1) cardQueue.value.splice(index, 1);

    // Network call in background
    void fsrs.submitRating(cardId, ease as 1 | 2 | 3 | 4).catch(err => {
      console.error('Failed to submit rating to backend:', err);
      // Optional: Revert UI state on failure if needed
    });

    // Refill if low
    if (cardQueue.value.length < QUEUE_REFILL_THRESHOLD && currentDeck.value) {
      void fillQueue(currentDeck.value);
    }
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
          question:      stripHtml(entry.question),
          correctAnswer: stripHtml(entry.answer),
          userAnswer:    entry.userResponse,
          cardType:      entry.cardType,
        });
        const e = processedCards.value.find(c => c.cardId === cardId);
        if (e) {
          e.status = 'success';
          e.feedback = feedback;
          e.llmAnalysis = feedback.verdict;
          playAlert();
        }

        const errorLog = useErrorLogStore();
        errorLog.captureSuccess({
          cardId,
          question:        stripHtml(entry.question),
          userAnswer:      entry.userResponse,
          provider:        llm.provider.label,
          model:           llm.modelId,
          score:           feedback.score,
          verdict:         feedback.verdict,
          strengths:       feedback.strengths,
          gaps:            feedback.gaps,
          improvements:    feedback.improvements,
          rating: feedback.rating,
        });

        // Sync successful analysis to server for logging
        void syncAnalysisToServer({
          cardId,
          question:   stripHtml(entry.question),
          cardAnswer: stripHtml(entry.answer),
          userAnswer: entry.userResponse,
          deckName:   currentDeck.value,
        }, feedback);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Analysis failed';
        const e = processedCards.value.find(c => c.cardId === cardId);
        if (e) { e.status = 'error'; e.llmAnalysis = message; }
        const errorLog = useErrorLogStore();
        errorLog.captureError({
          cardId,
          question:     stripHtml(entry.question),
          userAnswer:   entry.userResponse,
          errorMessage: `[RETRY] ${message}`,
          provider:     llm.provider.label,
          model:        llm.modelId,
        });
      }
    })();
  }

  /**
   * Batch-processes all cards that have a suggested AI rating but haven't been rated yet.
   */
  async function autogradeAll(): Promise<void> {
    const ungraded = processedCards.value.filter(
      (c) => c.status === 'success' && !c.rated && c.feedback?.rating
    );

    if (ungraded.length === 0) return;

    // Process all ungraded cards in parallel
    await Promise.all(
      ungraded.map((card) => sendRating(card.cardId, card.feedback!.rating))
    );
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
   */
  async function selectDeck(deckId: number): Promise<boolean> {
    const deck = decks.value.find(d => d.id === deckId);
    if (!deck) return false;

    cardQueue.value = [];
    currentDeck.value = deck.name;
    
    await syncDeckCards(deckId);
    await fillQueue(deck.name);
    return true;
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
   * AnkiConnect action: buryCards
   */
  async function buryCard(cardId: number): Promise<boolean> {
    try {
      await invoke<boolean>('buryCards', { cards: [cardId] });
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
    isSyncing: isSyncing as Readonly<typeof isSyncing>,
    currentCard,
    sessionId,
    sessionName,

    init,
    syncDecks,
    syncDeckCards,
    fillQueue,
    resetSession,
    autogradeAll,
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