export function FinalCta() {
  const scrollToInput = () => {
    document.getElementById("scan-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>("#scan-form input");
      input?.focus();
    }, 500);
  };
  return (
    <section className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 py-32 text-center">
        <h2 className="font-display text-6xl sm:text-7xl">
          Ready when you are<span className="text-mint">.</span>
        </h2>
        <button
          onClick={scrollToInput}
          className="mt-10 bg-ink px-7 py-4 font-mono text-sm text-paper hover:opacity-90"
        >
          Scan your domain →
        </button>
      </div>
    </section>
  );
}