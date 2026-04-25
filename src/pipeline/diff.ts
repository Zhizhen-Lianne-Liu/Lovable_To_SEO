/**
 * Tiny unified-diff generator. We keep this dependency-free to avoid
 * pulling in `diff` for one function. Output is human-skimmable, not a
 * patch a real diff tool will reapply — the optimized.html is the source
 * of truth, this file is just for the summary.
 */
export function unifiedDiff(
  before: string,
  after: string,
  beforeName: string,
  afterName: string,
): string {
  const a = before.split("\n");
  const b = after.split("\n");
  const lines: string[] = [];
  lines.push(`--- ${beforeName}`);
  lines.push(`+++ ${afterName}`);
  // Naive: emit a single hunk noting removed/added lines. Good enough for the
  // exec summary; real diffing happens visually in the rendered HTML.
  const removed = a.filter((l) => !b.includes(l));
  const added = b.filter((l) => !a.includes(l));
  lines.push(
    `@@ -1,${a.length} +1,${b.length} @@  (-${removed.length} +${added.length})`,
  );
  for (const l of removed.slice(0, 200)) lines.push(`- ${l}`);
  for (const l of added.slice(0, 200)) lines.push(`+ ${l}`);
  if (removed.length > 200 || added.length > 200) {
    lines.push(`… diff truncated (${removed.length} removed, ${added.length} added total)`);
  }
  return lines.join("\n");
}
