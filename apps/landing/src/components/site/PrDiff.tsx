import { useScan } from "@/lib/scan-context";

const FALLBACK_DIFF = `@@ src/index.html @@
-  <title>Receiptly</title>
+  <title>Receiptly · Free receipt scanner for freelancers</title>
+  <meta name="description" content="Snap a receipt, get a categorized expense in 3 seconds. Built for freelancers who hate QuickBooks.">
+  <link rel="canonical" href="https://receiptly.app/">
+  <script type="application/ld+json">{ "@context":"https://schema.org","@type":"SoftwareApplication","name":"Receiptly" }</script>

@@ src/index.html @@
+  <section id="comparison">
+    <h2>Receiptly vs QuickBooks vs Wave</h2>
+    <table>...</table>
+  </section>
+
+  <section id="faq">
+    <h2>FAQ</h2>
+    <details><summary>Is Receiptly free?</summary><p>Yes, for the first 50 receipts/month.</p></details>
+  </section>`;

function colorize(line: string): JSX.Element {
  if (line.startsWith("+++") || line.startsWith("---")) {
    return <span className="text-paper/60">{line}</span>;
  }
  if (line.startsWith("+")) return <span className="text-mint">{line}</span>;
  if (line.startsWith("-")) return <span className="text-red-400">{line}</span>;
  if (line.startsWith("@@")) return <span className="text-paper/40">{line}</span>;
  if (line.startsWith("diff ") || line.startsWith("index ")) {
    return <span className="text-paper/30">{line}</span>;
  }
  return <span className="text-paper/85">{line}</span>;
}

function statsFromDiff(diff: string): { added: number; removed: number; files: number } {
  let added = 0;
  let removed = 0;
  const fileSet = new Set<string>();
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") && !line.startsWith("+++ /dev/null")) {
      const m = line.match(/^\+\+\+ b\/(.+)/);
      if (m?.[1]) fileSet.add(m[1]);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  return { added, removed, files: fileSet.size };
}

export function PrDiff() {
  const { result } = useScan();
  const liveDiff = result?.diff ?? null;
  const diff = liveDiff ?? FALLBACK_DIFF;
  const stats = liveDiff ? statsFromDiff(liveDiff) : null;
  const headerLabel = liveDiff
    ? `${result?.files_changed?.[0] ?? "index.html"}${stats ? ` · +${stats.added} -${stats.removed}` : ""}`
    : "seo/index.html · +148 -3";

  return (
    <section className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-mono-tag text-ink/70">/ WHAT YOU GET</p>
        <h2 className="font-display mt-4 text-5xl sm:text-6xl">
          A PR. Diff included. Your call.
        </h2>

        <div className="mt-12 border hairline overflow-hidden bg-ink text-paper">
          <div className="flex items-center justify-between border-b border-paper/15 px-5 py-3 font-mono text-xs">
            <span>{headerLabel}</span>
            <span className="border border-mint/70 px-2 py-0.5 text-mint">
              {result?.pr ? `merged → ${result.pr.commit}` : "ready to merge"}
            </span>
          </div>
          <pre className="overflow-x-auto px-5 py-5 font-mono text-[13px] leading-relaxed">
            {diff.split("\n").map((line, i) => (
              <span key={i}>
                {colorize(line)}
                {"\n"}
              </span>
            ))}
          </pre>
        </div>
      </div>
    </section>
  );
}
