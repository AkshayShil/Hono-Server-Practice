import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import path from 'path';
import fs from 'fs';
import { appendFile, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { ankiProxy } from './routes/ankiProxy';
import { llmProxy } from './routes/llm';
import { fsrsRouter } from './routes/fsrs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');
const indexPath = path.resolve(distPath, 'index.html');

const logsDir = path.resolve(__dirname, '../analysis_logs');
const dataDir = path.resolve(__dirname, 'data');

export async function initLogs() {
  try {
    await mkdir(logsDir, { recursive: true });
    console.log(`[Server] Analysis logs directory: ${logsDir}`);
    await mkdir(dataDir, { recursive: true });
    console.log(`[Server] FSRS data directory: ${dataDir}`);
  } catch (err) {
    console.error('[Server] Failed to create directories:', err);
  }
}

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// 1. Anki-Connect Proxy
app.route('/anki', ankiProxy);

// 2. LLM Proxy (Secure Key Handling)
app.route('/api/llm', llmProxy);

// 3. FSRS Scheduling
app.route('/fsrs', fsrsRouter);

// 4. LLM Analysis Logging
app.post('/log-analysis', async (c) => {
  try {
    const data = await c.req.json();
    
    // Determine log file name based on date and deck
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const deckName = (data.deckName || 'unknown').replace(/[^a-z0-9]/gi, '_');
    const logFile = path.join(logsDir, `analysis-${dateStr}-${deckName}.jsonl`);

    const entry = JSON.stringify({
      ...data,
      serverTimestamp: new Date().toISOString(),
    }) + '\n';
    
    await appendFile(logFile, entry);
    return c.json({ status: 'ok' });
  } catch (error) {
    console.error('[Server] Failed to log analysis:', error);
    return c.json({ error: 'Failed to log data' }, 500);
  }
});

// 3. Serve Static Files
app.use('/*', serveStatic({ root: './dist' }));

// 4. SPA Fallback
app.get('*', async (c, next) => {
  const url = new URL(c.req.url);
  if (!url.pathname.startsWith('/anki') && !url.pathname.includes('.')) {
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, 'utf-8');
      return c.html(content);
    }
  }
  await next();
});

export default app;
