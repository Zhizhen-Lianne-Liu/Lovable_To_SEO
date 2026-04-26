import { Link } from "@tanstack/react-router";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b hairline bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="font-display text-xl tracking-tight">
          instantSEO&amp;GEO<span className="text-mint">.</span>
        </Link>
        <nav className="flex items-center gap-7">
          <a href="#pipeline" className="hidden text-sm text-ink/80 hover:text-ink sm:inline">
            Pipeline
          </a>
          <a href="#why" className="hidden text-sm text-ink/80 hover:text-ink sm:inline">
            Why
          </a>
          <a href="#faq" className="hidden text-sm text-ink/80 hover:text-ink sm:inline">
            FAQ
          </a>
        </nav>
      </div>
    </header>
  );
}