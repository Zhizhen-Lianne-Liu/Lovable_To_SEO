import { useEffect, useRef, useState } from "react";

const SIGNALS = [
  {
    h: "What buyers actually ask LLMs",
    p: "Peec's /queries/search gives us the real query strings. No Ahrefs guesses.",
  },
  {
    h: "Which URLs LLMs cite",
    p: "Peec's /reports/urls shows the shape of content that wins citations today.",
  },
  {
    h: "Where competitors crush you",
    p: "Peec's /reports/brands hands us the share-of-voice gaps to attack first.",
  },
  {
    h: "Your repo",
    p: "The cloned source, not a scrape. We see the React components your founder edits in Lovable.",
  },
];

function FadeUpCard({ children, delay }: { children: React.ReactNode; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShow(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`bg-paper p-8 ${show ? "fade-up" : "opacity-0"}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function WhyThisWorks() {
  return (
    <section id="why" className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-mono-tag text-ink/70">/ WHY THIS WORKS</p>
        <h2 className="font-display mt-4 text-5xl sm:text-6xl">
          Most "AI SEO" tools guess. We don't.
        </h2>

        <div className="mt-12 grid grid-cols-1 gap-px bg-ink sm:grid-cols-2">
          {SIGNALS.map((s, i) => (
            <FadeUpCard key={s.h} delay={i * 80}>
              <p className="font-mono-tag text-ink/60">/ SIGNAL</p>
              <h3 className="font-display mt-3 text-2xl">{s.h}</h3>
              <p className="mt-3 text-ink/70 leading-relaxed">{s.p}</p>
            </FadeUpCard>
          ))}
        </div>
      </div>
    </section>
  );
}