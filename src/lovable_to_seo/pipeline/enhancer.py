"""Enhance stage — Claude agent loop that edits seo/ in-place."""
from __future__ import annotations

from pathlib import Path

from ..claude_agent import run_agent
from ..models.insights import ActionItem
from ..pipeline.ingester import RepoMeta
from ..prompts.enhancer import ENHANCER_SYSTEM


def _format_action_items(items: list[ActionItem]) -> str:
    lines = ["| Priority | EditType | Target | Rationale | Evidence |", "|---|---|---|---|---|"]
    for item in items:
        lines.append(
            f"| {item.priority.name} | {item.edit_type.value} | "
            f"`{item.target_file}` | {item.rationale} | {item.evidence} |"
        )
    return "\n".join(lines)


async def enhance(
    meta: RepoMeta,
    action_items: list[ActionItem],
    model: str,
    api_key: str,
) -> None:
    """
    Run the enhance agent. Edits seo/index.html in-place and writes
    seo/robots.txt and seo/sitemap.xml. Returns nothing — files are on disk.
    """
    seo_index = meta.path / "seo" / "index.html"
    if not seo_index.exists():
        raise RuntimeError("seo/index.html not found; run prerender first")

    items_md = _format_action_items(action_items)
    user_prompt = (
        "The file seo/index.html has been prerendered (static HTML, Tailwind CSS inlined).\n\n"
        f"Apply these prioritized AEO action items:\n\n{items_md}\n\n"
        "Edit seo/index.html in place using the Edit tool. "
        "Write seo/robots.txt and seo/sitemap.xml using the Write tool. "
        "Work through items in priority order (CRITICAL first). "
        "When done, output one summary line."
    )

    await run_agent(
        system_prompt=ENHANCER_SYSTEM,
        user_prompt=user_prompt,
        cwd=meta.path,
        allowed_tools=["Read", "Edit", "Write"],
        model=model,
        api_key=api_key,
        label="enhance",
    )
