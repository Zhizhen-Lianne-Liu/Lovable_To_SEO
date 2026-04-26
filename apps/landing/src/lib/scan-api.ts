// Shape returned by `POST /api/scan` from apps/api. Kept loose on purpose —
// the demo backend is a baked-data echo and we want the UI to degrade
// gracefully if a field is missing.

export type ScanResult = {
  domain: string;
  framework?: string;
  isLovable?: boolean;
  diagnosis?: {
    indexable_pct?: number;
    llm_share_of_voice_pct?: number;
    schema_blocks_missing?: number;
    schema_blocks_total?: number;
    audit_errors?: number;
    audit_warnings?: number;
  };
  competitors?: Array<{ name: string; domain: string }>;
  share_of_voice?: Array<{ name: string; pct: number }>;
  fanout_queries?: string[];
  diff?: string;
  // Backward-compatible: either bare strings (older runs) or richer objects
  // with additions + status (newer baked + live runs).
  files_changed?: Array<string | FileChange>;
  pr?: { url: string; branch: string; commit: string };
};

export type FileChange = {
  path: string;
  additions: number;
  status: "added" | "modified";
  description?: string;
};

export function normalizeFiles(files: ScanResult["files_changed"]): FileChange[] {
  if (!files) return [];
  return files.map((f) =>
    typeof f === "string"
      ? { path: f, additions: 0, status: "added" as const }
      : f,
  );
}

export async function scan(url: string): Promise<ScanResult> {
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    // The demo API returns a structured `{ error, message }` body for known
    // refusals (e.g. URL_NOT_IN_DEMO). Surface the message verbatim so the
    // user sees something actionable, not "HTTP 404".
    let body: { error?: string; message?: string } | null = null;
    try {
      body = (await res.json()) as { error?: string; message?: string };
    } catch {
      /* not JSON */
    }
    throw new Error(body?.message ?? `/api/scan returned ${res.status}`);
  }
  return (await res.json()) as ScanResult;
}
