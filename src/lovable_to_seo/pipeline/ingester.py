"""Repo ingestion — ported from src/pipeline/ingest.ts."""
from __future__ import annotations

import asyncio
import json
import tempfile
from dataclasses import dataclass, field
from pathlib import Path


SOURCE_EXTS = {".tsx", ".jsx", ".ts", ".js", ".css", ".html"}
SKIP_DIRS = {"node_modules", "dist", "build", ".git", ".next", "out", "seo"}
# Skip Shadcn/Radix UI primitive dirs — they contain no page content
SKIP_CONTENT_DIRS = {"ui", "icons"}
MAX_FILES = 60
MIGRATION_SENTINEL = "generated-by:lovabletoseo"


@dataclass
class RepoMeta:
    path: Path
    remote: str | None
    default_branch: str
    stack: str  # "vite-react" | "next" | "astro" | "unknown"
    source_files: list[str] = field(default_factory=list)


class AlreadyMigratedError(Exception):
    """Raised when the repo has already been processed by lovabletoseo."""
    def __init__(self, run_id: str | None, parent_sha: str | None):
        self.run_id = run_id
        self.parent_sha = parent_sha
        msg = (
            "This repo has already been migrated by lovabletoseo"
            + (f" (run {run_id})" if run_id else "")
            + "."
        )
        if parent_sha:
            msg += (
                f" The original React source is in commit {parent_sha}."
                f" To re-run: git revert {parent_sha} or"
                f" git checkout {parent_sha} -- . && git commit"
            )
        super().__init__(msg)


def _detect_stack(repo_path: Path) -> str:
    pkg = repo_path / "package.json"
    if not pkg.exists():
        return "unknown"
    try:
        data = json.loads(pkg.read_text())
    except Exception:
        return "unknown"
    deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
    if "vite" in deps and "react" in deps:
        return "vite-react"
    if "next" in deps:
        return "next"
    if "astro" in deps:
        return "astro"
    return "unknown"


def _walk_sources(repo_path: Path) -> list[str]:
    out: list[str] = []
    # Always start with index.html
    if (repo_path / "index.html").exists():
        out.append("index.html")

    def recurse(d: Path) -> None:
        if len(out) >= MAX_FILES:
            return
        try:
            entries = sorted(d.iterdir())
        except PermissionError:
            return
        for e in entries:
            if len(out) >= MAX_FILES:
                return
            if e.is_dir():
                if e.name in SKIP_DIRS or e.name.startswith("."):
                    continue
                # Skip Shadcn/Radix UI primitive dirs inside components/
                if e.name in SKIP_CONTENT_DIRS and d.name == "components":
                    continue
                recurse(e)
            elif e.suffix in SOURCE_EXTS:
                rel = str(e.relative_to(repo_path))
                if rel not in out:
                    out.append(rel)

    src_dir = repo_path / "src"
    if src_dir.exists():
        recurse(src_dir)

    return out


def _check_migration_sentinel(repo_path: Path) -> None:
    """Abort if this repo was already migrated by lovabletoseo."""
    pkg = repo_path / "package.json"
    index = repo_path / "index.html"

    if pkg.exists():
        return  # Has a package.json → still a React project

    if not index.exists():
        return

    content = index.read_text(errors="replace")
    if "<script type=\"module\"" in content:
        return  # Still has Vite dev-server script → not migrated

    # Extract run_id and parent_sha from the sentinel comment if present
    run_id: str | None = None
    parent_sha: str | None = None
    if MIGRATION_SENTINEL in content:
        import re
        m = re.search(r"run=(\S+)", content)
        if m:
            run_id = m.group(1).rstrip(" -->")
        m = re.search(r"parent=(\S+)", content)
        if m:
            parent_sha = m.group(1).rstrip(" -->")

    raise AlreadyMigratedError(run_id, parent_sha)


async def ingest(repo_url: str) -> RepoMeta:
    """Clone repo to a temp dir and return metadata."""
    tmp = Path(tempfile.mkdtemp(prefix="ltseo-"))
    proc = await asyncio.create_subprocess_exec(
        "git", "clone", "--depth=1", repo_url, str(tmp),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"git clone failed: {stderr.decode()}")

    branch_proc = await asyncio.create_subprocess_exec(
        "git", "rev-parse", "--abbrev-ref", "HEAD",
        cwd=str(tmp),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    branch_out, _ = await branch_proc.communicate()
    default_branch = branch_out.decode().strip() or "main"

    _check_migration_sentinel(tmp)

    return RepoMeta(
        path=tmp,
        remote=repo_url,
        default_branch=default_branch,
        stack=_detect_stack(tmp),
        source_files=_walk_sources(tmp),
    )
