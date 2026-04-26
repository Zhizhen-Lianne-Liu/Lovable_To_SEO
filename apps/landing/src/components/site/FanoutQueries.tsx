import type { ScanResult } from "@/lib/scan-api";

// The fanout queries are what AI engines INTERNALLY search for to answer
// buyer prompts. Showing them = showing the founder the exact strings they
// could rank for if they shipped content matching them.

export function FanoutQueries({
  queries,
}: {
  queries: NonNullable<ScanResult["fanout_queries"]>;
}) {
  if (queries.length === 0) return null;
  return (
    <div className="mt-12 fade-up">
      <p className="font-mono-tag text-ink/70">/ WHAT THE AIs ACTUALLY SEARCH FOR</p>
      <h3 className="font-display mt-3 text-3xl sm:text-4xl">
        These are the queries. You don't show up in any of them.
      </h3>
      <div className="mt-8 grid gap-px bg-ink sm:grid-cols-2">
        {queries.slice(0, 8).map((q) => (
          <div key={q} className="bg-paper p-5">
            <p className="font-mono text-xs text-ink/55">→</p>
            <p className="mt-2 font-mono text-sm text-ink">{q}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 font-mono text-xs text-ink/55">
        Pulled from Peec's <code>/queries/search</code> — actual search strings the LLMs
        ran while answering tracked prompts.
      </p>
    </div>
  );
}
