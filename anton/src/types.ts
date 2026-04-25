export type ImportResult = {
  jobId: string;
  workdir: string;
  repoMeta: {
    owner: string;
    repo: string;
    sha?: string;
    sourceUrl: string;
  };
  isLovable: boolean;
  detectionReasons: string[];
  cached: boolean;
};

export type ImportError = {
  error: string;
  code:
    | 'INVALID_URL'
    | 'NOT_FOUND'
    | 'NOT_LOVABLE'
    | 'PRIVATE_REPO'
    | 'RATE_LIMITED'
    | 'NETWORK'
    | 'UNKNOWN';
};

export function importError(code: ImportError['code'], message: string): Error {
  const err = new Error(message);
  (err as Error & { cause: ImportError }).cause = { error: message, code };
  return err;
}
