"""Fetch the latest @modelcontextprotocol/sdk version from npm and sync it
into every template's package.json.

Usage:
    python src/utils/fetch_mcp_version.py            # fetch + update templates
    python src/utils/fetch_mcp_version.py --print    # just print the version
    python src/utils/fetch_mcp_version.py --check    # exit 1 if templates stale

The fetched version is also exposed as the module-level variable
`MCP_SDK_VERSION` so other Python tooling can import it:

    from src.utils.fetch_mcp_version import MCP_SDK_VERSION
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

PACKAGE = "@modelcontextprotocol/sdk"
REGISTRY_URL = f"https://registry.npmjs.org/{PACKAGE}/latest"
REPO_ROOT = Path(__file__).resolve().parents[2]
TEMPLATES_DIR = REPO_ROOT / "templates"


def fetch_latest_version(timeout: float = 10.0) -> str:
    req = urllib.request.Request(
        REGISTRY_URL,
        headers={"Accept": "application/json", "User-Agent": "create-mcp-server-tooling"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.load(resp)
    version = payload.get("version")
    if not isinstance(version, str):
        raise RuntimeError(f"Unexpected npm registry response: missing 'version' in {payload!r}")
    return version


def _iter_template_package_jsons() -> list[Path]:
    if not TEMPLATES_DIR.is_dir():
        return []
    return sorted(TEMPLATES_DIR.glob("*/package.json"))


def update_templates(version: str) -> list[Path]:
    """Pin every template's @modelcontextprotocol/sdk dependency to ^version.

    Returns the list of files that actually changed.
    """
    spec = f"^{version}"
    changed: list[Path] = []
    for pkg_path in _iter_template_package_jsons():
        original = pkg_path.read_text(encoding="utf-8")
        data = json.loads(original)
        deps = data.get("dependencies") or {}
        if PACKAGE not in deps:
            continue
        if deps[PACKAGE] == spec:
            continue
        deps[PACKAGE] = spec
        data["dependencies"] = deps
        # Preserve trailing newline if present, keep 2-space indent.
        trailing = "\n" if original.endswith("\n") else ""
        pkg_path.write_text(json.dumps(data, indent=2) + trailing, encoding="utf-8")
        changed.append(pkg_path)
    return changed


def check_templates(version: str) -> list[Path]:
    """Return list of template package.json files whose pinned version is stale."""
    spec = f"^{version}"
    stale: list[Path] = []
    for pkg_path in _iter_template_package_jsons():
        data = json.loads(pkg_path.read_text(encoding="utf-8"))
        deps = data.get("dependencies") or {}
        if PACKAGE in deps and deps[PACKAGE] != spec:
            stale.append(pkg_path)
    return stale


def _main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--print", action="store_true", help="Print the latest version and exit.")
    group.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero if any template pins an older version.",
    )
    args = parser.parse_args()

    try:
        version = fetch_latest_version()
    except Exception as exc:  # noqa: BLE001 - surface any failure to the caller
        print(f"error: failed to fetch {PACKAGE} version: {exc}", file=sys.stderr)
        return 2

    if args.print:
        print(version)
        return 0

    if args.check:
        stale = check_templates(version)
        if stale:
            print(f"stale templates (latest is {version}):", file=sys.stderr)
            for path in stale:
                print(f"  {path.relative_to(REPO_ROOT)}", file=sys.stderr)
            return 1
        print(f"all templates up to date ({version})")
        return 0

    changed = update_templates(version)
    if not changed:
        print(f"already up to date ({version})")
        return 0
    print(f"updated {len(changed)} file(s) to {PACKAGE}@^{version}:")
    for path in changed:
        print(f"  {path.relative_to(REPO_ROOT)}")
    return 0


try:
    MCP_SDK_VERSION: str = fetch_latest_version()
except Exception:  # noqa: BLE001 - import must not fail when offline
    MCP_SDK_VERSION = ""


if __name__ == "__main__":
    raise SystemExit(_main())
