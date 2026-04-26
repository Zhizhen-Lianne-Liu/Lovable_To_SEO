import { useEffect, useRef, useState } from "react";
import { GithubModal } from "./GithubModal";
import type { ScanResult } from "@/lib/scan-api";

function Counter({ to, suffix = "", duration = 1200 }: { to: number; suffix?: string; duration?: number }) {
  const [val, setVal] = useState(0);
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(eased * to));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return (
    <span>
      {val}
      {suffix}
    </span>
  );
}

export function Diagnosis({ domain, result }: { domain: string; result: ScanResult }) {
  const [openModal, setOpenModal] = useState(false);

  const indexable = result.diagnosis?.indexable_pct ?? 0;
  const sov = result.diagnosis?.llm_share_of_voice_pct ?? 0;
  const schemaMissing = result.diagnosis?.schema_blocks_missing ?? 5;
  const schemaTotal = result.diagnosis?.schema_blocks_total ?? 5;

  const topThree = (result.share_of_voice ?? [])
    .filter((c) => c.name.toLowerCase() !== domain.split(".")[0].toLowerCase())
    .slice(0, 2);
  const sovDescription =
    topThree.length > 0
      ? topThree.map((c) => `${c.name} ${c.pct}%`).join(" · ")
      : "No competitors with measurable share-of-voice yet";

  return (
    <div className="mt-10 fade-up">
      <p className="font-mono-tag text-ink/70">/ DIAGNOSIS COMPLETE</p>
      <h2 className="font-display mt-4 text-4xl sm:text-5xl">
        We can see why nobody finds{" "}
        <code className="font-mono text-[0.85em]">{domain}</code>.
      </h2>

      <div className="mt-10 grid grid-cols-1 border hairline bg-paper sm:grid-cols-3">
        <Tile
          label="INDEXABLE"
          value={<Counter to={indexable} suffix="%" />}
          desc={
            indexable === 0 ? (
              <>
                Crawlers see <code className="font-mono">{`<div id="root"></div>`}</code>. Empty.
              </>
            ) : (
              <>{indexable}% of routes have crawlable HTML.</>
            )
          }
        />
        <Tile
          label="LLM SHARE-OF-VOICE"
          value={<Counter to={sov} suffix="%" />}
          desc={`vs ${sovDescription}`}
          divider
        />
        <Tile
          label="MISSING SCHEMA"
          value={
            <>
              <Counter to={schemaMissing} />/{schemaTotal}
            </>
          }
          desc="No JSON-LD. No FAQ. No comparison table."
          divider
        />
      </div>

      <div className="mt-8 border hairline bg-paper p-8">
        <p className="font-mono-tag text-ink/70">/ NEXT STEP</p>
        <h3 className="font-display mt-3 text-2xl sm:text-3xl">Connect GitHub. We open a PR.</h3>
        <p className="mt-4 max-w-2xl text-ink/75 leading-relaxed">
          We need read access to clone the repo, run the pipeline, and push the rebuilt site to a
          new branch. You review the diff before anything goes live.
        </p>
        {result.pr ? (
          <a
            href={result.pr.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 bg-ink px-5 py-3 font-mono text-sm text-paper hover:opacity-90"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-paper" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            View the PR · {result.pr.commit}
          </a>
        ) : (
          <button
            onClick={() => setOpenModal(true)}
            className="mt-6 inline-flex items-center gap-2 bg-ink px-5 py-3 font-mono text-sm text-paper hover:opacity-90"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-paper" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            Connect GitHub
          </button>
        )}
      </div>

      <GithubModal open={openModal} onClose={() => setOpenModal(false)} />
    </div>
  );
}

function Tile({ label, value, desc, divider }: { label: string; value: React.ReactNode; desc: React.ReactNode; divider?: boolean }) {
  return (
    <div className={`p-8 ${divider ? "border-t hairline sm:border-t-0 sm:border-l" : ""}`}>
      <p className="font-mono text-xs tracking-wider text-ink/60">{label}</p>
      <p className="font-display mt-3 text-6xl">{value}</p>
      <p className="mt-3 text-sm text-ink/70 leading-relaxed">{desc}</p>
    </div>
  );
}
