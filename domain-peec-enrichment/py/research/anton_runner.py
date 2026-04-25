"""
Wrapper around Anton's prompt-generation CLI (anton/scripts/prompts.ts).

Spawns `npm run prompts -- ...` as a subprocess, points it at a JSON output file,
parses the resulting PromptSet, and returns it as a Python dict.

Anton's pipeline (DataForSEO → curator → sub-agents → aggregator) takes
~60–90s and produces 20–50 curated Peec prompts.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# Locate the ts/ folder relative to this file
# (domain-peec-enrichment/py/research/anton_runner.py).
# Falls back to legacy paths if running in a different checkout layout.
_HERE = Path(__file__).resolve()
_PKG_ROOT = _HERE.parent.parent.parent          # → domain-peec-enrichment/
_REPO_ROOT = _PKG_ROOT.parent                   # → repo root

if (_PKG_ROOT / "ts").exists():
    ANTON_DIR = _PKG_ROOT / "ts"                # new layout: domain-peec-enrichment/ts/
elif (_REPO_ROOT / "anton").exists():
    ANTON_DIR = _REPO_ROOT / "anton"            # legacy fallback
else:
    ANTON_DIR = _PKG_ROOT / "ts"                # surface a clear error later

ROOT = _REPO_ROOT  # kept for any other callers expecting it


# Country-code → DataForSEO location_code mapping (the few we'll plausibly hit).
# Full list: https://docs.dataforseo.com/v3/locations
LOCATION_CODES = {
    "US": 2840, "GB": 2826, "DE": 2276, "FR": 2250, "IT": 2380,
    "ES": 2724, "NL": 2528, "AT": 2040, "CH": 2756, "BE": 2056,
    "PL": 2616, "SE": 2752, "DK": 2208, "NO": 2578, "FI": 2246,
    "IE": 2372, "PT": 2620, "AU": 2036, "CA": 2124, "BR": 2076,
    "MX": 2484, "JP": 2392, "KR": 2410, "IN": 2356,
}

LANGUAGE_BY_COUNTRY = {
    "DE": "de", "AT": "de", "CH": "de", "FR": "fr", "BE": "fr",
    "IT": "it", "ES": "es", "MX": "es", "NL": "nl", "PL": "pl",
    "SE": "sv", "DK": "da", "NO": "no", "FI": "fi", "PT": "pt",
    "BR": "pt", "JP": "ja", "KR": "ko",
}


def country_from_domain(domain: str) -> str:
    """Crude TLD-to-country fallback. Returns ISO 3166-1 alpha-2."""
    tld = domain.lower().rsplit(".", 1)[-1]
    by_tld = {
        "de": "DE", "at": "AT", "ch": "CH",
        "fr": "FR", "uk": "GB", "co.uk": "GB",
        "it": "IT", "es": "ES", "nl": "NL", "be": "BE", "pl": "PL",
        "se": "SE", "dk": "DK", "no": "NO", "fi": "FI",
        "pt": "PT", "br": "BR", "au": "AU", "ca": "CA",
        "jp": "JP", "kr": "KR", "in": "IN",
    }
    return by_tld.get(tld, "US")


def ensure_npm_install() -> None:
    """Run `npm install` in anton/ if node_modules is missing."""
    if (ANTON_DIR / "node_modules").exists():
        return
    if not shutil.which("npm"):
        sys.exit("npm not found on PATH. Install Node 20+ to run anton/'s prompt generator.")
    print(f"[anton] node_modules missing — running `npm install` in {ANTON_DIR}…")
    subprocess.run(["npm", "install"], cwd=ANTON_DIR, check=True)


def generate_prompts(
    competitors: list[str],
    *,
    country: str | None = None,
    own_domain: str | None = None,
    keyword_limit: int = 200,
    category: str | None = None,
    extra_args: list[str] | None = None,
    out_path: Path | None = None,
) -> dict:
    """Run the TS prompt-generation pipeline. Returns the parsed PromptSet dict.

    competitors: list of root domains (no protocol, no path), e.g. ["hubspot.com", "pipedrive.com"]
    country:     ISO 3166-1 alpha-2. If None, derived from own_domain TLD.
    own_domain:  used for country auto-detection.
    category:    when provided, passed to the TS pipeline as --category= so the
                 curator/sub-agents have a ground-truth category instead of inferring
                 from competitor keyword patterns. Pass deep_profile.category_for_search.
    """
    if not competitors:
        raise ValueError("competitors list is empty")
    if not ANTON_DIR.exists():
        raise FileNotFoundError(f"ts/ not found at {ANTON_DIR}. Check the folder layout.")

    ensure_npm_install()

    if country is None and own_domain:
        country = country_from_domain(own_domain)
    country = (country or "US").upper()
    location_code = LOCATION_CODES.get(country, 2840)
    language = LANGUAGE_BY_COUNTRY.get(country, "en")

    if out_path is None:
        out_path = Path(tempfile.gettempdir()) / f"anton_prompts_{os.getpid()}.json"
    out_path = Path(out_path)

    cmd = [
        "npm", "run", "prompts", "--",
        f"--keyword-limit={keyword_limit}",
        f"--location={location_code}",
        f"--language={language}",
        f"--out={out_path}",
        "--quiet",
    ]
    if category:
        cmd.append(f"--category={category}")
    cmd.extend(extra_args or [])
    cmd.extend(competitors)

    print(f"[anton] running: npm run prompts -- ... {' '.join(competitors)}")
    print(f"        country={country}  location={location_code}  language={language}")
    print(f"        output → {out_path}")

    # Stream his stderr live so we see progress; capture stdout (we ignore it,
    # the structured data is in the JSON file). Pass through our env (loaded
    # from repo-root .env) so Anton's pipeline sees the same secrets.
    proc = subprocess.run(
        cmd, cwd=ANTON_DIR,
        check=False,  # we'll handle the exit code ourselves
        stdout=subprocess.DEVNULL,
        stderr=None,  # inherit terminal stderr → live progress
        env=os.environ.copy(),
    )
    if proc.returncode != 0:
        raise RuntimeError(f"anton prompt-gen failed with exit {proc.returncode}")
    if not out_path.exists():
        raise RuntimeError(f"anton ran but no JSON output at {out_path}")

    set_data = json.loads(out_path.read_text())
    print(f"[anton] generated {len(set_data.get('prompts', []))} prompts "
          f"(model={set_data.get('modelUsed')})")
    return set_data


if __name__ == "__main__":
    # Standalone smoke test:
    #   python3 anton_runner.py hubspot.com pipedrive.com close.com
    if len(sys.argv) < 2:
        sys.exit("usage: python3 anton_runner.py <competitor1> [<competitor2> ...]")
    result = generate_prompts(sys.argv[1:])
    print(json.dumps(result, indent=2)[:2000])
