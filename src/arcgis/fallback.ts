/* Try a list of resources in order; take the first one that loads.
 *
 * Refusing to prompt for credentials (see ./auth) turns a secured resource
 * from a modal into a rejected promise, which is an improvement only if
 * something catches it. Otherwise the map just has no basemap and the page
 * says nothing about why.
 *
 * The ordering this exists to express: prefer the Esri basemaps the current
 * page already uses, fall back to a keyless vector tile layer, and if even
 * that fails render with no basemap and a visible notice rather than a blank
 * frame. The spike found the first two serve anonymously today, so this
 * chain is insurance against that changing, not a workaround for a problem
 * we have.
 *
 * Deliberately not SDK-typed. Anything with a `load()` fits, which keeps the
 * retry policy unit-testable and means the same helper covers feature layers
 * -- the other thing that can turn out to be secured.
 */

export interface Loadable {
  load(): Promise<unknown>;
}

export interface Candidate<T extends Loadable> {
  /** Human-readable, and used in the notice when a fallback is taken. */
  name: string;
  /** Deferred: a candidate must not be constructed until it is needed. */
  create(): T;
  /**
   * An optional second question, asked after `load()` resolves: is this
   * resource actually usable?
   *
   * A basemap answers `load()` from its own item description and resolves
   * happily while the vector tile style behind it is answering 401 -- which
   * is the failure this chain exists for, and the one it silently passed
   * through until a browser test refused a style and watched the preferred
   * basemap "succeed" into a blank frame. A candidate that can be checked
   * more deeply says so here, and its rejection is an ordinary failure.
   */
  verify?(resource: T): Promise<unknown>;
}

export interface Attempt {
  name: string;
  error: Error;
}

export interface Resolution<T extends Loadable> {
  resource: T | null;
  name: string | null;
  /** Every candidate that failed before this one, in order. */
  failures: readonly Attempt[];
  /** True when the first choice was unavailable and something else is in use. */
  degraded: boolean;
}

const DEFAULT_TIMEOUT_MS = 10000;

/**
 * The whole chain's budget, not one candidate's.
 *
 * Every candidate already had a deadline; the chain did not, and the chain is
 * what a reader waits on. `loadMap` opens with `await resolveBasemap(...)` and
 * the page's first paint sits behind it, so the wait a reader actually serves
 * was the sum of the chain: four candidates for a light theme and five for a
 * dark one, each allowed ten seconds to load and ten more to verify -- eighty
 * to a hundred seconds of "Loading" with the reservoir data already fetched,
 * validated and waiting behind a background image.
 *
 * Fifteen seconds is the whole chain now. Past it the resolution is the one
 * this module already had words for -- `resource: null` -- which `loadMap`
 * already handles and the browser suite already exercises as "kept local data
 * when every basemap was refused". A reader gets the reservoirs on a plain
 * background and can pick a background from the map's own gallery, which is
 * a worse map and a far better page than a spinner that outlasts patience.
 */
const DEFAULT_BUDGET_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${name} did not load within ${ms}ms`)), ms);
    })
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * Loads candidates in order and resolves with the first success.
 *
 * Never rejects. A caller that has run out of options needs to render
 * something and say so, not handle another exception; `resource: null` with
 * the full failure list is that outcome.
 */
export async function resolveFirstLoadable<T extends Loadable>(
  candidates: readonly Candidate<T>[],
  options: { timeoutMs?: number; budgetMs?: number } = {}
): Promise<Resolution<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedAt = Date.now();
  /* What a candidate may still spend: never more than its own deadline, and
     never more than the chain has left. */
  const allowance = (): number => Math.min(timeoutMs, budgetMs - (Date.now() - startedAt));
  const failures: Attempt[] = [];

  for (const candidate of candidates) {
    if (allowance() <= 0) {
      failures.push({
        name: candidate.name,
        error: new Error(
          `the chain spent its ${budgetMs}ms before ${candidate.name} could be tried`)
      });
      break;
    }
    try {
      const resource = candidate.create();
      // A candidate whose load hangs is as unusable as one that rejects, and
      // an unbounded wait here is exactly the failure the auth prompt caused.
      await withTimeout(resource.load(), allowance(), candidate.name);
      if (candidate.verify) {
        const left = allowance();
        if (left <= 0) throw new Error(`${candidate.name} could not be verified in time`);
        await withTimeout(candidate.verify(resource), left, candidate.name);
      }
      return {
        resource,
        name: candidate.name,
        failures,
        degraded: failures.length > 0
      };
    } catch (error) {
      failures.push({
        name: candidate.name,
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  return { resource: null, name: null, failures, degraded: candidates.length > 0 };
}
