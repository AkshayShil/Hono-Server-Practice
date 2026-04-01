import { Hono } from 'hono';

const INFERENCE_DEFAULTS = {
  maxTokens: 1000,
  temperature: 0.3,
  topP: 1,
} as const;

export const llmProxy = new Hono();

// ── Shared Helpers ──────────────────────────────────────────────────────────

async function callAnthropic(params: any) {
  const { baseUrl, apiKey, model, template, userMessage } = params;
  const res = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model.id,
      max_tokens: INFERENCE_DEFAULTS.maxTokens,
      temperature: INFERENCE_DEFAULTS.temperature,
      // Omit top_p: Anthropic newer models (like Haiku 4.5) reject calls if both are set.
      system: template.systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  const data = await res.json() as any;
  const text = data.content?.find((b: any) => b.type === 'text')?.text;
  return typeof text === 'string' ? text : '';
}

async function callGoogle(params: any) {
  const { baseUrl, apiKey, model, template, userMessage } = params;
  const url = `${baseUrl}/models/${model.id}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: template.systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: {
        maxOutputTokens: INFERENCE_DEFAULTS.maxTokens,
        temperature: INFERENCE_DEFAULTS.temperature,
        topP: INFERENCE_DEFAULTS.topP,
      },
    }),
  });
  if (!res.ok) throw new Error(`Google error ${res.status}: ${await res.text()}`);
  const data = await res.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === 'string' ? text : '';
}

async function callOpenAI(params: any) {
  const { baseUrl, apiKey, model, template, userMessage } = params;
  
  // 2026 Responses API (/v1/responses)
  const res = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model.id,
      input: [
        { 
          role: 'developer', 
          content: template.systemPrompt + "\n\nIMPORTANT: All your feedback must be formatted using valid Markdown." 
        },
        { role: 'user', content: userMessage },
      ],
      store: true
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  
  const data = await res.json() as any;
  
  // 2026 Responses API: Extract text from output[i].content[j].text
  let text = '';
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === 'message' && Array.isArray(item.content)) {
        const textPart = item.content.find((c: any) => c.type === 'output_text');
        if (textPart?.text) {
          text = textPart.text;
          break;
        }
      }
    }
  }

  // Fallbacks for legacy formats or direct output objects
  text = text || 
         data.output?.[0]?.text || 
         data.output?.[0]?.message?.content || 
         data.choices?.[0]?.message?.content || 
         '';
  
  return typeof text === 'string' ? text : String(text);
}

async function callOpenAICompat(params: any) {
  const { baseUrl, apiKey, model, template, userMessage, providerId, requiresKey } = params;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey && requiresKey) headers['Authorization'] = `Bearer ${apiKey}`;
  
  const tokenParam = model.tokenParam ?? 'max_tokens';
  const samplingParams = model.fixedSampling
    ? {}
    : { temperature: INFERENCE_DEFAULTS.temperature, top_p: INFERENCE_DEFAULTS.topP };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model.id,
      [tokenParam]: INFERENCE_DEFAULTS.maxTokens,
      ...samplingParams,
      messages: [
        { role: 'system', content: template.systemPrompt },
        { role: 'user',   content: userMessage },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${providerId} error ${res.status}: ${await res.text()}`);
  const data = await res.json() as any;
  const text = data.choices?.[0]?.message?.content;
  return typeof text === 'string' ? text : '';
}

// ── Main Route ──────────────────────────────────────────────────────────────

llmProxy.post('/call', async (c) => {
  try {
    const { provider, model, template, userMessage, customBaseUrl } = await c.req.json();
    
    const ENV_KEYS: Record<string, string | undefined> = {
      openai:     process.env.OPENAI_API_KEY,
      anthropic:  process.env.ANTHROPIC_API_KEY,
      google:     process.env.GOOGLE_API_KEY,
      openrouter: process.env.OPENROUTER_API_KEY,
      deepseek:   process.env.DEEPSEEK_API_KEY,
      ollama:     process.env.OLLAMA_API_KEY,
    };

    const apiKey = ENV_KEYS[provider.id] || '';
    const baseUrl = customBaseUrl?.trim() || provider.baseUrl;

    if (provider.requiresKey && !apiKey) {
      return c.json({ error: `No API key found on server for ${provider.label}` }, 400);
    }

    let result: string;
    const params = { baseUrl, apiKey, model, template, userMessage };

    if (provider.id === 'openai') {
      result = await callOpenAI(params);
    } else if (provider.id === 'anthropic') {
      result = await callAnthropic(params);
    } else if (provider.id === 'google') {
      result = await callGoogle(params);
    } else {
      result = await callOpenAICompat({ ...params, providerId: provider.id, requiresKey: provider.requiresKey });
    }

    return c.json({ text: result });
  } catch (err: any) {
    console.error('[LLM Proxy] Call failed:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Helper for the UI to know which providers have keys on the server
llmProxy.get('/status', (c) => {
  const providers = [
    { id: 'openai',     hasKey: !!process.env.OPENAI_API_KEY },
    { id: 'anthropic',  hasKey: !!process.env.ANTHROPIC_API_KEY },
    { id: 'google',     hasKey: !!process.env.GOOGLE_API_KEY },
    { id: 'openrouter', hasKey: !!process.env.OPENROUTER_API_KEY },
    { id: 'deepseek',   hasKey: !!process.env.DEEPSEEK_API_KEY },
    { id: 'ollama',     hasKey: true }, // Local
  ];
  return c.json({ providers });
});
