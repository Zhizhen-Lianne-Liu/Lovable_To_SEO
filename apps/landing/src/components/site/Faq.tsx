const QA = [
  {
    q: "Will this break my Lovable app?",
    a: "No. The PR adds a parallel static build under /seo. Your live React app keeps shipping from Lovable. You can revert the PR with one click.",
  },
  {
    q: "Do I have to migrate off Lovable?",
    a: "No. Keep editing in Lovable. Re-run the pipeline whenever you want a fresh static snapshot. The point is to keep your dev loop, gain crawlers and citations.",
  },
  {
    q: "How is this different from LovableHTML?",
    a: "LovableHTML converts your SPA to HTML. We do that, then layer in Peec buyer-query data, comparison tables, FAQ blocks, and JSON-LD. Conversion is step one of five.",
  },
  {
    q: "What does GEO mean?",
    a: "Generative Engine Optimization. Optimizing pages so LLMs (ChatGPT, Perplexity, Claude) cite them when answering buyer questions. Same idea as SEO, different surface.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-mono-tag text-ink/70">/ FAQ</p>
        <h2 className="font-display mt-4 text-5xl sm:text-6xl">Honest answers.</h2>

        <div className="mt-12 grid gap-4">
          {QA.map((item) => (
            <div key={item.q} className="border hairline bg-paper p-6">
              <p className="text-base">{item.q}</p>
              <p className="mt-3 text-sm text-ink/65 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}