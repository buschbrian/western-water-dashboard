#!/usr/bin/env bash
# The share images over a freshly built dist/ (ADR-141): one command for the
# deploy and for a contributor.
#
# dist/share/*.png already holds the committed fallback images, copied by the
# build. This step replaces each with a capture of the day's frame, and every
# way it can fail -- no browser, no Playwright, a frame that did not draw --
# leaves the fallback in place. Only a missing or malformed image fails it.
#
# No browser is downloaded. The capture runs the repo's own Playwright package
# (scripts/install-playwright.sh, the installer the browser-smoke job runs;
# npm only, and no browser fetch) against a Chromium already on the
# machine: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH if set, else the first of
# google-chrome, google-chrome-stable, chromium and chromium-browser on PATH.
# GitHub's ubuntu-latest image carries Google Chrome. With none, the fallback
# images are published.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

warn() { echo "::warning title=Share images::$1"; }

if ! bash scripts/install-playwright.sh; then
  warn "Playwright could not be installed; the committed fallback images are published"
fi

if [ -z "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" ]; then
  for name in google-chrome google-chrome-stable chromium chromium-browser; do
    if path="$(command -v "$name")"; then
      export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$path"
      break
    fi
  done
fi
if [ -z "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" ]; then
  warn "No Chromium or Chrome was found; the committed fallback images are published"
else
  echo "Capturing with ${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}"
fi

node scripts/capture-share-images.mjs "$@"
