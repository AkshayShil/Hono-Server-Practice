import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Card as FSRSCard } from 'ts-fsrs'

export const useFsrsStore = defineStore('fsrs', () => {
  // Local cache of server state: cardId (as string) → FSRSCard
  const state = ref<Record<string, FSRSCard>>({})

  async function loadState(): Promise<void> {
    const res = await fetch('/fsrs/state')
    state.value = await res.json()
  }

  // Returns cardIds that are due NOW according to server-side state
  // Also returns ids with NO state yet (new cards — always due)
  function getDueIds(allCardIds: number[]): number[] {
    const now = new Date()
    return allCardIds.filter((id) => {
      const card = state.value[String(id)]
      if (!card) return true // never reviewed = due immediately
      return new Date(card.due) <= now
    })
  }

  async function submitRating(cardId: number, rating: 1 | 2 | 3 | 4): Promise<void> {
    const res = await fetch('/fsrs/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId, rating }),
    })
    const { card } = await res.json()
    state.value[String(cardId)] = card
  }

  // Returns FSRS state for a specific card (or null if unseen)
  function getCardState(cardId: number): FSRSCard | null {
    return state.value[String(cardId)] ?? null
  }

  return { state, loadState, getDueIds, submitRating, getCardState }
})
