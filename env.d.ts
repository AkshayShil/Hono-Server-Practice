/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly OPENAI_API_KEY: string
  readonly ANTHROPIC_API_KEY: string
  readonly GOOGLE_API_KEY: string
  readonly OPENROUTER_API_KEY: string
  readonly DEEPSEEK_API_KEY: string
  readonly OLLAMA_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
