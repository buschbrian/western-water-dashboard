/** The browser-only edge around the pure serializers in export.ts. */
export function downloadText(text: string, filename: string, mediaType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mediaType};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(csv: string, filename: string): void {
  downloadText(csv, filename, "text/csv");
}
