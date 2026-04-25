"""
End-to-end pipeline: domain in → Peec insights out.

Steps:
  1. Tavily competitor discovery (research/discover.py)
  2. Anton's prompt generation (anton/scripts/prompts.ts via subprocess)
  3. Peec push: brands (own + competitors) + prompts (REST)
  4. Wait ~60s for chats to land
  5. Snapshot composer — REST endpoints (research/snapshot.py)
  6. Actions overlay — MCP only (research/mcp_client.py via subprocess) merged in

Final artifact: data/<project_id>/snapshot_<ts>.json — the GEO insights for the
next pipeline stage.

Usage:
  python3 orchestrate.py --domain attio.com --project-id or_xxx
  python3 orchestrate.py --domain attio.com --project-id or_xxx --dry-run
  python3 orchestrate.py --domain attio.com --project-id or_xxx --skip-prompts
  python3 orchestrate.py --domain attio.com --project-id or_xxx --prompts-from prompts.json
  python3 orchestrate.py --domain attio.com --project-id or_xxx --no-mcp
"""
import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from discover import run as discover_run, load_env, normalize_input_domain
from push import push as peec_push, push_prompts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--domain", required=True, help="Input domain (e.g. attio.com)")
    ap.add_argument("--project-id", required=True, help="Peec project ID (or_...)")
    ap.add_argument("--country", default=None,
                    help="ISO 3166-1 alpha-2. If omitted, derived from domain TLD; defaults to US.")
    ap.add_argument("--dry-run", action="store_true",
                    help="Run research + show what would change, no Peec writes")
    ap.add_argument("--skip-research", help="Skip discovery, use this existing results.json")
    ap.add_argument("--skip-prompts", action="store_true",
                    help="Skip Anton's prompt-gen step (faster, but Peec gets no new prompts)")
    ap.add_argument("--prompts-from", help="Load prompts from this JSON file instead of running Anton")
    ap.add_argument("--wait-seconds", type=int, default=90,
                    help="Seconds to wait after pushing prompts before the snapshot (default 90)")
    ap.add_argument("--no-snapshot", action="store_true", help="Skip the readback snapshot")
    ap.add_argument("--no-mcp", action="store_true",
                    help="Skip the MCP actions overlay (REST-only snapshot, missing actions/recommendations)")
    args = ap.parse_args()

    load_env()

    # ---- Step 1: Tavily competitor discovery ----
    if args.skip_research:
        print(f"[1/5] Loading prior research from {args.skip_research}")
        results = json.loads(Path(args.skip_research).read_text())
    else:
        print(f"[1/5] Tavily competitor discovery on {args.domain}…")
        results = discover_run(normalize_input_domain(args.domain))

    self_profile = results["self"]
    self_profile["canonical_name"] = self_profile.get("name_guess")
    final = results.get("final", [])
    if not final:
        sys.exit("Discovery returned no competitors. Aborting.")
    competitor_domains = [c["domain"] for c in final]
    print(f"      → {len(competitor_domains)} competitors: {', '.join(competitor_domains[:5])}…")

    # ---- Step 2: Anton's prompt generation ----
    prompt_set = None
    if args.prompts_from:
        print(f"\n[2/5] Loading prompts from {args.prompts_from}")
        prompt_set = json.loads(Path(args.prompts_from).read_text())
    elif args.skip_prompts:
        print("\n[2/5] Skipping prompt generation (--skip-prompts)")
    else:
        print("\n[2/5] Generating prompts via anton/'s pipeline (this can take 60–90s)…")
        from anton_runner import generate_prompts
        prompt_set = generate_prompts(
            competitor_domains,
            country=args.country,
            own_domain=self_profile["domain"],
        )

    prompts = (prompt_set or {}).get("prompts", []) if prompt_set else []

    # ---- Step 3: Push brands + prompts to Peec ----
    print(f"\n[3/5] Peec push (project={args.project_id})…")
    brand_summary = peec_push(args.project_id, self_profile, final, dry_run=args.dry_run)

    if prompts:
        country_for_peec = (args.country or "US").upper()
        prompt_summary = push_prompts(args.project_id, prompts,
                                      country_code=country_for_peec, dry_run=args.dry_run)
    else:
        prompt_summary = {"prompts_deleted": 0, "prompts_created": 0, "_skipped": True}

    if args.dry_run:
        print("\n[DRY RUN] no further steps.")
        print(json.dumps({"brands": brand_summary, "prompts": prompt_summary}, indent=2, default=str)[:1500])
        return

    if args.no_snapshot:
        print("\n[DONE] (no snapshot — --no-snapshot)")
        return

    # ---- Step 4: Wait for chats to land ----
    print(f"\n[4/5] Waiting {args.wait_seconds}s for Peec to run prompts across active models…")
    for remaining in range(args.wait_seconds, 0, -10):
        print(f"      …{remaining}s")
        time.sleep(10)

    # ---- Step 5: Compose the snapshot ----
    print("\n[5/6] Composing snapshot via REST endpoints…")
    from snapshot import complete_snapshot, print_summary
    snap = complete_snapshot(args.project_id, days=1)
    print_summary(snap)

    # ---- Step 6: Actions overlay via MCP (REST has no actions endpoint) ----
    if args.no_mcp:
        print("\n[6/6] Skipping MCP actions overlay (--no-mcp). Snapshot has no recommendations.")
    else:
        snap["actions_via_mcp"] = _fetch_actions_via_mcp(args.project_id)

    out = Path(__file__).resolve().parent.parent / "data" / args.project_id / f"snapshot_{int(time.time())}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snap, indent=2, default=str))
    print(f"\n[DONE] snapshot saved → {out}")


def _fetch_actions_via_mcp(project_id: str) -> dict:
    """Run mcp_client.py as a subprocess, then read its output JSON.

    First run opens a browser for Peec OAuth (one-time). Subsequent runs are
    headless using the persisted .peec_oauth.json.
    """
    print("\n[6/6] Fetching Peec actions via MCP (REST-unavailable layer)…")
    here = Path(__file__).resolve().parent
    mcp_script = here / "mcp_client.py"
    actions_path = here.parent / "data" / project_id / "actions_via_mcp.json"

    venv_py = here.parent / ".venv" / "bin" / "python3"
    py = str(venv_py) if venv_py.exists() else sys.executable
    if not venv_py.exists():
        print(f"      [warn] .venv not found — falling back to {py}. "
              "If 'mcp' isn't installed in this interpreter, the actions step will fail "
              "(harmless — REST snapshot still ships).")

    cmd = [py, str(mcp_script), project_id]
    proc = subprocess.run(cmd, env=os.environ.copy(),
                          stdout=None, stderr=None, check=False)
    if proc.returncode != 0:
        print(f"      [warn] mcp_client exited {proc.returncode} — actions overlay unavailable.")
        return {"_error": f"mcp_client exit {proc.returncode}"}
    if not actions_path.exists():
        return {"_error": "mcp_client ran but produced no JSON file"}
    return json.loads(actions_path.read_text())


if __name__ == "__main__":
    main()
