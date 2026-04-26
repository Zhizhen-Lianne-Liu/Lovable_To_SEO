import { useState } from "react";
import { ScanFlow } from "./ScanFlow";
import { scan, type ScanResult } from "@/lib/scan-api";

export function Hero() {
  const [domain, setDomain] = useState("");
  const [scanning, setScanning] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = domain.trim() || "receiptly.lovable.app";
    setScanning(d);
    setResult(null);
    setError(null);
    setTimeout(() => {
      document.getElementById("scan")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    try {
      const r = await scan(d);
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <section className="relative mx-auto max-w-6xl px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <p className="font-mono-tag text-ink/70">/ THE AI MARKETER FOR LOVABLE FOUNDERS</p>
        <h1 className="font-display mt-6 text-6xl sm:text-7xl md:text-8xl">
          Your Lovable app
          <br />
          is invisible
          <br />
          to AI<span className="text-mint">.</span>
        </h1>
        <p className="mt-8 max-w-2xl text-lg text-ink/75 leading-relaxed">
          It's secretly a React SPA. Google sees an empty{" "}
          <code className="font-mono text-[0.95em] text-ink">{`<div id="root">`}</code>. ChatGPT
          has nothing to cite. We fix both, in one PR.
        </p>

        <form onSubmit={onSubmit} id="scan-form" className="relative mt-12 max-w-2xl">
          <div className="pulse-ring flex items-stretch border hairline bg-paper">
            <span className="flex items-center border-r hairline px-4 font-mono text-sm text-ink/60">
              https://
            </span>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="receiptly.lovable.app"
              className="flex-1 bg-transparent px-4 py-4 font-mono text-sm outline-none placeholder:text-ink/35"
              aria-label="Your Lovable app domain"
            />
            <button
              type="submit"
              className="bg-ink px-6 font-mono text-sm text-paper hover:opacity-90"
            >
              Scan →
            </button>
          </div>
          <p className="mt-3 font-mono text-xs text-ink/55">
            ~10 seconds. No signup. We don't store your URL.
          </p>
          {error && (
            <p className="mt-3 font-mono text-xs text-red-600">
              Couldn't reach the demo API ({error}). Run <code>cd apps/api &amp;&amp; npm run dev</code> and
              try again.
            </p>
          )}
        </form>
      </section>

      {scanning && <ScanFlow key={scanning} domain={scanning} result={result} />}
    </>
  );
}
