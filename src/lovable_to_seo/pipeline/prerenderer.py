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
    """Compile Tailwind CSS and inline it. Falls back to CDN script."""
    css_src = repo_path / css_entry
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
            style_block = f"<style>{compiled_css}</style>"
            html = re.sub(r'<link[^>]+href=["\']\/assets\/[^"\']+\.css["\'][^>]*>', "", html)
            html = html.replace("</head>", f"{style_block}\n</head>", 1)
            html_path.write_text(html)
            log.info("  tailwind compiled and inlined (%d bytes)", len(compiled_css))
            css_out.unlink(missing_ok=True)
            return

    # Fallback: CDN
    log.info("  tailwind CLI unavailable — using CDN fallback")
    cdn = '<script src="https://cdn.tailwindcss.com"></script>'
    html = html_path.read_text()
    if "tailwindcss.com" not in html:
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

    client = anthropic.AsyncAnthropic(api_key=api_key)
    user_message = (
        f"Stack: {meta.stack}\n"
        f"{html_instructions}\n\n"
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


async def _copy_assets(repo_path: Path, html_path: Path) -> None:
    """Copy local images/fonts referenced in the HTML to seo/assets/."""
    html = html_path.read_text()
    asset_refs = re.findall(r'(?:src|href)=["\']([^"\']+\.(jpg|jpeg|png|gif|webp|svg|ico|woff2?|ttf))["\']', html, re.IGNORECASE)
    updated = html
    assets_dir = repo_path / "seo" / "assets"

    for ref, _ in asset_refs:
        if ref.startswith(("http://", "https://", "data:", "//")):
            continue
        # Resolve relative to repo root or src/assets
        for base in [repo_path, repo_path / "src"]:
            candidate = (base / ref.lstrip("/")).resolve()
            if candidate.exists():
                assets_dir.mkdir(parents=True, exist_ok=True)
                dest = assets_dir / candidate.name
                import shutil
                shutil.copy2(candidate, dest)
                updated = updated.replace(ref, f"assets/{candidate.name}")
                break

    if updated != html:
        html_path.write_text(updated)
        log.info("  [prerender] copied local assets to seo/assets/")
