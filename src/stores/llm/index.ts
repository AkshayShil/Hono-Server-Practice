// ---------------------------------------------------------------------------
// index.ts — Public barrel for the llm/ module
// Import from here everywhere else in the app.
// ---------------------------------------------------------------------------

export { useLLMStore }      from './llmStore';
export { PROVIDERS, INFERENCE_DEFAULTS } from './apiConfig';
export { PROMPT_TEMPLATES } from './promptTemplates';
export type {
  ProviderId,
  PromptMode,
  ProviderConfig,
  ModelOption,
  PromptTemplate,
  LLMFeedback,
  Quiz,
  AnalyzeParams,
  PersistedLLMConfig,
} from './types';
