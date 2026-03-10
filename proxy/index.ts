import { serve } from '@hono/node-server';
import app, { initLogs } from './server';
import { getLocalIp } from './utils/network';

const PORT = Number(process.env.PORT) || 3020;
const IP = getLocalIp();

async function start() {
  await initLogs();

  console.log(`\x1b[32m✅ Anki Reviewer Proxy & UI running at:\x1b[0m`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${IP}:${PORT}`);
  console.log(`\n\x1b[34mℹ️ Features:\x1b[0m`);
  console.log(`   - Frontend served from ./dist`);
  console.log(`   - Anki-Connect proxy active at /anki`);
  console.log(`   - Server-side logging enabled`);
  console.log(`\x1b[33m💡 Access the URL on your mobile to start reviewing!\x1b[0m`);

  serve({
    fetch: app.fetch,
    port: PORT,
    hostname: '0.0.0.0'
  }, (_info) => {
    // Server is running
  });
}

start().catch(err => {
  console.error('[Server] Failed to start:', err);
});
