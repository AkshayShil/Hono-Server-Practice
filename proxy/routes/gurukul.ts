import { Hono } from 'hono';
import { db } from '../utils/gurukulDb';
import { upsertFileVector, searchRelevantFiles } from '../utils/lancedb';

export const gurukulRouter = new Hono();

// ── Sessions ────────────────────────────────────────────────────────────────

// Create new session
gurukulRouter.post('/sessions', async (c) => {
  try {
    const { id, filePath, sectionTitle, sectionContent, providerId, modelId } = await c.req.json();
    
    db.prepare(`
      INSERT INTO gurukul_sessions (id, file_path, section_title, section_content, provider_id, model_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, filePath, sectionTitle, sectionContent, providerId, modelId);
    
    return c.json({ status: 'ok', id });
  } catch (err) {
    console.error('[Gurukul API] Failed to create session:', err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

// List sessions for a file
gurukulRouter.get('/sessions', (c) => {
  const filePath = c.req.query('filePath');
  const limit = parseInt(c.req.query('limit') || '20', 10);
  
  let sessions;
  if (filePath) {
    sessions = db.prepare(`
      SELECT * FROM gurukul_sessions 
      WHERE file_path = ? 
      ORDER BY started_at DESC 
      LIMIT ?
    `).all(filePath, limit);
  } else {
    sessions = db.prepare(`
      SELECT * FROM gurukul_sessions 
      ORDER BY started_at DESC 
      LIMIT ?
    `).all(limit);
  }
  
  return c.json({ sessions });
});

// ── Messages ────────────────────────────────────────────────────────────────

// Save a message
gurukulRouter.post('/sessions/:id/messages', async (c) => {
  const sessionId = c.req.param('id');
  try {
    const { role, content } = await c.req.json();
    
    // Insert message
    db.prepare(`
      INSERT INTO gurukul_messages (session_id, role, content)
      VALUES (?, ?, ?)
    `).run(sessionId, role, content);
    
    // Increment message count
    db.prepare(`
      UPDATE gurukul_sessions 
      SET message_count = message_count + 1 
      WHERE id = ?
    `).run(sessionId);
    
    return c.json({ status: 'ok' });
  } catch (err) {
    console.error('[Gurukul API] Failed to save message:', err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

// Load full transcript
gurukulRouter.get('/sessions/:id/messages', (c) => {
  const sessionId = c.req.param('id');
  const messages = db.prepare(`
    SELECT * FROM gurukul_messages 
    WHERE session_id = ? 
    ORDER BY created_at ASC
  `).all(sessionId);
  
  return c.json({ messages });
});

// ── Session End & Summary ───────────────────────────────────────────────────

// Close session and store summary
gurukulRouter.put('/sessions/:id/end', async (c) => {
  const sessionId = c.req.param('id');
  try {
    const { autoSummary } = await c.req.json();
    
    db.prepare(`
      UPDATE gurukul_sessions 
      SET ended_at = CURRENT_TIMESTAMP, auto_summary = ? 
      WHERE id = ?
    `).run(autoSummary, sessionId);
    
    // Get file_path for this session
    const session = db.prepare('SELECT file_path FROM gurukul_sessions WHERE id = ?').get(sessionId) as { file_path: string };
    
    if (session && autoSummary) {
      // Fetch last 5 summaries for this file to build combined summary
      const pastSessions = db.prepare(`
        SELECT auto_summary FROM gurukul_sessions 
        WHERE file_path = ? AND auto_summary IS NOT NULL AND auto_summary != "" 
        ORDER BY started_at DESC 
        LIMIT 5
      `).all(session.file_path) as { auto_summary: string }[];
      
      const combinedSummary = pastSessions.map(s => s.auto_summary).join('\n---\n');
      const totalSessions = db.prepare('SELECT COUNT(*) as count FROM gurukul_sessions WHERE file_path = ?').get(session.file_path) as { count: number };
      
      // Upsert into LanceDB (async, don't block)
      void upsertFileVector(session.file_path, combinedSummary, totalSessions.count).catch(e => console.warn('[Gurukul API] LanceDB upsert failed:', e));
    }
    
    return c.json({ status: 'ok' });
  } catch (err) {
    console.error('[Gurukul API] Failed to end session:', err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ── Assessment ──────────────────────────────────────────────────────────────

// Run cross-session LLM assessment
gurukulRouter.post('/assess', async (c) => {
  try {
    const { filePath, provider, model, customBaseUrl } = await c.req.json();
    
    let summaries: string[] = [];
    
    if (filePath) {
      // Scope to one file
      const sessions = db.prepare(`
        SELECT auto_summary FROM gurukul_sessions 
        WHERE file_path = ? AND auto_summary IS NOT NULL AND auto_summary != "" 
        ORDER BY started_at DESC 
        LIMIT 15
      `).all(filePath) as { auto_summary: string }[];
      summaries = sessions.map(s => s.auto_summary);
    } else {
      // All topics
      const sessions = db.prepare(`
        SELECT auto_summary FROM gurukul_sessions 
        WHERE auto_summary IS NOT NULL AND auto_summary != "" 
        ORDER BY started_at DESC 
        LIMIT 15
      `).all() as { auto_summary: string }[];
      summaries = sessions.map(s => s.auto_summary);
    }
    
    if (summaries.length === 0) {
      return c.json({ text: "No learning history found to assess. Complete a few sessions first!" });
    }

    const assessmentPrompt = `
You are reviewing a student's recent Gurukul learning sessions.
Below are session summaries (most recent first).

[SUMMARIES]
${summaries.join('\n---\n')}
[/SUMMARIES]

Identify:
1. Recurring weaknesses (topics they consistently struggle with)
2. Topics they have clearly improved on across sessions
3. One concrete recommendation for their next session

Under 200 words. Plain numbered list.`.trim();

    // Call LLM for assessment
    const res = await fetch(`${c.req.url.split('/api')[0]}/api/llm/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        model,
        template: { systemPrompt: 'You are an expert pedagogical assessor.' },
        userMessage: assessmentPrompt,
        customBaseUrl
      })
    });

    const data = await res.json();
    return c.json({ text: data.text });
  } catch (err) {
    console.error('[Gurukul API] Assessment failed:', err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

