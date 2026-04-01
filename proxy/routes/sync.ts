import { Hono } from 'hono';
import { db } from '../utils/db';
import { logger } from '../utils/logger';
import { invokeAnki } from '../utils/anki';

export const syncRouter = new Hono();

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
    logger.info(`[Sync] Fetched ${Object.keys(ankiDecks).length} decks from Anki`);

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

    const decks = Object.entries(ankiDecks).map(([name, id]) => ({ name, id }));
    return c.json({ status: 'ok', count: decks.length, decks });
  } catch (error: any) {
    logger.error({ err: error }, '[Sync] GET /sync/decks failed');
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

    logger.info(`[Sync] Syncing cards for deck ${deckId}...`);

    // 1. Get all card IDs from Anki for this deck
    const ankiCardIds = await invokeAnki<number[]>('findCards', { query: `did:${deckId}` });

    // 2. Get existing cards from SQLite for this deck to check mods
    const existingCards = db.prepare('SELECT id, anki_mod FROM cards WHERE deck_id = ?').all(deckId) as Array<{ id: number, anki_mod: number | null }>;
    const existingMap = new Map(existingCards.map(c => [c.id, c.anki_mod]));

    // 3. Identify cards to fetch
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

    logger.info(`[Sync] Found ${cardsToUpdate.length} cards to update for deck ${deckId}`);

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
          deckId,
          card.mid ?? null,
          card.modelName ?? null,
          card.ord ?? 0,
          JSON.stringify(card.fields),
          JSON.stringify(card.tags || []),
          card.mod ?? 0,
          card.type ?? 0,
          card.queue ?? 0
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

    logger.info(`[Sync] Successfully synced deck ${deckId}: ${cardsToUpdate.length} updated`);

    return c.json({ 
      status: 'ok', 
      total: ankiCardIds.length,
      updated: cardsToUpdate.length,
      archived: existingCards.length - (existingCards.filter(c => ankiCardIdsSet.has(c.id)).length)
    });

  } catch (error: any) {
    logger.error({ err: error }, '[Sync] POST /sync/deck-cards failed');
    return c.json({ error: error.message }, 500);
  }
});
