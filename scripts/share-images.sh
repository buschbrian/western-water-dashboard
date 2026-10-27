#!/usr/bin/env bash
# The share images over a freshly built dist/ (ADR-141): one command for the
# deploy and for a contributor.
#
# dist/share/*.png already holds the committed fallback images, copied by the
# build. This step replaces each with a capture of the day's frame, and every
# way it can fail -- no browser, no Playwright, a frame that did not draw --
# leaves the fallback in place. Only a missing or malformed image fails it.
#
# The browser is the one the browser-smoke job installs: Playwright's package
# through scripts/install-playwright.sh, then Playwright's own Chromium and its
# system libraries. With PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH set (a machine
# with its own Chromium) nothing is downloaded.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

warn() { echo "::warning title=Share images::$1"; }

if ! bash scripts/install-playwright.sh; then
  warn "Playwright could not be installed; the committed fallback images are published"
elif [ -z "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" ]; then
  node node_modules/playwright/cli.js install --with-deps chromium \
    || warn "Chromium could not be installed; the committed fallback images are published"
fi

node scripts/capture-share-images.mjs "$@"
