"""
Peec MCP client — connects to https://api.peec.ai/mcp via streamable HTTP + OAuth.

First run: opens a browser for OAuth consent. Token gets persisted to .peec_oauth.json.
Subsequent runs: reuses the stored token (refreshing if needed).

Calls the tools the REST API doesn't expose — primarily get_actions.

Run:  .venv/bin/python3 research/mcp_client.py <project_id>
"""
import asyncio
import json
import os
import sys
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, urlparse

from mcp import ClientSession
from mcp.client.auth import OAuthClientProvider, TokenStorage
from mcp.client.streamable_http import streamablehttp_client
from mcp.shared.auth import OAuthClientInformationFull, OAuthClientMetadata, OAuthToken

ROOT = Path(__file__).resolve().parent.parent
TOKEN_FILE = ROOT / ".peec_oauth.json"
CALLBACK_PORT = 59012  # different from Claude Code's 59011
SERVER_URL = "https://api.peec.ai/mcp"


# ---------------- Token persistence ---------------- #

class FileTokenStorage(TokenStorage):
    """Persists tokens + dynamic client registration to a JSON file on disk."""

    def __init__(self, path: Path):
        self.path = path

    def _read(self) -> dict:
        if self.path.exists():
            return json.loads(self.path.read_text())
        return {}

    def _write(self, data: dict) -> None:
        self.path.write_text(json.dumps(data, indent=2))

    async def get_tokens(self) -> OAuthToken | None:
        d = self._read().get("tokens")
        return OAuthToken.model_validate(d) if d else None

    async def set_tokens(self, tokens: OAuthToken) -> None:
        d = self._read()
        d["tokens"] = tokens.model_dump(mode="json")
        self._write(d)

    async def get_client_info(self) -> OAuthClientInformationFull | None:
        d = self._read().get("client_info")
        return OAuthClientInformationFull.model_validate(d) if d else None

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        d = self._read()
        d["client_info"] = client_info.model_dump(mode="json")
        self._write(d)


# ---------------- Browser-redirect OAuth helper ---------------- #

class _CodeCatcher(BaseHTTPRequestHandler):
    code_holder: dict = {}
    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        code = (params.get("code") or [""])[0]
        # Ignore favicon / browser pings / non-OAuth probes — only the real
        # callback has a `code` query param.
        if not code:
            self.send_response(404)
            self.end_headers()
            return
        state = (params.get("state") or [""])[0]
        _CodeCatcher.code_holder["code"] = code
        _CodeCatcher.code_holder["state"] = state
        self.send_response(200)
        self.send_header("content-type", "text/html")
        self.end_headers()
        self.wfile.write(b"<h1>Peec MCP authenticated.</h1><p>You can close this tab.</p>")
    def log_message(self, *a, **kw): pass  # silence


async def _redirect_handler(authorization_url: str) -> None:
    print(f"[OAuth] Opening browser for consent…\n  {authorization_url}\n")
    webbrowser.open(authorization_url)


async def _callback_handler() -> tuple[str, str | None]:
    """Spin up a local server to catch the OAuth callback."""
    server = HTTPServer(("localhost", CALLBACK_PORT), _CodeCatcher)
    Thread(target=server.serve_forever, daemon=True).start()
    print(f"[OAuth] Waiting for redirect to http://localhost:{CALLBACK_PORT}/callback …")
    while "code" not in _CodeCatcher.code_holder:
        await asyncio.sleep(0.5)
    server.shutdown()
    return _CodeCatcher.code_holder["code"], _CodeCatcher.code_holder.get("state")


def make_auth_provider() -> OAuthClientProvider:
    return OAuthClientProvider(
        server_url=SERVER_URL,
        client_metadata=OAuthClientMetadata(
            client_name="peec-hackathon",
            redirect_uris=[f"http://localhost:{CALLBACK_PORT}/callback"],
            grant_types=["authorization_code", "refresh_token"],
            response_types=["code"],
            token_endpoint_auth_method="none",
        ),
        storage=FileTokenStorage(TOKEN_FILE),
        redirect_handler=_redirect_handler,
        callback_handler=_callback_handler,
    )


# ---------------- High-level helpers ---------------- #

async def call_tool(session: ClientSession, name: str, arguments: dict) -> dict:
    """Call an MCP tool and return the parsed result. Raises on tool errors."""
    result = await session.call_tool(name, arguments)
    if result.isError:
        msg = result.content[0].text if result.content else "unknown"
        raise RuntimeError(f"tool {name} returned error: {msg}")
    # Tool results come back as content items — text content is JSON-encoded for Peec
    if result.content and hasattr(result.content[0], "text"):
        try:
            return json.loads(result.content[0].text)
        except json.JSONDecodeError:
            return {"raw": result.content[0].text}
    return {}


async def list_available_tools(session: ClientSession) -> list[str]:
    tools = await session.list_tools()
    return [t.name for t in tools.tools]


# ---------------- Main demo ---------------- #

async def fetch_actions_tree(session: ClientSession, project_id: str) -> dict:
    """Pull overview + drill into every non-zero opportunity slice."""
    overview = await call_tool(session, "get_actions",
                               {"project_id": project_id, "scope": "overview"})
    rows = overview.get("rows", [])
    cols = overview.get("columns", [])
    if not rows:
        return {"overview": overview, "drilled": []}

    # Map columnar → records for easier processing
    overview_records = [dict(zip(cols, r)) for r in rows]
    drilled = []
    for rec in overview_records:
        score = rec.get("opportunity_score") or 0
        if score <= 0:
            continue
        scope = (rec.get("action_group_type") or "").lower()
        url_class = rec.get("url_classification")
        domain = rec.get("domain")
        args = {"project_id": project_id, "scope": scope}
        if scope in ("owned", "editorial") and url_class:
            args["url_classification"] = url_class
        if scope in ("reference", "ugc") and domain:
            args["domain"] = domain
        try:
            detail = await call_tool(session, "get_actions", args)
        except RuntimeError as e:
            drilled.append({"slice": rec, "error": str(e)})
            continue
        drilled.append({"slice": rec, "details": detail})
    return {"overview": overview_records, "drilled": drilled}


async def main(project_id: str):
    auth = make_auth_provider()
    print(f"[mcp] Connecting to {SERVER_URL} …")
    async with streamablehttp_client(SERVER_URL, auth=auth) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await list_available_tools(session)
            print(f"[mcp] {len(tools)} tools available. First few: {tools[:6]}")

            print(f"\n[mcp] Fetching actions tree for {project_id}…")
            actions = await fetch_actions_tree(session, project_id)

            out = ROOT / "data" / project_id / "actions_via_mcp.json"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(actions, indent=2))
            print(f"\nSaved → {out}")

            # Print a summary
            print(f"\nOverview slices: {len(actions['overview'])}")
            print(f"Drilled (non-zero opportunity): {len(actions['drilled'])}")
            for d in actions["drilled"][:5]:
                s = d["slice"]
                key = s.get("domain") or s.get("url_classification") or ""
                print(f"  [{s['action_group_type']:10}] {key:20} score={s['opportunity_score']:.3f}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("Usage: .venv/bin/python3 research/mcp_client.py <project_id>")
    asyncio.run(main(sys.argv[1]))
