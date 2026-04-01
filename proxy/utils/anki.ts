import { logger } from './logger';
import { db } from './db';

export const ANKI_URL = 'http://127.0.0.1:8765';

/**
 * Helper to call Anki-Connect.
 */
export async function invokeAnki<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  try {
    const response = await fetch(ANKI_URL, {
      method: 'POST',
      body: JSON.stringify({ action, version: 6, params }),
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`Anki-Connect request failed with status ${response.status}`);
    }

    const data = await response.json() as { result: T; error: string | null };
    if (data.error) {
      throw new Error(`Anki-Connect error: ${data.error}`);
    }
    return data.result;
  } catch (err) {
    logger.error({ err, action }, `[Anki] Anki-Connect invocation failed`);
    throw err;
  }
}

/**
 * Queues a card rating to be synced back to Anki.
 * Since we have multiple profiles, we need to know which profile owns the card.
 */
export function queueAnkiRating(cardId: number, rating: number) {
  try {
    // Find the profile name for this card
    const profile = db.prepare(`
      SELECT p.name 
      FROM profiles p
      JOIN decks d ON d.profile_id = p.id
      JOIN cards c ON c.deck_id = d.id
      WHERE c.id = ?
    `).get(cardId) as { name: string } | undefined;

    const profileName = profile?.name ?? 'Default Profile'; // Fallback if not found

    db.prepare(`
      INSERT INTO anki_sync_queue (card_id, rating, profile_name)
      VALUES (?, ?, ?)
    `).run(cardId, rating, profileName);
    
    logger.info({ cardId, rating, profileName }, '[Anki] Queued rating for sync');
    
    // Trigger background process (don't wait)
    void processAnkiSyncQueue();
  } catch (err) {
    logger.error({ err, cardId }, '[Anki] Failed to queue rating');
  }
}

let isSyncing = false;

interface AnkiSyncQueueItem {
  id: number;
  card_id: number;
  rating: number;
  profile_name: string;
  created_at: string;
  synced_at: string | null;
}

/**
 * Background worker to process the sync queue.
 * Handles multiple profiles by switching profiles in Anki-Connect if needed.
 */
export async function processAnkiSyncQueue() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const pending = db.prepare('SELECT * FROM anki_sync_queue WHERE synced_at IS NULL ORDER BY created_at ASC').all() as AnkiSyncQueueItem[];
    if (pending.length === 0) {
      isSyncing = false;
      return;
    }

    // Group by profile to minimize profile switching
    const byProfile: Record<string, AnkiSyncQueueItem[]> = {};
    for (const item of pending) {
      if (!byProfile[item.profile_name]) byProfile[item.profile_name] = [];
      byProfile[item.profile_name]!.push(item);
    }

    for (const [profileName, items] of Object.entries(byProfile)) {
      try {
        // 1. Switch profile
        await invokeAnki('loadProfile', { name: profileName });

        // 2. Answer cards in batch
        const answers = items.map(item => ({
          cardId: item.card_id,
          ease: item.rating
        }));

        await invokeAnki('answerCards', { answers });

        // 3. Mark as synced in local DB
        const ids = items.map(item => item.id);
        const placeholders = ids.map(() => '?').join(',');
        db.prepare(`UPDATE anki_sync_queue SET synced_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`).run(...ids);

        logger.info({ profileName, count: items.length }, '[Anki] Successfully synced ratings');
      } catch (err) {
        logger.warn({ err, profileName }, '[Anki] Failed to sync profile. Anki might be closed or profile missing.');
        // Stop processing this run if we hit an error (likely Anki is closed)
        break;
      }
    }
  } catch (err) {
    logger.error({ err }, '[Anki] Error processing sync queue');
  } finally {
    isSyncing = false;
  }
}

// Periodically check the queue (e.g., every 5 minutes)
setInterval(processAnkiSyncQueue, 5 * 60 * 1000);
