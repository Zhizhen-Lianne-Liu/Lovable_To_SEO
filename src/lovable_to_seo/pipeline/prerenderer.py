"""Prerender stage — two-phase: agent reads files, then plain API call generates HTML."""
from __future__ import annotations

import asyncio
import logging
import re
import subprocess
from pathlib import Path

import anthropic

from ..claude_agent import run_agent
from ..pipeline.ingester import RepoMeta
from ..prompts.prerenderer import PRERENDERER_SYSTEM

log = logging.getLogger("lovable_to_seo")

# System prompt for the reader phase — just extract content, no HTML generation
_READER_SYSTEM = """You are a source-code reader. Your only job is to read the files
listed and return their complete contents, clearly labelled by filename.
Do not generate HTML. Do not summarize. Return raw file contents only."""


def _inline_tailwind(repo_path: Path, html_path: Path, css_entry: str) -> None:
    """
    Always inline src/styles.css raw (contains :root CSS custom properties that
    Shadcn/Tailwind utility classes depend on via var(--variable)).
    Then attempt to compile Tailwind utility classes on top.
    Falls back to CDN for utilities if CLI unavailable.
    """
    html = html_path.read_text()

    # Step 1: Always inline the raw CSS entry file first.
    # This captures :root { --background: ...; } and .dark { ... } variable blocks
    # that CDN Tailwind has no knowledge of.
    css_src = repo_path / css_entry
    if css_src.exists():
        raw_css = css_src.read_text()
        # Remove Tailwind v4 @import and @theme directives (browser can't parse them)
        raw_css = re.sub(r'@import\s+"tailwindcss"[^;]*;', "", raw_css)
        raw_css = re.sub(r'@theme\s+inline\s*\{[^}]*\}', "", raw_css, flags=re.DOTALL)
        raw_css = re.sub(r'@custom-variant\s+[^\n]+\n', "", raw_css)
        raw_css = raw_css.strip()
        if raw_css:
            raw_block = f"<style>/* {css_entry} */\n{raw_css}\n</style>"
            html = html.replace("</head>", f"{raw_block}\n</head>", 1)
            log.info("  inlined raw %s (%d bytes)", css_entry, len(raw_css))

    # Remove dead Vite build stylesheet links
    html = re.sub(r'<link[^>]+href=["\']\/assets\/[^"\']+\.css["\'][^>]*>', "", html)
    html_path.write_text(html)

    # Step 2: Compile Tailwind utility classes via CLI
    css_out = repo_path / "seo" / "_tw.css"
    for cmd in [
        f"npx --yes @tailwindcss/cli -i {css_src} -o {css_out} --content {html_path}",
        f"npx --yes tailwindcss -i {css_src} -o {css_out} --content {html_path}",
    ]:
        result = subprocess.run(
            cmd, shell=True, cwd=str(repo_path),
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode == 0 and css_out.exists():
            compiled_css = css_out.read_text()
            html = html_path.read_text()
            style_block = f"<style>/* tailwind compiled */\n{compiled_css}\n</style>"
            html = html.replace("</head>", f"{style_block}\n</head>", 1)
            html_path.write_text(html)
            log.info("  tailwind compiled and inlined (%d bytes)", len(compiled_css))
            css_out.unlink(missing_ok=True)
            return

    # Step 3: CDN fallback for utility classes (custom properties already inlined above)
    log.info("  tailwind CLI unavailable — using CDN for utility classes")
    html = html_path.read_text()
    if "tailwindcss.com" not in html:
        cdn = '<script src="https://cdn.tailwindcss.com"></script>'
        html = html.replace("</head>", f"{cdn}\n</head>", 1)
        html_path.write_text(html)


async def prerender(meta: RepoMeta, model: str, api_key: str) -> Path:
    """
    Phase 1: agent reads source files and returns their contents as text.
    Phase 2: single plain API call generates the full HTML from that text.
    Splitting avoids the Write-tool max_tokens truncation problem.
    """
    seo_dir = meta.path / "seo"
    seo_dir.mkdir(exist_ok=True)

    # Only page-content files — skip infra/utility
    _skip = {"router", "routeTree", "use-mobile", "utils", "lib/"}
    page_files = [f for f in meta.source_files if not any(p in f for p in _skip)]
    source_list = "\n".join(f"- {f}" for f in page_files)

    has_index_html = (meta.path / "index.html").exists()
    css_candidates = ["src/index.css", "src/styles.css", "src/global.css", "src/app.css"]
    css_entry = next((c for c in css_candidates if (meta.path / c).exists()), "src/index.css")

    # --- Phase 1: read files via agent loop ---
    log.info("  [prerender] phase 1: reading source files")
    source_content = await run_agent(
        system_prompt=_READER_SYSTEM,
        user_prompt=f"Read and return the complete contents of these files:\n{source_list}",
        cwd=meta.path,
        allowed_tools=["Read", "Glob"],
        model=model,
        api_key=api_key,
        label="reader",
    )

    # --- Phase 2: generate HTML via plain API call (text output, no tools) ---
    log.info("  [prerender] phase 2: generating HTML")
    html_instructions = (
        "Use the existing index.html as the document skeleton."
        if has_index_html
        else (
            "There is no index.html — synthesise a valid HTML5 skeleton using the "
            "<head> metadata (title, description, og tags) found in the route components."
        )
    )

    # Discover actual asset files so Claude can reference them correctly
    asset_files = _discover_assets(meta.path)
    asset_note = ""
    if asset_files:
        asset_note = (
            "\n\nAsset files available in this repo:\n"
            + "\n".join(f"  {a}" for a in asset_files)
            + "\n\nIMPORTANT: For every image or font import in the source "
            "(e.g. `import heroImage from '@/assets/hero-dashboard.jpg'`), "
            "use `src=\"assets/hero-dashboard.jpg\"` in the output HTML. "
            "Always use the filename only under `assets/` — never use the original "
            "import path or Vite alias. Every image that exists in the source MUST "
            "appear in the output HTML."
        )

    client = anthropic.AsyncAnthropic(api_key=api_key)
    user_message = (
        f"Stack: {meta.stack}\n"
        f"{html_instructions}\n"
        f"{asset_note}\n\n"
        f"Source files:\n\n{source_content}\n\n"
        "Now output the complete static HTML document. "
        "Preserve all Tailwind class names verbatim. "
        "Remove any <script type=\"module\"> Vite dev-server tags. "
        "Output ONLY the HTML, starting with <!doctype html>."
    )

    # Use streaming to handle long-running generation without SDK timeout
    chunks: list[str] = []
    async with client.messages.stream(
        model=model,
        system=PRERENDERER_SYSTEM,
        messages=[{"role": "user", "content": user_message}],
        max_tokens=32000,
    ) as stream:
        async for text in stream.text_stream:
            chunks.append(text)

    html = "".join(chunks)
    # Strip accidental markdown fences
    html = re.sub(r"^```(?:html)?\s*", "", html.strip(), flags=re.IGNORECASE)
    html = re.sub(r"\s*```\s*$", "", html)

    if not html.strip().lower().startswith("<!doctype"):
        raise RuntimeError(f"HTML generation did not return valid HTML (stop_reason={response.stop_reason})")

    output = meta.path / "seo" / "index.html"
    output.write_text(html)
    log.info("  [prerender] wrote seo/index.html (%d bytes)", len(html))

    # Copy local assets referenced in the HTML
    await _copy_assets(meta.path, output)

    # Compile and inline Tailwind CSS
    log.info("  [prerender] compiling Tailwind CSS")
    await asyncio.to_thread(_inline_tailwind, meta.path, output, css_entry)

    return output


def _discover_assets(repo_path: Path) -> list[str]:
    """Return all image/font files under src/assets/ and public/."""
    exts = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".otf"}
    found = []
    for search_dir in [repo_path / "src" / "assets", repo_path / "public"]:
        if search_dir.exists():
            for p in sorted(search_dir.rglob("*")):
                if p.is_file() and p.suffix.lower() in exts:
                    found.append(str(p.relative_to(repo_path)))
    return found


