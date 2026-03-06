# Mobile Experience & Reliability Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve mobile reliability (persistence, proxy fixes) and UX (analysis alerts, voice-text cleaning).

**Architecture:** 
- **Persistence**: `localStorage` in `cardStore.ts`.
- **Alerts**: `watch` in `cardStore.ts` to trigger `Audio` and UI state.
- **Voice Cleaning**: New LLM prompt mode and UI button in `StudyPane.vue`.
- **Proxy**: Strict header whitelist in `proxy/index.ts`.

**Tech Stack:** Vue 3, Pinia, Hono, Browser Speech/Audio APIs.

---

### Task 1: Fix Proxy 403 for Mobile

**Files:**
- Modify: `proxy/index.ts`

**Step 1: Implement strict header forwarding**

Modify `proxy/index.ts` to only forward `Content-Type` and impersonate `localhost`.

```typescript
// proxy/index.ts
app.all('/anki/*', async (c) => {
  const subpath = c.req.path.replace(/^\/anki\/?/, '');
  const targetUrl = `http://127.0.0.1:8765/${subpath}`;
  
  // CLEAN-ROOM HEADERS
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
```

**Step 2: Commit**

```bash
git add proxy/index.ts
git commit -m "fix(proxy): implement strict header forwarding for mobile support"
```

---

### Task 2: Session Persistence

**Files:**
- Modify: `src/stores/cardStore.ts`

**Step 1: Add persistence logic to cardStore**

```typescript
// src/stores/cardStore.ts
const STORAGE_KEY_STATE = 'ankiStudy:sessionState';

function saveSession(queue: Card[], history: ProcessedCard[]) {
  localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify({ queue, history }));
}

function loadSession(): { queue: Card[], history: ProcessedCard[] } | null {
  const data = localStorage.getItem(STORAGE_KEY_STATE);
  return data ? JSON.parse(data) : null;
}

// Inside useCardStore:
const saved = loadSession();
const cardQueue = ref<Card[]>(saved?.queue ?? []);
const processedCards = ref<ProcessedCard[]>(saved?.history ?? []);

watch([cardQueue, processedCards], () => {
  saveSession(cardQueue.value, processedCards.value);
}, { deep: true });
```

**Step 2: Commit**

```bash
git add src/stores/cardStore.ts
git commit -m "feat(store): add session persistence via localStorage"
```

---

### Task 3: Analysis Completion Alerts (Audio + Visual)

**Files:**
- Modify: `src/stores/cardStore.ts`
- Modify: `src/components/SessionHistory.vue`
- Create: `public/audio/complete.mp3` (Placeholder or silent)

**Step 1: Trigger audio on analysis success**

```typescript
// src/stores/cardStore.ts
const playAlert = () => {
  const audio = new Audio('/audio/complete.mp3');
  audio.play().catch(() => {}); // Ignore autoplay blocks
};

// Inside submitReview success block:
if (entry) {
  entry.status = 'success';
  playAlert();
}
```

**Step 2: Commit**

```bash
git add src/stores/cardStore.ts
git commit -m "feat(alerts): play audio on analysis completion"
```

---

### Task 4: Voice-Text Cleaning Logic

**Files:**
- Modify: `src/stores/llm/promptTemplates.ts`
- Modify: `src/stores/llm/llmStore.ts`

**Step 1: Add 'clean' prompt template**

```typescript
// src/stores/llm/promptTemplates.ts
{
  id: 'clean',
  name: 'Text Cleaner',
  systemPrompt: 'You are a text formatter. The user will provide a messy voice transcript. Fix punctuation, grammar, and formatting while preserving the original meaning and terminology. Return ONLY the cleaned text.',
}
```

**Step 2: Add cleanText method to llmStore**

```typescript
// src/stores/llm/llmStore.ts
async function cleanText(text: string): Promise<string> {
  const tmpl = PROMPT_TEMPLATES.find(t => t.id === 'clean')!;
  const p = provider.value;
  const m = model.value;
  const baseUrl = customBaseUrl.value.trim() || p.baseUrl;

  let raw: string;
  const userMsg = `Clean this voice transcript:\n\n${text}`;

  if (p.id === 'anthropic') {
    raw = await callAnthropic({ baseUrl, apiKey: apiKey.value, model: m, template: tmpl, userMessage: userMsg });
  } else if (p.id === 'google') {
    raw = await callGoogle({ baseUrl, apiKey: apiKey.value, model: m, template: tmpl, userMessage: userMsg });
  } else {
    raw = await callOpenAICompat({ baseUrl, apiKey: apiKey.value, model: m, template: tmpl, userMessage: userMsg, providerId: p.id, requiresKey: p.requiresKey });
  }
  return raw.trim();
}
```

**Step 3: Commit**

```bash
git add src/stores/llm/promptTemplates.ts src/stores/llm/llmStore.ts
git commit -m "feat(llm): add voice-text cleaning capability"
```

---

### Task 5: Voice-Text Cleaning UI (Fast Replace + Undo)

**Files:**
- Modify: `src/components/StudyPane.vue`

**Step 1: Implement Clean button and Undo logic**

```typescript
// src/components/StudyPane.vue
const isCleaning = ref(false)
const originalText = ref('')
const showUndo = ref(false)

async function cleanEditorText() {
  if (editorIsEmpty.value) return
  isCleaning.value = true
  originalText.value = editorContent.value
  
  try {
    const llm = useLLMStore()
    const cleaned = await llm.cleanText(editorContent.value.replace(/<[^>]*>/g, ''))
    editorContent.value = `<p>${cleaned}</p>`
    showUndo.value = true
    setTimeout(() => { showUndo.value = false }, 8000)
  } finally {
    isCleaning.value = false
  }
}

function undoClean() {
  editorContent.value = originalText.value
  showUndo.value = false
}
```

**Step 2: Add button to template**

```html
<!-- Near the Analyze button -->
<button v-if="!showUndo" @click="cleanEditorText" :disabled="isCleaning" class="...">
  {{ isCleaning ? 'Cleaning...' : 'Clean Voice Text' }}
</button>
<button v-else @click="undoClean" class="...">
  Undo Clean
</button>
```

**Step 3: Commit**

```bash
git add src/components/StudyPane.vue
git commit -m "feat(ui): add voice cleaning button with undo"
```
