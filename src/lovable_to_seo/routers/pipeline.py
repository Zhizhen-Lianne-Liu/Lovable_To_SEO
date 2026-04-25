from fastapi import APIRouter, BackgroundTasks, HTTPException
from ..config import get_settings
from ..models.runs import RunRequest, RunResult
from ..pipeline.orchestrator import run_pipeline
from .. import runs_store

router = APIRouter()


async def _run_and_store(run_id: str, request: RunRequest) -> None:
    settings = get_settings()
    # Mark as running
    runs_store.put(RunResult(run_id=run_id, status="running"))
    result = await run_pipeline(request, settings)
    result.run_id = run_id
    runs_store.put(result)


@router.post("/run", status_code=202)
async def start_run(request: RunRequest, background_tasks: BackgroundTasks) -> dict:
    import uuid
    run_id = str(uuid.uuid4())[:8]
    runs_store.put(RunResult(run_id=run_id, status="pending"))
    background_tasks.add_task(_run_and_store, run_id, request)
    return {"run_id": run_id, "status": "pending"}


@router.get("/run/{run_id}")
async def get_run(run_id: str) -> RunResult:
    result = runs_store.get(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    return result


@router.post("/run/sync")
async def run_sync(request: RunRequest) -> RunResult:
    settings = get_settings()
    return await run_pipeline(request, settings)


@router.get("/health")
async def health() -> dict:
    from datetime import datetime, timezone
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}
