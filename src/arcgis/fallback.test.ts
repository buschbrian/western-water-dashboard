import { describe, expect, it, vi } from "vitest";
import { resolveFirstLoadable, type Candidate, type Loadable } from "./fallback";
import { SecuredResourceError } from "./auth";

function ok(name: string): Candidate<Loadable> {
  return { name, create: () => ({ load: () => Promise.resolve(name) }) };
}

function fails(name: string, error: Error = new Error(`${name} failed`)): Candidate<Loadable> {
  return { name, create: () => ({ load: () => Promise.reject(error) }) };
}

function hangs(name: string): Candidate<Loadable> {
  return { name, create: () => ({ load: () => new Promise<never>(() => undefined) }) };
}

/* A candidate that loads happily and is unusable anyway -- a basemap whose
 * own description serves while the style behind it answers 401. Until the
 * chain asked this second question, the preferred basemap "succeeded" onto a
 * blank frame and no fallback was ever taken. */
function loadsButBroken(name: string): Candidate<Loadable> {
  return {
    name,
    create: () => ({ load: () => Promise.resolve(name) }),
    verify: () => Promise.reject(new SecuredResourceError("https://cdn.arcgis.com/style"))
  };
}

describe("first-loadable fallback", () => {
  it("rejects a candidate that loads but cannot be verified", async () => {
    const result = await resolveFirstLoadable([loadsButBroken("topo-vector"), ok("gray-vector")]);
    expect(result.name).toBe("gray-vector");
    expect(result.degraded).toBe(true);
    expect(result.failures[0]?.error).toBeInstanceOf(SecuredResourceError);
  });

  it("verifies only the candidate it is about to return", async () => {
    const verify = vi.fn(() => Promise.resolve("checked"));
    const result = await resolveFirstLoadable([
      { name: "first", create: () => ({ load: () => Promise.resolve("first") }), verify },
      { name: "second", create: () => ({ load: () => Promise.resolve("second") }), verify }
    ]);
    expect(result.name).toBe("first");
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("gives up on a verification that hangs", async () => {
    const result = await resolveFirstLoadable([
      {
        name: "stalled-style",
        create: () => ({ load: () => Promise.resolve("loaded") }),
        verify: () => new Promise<never>(() => undefined)
      },
      ok("gray-vector")
    ], { timeoutMs: 20 });
    expect(result.name).toBe("gray-vector");
    expect(result.failures[0]?.error.message).toContain("did not load within 20ms");
  });

  /* The chain is what a reader waits on, so the chain is what has to be
   * bounded. Before this, every candidate had a deadline and their sum had
   * none: four hanging candidates at ten seconds each held the first paint
   * for forty, because `loadMap` awaits this before the page renders. */
  it("stops the whole chain at its budget, not at each candidate's", async () => {
    /* Fake clocks, not wall time. On a busy runner a 40ms timer and
     * `Date.now()` drift apart by a millisecond or two, which was enough to
     * let a fourth candidate in under the budget and fail this on timing
     * alone (one PR run in two of the same commit). What is asserted is the
     * arithmetic, and the arithmetic is exact once the clock is. */
    vi.useFakeTimers();
    try {
      const started = Date.now();
      // Read the clock when the chain answers, not after the timers are run
      // out: the run-out is what makes every pending timer fire.
      const pending = resolveFirstLoadable(
        [hangs("first"), hangs("second"), hangs("third"), hangs("fourth")],
        { timeoutMs: 40, budgetMs: 60 }
      ).then((result) => ({ result, elapsed: Date.now() - started }));
      await vi.advanceTimersByTimeAsync(200);
      const { result, elapsed } = await pending;

      expect(result.resource).toBeNull();
      /* Two candidates at 40ms each would be 80ms and four would be 160ms.
       * The budget is what decides: the first spends its 40, the second is
       * cut to the 20 that remain, and the third is never tried. */
      expect(elapsed).toBe(60);
      expect(result.failures.map((failure) => failure.name))
        .toEqual(["first", "second", "third"]);
      expect(result.failures.at(-1)?.error.message).toContain("before");
    } finally {
      vi.useRealTimers();
    }
  });

  it("still reaches a later candidate while the budget holds", async () => {
    const result = await resolveFirstLoadable(
      [hangs("slow-first"), ok("gray-vector")], { timeoutMs: 20, budgetMs: 5000 });

    expect(result.name).toBe("gray-vector");
    expect(result.degraded).toBe(true);
  });

  it("does not verify a candidate the budget can no longer pay for", async () => {
    const verify = vi.fn(() => Promise.resolve("checked"));

    const result = await resolveFirstLoadable([
      {
        name: "slow-to-load",
        create: () => ({
          load: () => new Promise((resolve) => { setTimeout(resolve, 40); })
        }),
        verify
      }
    ], { timeoutMs: 100, budgetMs: 25 });

    /* The load overran the budget, so the verification is never asked for and
     * the candidate is not returned as if it had passed one. */
    expect(verify).not.toHaveBeenCalled();
    expect(result.resource).toBeNull();
  });

  it("takes the first choice and reports no degradation", async () => {
    const result = await resolveFirstLoadable([ok("topo-vector"), ok("gray-vector")]);
    expect(result.name).toBe("topo-vector");
    expect(result.degraded).toBe(false);
    expect(result.failures).toEqual([]);
  });

  it("falls through to the next candidate and flags the app as degraded", async () => {
    const result = await resolveFirstLoadable([
      fails("arcgis/topographic", new SecuredResourceError("https://basemapstyles-api.arcgis.com")),
      ok("topo-vector")
    ]);
    expect(result.name).toBe("topo-vector");
    expect(result.degraded).toBe(true);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.error).toBeInstanceOf(SecuredResourceError);
  });

  it("does not construct a candidate it never needs", async () => {
    const create = vi.fn(() => ({ load: () => Promise.resolve("unused") }));
    await resolveFirstLoadable([ok("first"), { name: "second", create }]);
    expect(create).not.toHaveBeenCalled();
  });

  /* A hung load is as unusable as a rejected one, and waiting forever is
   * precisely the failure the credential prompt caused.
   */
  it("gives up on a candidate that hangs and moves on", async () => {
    const result = await resolveFirstLoadable([hangs("stalled"), ok("topo-vector")],
      { timeoutMs: 20 });
    expect(result.name).toBe("topo-vector");
    expect(result.failures[0]?.name).toBe("stalled");
    expect(result.failures[0]?.error.message).toContain("did not load within 20ms");
  });

  /* A caller that has run out of options has to render something and explain
   * itself; making it catch another exception guarantees the blank frame
   * this module exists to prevent.
   */
  it("resolves with nothing rather than rejecting when everything fails", async () => {
    const result = await resolveFirstLoadable([fails("a"), fails("b")]);
    expect(result.resource).toBeNull();
    expect(result.name).toBeNull();
    expect(result.degraded).toBe(true);
    expect(result.failures.map((failure) => failure.name)).toEqual(["a", "b"]);
  });

  it("keeps every failure in order, so the notice can say what was tried", async () => {
    const result = await resolveFirstLoadable([fails("a"), fails("b"), ok("c")]);
    expect(result.failures.map((failure) => failure.name)).toEqual(["a", "b"]);
    expect(result.name).toBe("c");
  });

  it("treats a constructor that throws as a failed candidate", async () => {
    const exploding: Candidate<Loadable> = {
      name: "bad-config",
      create: () => { throw new Error("bad portal item id"); }
    };
    const result = await resolveFirstLoadable([exploding, ok("topo-vector")]);
    expect(result.name).toBe("topo-vector");
    expect(result.failures[0]?.error.message).toBe("bad portal item id");
  });

  it("handles an empty candidate list without pretending it succeeded", async () => {
    const result = await resolveFirstLoadable([]);
    expect(result.resource).toBeNull();
    expect(result.degraded).toBe(false);
  });
});
