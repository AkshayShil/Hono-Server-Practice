import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { generateUUID } from '@/utils/uuid'
import { useLLMStore } from './llm'

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
      { role: 'user', content: `[Earlier discussion]\n${summary}` },
      { role: 'assistant', content: 'Understood. Continuing.' },
      ...recent,
    ]
  })

  // Markdown parsing
  const sections = computed<NoteSection[]>(() => {
    if (!selectedFile.value?.content) return []
    const content = selectedFile.value.content
    const lines = content.split('\n')
    const result: NoteSection[] = []

    let currentSection: NoteSection | null = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''

      // ATX Headings: # ## ###
      const atxMatch = line.match(/^(#{1,3})\s+(.+)$/)
      if (atxMatch) {
        if (currentSection) result.push(currentSection)
        currentSection = {
          level: (atxMatch[1] ?? '').length,
          title: (atxMatch[2] ?? '').trim(),
          content: '',
          startLine: i,
        }
        continue
      }

      // Setext Headings: === or --- underline
      const prevLine = lines[i - 1] ?? ''
      if (i > 0 && /^[=\-]{3,}$/.test(line) && prevLine.trim()) {
        if (currentSection) {
          const contentLines = currentSection.content.trimEnd().split('\n')
          contentLines.pop()
          currentSection.content = contentLines.join('\n')
          result.push(currentSection)
        }
        currentSection = {
          level: line.startsWith('=') ? 1 : 2,
          title: prevLine.trim(),
          content: '',
          startLine: i - 1,
        }
        continue
      }

      if (currentSection) {
        currentSection.content += line + '\n'
      } else {
        currentSection = {
          level: 0,
          title: 'Introduction',
          content: line + '\n',
          startLine: 0,
        }
      }
    }

    if (currentSection) {
      result.push(currentSection)
    }

    return result.filter(s => s.content.trim().length >= 20 || s.title.length > 0)
  })

  async function openFolder() {
    try {
      if (!('showDirectoryPicker' in window)) {
        throw new Error('FSA API not supported')
      }
      const handle = await (window as any).showDirectoryPicker()
      files.value = []
      await readDirectory(handle, '')
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
          files.value.push({
            name: entry.name,
            path: entryPath,
            content: '',
            handle: entry
          })
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
        files.value.push({
          name: file.name,
          path,
          content: '',
          fileRef: file,
        })
      }
    })
  }

  async function selectFile(file: NoteFile) {
    if (sessionStarted.value) await endSession()
    selectedFile.value = file
    activeSection.value = null
    resetSession()
    
    if (!file.content) {
      if (file.handle) {
        const f = await file.handle.getFile()
        file.content = await f.text()
      } else if (file.fileRef) {
        file.content = await file.fileRef.text()
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

  async function sendMessage(text: string, isTrigger = false) {
    if (!activeSection.value) return
    
    if (!isTrigger) {
      messages.value.push({ role: 'user', content: text })
      void persistMessage('user', text)
    }

    isThinking.value = true
    error.value = null

    try {
      const llm = useLLMStore()
      const systemPrompt = `
You are a Guru teaching through the Socratic method, as in a Gurukul.

RULES:
- Ask ONE focused question at a time based only on the notes below.
- After the student answers: 1 sentence acknowledging right/wrong, then ask the next question.
- Escalate: recall → understanding → application.
- Never lecture unprompted. If asked to explain, give max 4 lines then ask a question.
- Stay within the notes. Never introduce outside knowledge.
- All responses under 120 words.

[NOTES]
${activeSection.value.content.slice(0, 4000)}
[/NOTES]

Begin by asking your first question.`.trim()

      const response = await fetch('/api/llm/gurukul', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: llm.provider,
          model: llm.model,
          systemPrompt,
          messages: isTrigger ? [{ role: 'user', content: 'Begin.' }] : compressedMessages.value,
        })
      })

      if (!response.ok) throw new Error('Guru is silent...')
      
      const data = await response.json()
      messages.value.push({ role: 'assistant', content: data.content })
      void persistMessage('assistant', data.content)
    } catch (err) {
      error.value = (err as Error).message
    } finally {
      isThinking.value = false
    }
  }

  async function endSession() {
    if (!currentSessionId.value) return

    // If session has enough messages, generate summary
    let autoSummary = ''
    if (messages.value.length >= 4) {
      try {
        const llm = useLLMStore()
        const history = messages.value.slice(-10).map(m => `${m.role === 'user' ? 'Student' : 'Guru'}: ${m.content}`).join('\n')
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
        body: JSON.stringify({
          filePath,
          provider: llm.provider,
          model: llm.model,
          customBaseUrl: llm.customBaseUrl,
        })
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
        pendingResume.value = {
          sessionId: savedId,
          sectionTitle: session.section_title,
          filePath: session.file_path,
        }
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
    const { sessionId } = pendingResume.value
    try {
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
    openFolder,
    loadFilesFromInput,
    selectFile,
    selectSection,
    startSession,
    sendMessage,
    resetSession,
    endSession,
    assessProgress,
    loadPastSessions,
    initResumeCheck,
    resumeSession,
    discardPendingSession,
  }
})
