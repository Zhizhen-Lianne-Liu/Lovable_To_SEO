#!/usr/bin/env bash
# Single end-to-end entry point for domain-peec-enrichment.
#
# Usage:
#   ./run.sh <domain> <project_id> [extra orchestrate.py flags]
#
# Examples:
#   ./run.sh forgent.ai or_c8e713b5-a4c0-415f-8cd7-f516d726e8ce
#   ./run.sh telli.io or_c8e713b5-a4c0-415f-8cd7-f516d726e8ce --no-mcp
#   ./run.sh attio.com or_xxx --country US --skip-prompts

set -e

if [ $# -lt 2 ]; then
  echo "usage: $0 <domain> <project_id> [extra orchestrate.py flags]"
  exit 1
fi

DOMAIN="$1"
PROJECT_ID="$2"
shift 2

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

# ---- env --------------------------------------------------------------
if [ -f .env ]; then
  set -a; source .env; set +a
else
  echo "error: $HERE/.env not found. cp .env.example .env and fill in your keys."
  exit 1
fi

# ---- python deps ------------------------------------------------------
if [ ! -d py/.venv ]; then
  echo "[setup] creating Python venv (one-time)…"
  python3 -m venv py/.venv
  py/.venv/bin/pip install --quiet -r py/requirements.txt
fi

# ---- node deps --------------------------------------------------------
if [ ! -d ts/node_modules ]; then
  echo "[setup] installing Node deps (one-time)…"
  (cd ts && npm install --silent)
fi

# ---- run --------------------------------------------------------------
exec py/.venv/bin/python3 -u py/research/orchestrate.py \
  --domain "$DOMAIN" \
  --project-id "$PROJECT_ID" \
  "$@"
