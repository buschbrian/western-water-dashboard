import type { LakePayload, ReservoirPayload, RiverPayload, UpstreamIndex } from "../types";
import { fetchWithin } from "./fetch";
import { validateLakePayload } from "./lakes-validate";
import { validateRiverPayload } from "./rivers-validate";
import { validateReservoirPayload, validateUpstreamIndex } from "./validate";

export async function loadReservoirs(
  url = import.meta.env.DEV ? "./reservoirs.json" : "./data/reservoirs.json"
): Promise<ReservoirPayload> {
  const response = await fetchWithin(url);
  return validateReservoirPayload(await response.json() as unknown);
}

export async function loadUpstreamIndex(
  url = import.meta.env.DEV
    ? "./upstream_index.json"
    : "./data/upstream_index.json"
): Promise<UpstreamIndex> {
  const response = await fetchWithin(url);
  return validateUpstreamIndex(await response.json() as unknown);
}

/** The terminal lakes (ADR-118): their own file, never merged into the reservoirs. */
export async function loadLakes(
  url = import.meta.env.DEV ? "./lakes.json" : "./data/lakes.json"
): Promise<LakePayload> {
  const response = await fetchWithin(url);
  return validateLakePayload(await response.json() as unknown);
}

/** Daily river flow (ADR-136): its own file, never added into anything. */
export async function loadRivers(
  url = import.meta.env.DEV ? "./rivers.json" : "./data/rivers.json"
): Promise<RiverPayload> {
  const response = await fetchWithin(url);
  return validateRiverPayload(await response.json() as unknown);
}
