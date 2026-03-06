import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getLocalIp } from './utils/network';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');
const indexPath = path.resolve(distPath, 'index.html');

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Anki-Connect Proxy
app.all('/anki/*', async (c) => {
  const subpath = c.req.path.replace(/^\/anki\/?/, '');
  const targetUrl = `http://127.0.0.1:8765/${subpath}`;
  
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('Origin', 'http://localhost');
  headers.set('Host', '127.0.0.1:8765');

  try {
    const body = c.req.method !== 'GET' && c.req.method !== 'HEAD' 
      ? await c.req.raw.arrayBuffer() 
      : undefined;

    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers: headers,
      body: body,
      // @ts-ignore - node-fetch specific or newer fetch options
      duplex: body ? 'half' : undefined 
    });

    const resHeaders = new Headers(response.headers);
    resHeaders.delete('content-encoding');
    resHeaders.delete('transfer-encoding');
    resHeaders.delete('access-control-allow-origin');
    resHeaders.delete('access-control-allow-headers');
    resHeaders.delete('access-control-allow-methods');

    return new Response(response.body, {
      status: response.status,
      headers: resHeaders,
    });
  } catch (error) {
    return c.json({ error: 'Anki-Connect unreachable' }, 503);
  }
});

// Serve static files
app.use('/*', serveStatic({ root: './dist' }));

// SPA Fallback
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

const PORT = Number(process.env.PORT) || 3020;
const IP = getLocalIp();

console.log(`\x1b[32m✅ Anki Reviewer Proxy & UI running at:\x1b[0m`);
console.log(`   Local:   http://localhost:${PORT}`);
console.log(`   Network: http://${IP}:${PORT}`);
console.log(`\n\x1b[34mℹ️ Features:\x1b[0m`);
console.log(`   - Frontend served from ./dist`);
console.log(`   - Anki-Connect proxy active at /anki`);
console.log(`\x1b[33m💡 Access the URL on your mobile to start reviewing!\x1b[0m`);

serve({
  fetch: app.fetch,
  port: PORT,
  hostname: '0.0.0.0'
}, (_info) => {
  // Server is running
});
