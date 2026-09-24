# Adding a photograph to the drought-on-the-ground page

The procedure for [`landscape.html`](../../landscape.html), the static page
that pairs the measurements with what the land looks like. It is a ten-minute
job and every step is on this page.

The page owns the reader-facing claims: every frame is a real capture, made on
public land, and its place is named. This document owns how a file gets there
without breaking any of them.

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

The name is a file name, not the caption. Keep it short, and use the same place
the caption uses so the two agree.

**Why the size limit.** Every published file is downloaded by every reader who
opens the page, and this site measures its own transfer cost
([`docs/data-transfer.md`](../data-transfer.md)). Four photographs at 400 KB is
a page that opens on a phone on a mountain road. Four at 4 MB is not.

### Camera data stays in the file, local file paths do not

**Do not strip the location.** These are public places on public land, and
where a photograph was made is part of what it says. The GPS position a camera
writes is the same kind of fact as the place named in the caption, and this
project publishes coordinates for every reservoir and snow site already
(ADR-096). There is nothing here to hide.

**Always strip the editing history.** Lightroom and DxO write XMP that records
where the file lived on your own disk: the raw file name, the file it was
derived from, and a history of saves, any of which can carry an absolute path
such as `/Users/<name>/Pictures/...`. That is not a fact about the place and
has no reader. Remove it from every file:

```bash
exiftool -overwrite_original \
  -XMP-crs:RawFileName= \
  -XMP-xmpMM:DerivedFrom= -XMP-xmpMM:History= \
  -XMP-xmpMM:Ingredients= -XMP-xmpMM:Pantry= \
  public/photos/frame.jpg
```

`-overwrite_original` matters: without it `exiftool` leaves
`frame.jpg_original` beside the file, with every field intact. The build
publishes only `.jpg` files from `public/photos/`, but a backup there is one
`git add` from the repository's history.

Optional, and only about your gear rather than the place: drop the body and
lens serial numbers, including the one in the maker notes, and the owner name.

```bash
exiftool -overwrite_original -SerialNumber= -LensSerialNumber= \
  -InternalSerialNumber= -OwnerName= public/photos/frame.jpg
```

Without a group prefix each name clears that tag in every group that carries
it: EXIF, XMP and the maker notes. Skip this step unless you want it. Nothing
on the page depends on it.

Then confirm no local path is left. This prints nothing when the file is
clean:

```bash
exiftool -a -G1 -s public/photos/frame.jpg | grep -E '/Users/|/home/|[A-Za-z]:\\'
```

### Check the file before it is published

Two checks, every photograph, before the markup.

**The point is on public land.** The page promises it, and nothing else checks
it. Read the position the file carries:

```bash
exiftool -n -GPSLatitude -GPSLongitude public/photos/frame.jpg
```

Look that point up in the USGS Protected Areas Database viewer (PAD-US) or the
BLM surface management agency map, and name the land manager it falls on in
the Place row. A point on private land, on tribal land, or in an inholding
does not go on this page, even if the view itself is of public ground. A file
with no GPS position needs the same check from where you stood.

**Run the `photo-metadata-audit` skill** over `public/photos/`. It lists every
field in each file and writes a share-safe report without GPS, serials, owner
names or paths. Read the private report for anything the step above missed,
and keep both reports out of this repository.

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
| Place | The place, said the way a map says it, and the public land it is on. Coordinates after it where they help a reader find the same view. |
| Month | Month and year. A day as well, if the caption leans on the weather that day. |
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
npm run verify:frontend    # confirms it still builds and publishes
```

Run `npm run verify:browser` if you have Playwright installed. It reads the
rendered text of this page and measures the sentence lengths.

## What this page is not

It is not a portfolio and not a gallery of the best frames. A photograph earns
its place by showing a condition the measurements state. A beautiful frame that
shows nothing about water belongs somewhere else.
