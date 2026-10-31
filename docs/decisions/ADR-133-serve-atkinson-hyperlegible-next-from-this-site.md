# ADR-133: Serve Atkinson Hyperlegible Next from this site

- Status: Accepted
- Date: 2026-10-26
- Relates to: ADR-036 (accessibility is a gate), ADR-006 (plain language)

## Context

Every page named `"Avenir Next", Avenir, "Segoe UI", sans-serif` and loaded
no font, so each device drew its own: Avenir Next on Apple, Segoe UI on
Windows, Roboto or similar on Android and Linux. Text measured in one
browser was a different width in the next, and the face a reader got was an
accident of their device.

## Decision

**Atkinson Hyperlegible Next, served from `public/fonts/`, is the site's
typeface.**

- The Braille Institute's face for low-vision readers: open forms and
  distinct 0/O, 1/l/I, which matter on a page of station names and figures.
- One file: the Latin variable font, every weight from 200 to 800, 34 KB.
  Every payload and page string is in its range; anything outside falls
  back to the system face.
- `font-display: swap`: text shows at once in the fallback and changes face
  when the file arrives. No preload, so the file never competes with the
  page's own scripts on a slow phone.
- One token, `--app-font`, used by the page, by Calcite
  (`--calcite-font-family`) and by every control that sets its own font.
- Taken from the `@fontsource-variable/atkinson-hyperlegible-next` 5.3.0
  package (SIL Open Font License 1.1); the licence is served beside the file.
  No package dependency is added.

## Rejected

- **Keep the system stack.** Free, but the face differs by device.
- **A font service (Google Fonts).** A third-party host in the content
  policy and a request to another origin on every first visit.
- **Public Sans or Inter.** Readable, but not designed for low vision.

## Consequences

- Text widths change on every page; the browser suite's width, clipping and
  overlap checks are the guard.
- Map labels are not affected: they use the map service's own label fonts.
