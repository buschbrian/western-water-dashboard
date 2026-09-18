# Adding a photograph to the drought-on-the-ground page

The procedure for [`landscape.html`](../../landscape.html), the static page
that pairs the measurements with what the land looks like. It is a ten-minute
job and every step is on this page.

The page owns the reader-facing claims — no exact coordinates, and every frame
a real capture. This document owns how a file gets there without breaking
either one.

## Before anything else: clean the file

**A photograph carries its location inside it.** A camera or a phone writes GPS
coordinates, a serial number, an owner name and the capture timestamp into the
file's metadata. This repository is public. A frame copied in untouched
publishes the exact coordinates of a fragile site, which is the one thing the
page says it will not do.

Strip the metadata from a working copy, never from the original:

```bash
cp ~/Pictures/export/frame.jpg /tmp/frame.jpg
exiftool -all= /tmp/frame.jpg                 # removes GPS, serial, owner, timestamps
exiftool -G /tmp/frame.jpg                    # confirm: nothing but the basics survives
```

`exiftool -G` is the check that matters. A file that still prints a `GPS`
group, an `OwnerName`, a `SerialNumber` or a `CreatorTool` naming a local path
is not ready. Repeat the strip rather than editing fields one at a time.

Copyright and credit do not need to live in the file. The page states the
photographer in the provenance block, where a reader can see it.

## The file

| | |
|---|---|
| Where | `public/photos/` — it is published at `/photos/<name>` |
| Format | JPEG. `.jpg`, not `.jpeg` |
| Long edge | 1600 px. 2400 px only if the frame needs it |
| File size | under 400 KB, and never over 1 MB |
| Colour | sRGB, embedded profile |
| Name | `<place>-<month><year>-<subject>.jpg`, lower case, hyphens only |

Examples: `sevier-lake-jul2026-dry-bed.jpg`,
`great-salt-lake-aug2026-old-waterline.jpg`.

The name is a file name, not a location. Use the same coarse place the caption
uses. Do not put a lake's exact arm, a spring's name or a road number in it.

**Why the size limit.** Every published file is downloaded by every reader who
opens the page, and this site measures its own transfer cost
([`docs/data-transfer.md`](../data-transfer.md)). Four photographs at 400 KB is
a page that opens on a phone on a mountain road. Four at 4 MB is not.

## The markup

`landscape.html` carries a complete template inside an HTML comment in the
gallery, with the fields marked. Copy it, paste it into the gallery, delete the
comment markers around your copy, and fill four things.

**1. `src` and the size.** The file name, and the photograph's own pixel
width and height:

```html
<img src="./photos/sevier-lake-jul2026-dry-bed.jpg"
     width="1600" height="1067" loading="lazy" alt="…" />
```

Keep `width` and `height`. They reserve the space before the file arrives, so
the page does not jump while it loads.

**2. `alt`.** One sentence, for a reader who cannot see the frame. Name the
ground, the water or its absence, and the light. Do not repeat the caption, do
not start with "Photograph of", and do not name the place — the provenance
block does that.

> A pale cracked lake bed runs to a low ridge, with no water anywhere in the
> frame.

**3. The caption.** Two or three short sentences, in Simplified Technical
English like every other visible string on this site (ADR-006, and
[`.claude/rules/visible-language.md`](../../.claude/rules/visible-language.md)).
Keep each sentence under 25 words: the browser suite measures them.

- Sentence one: what this is.
- Sentence two: what the water did here.
- Sentence three, if there is one: the measurement for the same week, with a
  link to the page it is on.

**4. The provenance block.** Four rows, and only the first two change:

| Row | What goes in it |
|---|---|
| Place | The coarsest name that still means something — a named lake bed, a valley, a county. **No coordinates, ever.** |
| Month | Month and year. No day: a day plus a place is a location. |
| Photographer | `Brian Busch` |
| Capture | `Real capture. No generative content.` — written exactly, never reworded |

The last row is a claim about provenance, not about tools. Exposure, colour and
crop are ordinary work and do not touch it. A frame with generated content in
it does not go on this page at all, whatever the row says.

## Finish

Delete the "no photographs are published here yet" notice once the first
photograph is published. It is one paragraph with the id `no-photographs-yet`.

Then:

```bash
npm run verify:fast        # the page is in the visible-text checks
npx vite build             # confirms it still builds and publishes
```

Run `npm run verify:browser` if you have Playwright installed. It reads the
rendered text of this page and measures the sentence lengths.

## What this page is not

It is not a portfolio and not a gallery of the best frames. A photograph earns
its place by showing a condition the measurements state. A beautiful frame that
shows nothing about water belongs somewhere else.
