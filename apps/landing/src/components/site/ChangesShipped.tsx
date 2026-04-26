import { normalizeFiles, type ScanResult } from "@/lib/scan-api";

// Concrete artifact — the file changes that landed (or would land) in the PR.
// Status badge, line counts, optional description per file.

export function ChangesShipped({ result }: { result: ScanResult }) {
  const files = normalizeFiles(result.files_changed);
  if (files.length === 0) return null;
  const totalAdditions = files.reduce((s, f) => s + (f.additions || 0), 0);

  return (
    <div className="mt-12 fade-up">
      <p className="font-mono-tag text-ink/70">/ WHAT WE'D SHIP</p>
      <h3 className="font-display mt-3 text-3xl sm:text-4xl">
        {files.length} file changes{totalAdditions > 0 && <>, +{totalAdditions} lines</>}.
      </h3>
      <div className="mt-8 border hairline bg-paper">
        <ul className="divide-y">
          {files.map((f) => (
            <li key={f.path} className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6">
              <div className="flex items-start gap-3 min-w-0">
                <span
                  className={`mt-0.5 inline-flex h-5 items-center rounded-sm px-1.5 font-mono text-[10px] font-semibold uppercase shrink-0 ${
                    f.status === "added"
                      ? "bg-mint/15 text-ink border border-mint/30"
                      : "bg-ink/5 text-ink border border-ink/15"
                  }`}
                >
                  {f.status === "added" ? "new" : "edit"}
                </span>
                <div className="min-w-0">
                  <code className="font-mono text-sm text-ink truncate block">{f.path}</code>
                  {f.description && (
                    <p className="mt-1 text-xs text-ink/65">{f.description}</p>
                  )}
                </div>
              </div>
              {f.additions > 0 && (
                <span className="font-mono text-xs text-mint shrink-0">+{f.additions}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
      {result.pr && (
        <p className="mt-4 font-mono text-xs text-ink/55">
          Pushed to <code className="text-ink">{result.pr.branch}</code> · commit{" "}
          <code className="text-ink">{result.pr.commit}</code>
        </p>
      )}
    </div>
  );
}
