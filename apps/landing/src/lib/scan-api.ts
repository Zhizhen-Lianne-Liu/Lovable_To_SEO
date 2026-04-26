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
  files_changed?: string[];
  pr?: { url: string; branch: string; commit: string };
};

export async function scan(url: string): Promise<ScanResult> {
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    throw new Error(`/api/scan returned ${res.status}`);
  }
  return (await res.json()) as ScanResult;
}
