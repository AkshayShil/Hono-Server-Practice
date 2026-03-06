# Express Proxy Middleman Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a modular Express.js proxy server to allow network devices to access Anki-Connect.

**Architecture:** A standalone Express server that uses `http-proxy-middleware` to forward requests to Anki-Connect (`localhost:8765`). The frontend will be updated to point to this proxy, which listens on all network interfaces (`0.0.0.0`).

**Tech Stack:** Express, http-proxy-middleware, cors, tsx (for running TS), pnpm.

---

### Task 1: Project Setup & Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install dependencies**
Run: `pnpm add express http-proxy-middleware cors`
Run: `pnpm add -D @types/express @types/cors tsx`

**Step 2: Add start script**
Modify `package.json` to include `"proxy": "tsx proxy/index.ts"`.

**Step 3: Commit**
```bash
git add package.json
git commit -m "chore: add proxy dependencies and script"
```

---

### Task 2: Modular Proxy Implementation

**Files:**
- Create: `proxy/utils/network.ts`
- Create: `proxy/routes/ankiProxy.ts`
- Create: `proxy/server.ts`
- Create: `proxy/index.ts`

**Step 1: Implement Network Utility**
Create `proxy/utils/network.ts` to get the local IP address.
```typescript
import os from 'os';

export function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}
```

**Step 2: Implement Proxy Route**
Create `proxy/routes/ankiProxy.ts` using `http-proxy-middleware`.
```typescript
import { createProxyMiddleware } from 'http-proxy-middleware';

export const ankiProxy = createProxyMiddleware({
  target: 'http://localhost:8765',
  changeOrigin: true,
  pathRewrite: {
    '^/anki': '', // remove /anki prefix when forwarding
  },
});
```

**Step 3: Setup Express Server**
Create `proxy/server.ts` to configure middleware and routes.
```typescript
import express from 'express';
import cors from 'cors';
import { ankiProxy } from './routes/ankiProxy';

const app = express();

app.use(cors());
app.use('/anki', ankiProxy);

export default app;
```

**Step 4: Create Entry Point**
Create `proxy/index.ts`.
```typescript
import app from './server';
import { getLocalIp } from './utils/network';

const PORT = process.env.PORT || 3000;
const IP = getLocalIp();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\x1b[32mâœ… Proxy server running at:\x1b[0m`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${IP}:${PORT}`);
  console.log(`\x1b[34mâ„¹ï¸ Forwarding /anki to http://localhost:8765\x1b[0m`);
});
```

**Step 5: Verify & Commit**
Run: `pnpm proxy` (manual check)
```bash
git add proxy/
git commit -m "feat: implement modular express proxy"
```

---

### Task 3: Update Frontend Store

**Files:**
- Modify: `src/stores/cardStore.ts`

**Step 1: Dynamic API URL**
Update `src/stores/cardStore.ts` to use a dynamic URL based on the current hostname.
```typescript
// Replace: const ANKI_CONNECT_URL = 'http://localhost:8765';
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const PROXY_PORT = 3000;
const ANKI_CONNECT_URL = isLocal 
  ? `http://localhost:${PROXY_PORT}/anki` 
  : `http://${window.location.hostname}:${PROXY_PORT}/anki`;
```

**Step 2: Commit**
```bash
git add src/stores/cardStore.ts
git commit -m "feat: update cardStore to use proxy URL"
```
