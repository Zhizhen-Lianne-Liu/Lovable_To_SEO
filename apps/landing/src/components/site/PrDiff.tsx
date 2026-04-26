export function PrDiff() {
  return (
    <section className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-mono-tag text-ink/70">/ WHAT YOU GET</p>
        <h2 className="font-display mt-4 text-5xl sm:text-6xl">
          A PR. Diff included. Your call.
        </h2>

        <div className="mt-12 border hairline overflow-hidden bg-ink text-paper">
          <div className="flex items-center justify-between border-b border-paper/15 px-5 py-3 font-mono text-xs">
            <span>seo/index.html · +148 -3</span>
            <span className="border border-mint/70 px-2 py-0.5 text-mint">ready to merge</span>
          </div>
          <pre className="overflow-x-auto px-5 py-5 font-mono text-[13px] leading-relaxed">
{`@@ src/index.html @@
`}<span className="text-red-400">{`-  <title>Receiptly</title>`}</span>{`
`}<span className="text-mint">{`+  <title>Receiptly · Free receipt scanner for freelancers</title>
+  <meta name="description" content="Snap a receipt, get a categorized expense in 3 seconds. Built for freelancers who hate QuickBooks.">
+  <link rel="canonical" href="https://receiptly.app/">
+  <script type="application/ld+json">{ "@context":"https://schema.org","@type":"SoftwareApplication","name":"Receiptly" }</script>`}</span>{`

@@ src/index.html @@
`}<span className="text-mint">{`+  <section id="comparison">
+    <h2>Receiptly vs QuickBooks vs Wave</h2>
+    <table>...</table>
+  </section>
+
+  <section id="faq">
+    <h2>FAQ</h2>
+    <details><summary>Is Receiptly free?</summary><p>Yes, for the first 50 receipts/month.</p></details>
+  </section>`}</span>{`
`}
          </pre>
        </div>
      </div>
    </section>
  );
}