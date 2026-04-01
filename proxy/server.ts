import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import path from 'path';
import fs from 'fs';
import { appendFile, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { ankiProxy } from './routes/ankiProxy';
import { llmProxy } from './routes/llm';
import { fsrsRouter } from './routes/fsrs';
import { syncRouter } from './routes/sync';
import { initSchema } from './utils/db';
import { migrate } from './utils/migrate';
import { logger } from './utils/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');
const indexPath = path.resolve(distPath, 'index.html');

const logsDir = path.resolve(__dirname, '../analysis_logs');
const errorsDir = path.resolve(__dirname, '../client_errors');
const dataDir = path.resolve(__dirname, 'data');

export async function initLogs() {
  try {
    await mkdir(logsDir, { recursive: true });
    logger.info(`[Server] Analysis logs directory: ${logsDir}`);
    await mkdir(errorsDir, { recursive: true });
    logger.info(`[Server] Client errors directory: ${errorsDir}`);
    await mkdir(dataDir, { recursive: true });
    logger.info(`[Server] FSRS data directory: ${dataDir}`);
    
    // Initialize SQLite database
    initSchema();
    logger.info('[Server] SQLite database initialized');
    
    // Migrate legacy data
    migrate();
  } catch (err) {
    logger.error({ err }, '[Server] Failed to initialize');
  }
}

const app = new Hono();

// Middleware
app.use('*', honoLogger((str) => {
  logger.info(str);
}));
app.use('*', cors());

// 1. Anki-Connect Proxy
app.route('/anki', ankiProxy);

// 2. LLM Proxy (Secure Key Handling)
app.route('/api/llm', llmProxy);

// 3. FSRS Scheduling
app.route('/fsrs', fsrsRouter);

// 4. Syncing (Anki to SQLite)
app.route('/sync', syncRouter);

// 5. LLM Analysis Logging
app.post('/log-analysis', async (c) => {
  try {
    const data = await c.req.json();
    
    // Determine log file name based on date, session name, and session ID
    // We prioritize sessionName if user provided one, otherwise use deckName
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const deckName = (data.deckName || 'unknown').replace(/[^a-z0-9]/gi, '_');
    const sessionName = (data.sessionName || '').replace(/[^a-z0-9]/gi, '_');
    const sessionId = (data.sessionId || 'nosid').slice(0, 8); // Keep it short
    
    const fileNameBase = sessionName ? `${sessionName}-${sessionId}` : `analysis-${dateStr}-${deckName}-${sessionId}`;
    const logFile = path.join(logsDir, `${fileNameBase}.jsonl`);

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

// 6. Generic Error Logging
app.post('/log-error', async (c) => {
  try {
    const data = await c.req.json();
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const errorFile = path.join(errorsDir, `errors-${dateStr}.jsonl`);

    const entry = JSON.stringify({
      ...data,
      serverTimestamp: new Date().toISOString(),
    }) + '\n';
    
    await appendFile(errorFile, entry);
    return c.json({ status: 'ok' });
  } catch (error) {
    console.error('[Server] Failed to log client error:', error);
    return c.json({ error: 'Failed to log error' }, 500);
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
