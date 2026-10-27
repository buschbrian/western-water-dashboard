# ADR-141: Publish a share page and a daily picture for a reservoir link

## Status

Accepted

## Date

2026-10-27

## Relates to

ADR-002 (data is copied, never bundled; the morning's commit is the deploy),
ADR-006 (visible language), ADR-008 (colour comes from the class table),
ADR-056 (a withdrawal must not delete a permanent URL), ADR-128 (a page that
draws one figure alone, for use outside the site), ADR-135 (the surface level
and its chart).

ADR-136 to ADR-140 and ADR-142 belong to other records.

## Context

A link to `reservoir.html?name=Lake%20Powell` posted on X shows a plain link
or the site's title, with no picture. The reservoir page is one static shell
that draws everything at run time (ADR-002), so a crawler, which reads only
the static HTML, finds nothing about the reservoir in it. Brian wants a link
to Lake Powell or Lake Mead to show the current surface level (ADR-135).

Two earlier decisions limit the answer. The reservoir page was decided
against generated per-reservoir shells because a withdrawal (ADR-056) would
have deleted a permanent URL. And a picture that is committed and stale shows
a level that is wrong on every day but the one it was made.

## Decision

**Two committed share pages, a share layout of the reservoir page, and a
picture captured in each deploy that falls back to a committed one.**

1. `share/lake-powell.html` and `share/lake-mead.html` are hand-kept, in
   `public/share/`, and copied as they are. Each has `og:title`,
   `og:description`, `og:image` (an absolute URL), `og:image:alt`, `og:url`,
   `twitter:card=summary_large_image` and the Twitter forms, and a canonical
   link to the reservoir page. They state no figure, because the page cannot
   know today's level. A person is sent on to
   `reservoir.html?name=Lake%20Powell` by a meta refresh with no delay, and a
   visible link covers a browser that blocks it. No script, no tracking. The
   site's address in them is the one `src/data-docs.ts` already states, and
   `src/deploy.test.ts` holds the two together.
2. `reservoir.html?name=...&view=share` is the share layout: a 1200 by 630
   frame of the name, the surface level with its datum, the reading date and
   the water-year chart, with no navigation, no map and no place chooser. It
   is always the light theme and stores nothing. The chart is the page's own
   (`renderElevationYears`) drawn at twice its size, so its axis type is 24
   pixels and still reads when a card shows the picture at a fifth of its
   width. Its words come from the page's level card, so the picture and the
   page cannot say different things. A reservoir with no reviewed level, or a
   history that cannot be read, never reports the chart as drawn.
3. `scripts/capture-share-images.mjs` serves the built `dist/`, opens each
   frame in Chromium, waits for `__reservoirReady.elevation === "drawn"`,
   checks the frame says what it should and fits 1200 by 630, and saves the
   screenshot as `dist/share/<reservoir>.png`. It writes beside the file and
   renames over it only when the result is a 1200 by 630 PNG, and it blocks
   every host but its own server.
4. `public/share/<reservoir>.png` are the committed fallbacks. The build
   copies them to `dist/share/`, so after any build, with no capture at all,
   every `og:image` already names a valid picture. The fallback names the
   reservoir and carries no figure, so a fallback kept for months is never a
   stale level. `scripts/share-fallback.html` is its source.
5. The Pages workflow runs `bash scripts/share-images.sh` after it checks the
   build and before it uploads. The script installs what the browser-smoke job
   installs (`scripts/install-playwright.sh`, then Playwright's Chromium with
   its system libraries) unless a Chromium path is set, and then captures. A
   failed install or capture is a warning and the fallback stays. The step
   fails only when an image is missing or not a 1200 by 630 PNG.

## Rejected

- **Generated share pages**, one per reservoir on the roster. A reservoir
  withdrawn by ADR-056 would delete its page, which is what ADR-056 and the
  reservoir page's own shape were decided against. Two reservoirs have a
  level to show, so two hand-kept pages cost less than a generator and its
  withdrawal rules.
- **A second page for the frame.** The frame needs the page's payload loaders,
  level card and chart; a layout toggled by `view=share` reuses them, as the
  story views reuse their full pages (ADR-128), and a second page would be a
  copy that drifts.
- **Committing a captured picture each day.** It puts a binary into history
  every morning for a picture that is replaced the next.
- **Capturing the live site from the workflow.** The deploy has no deployed
  site to read until it finishes. The built `dist/` serves the same files.
- **A delay on the meta refresh** to let a crawler that follows refreshes read
  the card first. A crawler that follows a refresh does not wait for it, and
  a person would wait for nothing.
- **Failing the deploy when the capture fails.** The deploy publishes the
  morning's data (ADR-002); a share picture must not hold that back.

## Consequences

- A link to `share/lake-powell.html` or `share/lake-mead.html` shows a card
  with that morning's level. A link to `reservoir.html` itself still shows
  no card, because its static HTML cannot name a reservoir.
- The picture is as old as the last deploy: the level can be a day behind.
  A platform that has cached the card shows the old picture until it
  refreshes its cache. A change of image URL is not made for that.
- Adding a reservoir to the cards means a share page, a fallback picture and
  an entry in the capture script's list, and `src/deploy.test.ts` fails until
  all three agree.
- The workflow downloads Chromium each morning, as the browser-smoke job
  does. If that ever fails, the fallbacks are published.
- Nothing new is published as data; no schema changes.

## Supersedes

Nothing.
