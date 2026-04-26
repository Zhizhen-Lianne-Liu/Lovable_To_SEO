import { useState } from "react";
import { ScanFlow } from "./ScanFlow";
import { useScan } from "@/lib/scan-context";

export function Hero() {
  const [domain, setDomain] = useState("");
  const { scan, scanning, error } = useScan();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = domain.trim() || "flowmetricsorg.lovable.app";
    setTimeout(() => {
      document.getElementById("scan")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    await scan(d);
  };

  return (
    <>
      <section className="relative mx-auto max-w-6xl px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <p className="font-mono-tag text-ink/70">/ AI &amp; SEARCH VISIBILITY CHECK</p>
        <h1 className="font-display mt-6 text-6xl sm:text-7xl md:text-8xl">
          Is your website
          <br />
          visible to AI
          <br />
          &amp; Google<span className="text-mint">?</span>
        </h1>
        <p className="mt-8 max-w-2xl text-lg text-ink/75 leading-relaxed">
          Paste your website and check it here. We'll show you exactly what Google crawlers and
          ChatGPT see — and what they don't.
        </p>

        <form onSubmit={onSubmit} id="scan-form" className="relative mt-12 max-w-2xl">
          <div className="pulse-ring flex items-stretch border hairline bg-paper">
            <span className="flex items-center border-r hairline px-4 font-mono text-sm text-ink/60">
              https://
            </span>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="flowmetricsorg.lovable.app"
              className="flex-1 bg-transparent px-4 py-4 font-mono text-sm outline-none placeholder:text-ink/35"
              aria-label="Your website domain"
            />
            <button
              type="submit"
              className="bg-ink px-6 font-mono text-sm text-paper hover:opacity-90"
            >
              Scan →
            </button>
          </div>
          <p className="mt-3 font-mono text-xs text-ink/55">
            <code className="text-ink">flowmetricsorg.lovable.app</code> → instant baked findings.
            <br />
            Any other domain → real pipeline run (~3-5 min, ~$0.30 in API credits).
          </p>
          {error && (
            <p className="mt-3 font-mono text-xs text-red-600">
              {error}
            </p>
          )}
        </form>
      </section>

      {scanning && <ScanFlow key={scanning} />}
    </>
  );
}
