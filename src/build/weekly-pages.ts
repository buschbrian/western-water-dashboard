import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SITE_ADDRESS } from "../reservoir-share-model";
import { validateDigestLedger, type WeeklyDigestEntry, type WeeklyDigestLedger } from "../weekly-digest-model";
import { formatDate } from "../viz/format";
import { escapeHtml as escape, shareFrameDocument } from "./share-frame";

const BASE = `https://${SITE_ADDRESS}`;
const TITLE = "Western Water Dashboard weekly figures";
const FEED_LIMIT = 52;
const slug = (entry: WeeklyDigestEntry): string => `weekly-${entry.week}`;
const address = (entry: WeeklyDigestEntry): string => `${BASE}/share/${slug(entry)}.html`;

export function weeklyFeeds(ledger: WeeklyDigestLedger): { atom: string; json: string } {
  validateDigestLedger(ledger);
  const newest = [...ledger.entries].reverse().slice(0, FEED_LIMIT);
  const json = JSON.stringify({ version: "https://jsonfeed.org/version/1.1", title: TITLE,
    home_page_url: `${BASE}/weekly.html`, feed_url: `${BASE}/feed.json`, language: "en-US",
    description: "Saved weekly storage, mountain snow and drought figures, with their dates and reporting coverage.",
    authors: [{ name: "Western Water Dashboard", url: BASE }],
    items: newest.map((entry) => ({ id: address(entry), url: address(entry), title: entry.frame.name,
      content_text: entry.caption, date_published: entry.published,
      image: `${BASE}/share/${slug(entry)}.png` })) }, null, 2) + "\n";
  const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en-US">
<id>${BASE}/feed.xml</id><title>${escape(TITLE)}</title>
<updated>${newest[0]?.published ?? "1970-01-01T00:00:00.000Z"}</updated>
<link rel="self" type="application/atom+xml" href="${BASE}/feed.xml"/>
<link rel="alternate" type="text/html" href="${BASE}/weekly.html"/>
<author><name>Western Water Dashboard</name><uri>${BASE}</uri></author>
${newest.map((entry) => `<entry><id>${address(entry)}</id><title>${escape(entry.frame.name)}</title>
<published>${entry.published}</published><updated>${entry.published}</updated>
<link rel="alternate" type="text/html" href="${address(entry)}"/>
<link rel="enclosure" type="image/png" href="${BASE}/share/${slug(entry)}.png"/>
<content type="text">${escape(entry.caption)}</content></entry>`).join("\n")}
</feed>\n`;
  return { atom, json };
}

function document(title: string, body: string, path: string, policy: string, preview?: WeeklyDigestEntry): string {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta http-equiv="Content-Security-Policy" content="${escape(policy)}"/>
<title>${escape(title)} — Western Water Dashboard</title>
<link rel="canonical" href="${BASE}/${path}"/>
<link rel="icon" type="image/svg+xml" href="${path.startsWith("share/") ? "../" : "./"}favicon.svg"/>
<link rel="alternate" type="application/atom+xml" title="Weekly figures" href="${BASE}/feed.xml"/>
<link rel="alternate" type="application/feed+json" title="Weekly figures" href="${BASE}/feed.json"/>
${preview ? `<meta property="og:type" content="article"/><meta property="og:title" content="${escape(title)}"/>
<meta property="og:description" content="${escape(preview.scope)}"/>
<meta property="og:url" content="${address(preview)}"/>
<meta property="og:image" content="${BASE}/share/${slug(preview)}.png"/>
<meta property="og:image:width" content="1200"/><meta property="og:image:height" content="630"/>
<meta property="og:image:alt" content="${escape(`${title}: ${preview.frame.figure}; net storage change over seven days.`)}"/>
<meta name="twitter:card" content="summary_large_image"/>` : ""}
<style>body{margin:0;background:#f3eee6;color:#2f342f;font-family:Arial,sans-serif;font-size:1rem;line-height:1.6}main{max-width:48rem;margin:auto;padding:2rem 1.25rem}a{color:#1d5862}h1{font-size:2rem;line-height:1.2}h2{font-size:1.25rem;margin-block-start:2rem}nav{display:flex;gap:1.25rem;flex-wrap:wrap}nav a{padding-block:.75rem}textarea{box-sizing:border-box;width:100%;font:inherit;line-height:1.6;min-height:18rem;padding:.75rem;background:#fff;color:#2f342f;border:1px solid #7d8178}li{margin-block:.75rem}time{color:#595e56}</style>
</head><body><main>${body}</main></body></html>\n`;
}

