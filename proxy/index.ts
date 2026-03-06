import app from './server';
import { getLocalIp } from './utils/network';

const PORT = process.env.PORT || 3000;
const IP = getLocalIp();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\x1b[32m✅ Anki Reviewer Proxy & UI running at:\x1b[0m`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${IP}:${PORT}`);
  console.log(`\n\x1b[34mℹ️ Features:\x1b[0m`);
  console.log(`   - Frontend served from ./dist`);
  console.log(`   - Anki-Connect proxy active at /anki`);
  console.log(`\x1b[33m💡 Access the URL on your mobile to start reviewing!\x1b[0m`);
});
