import { fetchWithin } from "./fetch";
import { validateShareLedger, type ShareAddress } from "../share-ledger";

let ledger: Promise<ShareAddress[]> | undefined;

/** Prepare the link beside the figures without delaying their display. */
export async function reservoirShareUrl(station: string | null | undefined, fallback: string): Promise<string> {
  if (!station) return fallback;
  try {
    ledger ??= fetchWithin("./share/ledger.json").then(async (response) => validateShareLedger(await response.json()));
    const address = (await ledger).find((entry) => entry.source_station_id === station);
    return address ? new URL(`./share/${address.slug}.html`, fallback).href : fallback;
  } catch {
    ledger = undefined;
    return fallback;
  }
}
