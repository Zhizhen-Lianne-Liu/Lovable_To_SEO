import { useEffect, useState } from "react";
import { Diagnosis } from "./Diagnosis";
import { useScan } from "@/lib/scan-context";

const STEPS = [
  "Cloning the Lovable repo…",
  "Detecting tech stack (Vite + React)…",
  "Reading components and routes…",
  "Querying Peec for buyer signals…",
  "Comparing to top-cited competitor pages…",
];

export function ScanFlow() {
  const { scanning, result } = useScan();
  const [done, setDone] = useState(0);
  const [animationComplete, setAnimationComplete] = useState(false);

  useEffect(() => {
    if (done >= STEPS.length) {
      const t = setTimeout(() => setAnimationComplete(true), 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setDone((d) => d + 1), 600);
    return () => clearTimeout(t);
  }, [done]);

  // Reveal Diagnosis only when BOTH the animation has played out AND the
  // backend has returned. This way fast networks don't skip the animation
  // and slow networks wait visibly instead of showing stale tiles.
  const showDiagnosis = animationComplete && result != null && scanning != null;

  return (
    <section id="scan" className="mx-auto max-w-6xl px-6 pb-20">
      <div className="border hairline bg-paper p-8 fade-up">
        <p className="font-mono-tag text-ink/70">
          / SCANNING <span className="text-ink">{scanning}</span>
        </p>
        <ul className="mt-6 space-y-4 font-mono text-sm">
          {STEPS.map((step, i) => {
            const isDone = i < done;
            const isActive = i === done && !animationComplete;
            const pending = i > done;
            return (
              <li key={step} className="flex items-center gap-4">
                <span className="inline-flex h-5 w-5 items-center justify-center">
                  {isDone ? (
                    <span className="text-ink">✓</span>
                  ) : isActive ? (
                    <span className="flex gap-1">
                      <span className="thinking-dot inline-block h-1.5 w-1.5 rounded-full bg-ink" style={{ animationDelay: "0s" }} />
                      <span className="thinking-dot inline-block h-1.5 w-1.5 rounded-full bg-ink" style={{ animationDelay: "0.2s" }} />
                      <span className="thinking-dot inline-block h-1.5 w-1.5 rounded-full bg-ink" style={{ animationDelay: "0.4s" }} />
                    </span>
                  ) : (
                    <span className="text-ink/25">·</span>
                  )}
                </span>
                <span className={pending ? "text-ink/35" : "text-ink"}>{step}</span>
              </li>
            );
          })}
          {animationComplete && result == null && (
            <li className="flex items-center gap-4 text-ink/55">
              <span className="inline-flex h-5 w-5 items-center justify-center">
                <span className="thinking-dot inline-block h-1.5 w-1.5 rounded-full bg-ink" />
              </span>
              <span>Waiting for the backend to respond…</span>
            </li>
          )}
        </ul>
      </div>

      {showDiagnosis && scanning != null && result != null && (
        <Diagnosis domain={scanning} result={result} />
      )}
    </section>
  );
}
