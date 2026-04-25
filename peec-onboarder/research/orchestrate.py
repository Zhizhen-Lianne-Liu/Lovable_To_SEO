"""
End-to-end: domain in → research → coordinated Peec push.

Usage:
  python3 orchestrate.py --domain nothing.tech --project-id or_c8e713b5-...
  python3 orchestrate.py --domain nothing.tech --project-id or_... --dry-run
"""
import argparse
import json
import sys
from pathlib import Path

from discover import run as discover_run, load_env, normalize_input_domain
from push import push as peec_push


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--domain", required=True, help="Input domain (e.g. nothing.tech)")
    ap.add_argument("--project-id", required=True, help="Peec project ID (or_...)")
    ap.add_argument("--dry-run", action="store_true", help="Run research + show what would change, no Peec writes")
    ap.add_argument("--skip-research", help="Skip research, use this existing results.json")
    args = ap.parse_args()

    load_env()

    if args.skip_research:
        print(f"[1/2] Loading prior research from {args.skip_research}")
        results = json.loads(Path(args.skip_research).read_text())
    else:
        print(f"[1/2] Running research on {args.domain}…")
        results = discover_run(normalize_input_domain(args.domain))

    self_profile = results["self"]
    # Use the canonical name we derived if available, else fall back to the name guess
    self_profile["canonical_name"] = self_profile.get("name_guess")

    final = results.get("final", [])
    if not final:
        sys.exit("Research returned no competitors. Aborting push.")

    print(f"\n[2/2] Pushing to Peec project {args.project_id}…")
    summary = peec_push(args.project_id, self_profile, final, dry_run=args.dry_run)

    print("\n[DONE]")
    print(json.dumps(summary, indent=2, default=str)[:2000])


if __name__ == "__main__":
    main()
