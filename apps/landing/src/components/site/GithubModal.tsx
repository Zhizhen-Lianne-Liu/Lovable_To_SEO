export function GithubModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 fade-up"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border hairline bg-paper p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono-tag text-ink/70">/ GITHUB</p>
        <h4 className="font-display mt-3 text-2xl">OAuth handshake, coming soon.</h4>
        <p className="mt-3 text-sm text-ink/70 leading-relaxed">
          We'll request <code className="font-mono">repo:read</code> and{" "}
          <code className="font-mono">pull_request:write</code> on the repo you pick. Nothing else.
        </p>
        <button
          onClick={onClose}
          className="mt-6 w-full border hairline px-4 py-2 font-mono text-sm hover:bg-ink hover:text-paper"
        >
          Close
        </button>
      </div>
    </div>
  );
}