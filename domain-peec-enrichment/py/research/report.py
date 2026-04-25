"""
Compose a markdown summary of a pipeline run.

Captures the upstream signal the run produces *before* the Peec push:
deep profile, validated competitive landscape, and the generated prompt set.
Peec already has visibility data; this artifact carries the data Peec doesn't:
why we picked these competitors, what the brand profile looks like, and the
prompt set as a structured asset.

Output is a single markdown file the team can hand to a content writer, an
SEO consultant, or another LLM that needs to generate website copy from the
research.

Usage as a function:
    from report import compose_report
    md = compose_report(run_dir)
    Path(run_dir / "report.md").write_text(md)

Standalone CLI:
    python3 report.py <run_dir>
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


def _safe(v: Any, default: str = "—") -> str:
    if v is None or v == "":
        return default
    if isinstance(v, list):
        return ", ".join(str(x) for x in v) if v else default
    return str(v)


def _pct(num: int, denom: int) -> str:
    if not denom:
        return "—"
    return f"{round(num / denom * 100)}%"


def compose_report(run_dir: Path) -> str:
    """Read the run artifacts, return the markdown report as a string."""
    run_dir = Path(run_dir)

    deep_profile = _read_json(run_dir / "deep_profile.json")
    results = _read_json(run_dir / "results.json")
    prompts = _read_json(run_dir / "prompts.json")

    sections = [
        _header(deep_profile, results),
        _who_they_are(deep_profile),
        _competitive_landscape(results),
        _prompt_set(prompts),
        _metadata(run_dir, prompts, results),
    ]
    return "\n\n".join(s for s in sections if s)


# ---------- sections ----------

def _header(profile: dict | None, results: dict | None) -> str:
    name = (profile or {}).get("name") or (results or {}).get("self", {}).get("name_guess") or "(unknown)"
    domain = (profile or {}).get("domain") or (results or {}).get("input") or ""
    tagline = (profile or {}).get("tagline") or ""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M UTC")

    lines = [f"# {name} — Run brief", ""]
    meta_parts = []
    if domain: meta_parts.append(f"**Domain**: {domain}")
    meta_parts.append(f"**Generated**: {timestamp}")
    if meta_parts:
        lines.append("  |  ".join(meta_parts))
    if tagline:
        lines.append("")
        lines.append(f"> {tagline}")
    lines.append("")
    lines.append("*This brief captures the brand profile, validated competitor list, and generated tracking prompts produced before Peec submission. Visibility / sentiment / citation data lives in the Peec dashboard.*")
    return "\n".join(lines)


def _who_they_are(profile: dict | None) -> str:
    if not profile:
        return ""
    out = ["## Who they are", ""]
    if profile.get("occupation"):
        out.append(profile["occupation"])
        out.append("")

    rows = [
        ("Industry", profile.get("industry")),
        ("Category", profile.get("category_for_search")),
        ("Scale tier", profile.get("scale_tier")),
        ("Pricing tier", profile.get("pricing_tier")),
        ("Audience", profile.get("audience")),
        ("Sophistication", profile.get("audience_sophistication")),
        ("Geography", _markets(profile.get("target_markets"))),
        ("Brand voice", _safe(profile.get("brand_presentation"))),
    ]
    out += ["| | |", "|---|---|"]
    for label, value in rows:
        out.append(f"| {label} | {_safe(value)} |")

    if profile.get("products_and_services"):
        out += ["", "### Products & services", ""]
        for item in profile["products_and_services"]:
            out.append(f"- {item}")

    if profile.get("key_differentiators"):
        out += ["", "### Key differentiators", ""]
        for item in profile["key_differentiators"]:
            out.append(f"- {item}")

    if profile.get("competitor_signals"):
        out += ["", "### Competitor signals from source material",
                "*Brand names mentioned in the source text — comparison pages, external listings, etc. Not necessarily added to tracking.*", ""]
        for item in profile["competitor_signals"]:
            out.append(f"- {item}")

    return "\n".join(out)


def _markets(markets: Any) -> str:
    if not markets:
        return "—"
    if isinstance(markets, list):
        labels = []
        for m in markets:
            if isinstance(m, dict):
                loc = m.get("location") or "?"
                size = m.get("marketSize") or ""
                labels.append(f"{loc} ({size})" if size else loc)
            else:
                labels.append(str(m))
        return ", ".join(labels)
    return str(markets)


def _competitive_landscape(results: dict | None) -> str:
    if not results:
        return ""
    final = results.get("final") or []
    if not final:
        return ""

    validated = [c for c in final if c.get("validated") is True]
    rejected = [c for c in final if c.get("validated") is False]

    out = ["## Competitive landscape", "",
           f"{len(final)} competitors after Tavily discovery + Anthropic validation gate."]
    if validated:
        out.append(f"**{len(validated)}** validated as direct competitors. **{len(rejected)}** flagged as non-direct.\n")
    else:
        out.append("")

    out += ["### Final list",
            "| # | Brand | Domain | Validated | Why |",
            "|---|---|---|---|---|"]
    for i, c in enumerate(final, 1):
        name = c.get("canonical_name") or c.get("name") or c.get("domain", "?")
        domain = c.get("domain", "?")
        v = c.get("validated")
        v_mark = "✓" if v is True else ("✗" if v is False else "—")
        reason = (c.get("validation_reason") or c.get("why_relevant") or "").replace("\n", " ")[:140]
        out.append(f"| {i} | {name} | `{domain}` | {v_mark} | {reason} |")

    return "\n".join(out)


def _prompt_set(prompts: dict | None) -> str:
    if not prompts:
        return ""
    items = prompts.get("prompts") or []
    if not items:
        return ""

    by_bucket: dict[str, list] = {}
    for p in items:
        by_bucket.setdefault(p.get("bucket", "consideration"), []).append(p)

    out = ["## Tracking prompt set", ""]
    out.append(f"**{len(items)}** prompts generated by `{prompts.get('modelUsed', '?')}`.")
    out.append("")

    inferred = next(
        (w.split(":", 1)[1].strip().strip('"') for w in (prompts.get("warnings") or [])
         if "inferred category" in w),
        None,
    )
    if inferred:
        out.append(f"Curator inferred category: **{inferred}**")
        out.append("")

    out.append("| Bucket | Count | Share |")
    out.append("|---|---|---|")
    for b in ("consideration", "awareness", "brand-eval"):
        n = len(by_bucket.get(b, []))
        out.append(f"| {b} | {n} | {_pct(n, len(items))} |")

    out.append("\n### All prompts (paste-ready for Peec)\n")
    for b in ("consideration", "awareness", "brand-eval"):
        items_b = by_bucket.get(b, [])
        if not items_b:
            continue
        out.append(f"#### {b.title()}\n")
        for p in items_b:
            out.append(f"- {p.get('query', '')}")
        out.append("")

    return "\n".join(out)


def _metadata(run_dir: Path, prompts: dict | None, results: dict | None) -> str:
    out = ["## Run metadata", ""]
    out.append(f"- **Run dir**: `{run_dir}`")
    if prompts and prompts.get("modelUsed"):
        out.append(f"- **Models**: {prompts['modelUsed']}")
    if prompts and prompts.get("competitors"):
        out.append(f"- **Competitors fed to keyword fetch**: {len(prompts['competitors'])}")
    if results and results.get("input"):
        out.append(f"- **Input domain**: {results['input']}")
    out.append("")
    out.append("*Generated by `domain-peec-enrichment/py/research/report.py`*")
    return "\n".join(out)


# ---------- IO helpers ----------

def _read_json(path: Path | None) -> dict | None:
    if not path:
        return None
    p = Path(path)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except (json.JSONDecodeError, OSError):
        return None


# ---------- CLI ----------

def main() -> None:
    ap = argparse.ArgumentParser(description="Compose a markdown summary of a pipeline run")
    ap.add_argument("run_dir", help="Path to the run dir (deep_profile.json + results.json + prompts.json)")
    ap.add_argument("--out", help="Output path. Default: <run_dir>/report.md")
    args = ap.parse_args()

    run_dir = Path(args.run_dir)
    if not run_dir.is_dir():
        sys.exit(f"run dir not found: {run_dir}")

    md = compose_report(run_dir)
    out_path = Path(args.out) if args.out else run_dir / "report.md"
    out_path.write_text(md)
    print(f"[report] wrote → {out_path}  ({len(md)} chars)")


if __name__ == "__main__":
    main()
