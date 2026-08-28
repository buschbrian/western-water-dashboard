export interface ClipboardWriter {
  writeText(text: string): Promise<void>;
}

/** Copies text without making a UI depend directly on the browser clipboard,
 * so success and refusal are both testable. */
export async function copyText(
  text: string,
  clipboard: ClipboardWriter | undefined
): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The named wrapper keeps call sites explicit about what they are sharing. */
export async function copyViewUrl(
  url: string,
  clipboard: ClipboardWriter | undefined
): Promise<boolean> {
  return copyText(url, clipboard);
}
