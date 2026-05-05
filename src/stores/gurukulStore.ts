import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { generateUUID } from '@/utils/uuid'
import { useLLMStore, PROVIDERS } from './llm'

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface NoteFile {
  name: string
  path: string
  content: string
  handle?: FileSystemFileHandle
  fileRef?: File
}

export interface NoteSection {
  level: number
  title: string
  content: string
  startLine: number
}

// ---------------------------------------------------------------------------
// IndexedDB helpers — persist FileSystemDirectoryHandle across page loads
// ---------------------------------------------------------------------------
async function saveHandleToIDB(handle: FileSystemDirectoryHandle): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('gurukul-fs', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('handles')
    req.onsuccess = () => {
      const tx = req.result.transaction('handles', 'readwrite')
      tx.objectStore('handles').put(handle, 'folder')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    }
    req.onerror = () => reject(req.error)
  })
}

async function getHandleFromIDB(): Promise<FileSystemDirectoryHandle | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open('gurukul-fs', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('handles')
    req.onsuccess = () => {
      const tx = req.result.transaction('handles', 'readonly')
      const get = tx.objectStore('handles').get('folder')
      get.onsuccess = () => resolve((get.result as FileSystemDirectoryHandle) ?? null)
      get.onerror = () => resolve(null)
    }
    req.onerror = () => resolve(null)
  })
}

