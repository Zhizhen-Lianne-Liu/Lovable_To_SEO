export type DomainContext = {
  domain: string;
  brand_name: string;
  tagline: string;             // 1-line proposition from the homepage
  category: string;            // 2-4 words, e.g. "AI tender response automation"
  what_we_do: string;          // 1-2 sentences in plain language
  icp: string[];               // ["procurement teams in DACH", "EU public-sector RFPs"]
  geography: string[];         // ISO codes: ["DE", "AT", "CH"] | ["US"] | ["global"]
  language: string;            // primary site language: "en", "de", ...
  source_evidence: string;     // first 300 chars of homepage extract — sanity check
  fetchedAt: string;
};

export type ContextError = {
  error: string;
  code: 'NO_API_KEY' | 'FETCH_FAILED' | 'EXTRACT_FAILED' | 'LLM_ERROR' | 'PARSE_ERROR' | 'UNKNOWN';
};

export function contextError(code: ContextError['code'], message: string): Error {
  const err = new Error(message);
  (err as Error & { cause: ContextError }).cause = { error: message, code };
  return err;
}
