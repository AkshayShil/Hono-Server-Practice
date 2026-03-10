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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');
const indexPath = path.resolve(distPath, 'index.html');

const logsDir = path.resolve(__dirname, '../analysis_logs');
const sessionLogFile = path.join(logsDir, `analysis-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);

export async function initLogs() {
  try {
    await mkdir(logsDir, { recursive: true });
    console.log(`[Server] Analysis logs will be saved to: ${sessionLogFile}`);
  } catch (err) {
    console.error('[Server] Failed to create logs directory:', err);
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

// 3. LLM Analysis Logging
app.post('/log-analysis', async (c) => {
  try {
    const data = await c.req.json();
    const entry = JSON.stringify({
      ...data,
      serverTimestamp: new Date().toISOString(),
    }) + '\n';
    await appendFile(sessionLogFile, entry);
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