export const useGurukulStore = defineStore('gurukulStore', () => {
  const files = ref<NoteFile[]>([])
  const selectedFile = ref<NoteFile | null>(null)
  const activeSection = ref<NoteSection | null>(null)
  const messages = ref<ChatMessage[]>([])
  const isThinking = ref(false)
  const error = ref<string | null>(null)
  const sessionStarted = ref(false)
  const currentSessionId = ref<string | null>(localStorage.getItem('gurukul:activeSessionId'))

  const allowAssessment = ref(localStorage.getItem('gurukul:allowAssessment') === 'true')
  const assessmentResult = ref<string | null>(null)
  const isAssessing = ref(false)
  const pastSessionsForFile = ref<any[]>([])
  const pendingResume = ref<{ sessionId: string; sectionTitle: string | null; filePath: string } | null>(null)

  // ── Folder persistence ────────────────────────────────────────────────────
  const hasSavedFolder = ref(false)
  const savedFolderName = ref<string | null>(null)

  // ── Permanent discussion history (pink dot across sessions) ─────────────
  const discussedFiles = ref<string[]>(
    JSON.parse(localStorage.getItem('gurukul:discussed') ?? '[]')
  )

  function persistDiscussed() {
    localStorage.setItem('gurukul:discussed', JSON.stringify(discussedFiles.value))
  }

  // ── Macro session (named study session spanning multiple notes) ───────────
  const macroSessionId   = ref<string | null>(localStorage.getItem('gurukul:macroSessionId'))
  const macroSessionName = ref<string | null>(localStorage.getItem('gurukul:macroSessionName'))
  // File paths studied (chat session completed) in the current macro session
  const macroSessionStudied = ref<string[]>([])

  const macroSessionActive = computed(() => !!macroSessionId.value)

  async function startMacroSession(name: string) {
    const id = generateUUID()
    try {
      await fetch('/api/gurukul/macro-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      })
      macroSessionId.value = id
      macroSessionName.value = name
      macroSessionStudied.value = []
      localStorage.setItem('gurukul:macroSessionId', id)
      localStorage.setItem('gurukul:macroSessionName', name)
    } catch (err) {
      error.value = 'Failed to start session: ' + (err as Error).message
    }
  }

  async function endMacroSession() {
    if (!macroSessionId.value) return
    try {
      await fetch(`/api/gurukul/macro-sessions/${macroSessionId.value}/end`, { method: 'PUT' })
    } catch (err) {
      console.warn('[Gurukul Store] Failed to end macro session:', err)
    }
    macroSessionId.value = null
    macroSessionName.value = null
    macroSessionStudied.value = []
    localStorage.removeItem('gurukul:macroSessionId')
    localStorage.removeItem('gurukul:macroSessionName')
  }

  async function initMacroSessionRestore() {
    const savedId = localStorage.getItem('gurukul:macroSessionId')
    if (!savedId) return
    try {
      const res = await fetch('/api/gurukul/macro-sessions/active')
      const data = await res.json() as { session: { id: string; name: string } | null; notes: { file_path: string }[] }
      if (data.session && data.session.id === savedId) {
        macroSessionId.value = data.session.id
        macroSessionName.value = data.session.name
        macroSessionStudied.value = data.notes.map(n => n.file_path)
      } else {
        // Session ended or missing — clear stale state
        localStorage.removeItem('gurukul:macroSessionId')
        localStorage.removeItem('gurukul:macroSessionName')
        macroSessionId.value = null
        macroSessionName.value = null
      }
    } catch { /* silently ignore, server may not be running */ }
  }

  // Manually mark/unmark a file as studied in the active session
  function markFileStudied(path: string) {
    if (!macroSessionId.value) return
    if (!macroSessionStudied.value.includes(path)) {
      macroSessionStudied.value = [...macroSessionStudied.value, path]
      void fetch(`/api/gurukul/macro-sessions/${macroSessionId.value}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: path }),
      }).catch(e => console.warn('[Gurukul Store] Failed to record macro note:', e))
    }
  }

  function unmarkFileStudied(path: string) {
    macroSessionStudied.value = macroSessionStudied.value.filter(p => p !== path)
    if (macroSessionId.value) {
      void fetch(`/api/gurukul/macro-sessions/${macroSessionId.value}/notes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: path }),
      }).catch(e => console.warn('[Gurukul Store] Failed to unmark note:', e))
    }
  }

  // ── Selection persistence ─────────────────────────────────────────────────
  watch(selectedFile, (f) => {
    if (f) localStorage.setItem('gurukul:selectedFilePath', f.path)
    else localStorage.removeItem('gurukul:selectedFilePath')
  })
  watch(activeSection, (s) => {
    if (s) localStorage.setItem('gurukul:activeSectionTitle', s.title)
    else localStorage.removeItem('gurukul:activeSectionTitle')
  })

  async function restoreSelection() {
    const savedPath = localStorage.getItem('gurukul:selectedFilePath')
    const savedSection = localStorage.getItem('gurukul:activeSectionTitle')
    if (!savedPath) return
    const file = files.value.find(f => f.path === savedPath)
    if (!file) return
    try {
      await selectFile(file)
      if (savedSection) {
        const sec = sections.value.find(s => s.title === savedSection)
        if (sec) activeSection.value = sec
      }
    } catch (err) {
      console.warn('[Gurukul Store] Failed to restore selection:', err)
      selectedFile.value = null
      activeSection.value = null
    }
  }

  // ── Reader collapse (purely manual — student controls this) ──────────────
  const readerCollapsed = ref(false)

  // ── Gurukul-specific provider / model ─────────────────────────────────────
  const gurukulProviderId = ref<string>(localStorage.getItem('gurukul:providerId') ?? 'google')
  const gurukulModelId    = ref<string>(localStorage.getItem('gurukul:modelId')    ?? '')

  const gurukulProvider = computed(() =>
    PROVIDERS.find(p => p.id === gurukulProviderId.value) ?? PROVIDERS[0]!
  )
  const gurukulModel = computed(() =>
    gurukulProvider.value.models.find(m => m.id === gurukulModelId.value) ?? gurukulProvider.value.models[0]!
  )

  function setGurukulProvider(id: string) {
    gurukulProviderId.value = id
    gurukulModelId.value = PROVIDERS.find(p => p.id === id)?.models[0]?.id ?? ''
    localStorage.setItem('gurukul:providerId', id)
    localStorage.setItem('gurukul:modelId', gurukulModelId.value)
  }
  function setGurukulModel(id: string) {
    gurukulModelId.value = id
    localStorage.setItem('gurukul:modelId', id)
  }

  watch(allowAssessment, (val) => localStorage.setItem('gurukul:allowAssessment', String(val)))

  // Token Optimization: History compression
  const compressedMessages = computed(() => {
    if (messages.value.length <= 8) return messages.value
    const recent = messages.value.slice(-4)
    const older = messages.value.slice(0, -4)
    const summary = older
      .map(m => `${m.role === 'user' ? 'Student' : 'Guru'}: ${m.content.replace(/\n+/g, ' ').slice(0, 120)}`)
      .join('\n')
    return [
      { role: 'user' as const, content: `[Earlier discussion]\n${summary}` },
      { role: 'assistant' as const, content: 'Understood. Continuing.' },
      ...recent,
    ]
  })

  // Markdown parsing
  const sections = computed<NoteSection[]>(() => {
    if (!selectedFile.value?.content) return []
    const lines = selectedFile.value.content.split('\n')
    const result: NoteSection[] = []
    let currentSection: NoteSection | null = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      const atxMatch = line.match(/^(#{1,3})\s+(.+)$/)
      if (atxMatch) {
        if (currentSection) result.push(currentSection)
        currentSection = { level: (atxMatch[1] ?? '').length, title: (atxMatch[2] ?? '').trim(), content: '', startLine: i }
        continue
      }
      const prevLine = lines[i - 1] ?? ''
      if (i > 0 && /^[=\-]{3,}$/.test(line) && prevLine.trim()) {
        if (currentSection) {
          const cl = currentSection.content.trimEnd().split('\n')
          cl.pop()
          currentSection.content = cl.join('\n')
          result.push(currentSection)
        }
        currentSection = { level: line.startsWith('=') ? 1 : 2, title: prevLine.trim(), content: '', startLine: i - 1 }
        continue
      }
      if (currentSection) {
        currentSection.content += line + '\n'
      } else {
        currentSection = { level: 0, title: 'Introduction', content: line + '\n', startLine: 0 }
      }
    }
    if (currentSection) result.push(currentSection)
    return result.filter(s => s.content.trim().length >= 20 || s.title.length > 0)
  })

  async function openFolder() {
    try {
      if (!('showDirectoryPicker' in window)) throw new Error('FSA API not supported')
      const handle = await (window as any).showDirectoryPicker()
      files.value = []
      await readDirectory(handle, '')
      savedFolderName.value = handle.name
      hasSavedFolder.value = true
      await saveHandleToIDB(handle)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      error.value = (err as Error).message
    }
  }

  async function initFolderRestore() {
    if (!('showDirectoryPicker' in window)) return
    const handle = await getHandleFromIDB()
    if (!handle) return
    hasSavedFolder.value = true
    savedFolderName.value = handle.name
    try {
      const perm = await (handle as any).queryPermission({ mode: 'read' })
      if (perm === 'granted') {
        files.value = []
        await readDirectory(handle, '')
        await restoreSelection()
      }
    } catch { /* permission lapsed — show Reopen button */ }
  }

  async function restoreFolder() {
    if (!('showDirectoryPicker' in window)) return
    const handle = await getHandleFromIDB()
    if (!handle) return
    try {
      const perm = await (handle as any).requestPermission({ mode: 'read' })
      if (perm === 'granted') {
        files.value = []
        await readDirectory(handle, '')
        await restoreSelection()
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      error.value = (err as Error).message
    }
  }

  async function readDirectory(handle: FileSystemDirectoryHandle, path: string) {
    for await (const entry of (handle as any).values()) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name
      if (entry.kind === 'file') {
        if (entry.name.endsWith('.md') || entry.name.endsWith('.txt')) {
          files.value.push({ name: entry.name, path: entryPath, content: '', handle: entry })
        }
      } else if (entry.kind === 'directory') {
        await readDirectory(entry, entryPath)
      }
    }
  }

  function loadFilesFromInput(fileList: FileList) {
    files.value = []
    Array.from(fileList).forEach(file => {
      if (file.name.endsWith('.md') || file.name.endsWith('.txt')) {
        const path = (file as any).webkitRelativePath || file.name
        files.value.push({ name: file.name, path, content: '', fileRef: file })
      }
    })
  }

  async function selectFile(file: NoteFile) {
    if (sessionStarted.value) await endSession()
    selectedFile.value = file
    activeSection.value = null
    resetSession()
    if (!file.content) {
      try {
        if (file.handle) {
          const f = await file.handle.getFile()
          file.content = await f.text()
        } else if (file.fileRef) {
          file.content = await file.fileRef.text()
        }
      } catch (err) {
        error.value = 'Could not read file: ' + (err as Error).message
      }
    }
  }

  async function selectSection(section: NoteSection) {
    if (sessionStarted.value) await endSession()
    activeSection.value = section
    resetSession()
  }

  async function startSession() {
    if (!activeSection.value || !selectedFile.value) return
    const llm = useLLMStore()
    const id = generateUUID()
    currentSessionId.value = id
    localStorage.setItem('gurukul:activeSessionId', id)
    try {
      await fetch('/api/gurukul/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          filePath: selectedFile.value.path,
          sectionTitle: activeSection.value.title,
          sectionContent: activeSection.value.content.slice(0, 500),
          providerId: llm.provider.id,
          modelId: llm.model.id,
        })
      })
      sessionStarted.value = true
      error.value = null
      await sendMessage('Begin.', true)
    } catch (err) {
      error.value = 'Failed to start session: ' + (err as Error).message
    }
  }

  async function persistMessage(role: ChatRole, content: string) {
    if (!currentSessionId.value) return
    try {
      await fetch(`/api/gurukul/sessions/${currentSessionId.value}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content })
      })
    } catch (err) {
      console.warn('[Gurukul Store] Failed to persist message:', err)
    }
  }

  function buildSystemPrompt() {
    return `You are a Guru in a Gurukul. You adapt your teaching to the student's needs each turn.

TEACHING TOOLS — pick the best one each turn:
• QUESTION (default): Ask ONE focused Socratic question. Escalate: recall → understanding → application.
• MNEMONIC: When the student has struggled with a fact 2+ times, or explicitly asks — create a vivid mnemonic (acronym, story, analogy, or rhyme) using only the notes, then ask if it helped.
• EXPLAIN: When the student is clearly confused or asks for an explanation — explain in ≤ 5 plain sentences, then ask a follow-up question.
• AFFIRM: One sentence acknowledging a correct answer, then continue.

RULES:
- One question per turn. All responses under 150 words.
- Stay strictly within the notes. Never add outside knowledge.
- After MNEMONIC or EXPLAIN, always end with a question to test understanding.

[NOTES]
${activeSection.value!.content.slice(0, 4000)}
[/NOTES]

Begin by asking your first question.`.trim()
  }

  async function callGuruAPI(msgs: ChatMessage[]): Promise<string> {
    const response = await fetch('/api/llm/gurukul', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: gurukulProvider.value,
        model: gurukulModel.value,
        systemPrompt: buildSystemPrompt(),
        messages: msgs,
      })
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as Record<string, string>
      throw new Error(data.error || `Server error ${response.status}`)
    }
    const data = await response.json() as Record<string, string>
    return data.content ?? ''
  }

  const canRetry = computed(() => error.value !== null && sessionStarted.value)

  async function retryLastMessage() {
    if (!activeSection.value) return
    isThinking.value = true
    error.value = null
    try {
      const msgs = messages.value.length === 0
        ? [{ role: 'user' as const, content: 'Begin.' }]
        : compressedMessages.value
      const content = await callGuruAPI(msgs)
      messages.value.push({ role: 'assistant', content })
      void persistMessage('assistant', content)
    } catch (err) {
      error.value = (err as Error).message
    } finally {
      isThinking.value = false
    }
  }

  async function sendMessage(text: string, isTrigger = false) {
    if (!activeSection.value) return
    if (!isTrigger) {
      messages.value.push({ role: 'user', content: text })
      void persistMessage('user', text)
    }
    isThinking.value = true
    error.value = null
    try {
      const msgs = isTrigger ? [{ role: 'user' as const, content: 'Begin.' }] : compressedMessages.value
      const content = await callGuruAPI(msgs)
      messages.value.push({ role: 'assistant', content })
      void persistMessage('assistant', content)
    } catch (err) {
      error.value = (err as Error).message
    } finally {
      isThinking.value = false
    }
  }

  async function endSession() {
    if (!currentSessionId.value) return

    // Auto-mark file as discussed (permanent history)
    if (selectedFile.value && !discussedFiles.value.includes(selectedFile.value.path)) {
      discussedFiles.value = [...discussedFiles.value, selectedFile.value.path]
      persistDiscussed()
    }

    // Record in active macro session
    if (macroSessionId.value && selectedFile.value) {
      const fp = selectedFile.value.path
      if (!macroSessionStudied.value.includes(fp)) {
        macroSessionStudied.value = [...macroSessionStudied.value, fp]
        void fetch(`/api/gurukul/macro-sessions/${macroSessionId.value}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: fp }),
        }).catch(e => console.warn('[Gurukul Store] Failed to record macro note:', e))
      }
    }

    let autoSummary = ''
    if (messages.value.length >= 4) {
      try {
        const llm = useLLMStore()
        const history = messages.value.slice(-10)
          .map(m => `${m.role === 'user' ? 'Student' : 'Guru'}: ${m.content}`).join('\n')
        const summaryPrompt = `Summarize this teaching session in under 80 words. Focus on: topics covered, where the student showed confusion or errors, what they understood well. Plain text only, no headers or bullets.\n\nSession:\n${history}`
        const res = await fetch('/api/llm/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: llm.provider,
            model: llm.model,
            template: { systemPrompt: 'You are a helpful education assistant.' },
            userMessage: summaryPrompt
          })
        })
        const data = await res.json()
        autoSummary = data.text || ''
      } catch (err) {
        console.warn('[Gurukul Store] Failed to generate summary:', err)
      }
    }

    try {
      await fetch(`/api/gurukul/sessions/${currentSessionId.value}/end`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoSummary })
      })
    } catch (err) {
      console.warn('[Gurukul Store] Failed to end session on server:', err)
    }

    currentSessionId.value = null
    localStorage.removeItem('gurukul:activeSessionId')
    resetSession()
  }

  function resetSession() {
    messages.value = []
    sessionStarted.value = false
    error.value = null
  }

  async function assessProgress(filePath?: string) {
    const llm = useLLMStore()
    isAssessing.value = true
    assessmentResult.value = null
    try {
      const res = await fetch('/api/gurukul/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, provider: llm.provider, model: llm.model, customBaseUrl: llm.customBaseUrl })
      })
      const data = await res.json()
      assessmentResult.value = data.text || 'No assessment generated.'
    } catch (err) {
      assessmentResult.value = 'Assessment failed: ' + (err as Error).message
    } finally {
      isAssessing.value = false
    }
  }

  async function initResumeCheck() {
    const savedId = localStorage.getItem('gurukul:activeSessionId')
    if (!savedId) return
    try {
      const res = await fetch(`/api/gurukul/sessions?limit=50`)
      const data = await res.json()
      const session = (data.sessions as any[]).find((s: any) => s.id === savedId && !s.ended_at)
      if (session) {
        pendingResume.value = { sessionId: savedId, sectionTitle: session.section_title, filePath: session.file_path }
      } else {
        localStorage.removeItem('gurukul:activeSessionId')
        currentSessionId.value = null
      }
    } catch {
      localStorage.removeItem('gurukul:activeSessionId')
      currentSessionId.value = null
    }
  }

  async function resumeSession() {
    if (!pendingResume.value) return
    const { sessionId, filePath, sectionTitle } = pendingResume.value
    try {
      // Restore file + section if not already selected
      if (filePath && selectedFile.value?.path !== filePath) {
        const file = files.value.find(f => f.path === filePath)
        if (file) {
          if (!file.content) {
            if (file.handle) {
              const f = await file.handle.getFile()
              file.content = await f.text()
            } else if (file.fileRef) {
              file.content = await file.fileRef.text()
            }
          }
          selectedFile.value = file
        }
      }
      if (sectionTitle && activeSection.value?.title !== sectionTitle) {
        const sec = sections.value.find(s => s.title === sectionTitle)
        if (sec) activeSection.value = sec
      }
      const res = await fetch(`/api/gurukul/sessions/${sessionId}/messages`)
      const data = await res.json()
      messages.value = (data.messages as any[]).map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
      currentSessionId.value = sessionId
      sessionStarted.value = true
      pendingResume.value = null
    } catch (err) {
      error.value = 'Failed to resume session: ' + (err as Error).message
    }
  }

  async function discardPendingSession() {
    const id = pendingResume.value?.sessionId || currentSessionId.value
    if (id) {
      try {
        await fetch(`/api/gurukul/sessions/${id}/end`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ autoSummary: '' })
        })
      } catch { /* best effort */ }
    }
    pendingResume.value = null
    currentSessionId.value = null
    localStorage.removeItem('gurukul:activeSessionId')
  }

  async function loadPastSessions(filePath?: string) {
    try {
      const res = await fetch(`/api/gurukul/sessions?filePath=${filePath || ''}`)
      const data = await res.json()
      pastSessionsForFile.value = data.sessions || []
    } catch (err) {
      console.warn('[Gurukul Store] Failed to load past sessions:', err)
    }
  }

  return {
    files,
    selectedFile,
    sections,
    activeSection,
    messages,
    isThinking,
    error,
    sessionStarted,
    currentSessionId,
    allowAssessment,
    assessmentResult,
    isAssessing,
    pastSessionsForFile,
    pendingResume,
    gurukulProviderId,
    gurukulModelId,
    gurukulProvider,
    gurukulModel,
    canRetry,
    // Folder persistence
    hasSavedFolder,
    savedFolderName,
    // Discussion history (permanent, pink dot)
    discussedFiles,
    // Macro session
    macroSessionId,
    macroSessionName,
    macroSessionStudied,
    macroSessionActive,
    startMacroSession,
    endMacroSession,
    initMacroSessionRestore,
    markFileStudied,
    unmarkFileStudied,
    // Reader collapse (manual only)
    readerCollapsed,
    // Actions
    setGurukulProvider,
    setGurukulModel,
    openFolder,
    initFolderRestore,
    restoreFolder,
    restoreSelection,
    loadFilesFromInput,
    selectFile,
    selectSection,
    startSession,
    sendMessage,
    retryLastMessage,
    resetSession,
    endSession,
    assessProgress,
    loadPastSessions,
    initResumeCheck,
    resumeSession,
    discardPendingSession,
  }
})
