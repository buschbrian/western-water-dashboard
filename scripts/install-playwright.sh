#!/usr/bin/env bash
# Install the browser tool without asking npm to resolve the ArcGIS graph again.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if node --input-type=module -e 'await import("playwright")' >/dev/null 2>&1; then
  exit 0
fi

npm install --prefix node_modules/.browser-tools --no-save --no-package-lock playwright
ln -s .browser-tools/node_modules/playwright node_modules/playwright
