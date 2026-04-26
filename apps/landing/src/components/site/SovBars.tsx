import type { ScanResult } from "@/lib/scan-api";

// Visual share-of-voice breakdown — the shock moment that makes the
// "0% visibility" tile concrete. Renders horizontal bars, brands sorted
// descending by pct, the user's own brand highlighted with the mint accent.

export function SovBars({
  domain,
  share,
}: {
  domain: string;
  share: NonNullable<ScanResult["share_of_voice"]>;
}) {
  if (share.length === 0) return null;
  const max = Math.max(...share.map((s) => s.pct), 1);
  const sorted = [...share].sort((a, b) => b.pct - a.pct);
  const ownStem = domain.split(".")[0]?.toLowerCase() ?? "";
  const isOwn = (name: string) => name.toLowerCase().includes(ownStem) && ownStem.length >= 4;

  return (
    <div className="mt-12 fade-up">
      <p className="font-mono-tag text-ink/70">/ WHO'S EATING YOUR LUNCH</p>
      <h3 className="font-display mt-3 text-3xl sm:text-4xl">
        Share-of-voice when an AI answers buyer questions in this category.
      </h3>
      <div className="mt-8 border hairline bg-paper p-6 sm:p-8">
        <div className="space-y-3">
          {sorted.map((s) => {
            const own = isOwn(s.name);
            const widthPct = max > 0 ? (s.pct / max) * 100 : 0;
            return (
              <div key={s.name} className="flex items-center gap-4">
                <div
                  className={`w-32 shrink-0 font-mono text-xs sm:w-40 ${own ? "text-ink font-semibold" : "text-ink/65"}`}
                >
                  {s.name}
                  {own && <span className="ml-1 text-mint">●</span>}
                </div>
                <div className="relative flex-1 h-3 rounded-sm bg-ink/5 overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 ${own ? "bg-mint" : "bg-ink"}`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <div
                  className={`w-12 shrink-0 text-right font-mono text-xs ${own ? "text-ink font-semibold" : "text-ink/65"}`}
                >
                  {s.pct}%
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-6 font-mono text-xs text-ink/55">
          Source: live Peec snapshot — 7 LLM engines × every tracked prompt over the last 7 days.
        </p>
      </div>
    </div>
  );
}
