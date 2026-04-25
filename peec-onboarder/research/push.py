"""
Push normalized research output to a Peec AI project.

Flow:
  1. List existing brands in the project
  2. PATCH the is_own=true brand → new canonical name + new domain
  3. DELETE every non-own brand (wipe-and-replace per spec)
  4. POST one brand per competitor in the final list

The project must already exist in the Peec dashboard — there is no
project-creation endpoint in the public API.
"""
import json
import os
import sys
import time
from pathlib import Path

import requests

PEEC_API = "https://api.peec.ai/customer/v1"

# Distinct colors so the dashboard chart is readable. Cycles if more than 8 competitors.
COMPETITOR_COLORS = [
    "#3b82f6", "#ef4444", "#10b981", "#f59e0b",
    "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
]

OWN_BRAND_COLOR = "#000000"


def _headers() -> dict:
    key = os.environ.get("PEEC_API_KEY")
    if not key:
        sys.exit("Missing PEEC_API_KEY in .env")
    return {"x-api-key": key, "content-type": "application/json"}


def list_brands(project_id: str) -> list[dict]:
    r = requests.get(
        f"{PEEC_API}/brands",
        headers=_headers(),
        params={"project_id": project_id, "limit": 1000},
        timeout=30,
    )
    r.raise_for_status()
    return r.json().get("data", [])


def update_brand(brand_id: str, project_id: str, body: dict) -> dict:
    r = requests.patch(
        f"{PEEC_API}/brands/{brand_id}",
        headers=_headers(),
        params={"project_id": project_id},
        json=body,
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def delete_brand(brand_id: str, project_id: str) -> None:
    r = requests.delete(
        f"{PEEC_API}/brands/{brand_id}",
        headers=_headers(),
        params={"project_id": project_id},
        timeout=30,
    )
    if r.status_code not in (200, 204):
        r.raise_for_status()


def create_brand(project_id: str, name: str, domains: list[str], color: str | None = None,
                 aliases: list[str] | None = None) -> dict:
    body = {"name": name, "domains": domains}
    if color:
        body["color"] = color
    if aliases:
        body["aliases"] = aliases
    r = requests.post(
        f"{PEEC_API}/brands",
        headers=_headers(),
        params={"project_id": project_id},
        json=body,
        timeout=30,
    )
    if r.status_code >= 400:
        print(f"    [create_brand] {r.status_code} body={r.text[:300]}")
    r.raise_for_status()
    return r.json()


# ---------------- Coordinated push ---------------- #

def push(project_id: str, self_profile: dict, final_competitors: list[dict],
         dry_run: bool = False) -> dict:
    """Idempotent: own brand updated, all competitors wiped + recreated."""
    print(f"\n[PUSH] project={project_id}  dry_run={dry_run}")

    print("  1) Reading existing brands…")
    existing = list_brands(project_id)
    own = [b for b in existing if b.get("is_own")]
    competitors = [b for b in existing if not b.get("is_own")]
    print(f"     own: {len(own)}  competitors: {len(competitors)}")
    if not own:
        sys.exit(f"  ERROR: project {project_id} has no is_own=true brand. "
                 "The own brand must exist before this script runs.")
    if len(own) > 1:
        print(f"     WARN: project has {len(own)} is_own brands — using first")

    own_brand = own[0]
    own_id = own_brand["id"]

    # New own-brand values
    new_name = self_profile.get("canonical_name") or self_profile.get("name_guess") or self_profile["domain"]
    new_domain = self_profile["domain"]

    print(f"  2) Updating own brand {own_id}: '{own_brand.get('name')}' → '{new_name}', "
          f"domains {own_brand.get('domains')} → ['{new_domain}']")
    if not dry_run:
        update_brand(own_id, project_id, {
            "name": new_name,
            "domains": [new_domain],
            "color": OWN_BRAND_COLOR,
        })

    print(f"  3) Deleting {len(competitors)} existing competitor brand(s)…")
    for b in competitors:
        print(f"     - {b.get('name')} ({b['id']})")
        if not dry_run:
            try:
                delete_brand(b["id"], project_id)
            except requests.HTTPError as e:
                print(f"       FAILED: {e} — body: {e.response.text[:200] if e.response else ''}")

    # Throttle a bit — Peec triggers metric recalc on name/domain changes; rapid follow-up
    # writes can race. 2 seconds is plenty in practice.
    if not dry_run and competitors:
        time.sleep(2)

    print(f"  4) Creating {len(final_competitors)} new competitor brand(s)…")
    created = []
    for i, c in enumerate(final_competitors):
        name = c.get("canonical_name") or c.get("name") or c["domain"].split(".")[0].title()
        domain = c["domain"]
        color = COMPETITOR_COLORS[i % len(COMPETITOR_COLORS)]
        print(f"     + {name:24} {domain:30} color={color}")
        if dry_run:
            created.append({"name": name, "domain": domain, "color": color, "_dry_run": True})
            continue
        try:
            res = create_brand(project_id, name=name, domains=[domain], color=color)
            created.append(res)
        except requests.HTTPError as e:
            print(f"       FAILED: {e}")

    print("  5) Verifying final state…")
    if not dry_run:
        final_state = list_brands(project_id)
        print(f"     project now has {len(final_state)} brand(s) "
              f"({sum(1 for b in final_state if b.get('is_own'))} own, "
              f"{sum(1 for b in final_state if not b.get('is_own'))} competitors)")
    else:
        final_state = []

    return {
        "own_brand_updated": {"id": own_id, "name": new_name, "domain": new_domain},
        "competitors_deleted": len(competitors),
        "competitors_created": len(created),
        "final_state": final_state,
    }


if __name__ == "__main__":
    # Standalone usage: python3 push.py <project_id> <results.json>
    if len(sys.argv) < 3:
        sys.exit("Usage: python3 push.py <project_id> <path/to/results.json> [--dry-run]")
    proj = sys.argv[1]
    results = json.loads(Path(sys.argv[2]).read_text())
    dry = "--dry-run" in sys.argv
    # Load env if not loaded yet
    if not os.environ.get("PEEC_API_KEY"):
        from discover import load_env
        load_env()
    self_profile = results["self"]
    self_profile["canonical_name"] = self_profile.get("name_guess")
    push(proj, self_profile, results.get("final", []), dry_run=dry)
