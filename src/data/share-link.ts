import { fetchWithin } from "./fetch";
import { validateShareLedger, type ShareAddress } from "../share-ledger";

let ledger: Promise<ShareAddress[]> | undefined;

async function permanentSlug(station: string | null | undefined): Promise<string | null> {
  if (!station) return null;
  try {
    ledger ??= fetchWithin("./share/ledger.json").then(async (response) => validateShareLedger(await response.json()));
    return (await ledger).find((entry) => entry.source_station_id === station)?.slug ?? null;
  } catch {
    ledger = undefined;
    return null;
  }
}

/** Prepare the link beside the figures without delaying their display. */
export async function reservoirShareUrl(station: string | null | undefined, fallback: string): Promise<string> {
  const slug = await permanentSlug(station);
  return slug ? new URL(`./share/${slug}.html`, fallback).href : fallback;
}

/**
 * The station's daily 1200 by 630 share picture, or null when it has no
 * permanent address. The Pages deploy writes `share/<slug>.png` for every
 * ledger entry, so a found slug always has a picture.
 */
export async function reservoirSharePicture(station: string | null | undefined, base: string): Promise<string | null> {
  const slug = await permanentSlug(station);
  return slug ? new URL(`./share/${slug}.png`, base).href : null;
}
