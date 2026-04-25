export type GeneratedPrompt = {
  id: string;
  query: string;                                    // 1-200 chars, what gets pasted into Peec
  bucket: 'consideration' | 'awareness' | 'brand-eval';
  source_keyword: string | null;                    // null for brand-eval prompts
  source_competitors: string[];                     // domains whose keyword data drove this prompt
  hypothesis: string;                               // 1 line: what success looks like
};

export type PromptSet = {
  jobId: string;
  competitors: string[];
  prompts: GeneratedPrompt[];
  modelUsed: string;
  generatedAt: string;
  warnings: string[];
};

export type PromptError = {
  error: string;
  code: 'NO_API_KEY' | 'NO_KEYWORDS' | 'LLM_ERROR' | 'PARSE_ERROR' | 'UNKNOWN';
};

export function promptError(code: PromptError['code'], message: string): Error {
  const err = new Error(message);
  (err as Error & { cause: PromptError }).cause = { error: message, code };
  return err;
}
