"""Pure Python decision table: DiagnoseBundle → list[ActionItem]."""
from __future__ import annotations

from ..models.insights import ActionItem, EditType, Priority
from ..models.peecai import DiagnoseBundle


def analyze(bundle: DiagnoseBundle, own_brand_id: str, max_items: int = 5) -> list[ActionItem]:
    own = next((r for r in bundle.brand_report if r.brand_id == own_brand_id), None)
    if own is None:
        # Fall back to lowest-visibility brand if ID not found
        own = min(bundle.brand_report, key=lambda r: r.visibility, default=None)
    if own is None:
        return []

    competitors = [r for r in bundle.brand_report if r.brand_id != own.brand_id]
    top_competitor = max(competitors, key=lambda r: r.share_of_voice, default=None)

    own_urls = [u for u in bundle.url_report if own.brand_id in u.mentioned_brand_ids]
    avg_citation_rate = (
        sum(u.citation_rate for u in own_urls) / len(own_urls) if own_urls else 0.0
    )

    items: list[ActionItem] = []

    # CRITICAL: low overall visibility
    if own.visibility < 0.20:
        items.append(ActionItem(
            edit_type=EditType.ADD_JSON_LD_ORG_SOFTWARE,
            priority=Priority.CRITICAL,
            target_file="seo/index.html",
            rationale="Brand has near-zero AI visibility; structured data helps LLMs identify and cite the product.",
            evidence=f"visibility={own.visibility:.2f} (threshold 0.20)",
        ))

    # CRITICAL: own URLs rarely cited
    if avg_citation_rate < 0.30:
        queries = [q.query_text for q in bundle.search_queries[:6]]
        items.append(ActionItem(
            edit_type=EditType.ADD_FAQ_SECTION,
            priority=Priority.CRITICAL,
            target_file="seo/index.html",
            rationale="Own URLs have low citation rate; FAQ content matching observed buyer queries improves citability.",
            evidence=f"avg citation_rate={avg_citation_rate:.2f}; queries: {', '.join(queries)}",
        ))

    # HIGH: competitor outperforming on share of voice
    if top_competitor and top_competitor.share_of_voice > own.share_of_voice:
        items.append(ActionItem(
            edit_type=EditType.ADD_COMPARISON_TABLE,
            priority=Priority.HIGH,
            target_file="seo/index.html",
            rationale="Competitors dominate AI share of voice; a comparison table captures 'X vs Y' query traffic.",
            evidence=(
                f"{own.brand_name} sov={own.share_of_voice:.2f} vs "
                f"{top_competitor.brand_name} sov={top_competitor.share_of_voice:.2f}"
            ),
        ))

    # HIGH: weak sentiment
    if own.sentiment < 0.55:
        items.append(ActionItem(
            edit_type=EditType.TIGHTEN_HERO_COPY,
            priority=Priority.HIGH,
            target_file="seo/index.html",
            rationale="Brand sentiment is weak; sharpening hero copy around key differentiators improves how LLMs describe the product.",
            evidence=f"sentiment={own.sentiment:.2f} (threshold 0.55)",
        ))

    # MEDIUM: not appearing in top-3 mentions
    if own.position > 3.5:
        items.append(ActionItem(
            edit_type=EditType.ADD_PRIMARY_KEYWORD_TO_TITLE_H1,
            priority=Priority.MEDIUM,
            target_file="seo/index.html",
            rationale="Brand appears late in AI responses; front-loading the primary keyword in <title> and <h1> improves position.",
            evidence=f"avg position={own.position:.1f} (threshold 3.5)",
        ))

    # MEDIUM: always emit robots.txt, sitemap.xml, and llms.txt
    items.append(ActionItem(
        edit_type=EditType.EMIT_ROBOTS_TXT,
        priority=Priority.MEDIUM,
        target_file="seo/robots.txt",
        rationale="robots.txt explicitly allows all AI crawlers (GPTBot, PerplexityBot, ClaudeBot, Google-Extended, Bingbot).",
        evidence="always",
    ))
    items.append(ActionItem(
        edit_type=EditType.EMIT_SITEMAP_XML,
        priority=Priority.MEDIUM,
        target_file="seo/sitemap.xml",
        rationale="sitemap.xml helps crawlers discover and date the page.",
        evidence="always",
    ))
    items.append(ActionItem(
        edit_type=EditType.EMIT_LLMS_TXT,
        priority=Priority.MEDIUM,
        target_file="seo/llms.txt",
        rationale="llms.txt gives AI agents a machine-readable product overview for programmatic evaluation.",
        evidence="always",
    ))
    items.append(ActionItem(
        edit_type=EditType.EMIT_PRICING_MD,
        priority=Priority.MEDIUM,
        target_file="seo/pricing.md",
        rationale="AI agents evaluating tools programmatically can't parse JS-rendered pricing; a plain markdown file is trivially readable.",
        evidence="always",
    ))

    # LOW: no OG/Twitter meta
    items.append(ActionItem(
        edit_type=EditType.ADD_OG_TWITTER_META,
        priority=Priority.LOW,
        target_file="seo/index.html",
        rationale="OG and Twitter meta tags improve link previews and signal page identity to AI crawlers.",
        evidence="defensive best-practice",
    ))

    # Sort by priority value (1=CRITICAL is lowest int), deduplicate edit_types
    seen: set[EditType] = set()
    deduped: list[ActionItem] = []
    for item in sorted(items, key=lambda x: x.priority.value):
        if item.edit_type not in seen:
            seen.add(item.edit_type)
            deduped.append(item)

    return deduped[:max_items]
