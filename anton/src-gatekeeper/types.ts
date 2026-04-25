export type CandidateCompetitor = {
  domain: string;
  name?: string;
  descriptor?: string;          // Tavily / discovery descriptor if available
  why_relevant?: string;        // claim from the discovery step
};

export type GatekeeperVerdict = {
  domain: string;
  decision: 'keep' | 'reject';
  reason: string;               // 1 sentence
};

export type GatekeeperResult = {
  context_summary: string;      // echo of what the gatekeeper used as context
  kept: CandidateCompetitor[];
  rejected: { candidate: CandidateCompetitor; reason: string }[];
  warnings: string[];
};

export type GatekeeperError = {
  error: string;
  code: 'NO_CANDIDATES' | 'LLM_ERROR' | 'PARSE_ERROR' | 'UNKNOWN';
};

export function gatekeeperError(code: GatekeeperError['code'], message: string): Error {
  const err = new Error(message);
  (err as Error & { cause: GatekeeperError }).cause = { error: message, code };
  return err;
}
