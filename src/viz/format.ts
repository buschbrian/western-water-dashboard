export function formatAcreFeet(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? "—" : Math.round(value).toLocaleString("en-US");
}

export function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;
}

export function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC"
  });
}

/**
 * A drainage area's name with the states its water reaches after it.
 *
 * The model keeps the name and the states apart on purpose; this is the one
 * place they are put together, so a name never reaches a sort, a search or a
 * roster match with a parenthetical stuck to it. An area with no states left
 * after the foreign tags go -- nine of the subbasins hold no United States
 * ground at all -- reads as its bare name rather than as an empty bracket.
 */
export function drainageLabel(
  name: string,
  states?: readonly string[]
): string {
  return states?.length ? `${name} (${states.join(", ")})` : name;
}