export function weeklyPage(entry: WeeklyDigestEntry, policy: string): string {
  const body = `<nav aria-label="Weekly summary links"><a href="../weekly.html">All weekly summaries</a><a href="../overview.html?state=all">Current storage charts</a></nav>
<h1>${escape(entry.frame.name)}</h1><p><time datetime="${entry.published}">Captured ${formatDate(entry.published.slice(0, 10))} (UTC).</time></p>
<p>This is a saved weekly summary. It is not updated when a source revises a reading. The live dashboard can show newer values.</p>
<p>${escape(entry.scope)}</p>
${entry.notes.map((note) => `<p>${escape(note)}</p>`).join("")}
${entry.sections.map((section) => `<section><h2>${escape(section.heading)}</h2>${section.lines.map((line) => `<p>${escape(line)}</p>`).join("")}</section>`).join("")}
<section aria-labelledby="weekly-caption-heading"><h2 id="weekly-caption-heading">Caption to copy</h2>
<p>Select the caption and copy it. It includes the reading dates, coverage and sources.</p>
<label for="weekly-caption">Weekly caption</label><textarea id="weekly-caption" readonly>${escape(entry.caption)}</textarea>
<p><a href="${slug(entry)}.png" download>Download the picture</a></p></section>`;
  return document(entry.frame.name, body, `share/${slug(entry)}.html`, policy, entry);
}

export async function writeWeeklyPages(root: string, outDir: string, policy: string): Promise<{
  file: string; name: string; frame: string; kind: "weekly"
}[]> {
  let ledger: WeeklyDigestLedger;
  try { ledger = validateDigestLedger(JSON.parse(await readFile(resolve(root, "data/weekly-digest.json"), "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    ledger = { schema_version: 1, entries: [] };
  }
  const feeds = weeklyFeeds(ledger);
  await writeFile(resolve(outDir, "feed.xml"), feeds.atom);
  await writeFile(resolve(outDir, "feed.json"), feeds.json);
  const links = [...ledger.entries].reverse().map((entry) => `<li><a href="share/${slug(entry)}.html">${escape(entry.frame.name)}</a></li>`).join("");
  await writeFile(resolve(outDir, "weekly.html"), document("Weekly summaries",
    `<nav aria-label="Weekly summary links"><a href="overview.html?state=all">Current storage charts</a><a href="feed.xml">Atom feed</a><a href="feed.json">JSON feed</a></nav>
<h1>Weekly summaries</h1><p>Saved figures for the whole West, with their dates and reporting coverage. Nothing is posted automatically.</p>
${links ? `<ol>${links}</ol>` : "<p>No weekly summary has been captured yet.</p>"}`, "weekly.html", policy));
  const folder = resolve(outDir, "share");
  await mkdir(folder, { recursive: true });
  for (const entry of ledger.entries) {
    await writeFile(resolve(folder, `${slug(entry)}.html`), weeklyPage(entry, policy));
    await writeFile(resolve(folder, `${slug(entry)}.frame.html`), shareFrameDocument(entry.frame, policy, "weekly"));
    await copyFile(resolve(root, "public/share/fallback.png"), resolve(folder, `${slug(entry)}.png`));
  }
  return [...ledger.entries].reverse().map((entry) => ({ file: slug(entry), name: entry.frame.name,
    frame: `share/${slug(entry)}.frame.html`, kind: "weekly" }));
}
