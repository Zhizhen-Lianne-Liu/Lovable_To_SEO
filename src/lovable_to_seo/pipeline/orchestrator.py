"""Orchestrator — wires all five pipeline stages into a single async run."""
from __future__ import annotations

import asyncio
import logging
import uuid

from ..config import Settings
from ..models.runs import RunRequest, RunResult
from .analyzer import analyze
from .diagnoser import diagnose
from .enhancer import enhance
from .ingester import AlreadyMigratedError, ingest
from .prerenderer import prerender
from .shipper import ship

log = logging.getLogger("lovable_to_seo")


async def run_pipeline(request: RunRequest, settings: Settings) -> RunResult:
    run_id = str(uuid.uuid4())[:8]
    log.info("[%s] pipeline started — %s", run_id, request.github_repo_url)

    # Stage 1: Ingest
    log.info("[%s] stage 1/6 → INGEST", run_id)
    try:
        meta = await ingest(request.github_repo_url)
    except AlreadyMigratedError as e:
        return RunResult(
            run_id=run_id,
            status="already_migrated",
            error=str(e),
            revert_instructions=(
                f"git revert HEAD  # or: git checkout {e.parent_sha} -- . && git commit"
                if e.parent_sha else "git revert HEAD"
            ),
        )
    except Exception as e:
        return RunResult(run_id=run_id, status="error", error=f"Ingest failed: {e}")

    log.info("[%s]   stack=%s  source_files=%d", run_id, meta.stack, len(meta.source_files))

    # Stage 2 + 3: Prerender and Diagnose concurrently
    log.info("[%s] stage 2+3/6 → PRERENDER + DIAGNOSE (concurrent)", run_id)
    try:
        prerender_task = asyncio.create_task(
            prerender(meta, model=settings.claude_agent_model, api_key=settings.anthropic_api_key)
        )
        diagnose_task = asyncio.create_task(
            diagnose(
                project_id=request.peec_project_id,
                own_brand_id=request.own_brand_id,
                lookback_days=request.lookback_days,
                fixture_path=settings.peec_fixture,
            )
        )
        _, bundle = await asyncio.gather(prerender_task, diagnose_task)
        log.info("[%s]   prerender ✓  diagnose ✓", run_id)
    except Exception as e:
        return RunResult(run_id=run_id, status="error", error=f"Prerender/Diagnose failed: {e}")

    # Stage 4: Analyze
    log.info("[%s] stage 4/6 → ANALYZE", run_id)
    try:
        action_items = analyze(bundle, request.own_brand_id, request.max_action_items)
        for item in action_items:
            log.info("[%s]   [%s] %s", run_id, item.priority.name, item.edit_type.value)
    except Exception as e:
        return RunResult(run_id=run_id, status="error", error=f"Analyze failed: {e}")

    # Stage 5: Enhance
    log.info("[%s] stage 5/6 → ENHANCE (%d action items)", run_id, len(action_items))
    try:
        await enhance(meta, action_items, model=settings.claude_agent_model, api_key=settings.anthropic_api_key)
        log.info("[%s]   enhance ✓", run_id)
    except Exception as e:
        return RunResult(run_id=run_id, status="error", error=f"Enhance failed: {e}")

    # Stage 6: Ship
    log.info("[%s] stage 6/6 → SHIP (push=%s)", run_id, request.push)
    try:
        ship_result = await ship(
            repo_url=request.github_repo_url,
            seo_dir=meta.path / "seo",
            run_id=run_id,
            action_items=action_items,
            github_token=settings.github_token,
            push=request.push,
        )
    except Exception as e:
        return RunResult(run_id=run_id, status="error", error=f"Ship failed: {e}")

    log.info("[%s] pipeline done — commit=%s", run_id, ship_result.commit_sha or "dry-run")

    revert = None
    if ship_result.parent_sha:
        revert = f"git revert HEAD  # restores to {ship_result.parent_sha[:7]}"

    return RunResult(
        run_id=run_id,
        status="done",
        commit_sha=ship_result.commit_sha or None,
        parent_sha=ship_result.parent_sha or None,
        commit_url=ship_result.commit_url or None,
        revert_instructions=revert,
        action_items=action_items,
    )
