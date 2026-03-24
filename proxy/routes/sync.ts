import { Hono } from 'hono';
import { db } from '../utils/db';

export const syncRouter = new Hono();

const ANKI_URL = 'http://127.0.0.1:8765';

/**
 * Helper to call Anki-Connect.
 */
async function invokeAnki<T>(action: string, params: any = {}): Promise<T> {
  try {
    const response = await fetch(ANKI_URL, {
      method: 'POST',
      body: JSON.stringify({ action, version: 6, params }),
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`Anki-Connect request failed with status ${response.status}`);
    }

    const data = await response.json() as any;
    if (data.error) {
      throw new Error(`Anki-Connect error: ${data.error}`);
    }
    return data.result as T;
  } catch (err) {
    console.error(`[Sync] Anki-Connect invocation failed for action "${action}":`, err);
    throw err;
  }
}

/**
 * GET /sync/decks
 * Fetches all deck names and IDs from Anki and updates the `decks` table.
 */
syncRouter.get('/decks', async (c) => {
  try {
    // 1. Get Default Profile ID
    const profile = db.prepare('SELECT id FROM profiles WHERE name = ?').get('Default Profile') as { id: number } | undefined;
    if (!profile) {
      return c.json({ error: 'Default Profile not found' }, 500);
    }
    const profileId = profile.id;

    // 2. Fetch decks from Anki
    // deckNamesAndIds returns { deckName: deckId, ... }
    const ankiDecks = await invokeAnki<Record<string, number>>('deckNamesAndIds');

    // 3. Update SQLite
    const upsertDeck = db.prepare(`
      INSERT INTO decks (id, profile_id, name)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        profile_id = excluded.profile_id
    `);

    db.exec('BEGIN TRANSACTION');
    try {
      for (const [name, id] of Object.entries(ankiDecks)) {
        upsertDeck.run(id, profileId, name);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    return c.json({ status: 'ok', count: Object.keys(ankiDecks).length });
  } catch (error: any) {
    console.error('[Sync] GET /sync/decks failed:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /sync/deck-cards
 * Synchronizes cards for a specific deck.
 */
syncRouter.post('/deck-cards', async (c) => {
  try {
    const { deckId } = await c.req.json();
    if (deckId === undefined) {
      return c.json({ error: 'deckId is required' }, 400);
    }

    // 1. Get all card IDs from Anki for this deck
    const ankiCardIds = await invokeAnki<number[]>('findCards', { query: `did:${deckId}` });

    // 2. Get existing cards from SQLite for this deck to check mods
    const existingCards = db.prepare('SELECT id, anki_mod FROM cards WHERE deck_id = ?').all(deckId) as Array<{ id: number, anki_mod: number | null }>;
    const existingMap = new Map(existingCards.map(c => [c.id, c.anki_mod]));

    // 3. Identify cards to fetch
    // Cards that don't exist in SQLite or have different mod (we'll fetch mod from Anki for all findCards first if we wanted to be super efficient, 
    // but cardsInfo is relatively cheap for large batches)
    
    // Actually, cardsInfo returns everything including 'mod'. 
    // We could do it in two steps: 
    // a) Get all card IDs from Anki.
    // b) Check which ones are missing or stale in SQLite.
    // c) Fetch cardsInfo for those.

    // To know which ones are stale without fetching all cardsInfo, we'd need 'mod' from somewhere else.
    // But Anki's findCards doesn't return mods.
    // So we either:
    // - Fetch ALL cardsInfo for the deck (expensive for large decks)
    // - Or just fetch those that are missing from SQLite.
    // - Or fetch all, but only update if mod changed.
    
    // The task says: "For each ID, check if it exists in SQLite and if its anki_mod matches."
    // This implies we already know the anki_mod from Anki. 
    // Wait, Anki-Connect's `cardsInfo` is the way to get `mod`.
    
    // Let's check if there's an action to get just IDs and Mods.
    // There isn't an obvious one.
    
    // I'll fetch ALL cardsInfo for these IDs to get their mods and other data.
    // If the deck is huge, this might be slow, but it's a standard approach.
    // Actually, I can optimize:
    // Only fetch IDs that are NOT in existingMap.
    // But how do I know if they are modified? I need to fetch their info to see the new mod.
    
    // OK, let's fetch IDs in chunks if there are many.
    const CHUNK_SIZE = 500;
    const cardsToUpdate: any[] = [];
    const ankiCardIdsSet = new Set(ankiCardIds);

    for (let i = 0; i < ankiCardIds.length; i += CHUNK_SIZE) {
      const chunk = ankiCardIds.slice(i, i + CHUNK_SIZE);
      const info = await invokeAnki<any[]>('cardsInfo', { cards: chunk });
      
      for (const card of info) {
        const existingMod = existingMap.get(card.cardId);
        if (existingMod === undefined || existingMod !== card.mod) {
          cardsToUpdate.push(card);
        }
      }
    }

    // 4. Update SQLite
    const upsertCard = db.prepare(`
      INSERT INTO cards (id, deck_id, model_id, model_name, ord, fields, tags, anki_mod, type, queue, is_archived)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(id) DO UPDATE SET
        deck_id = excluded.deck_id,
        model_id = excluded.model_id,
        model_name = excluded.model_name,
        ord = excluded.ord,
        fields = excluded.fields,
        tags = excluded.tags,
        anki_mod = excluded.anki_mod,
        type = excluded.type,
        queue = excluded.queue,
        is_archived = 0
    `);

    db.exec('BEGIN TRANSACTION');
    try {
      // Create temporary table for current Anki IDs
      db.exec('CREATE TEMPORARY TABLE IF NOT EXISTS current_anki_ids (id INTEGER PRIMARY KEY)');
      db.exec('DELETE FROM current_anki_ids');
      const insertTemp = db.prepare('INSERT INTO current_anki_ids (id) VALUES (?)');
      
      for (const id of ankiCardIds) {
        insertTemp.run(id);
      }

      // Upsert modified/new cards
      for (const card of cardsToUpdate) {
        upsertCard.run(
          card.cardId,
          card.deckId,
          card.modelId,
          card.modelName,
          card.ord,
          JSON.stringify(card.fields),
          JSON.stringify(card.tags || []),
          card.mod,
          card.type,
          card.queue
        );
      }

      // Archive cards no longer in Anki for this deck
      db.prepare(`
        UPDATE cards 
        SET is_archived = 1 
        WHERE deck_id = ? AND id NOT IN (SELECT id FROM current_anki_ids)
      `).run(deckId);

      // Unarchive cards that are in Anki
      db.prepare(`
        UPDATE cards 
        SET is_archived = 0 
        WHERE deck_id = ? AND id IN (SELECT id FROM current_anki_ids)
      `).run(deckId);

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    return c.json({ 
      status: 'ok', 
      total: ankiCardIds.length,
      updated: cardsToUpdate.length,
      archived: existingCards.length - (existingCards.filter(c => ankiCardIdsSet.has(c.id)).length)
    });

  } catch (error: any) {
    console.error('[Sync] POST /sync/deck-cards failed:', error);
    return c.json({ error: error.message }, 500);
  }
});