async def _copy_assets(repo_path: Path, html_path: Path) -> None:
    """
    Copy local images/fonts to seo/assets/ and rewrite all refs in the HTML.
    Handles: src/href attributes, inline style background-image, @/assets/ Vite aliases.
    Strategy: build a filename→source_path map for all known assets, then scan
    every asset-like reference in the HTML and resolve by filename.
    """
    import shutil

    # Build a lookup: filename (lowercase) → absolute source path
    asset_map: dict[str, Path] = {}
    for rel in _discover_assets(repo_path):
        p = repo_path / rel
        asset_map[p.name.lower()] = p

    if not asset_map:
        return

    html = html_path.read_text()
    assets_dir = repo_path / "seo" / "assets"
    updated = html
    copied: set[str] = set()

    # All patterns that can carry an asset reference
    patterns = [
        # src="..." and href="..."
        r'(?:src|href)=["\']([^"\']+)["\']',
        # url(...) in style attributes or <style> blocks
        r'url\(["\']?([^"\')\s]+)["\']?\)',
        # content="..." on og:image meta
        r'content=["\']([^"\']+\.(jpg|jpeg|png|gif|webp|svg|ico))["\']',
    ]

    all_refs: list[str] = []
    for pat in patterns:
        all_refs.extend(re.findall(pat, html, re.IGNORECASE))

    # Flatten (some patterns return tuples)
    flat_refs: list[str] = []
    for r in all_refs:
        flat_refs.append(r[0] if isinstance(r, tuple) else r)

    for ref in flat_refs:
        if ref.startswith(("http://", "https://", "data:", "//", "#")):
            continue
        # Extract just the filename
        filename = Path(ref.split("?")[0]).name.lower()
        if not filename or "." not in filename:
            continue
        if filename not in asset_map:
            continue

        src_path = asset_map[filename]
        if filename not in copied:
            assets_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_path, assets_dir / src_path.name)
            copied.add(filename)
            log.info("  [prerender] copied asset: %s", src_path.name)

        # Rewrite every occurrence of this ref (exact string match)
        new_ref = f"assets/{src_path.name}"
        if ref != new_ref:
            updated = updated.replace(f'"{ref}"', f'"{new_ref}"')
            updated = updated.replace(f"'{ref}'", f"'{new_ref}'")

    if updated != html:
        html_path.write_text(updated)
        log.info("  [prerender] rewrote %d asset references", len(copied))
