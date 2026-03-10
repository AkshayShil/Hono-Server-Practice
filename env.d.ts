/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY: string
  readonly VITE_ANTHROPIC_API_KEY: string
  readonly VITE_GOOGLE_API_KEY: string
  readonly VITE_OPENROUTER_API_KEY: string
  readonly VITE_DEEPSEEK_API_KEY: string
  readonly VITE_OLLAMA_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
