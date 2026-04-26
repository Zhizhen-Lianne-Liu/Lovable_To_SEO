const STAGES = [
  { n: "01", title: "INGEST", desc: "git clone, detect Vite+React" },
  { n: "02", title: "PRERENDER", desc: "React → static HTML" },
  { n: "03", title: "DIAGNOSE", desc: "Peec API: brands, queries, urls" },
  { n: "04", title: "ENHANCE", desc: "FAQ, comparison, JSON-LD" },
  { n: "05", title: "SHIP", desc: "branch + gh pr create" },
];

export function Pipeline() {
  return (
    <section id="pipeline" className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-mono-tag text-ink/70">/ PIPELINE</p>
        <h2 className="font-display mt-4 text-5xl sm:text-6xl">5 stages. One PR.</h2>
        <p className="mt-6 max-w-2xl text-ink/75 leading-relaxed">
          An agent walks your repo through five stages. Each one writes an artifact you can
          inspect, no black box.
        </p>

        <div className="relative mt-14 border hairline bg-paper">
          <div className="grid grid-cols-1 sm:grid-cols-5">
            {STAGES.map((s, i) => (
              <div
                key={s.n}
                className={`p-6 ${i > 0 ? "border-t hairline sm:border-t-0 sm:border-l" : ""}`}
              >
                <p className="font-mono text-xs text-ink/55">{s.n}</p>
                <p className="font-display mt-3 text-xl">{s.title}</p>
                <p className="mt-2 font-mono text-xs text-ink/65 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>

          {/* Agent travel track */}
          <div className="relative hidden h-12 border-t hairline sm:block">
            <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-ink/30" />
            <div className="agent-dot absolute top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="relative flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full bg-ink"
                  style={{ boxShadow: "0 0 0 6px oklch(0.83 0.14 165 / 0.35)" }}
                />
                <span className="flex gap-0.5">
                  <span className="thinking-dot h-1 w-1 rounded-full bg-ink" style={{ animationDelay: "0s" }} />
                  <span className="thinking-dot h-1 w-1 rounded-full bg-ink" style={{ animationDelay: "0.15s" }} />
                  <span className="thinking-dot h-1 w-1 rounded-full bg-ink" style={{ animationDelay: "0.3s" }} />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}