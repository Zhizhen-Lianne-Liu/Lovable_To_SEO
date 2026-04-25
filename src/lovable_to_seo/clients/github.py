"""GitHub Git Data API client — atomic multi-file commits via blobs+trees."""
from __future__ import annotations

import base64
from urllib.parse import urlparse

import httpx


class GitHubError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(f"GitHub API {status}: {message}")
        self.status = status


class GitHubClient:
    def __init__(self, token: str):
        self._token = token
        self._base = "https://api.github.com"

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def _get(self, path: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{self._base}{path}", headers=self._headers())
            if not resp.is_success:
                raise GitHubError(resp.status_code, resp.text)
            return resp.json()

    async def _post(self, path: str, body: dict) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self._base}{path}", headers=self._headers(), json=body
            )
            if not resp.is_success:
                raise GitHubError(resp.status_code, resp.text)
            return resp.json()

    async def _patch(self, path: str, body: dict) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.patch(
                f"{self._base}{path}", headers=self._headers(), json=body
            )
            if not resp.is_success:
                raise GitHubError(resp.status_code, resp.text)
            return resp.json()

    @staticmethod
    def parse_repo_url(repo_url: str) -> tuple[str, str]:
        """Extract (owner, repo) from https://github.com/owner/repo[.git]."""
        parsed = urlparse(repo_url)
        parts = parsed.path.strip("/").replace(".git", "").split("/")
        if len(parts) < 2:
            raise ValueError(f"Cannot parse owner/repo from {repo_url!r}")
        return parts[0], parts[1]

    async def get_default_branch(self, owner: str, repo: str) -> str:
        data = await self._get(f"/repos/{owner}/{repo}")
        return data["default_branch"]

    async def get_branch_sha(self, owner: str, repo: str, branch: str) -> str:
        data = await self._get(f"/repos/{owner}/{repo}/git/ref/heads/{branch}")
        return data["object"]["sha"]

    async def _create_blob(self, owner: str, repo: str, content: bytes) -> str:
        data = await self._post(
            f"/repos/{owner}/{repo}/git/blobs",
            {"content": base64.b64encode(content).decode(), "encoding": "base64"},
        )
        return data["sha"]

    async def publish_to_main(
        self,
        repo_url: str,
        files: dict[str, bytes],
        commit_message: str,
        expected_parent_sha: str,
    ) -> dict[str, str]:
        """
        Replace the entire tree on main with exactly the given files.
        No base_tree → all files not in `files` are implicitly deleted.
        Refuses to push if main has moved since expected_parent_sha was read
        (concurrency guard).
        """
        owner, repo = self.parse_repo_url(repo_url)
        default_branch = await self.get_default_branch(owner, repo)
        current_sha = await self.get_branch_sha(owner, repo, default_branch)

        if current_sha != expected_parent_sha:
            raise GitHubError(
                409,
                f"main has moved ({expected_parent_sha[:7]}→{current_sha[:7]}); "
                "re-run to pick up the latest commit",
            )

        # Create blobs for each file
        tree_entries = []
        for path, content in files.items():
            blob_sha = await self._create_blob(owner, repo, content)
            tree_entries.append({"path": path, "mode": "100644", "type": "blob", "sha": blob_sha})

        # New tree with NO base_tree → implicit delete of all original files
        tree_data = await self._post(
            f"/repos/{owner}/{repo}/git/trees",
            {"tree": tree_entries},
        )
        new_tree_sha = tree_data["sha"]

        # Commit
        commit_data = await self._post(
            f"/repos/{owner}/{repo}/git/commits",
            {
                "message": commit_message,
                "tree": new_tree_sha,
                "parents": [expected_parent_sha],
            },
        )
        new_commit_sha = commit_data["sha"]

        # Fast-forward the branch ref
        await self._patch(
            f"/repos/{owner}/{repo}/git/refs/heads/{default_branch}",
            {"sha": new_commit_sha, "force": False},
        )

        return {
            "commit_sha": new_commit_sha,
            "commit_url": f"https://github.com/{owner}/{repo}/commit/{new_commit_sha}",
            "parent_sha": expected_parent_sha,
        }
