import app from './server';
import { getLocalIp } from './utils/network';
const PORT = process.env.PORT || 3000;
const IP = getLocalIp();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\x1b[32m✅ Proxy server running at:\x1b[0m`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${IP}:${PORT}`);
  console.log(`\x1b[34mℹ️ Forwarding /anki to http://localhost:8765\x1b[0m`);
});
