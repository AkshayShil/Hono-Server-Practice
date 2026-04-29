import * as lancedb from '@lancedb/lancedb';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, '../data/lancedb');

mkdirSync(DB_DIR, { recursive: true });

let dbPromise: Promise<lancedb.Connection> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = lancedb.connect(DB_DIR);
  }
  return dbPromise;
}

interface FileVector {
  file_path: string;
  combined_summary: string;
  session_count: number;
  last_updated: string;
  vector: number[];
}

async function getEmbedding(text: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'): Promise<number[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not found on server');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
      content: { parts: [{ text }] },
      taskType,
    })
  });

  if (!res.ok) {
    throw new Error(`Gemini Embedding error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json() as any;
  return data.embedding.values;
}

export async function upsertFileVector(
  filePath: string,
  combinedSummary: string,
  sessionCount: number
): Promise<void> {
  try {
    const db = await getDb();
    const vector = await getEmbedding(combinedSummary, 'RETRIEVAL_DOCUMENT');
    
    const tableNames = await db.tableNames();
    let table: lancedb.Table;
    
    const row: FileVector = {
      file_path: filePath,
      combined_summary: combinedSummary,
      session_count: sessionCount,
      last_updated: new Date().toISOString(),
      vector,
    };

    if (tableNames.includes('gurukul_files')) {
      table = await db.openTable('gurukul_files');
      // Upsert by file_path: replace all fields when matched, insert when not
      await table.mergeInsert('file_path')
        .whenMatchedUpdateAll()
        .whenNotMatchedInsertAll()
        .execute([row]);
    } else {
      table = await db.createTable('gurukul_files', [row]);
    }
  } catch (err) {
    console.warn('[LanceDB] Upsert failed:', err);
  }
}

export async function searchRelevantFiles(
  queryText: string,
  k: number = 5
): Promise<any[]> {
  try {
    const db = await getDb();
    const tableNames = await db.tableNames();
    if (!tableNames.includes('gurukul_files')) return [];

    const vector = await getEmbedding(queryText, 'RETRIEVAL_QUERY');
    const table = await db.openTable('gurukul_files');
    
    const results = await table
      .vectorSearch(vector)
      .limit(k)
      .toArray();
      
    return results;
  } catch (err) {
    console.warn('[LanceDB] Search failed:', err);
    return [];
  }
}
