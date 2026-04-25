from typing import Literal
from pydantic import BaseModel
from .insights import ActionItem


class RunRequest(BaseModel):
    github_repo_url: str
    peec_project_id: str
    own_brand_id: str
    lookback_days: int = 30
    max_action_items: int = 5
    push: bool = True


class RunResult(BaseModel):
    run_id: str
    status: Literal["pending", "running", "done", "error", "already_migrated"]
    commit_sha: str | None = None
    parent_sha: str | None = None
    commit_url: str | None = None
    revert_instructions: str | None = None
    action_items: list[ActionItem] = []
    error: str | None = None
