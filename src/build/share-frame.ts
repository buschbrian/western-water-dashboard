export interface FrameContent {
  name: string;
  figure: string;
  stored?: string;
  lines: string[];
  source: string;
}

export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g,
  (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function shareFrameDocument(content: FrameContent, policy: string, kind: "scope" | "page" | "weekly"): string {
  const { name, figure, stored, lines, source } = content;
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}" />
<title>${escapeHtml(name)}</title><style>
html,body{margin:0;width:1200px;height:630px}body{box-sizing:border-box;padding:40px 56px;background:#f3eee6;color:#2f342f;font-family:Arial,sans-serif;display:flex;flex-direction:column;justify-content:space-between;gap:12px}h1{font-size:48px;line-height:1.1;margin:0}p{margin:0;font-size:23px;line-height:1.35}.site{font-size:24px;color:#655f55}.figure{font-size:78px;font-weight:bold;color:#1d4e6b}.stored{font-size:32px}.notes{display:grid;gap:7px}footer{font-size:19px;line-height:1.4}body[data-share-frame="page"] .notes p{font-size:21px}
</style></head><body data-share-frame="${kind}"><p class="site">Western Water Dashboard</p>
<h1>${escapeHtml(name)}</h1><div><p class="figure">${escapeHtml(figure)}</p>
${stored ? `<p class="stored">${escapeHtml(stored)}</p>` : ""}</div>
<div class="notes">${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>
<footer>${escapeHtml(source)}</footer></body></html>\n`;
}
