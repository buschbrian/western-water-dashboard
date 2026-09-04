"""Turn source agreement into a verdict about *this* reservoir.

The question is not which water body the most publishers name, but whether
the water the row claims is among what they name. A point beside a dam
often has two bodies within a kilometre -- the reservoir above and a
diversion pool below -- and picking the more popular answer would condemn
a point that is sitting exactly where it should.

So every source answer inside 1 km is searched for the claimed name. Found
means confirmed, and any other body nearby is reported rather than ruled
on. Not found, with named water present, means the point is somewhere
other than what it claims. Nothing named inside 1 km is always a person's
call, per the reviewer's threshold.

A sixth source answers after the five: the dam inventory, collected by
`verify_dam_position.py`. It is a register of structures, not of water, so it
carries impoundments too small for any polygon layer -- and a dam is where the
stored water leaves, which is the rule the drainage assignment already uses.
A dam carrying the claimed name inside the same threshold therefore confirms
the *position* and nothing else: no water publication has named the water, so
no name is proposed from it.

    python tools/classify_water_body_points.py
"""
import csv, re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GENERIC = {"lake", "reservoir", "lk", "res", "the", "of"}
SUBSIDIARY = {"lagoon", "forebay", "afterbay", "diversion", "pool",
              "tailrace", "tailwater", "regulating"}
#: Words that say a note is naming water rather than remarking on the point.
#:
#: The reviewer's notes column carries two different things: a name for the
#: water ("Bass Lake", "Seven Oaks Reservoir") and a remark about the point
#: ("point is slightly off", "incorrect lat long not on water"). Read as a
#: name, a remark can never match any source, so the row can never be settled
#: by any evidence -- it is tested against water called "point is slightly
#: off". A name names water and so carries a water word; a remark does not.
#: "water" is deliberately not one of these words: "not on water" is a remark.
WATER = {"lake", "lakes", "reservoir", "reservoirs", "forebay", "afterbay",
         "pond", "lagoon", "pool", "creek", "river", "slough", "basin",
         "tank", "impoundment", "bay"}
COLS = ["gnis_1km", "nhd_waterbody_1km", "nhd_area_1km", "nhd_medium_1km", "esri_1km"]
#: The dam inventory is asked last and judged apart: see the module docstring.
DAM_COL = "dam_1km"
LABEL = {"gnis_1km": "GNIS", "nhd_waterbody_1km": "hydrography water body",
         "nhd_area_1km": "hydrography area",
         "nhd_medium_1km": "hydrography medium scale", "esri_1km": "Esri"}

def words(name):
    return set(re.findall(r"[a-z0-9]+", (name or "").lower()))

def names_water(note):
    """Is this note a name for the water, or a remark about the point?"""
    return bool(WATER & words(note))

#: One dam as `verify_dam_position.py` writes it: name, identifier, distance.
DAM_EVIDENCE = re.compile(r"^(?P<name>.*?)\s*\((?P<id>[^()]+)\)\s+at\s+"
                          r"(?P<km>[\d.]+)\s+km$")

def dam_entries(cell):
    """Every dam in a column, as (name, identifier, distance) triples."""
    found = []
    for entry in (e.strip() for e in (cell or "").split(";") if e.strip()):
        seen = DAM_EVIDENCE.match(entry)
        found.append((seen["name"], seen["id"], seen["km"]) if seen
                     else (entry, "", ""))
    return found

def core(name):
    return words(name) - GENERIC

def same_water(a, b):
    """Same body, allowing word order and the type word to differ."""
    ca, cb = core(a), core(b)
    if not ca or not cb or not (ca & cb):
        return False
    # "Castaic Lagoon" is not "Castaic Lake": a subsidiary word on one side only
    # names a different, smaller pool.
    return bool(SUBSIDIARY & words(a)) == bool(SUBSIDIARY & words(b))

def claimed_name(reservoir, note):
    """What this row says its water is called."""
    first = re.split(r"\s*-\s*", (note or "").strip(), maxsplit=1)[0].strip()
    return first if names_water(first) else reservoir

def judge(r, claim):
    """The verdict fields for one row, from the answers it already carries."""
    matched, others = [], []
    for col in COLS:
        for name in (n.strip() for n in (r.get(col) or "").split(";") if n.strip()):
            (matched if same_water(name, claim) else others).append((col, name))
    named = [n for _, n in matched + others if core(n)]
    dams_matching = [d for d in dam_entries(r.get(DAM_COL))
                     if same_water(d[0], claim)]
    if matched:
        srcs = sorted({LABEL[c] for c, _ in matched})
        near = sorted({n for _, n in others if core(n)})
        return {"verdict": "confirmed", "proposed_name": matched[0][1],
                "agreeing_sources": ",".join(sorted({c for c, _ in matched})),
                "why": (f"{len(srcs)} source{'s' if len(srcs) > 1 else ''} name it within 1 km"
                        + (f"; also within 1 km: {', '.join(near[:3])}" if near else ""))}
    if dams_matching:
        # The dam stands where the point is, so the point is right and the
        # water is simply unmapped. The name stays as claimed: a dam's name is
        # not a water body's name, and nothing here has named the water.
        name, identifier, km = dams_matching[0]
        reach = "1 km" if r.get("beyond_1km") else "4 km"
        return {"verdict": "confirmed by dam position", "proposed_name": "",
                "agreeing_sources": DAM_COL,
                "why": (f"the dam {name} ({identifier}) stands {km} km from the "
                        f"point; no water source names water within {reach}")}
    if named:
        return {"verdict": "point suspect", "proposed_name": others[0][1],
                "agreeing_sources": ",".join(sorted({c for c, _ in others})),
                "why": ("no source names it within 1 km; they name "
                        + ", ".join(sorted({n for _, n in others if core(n)})[:3]))}
    if not r.get("sources_within_1km"):
        why = "no source within 4 km" if not r.get("beyond_1km") else "nearest evidence beyond 1 km"
    else:
        why = "water within 1 km but no source names it"
    if r.get("dam_beyond_1km"):
        # A named dam outside the threshold settles nothing, but it is what
        # tells a wrong coordinate from unmapped water.
        why += f"; nearest dam {r['dam_beyond_1km'].split(';')[0].strip()}"
    return {"verdict": "human review", "proposed_name": "",
            "agreeing_sources": "", "why": why}

def main():
    notes = {row["reservoir"]: row["notes"] for row
             in csv.DictReader((ROOT / "nhd-review.csv").open(encoding="utf-8"))}

    rows = list(csv.DictReader((ROOT / "point-verification.csv").open(encoding="utf-8")))
    for r in rows:
        r["claimed_name"] = claim = claimed_name(r["reservoir"], notes.get(r["reservoir"]))
        r.update(judge(r, claim))

    with (ROOT / "point-verification.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)

    print(dict(Counter(r["verdict"] for r in rows)), "\n")
    for want in ("confirmed by dam position", "point suspect", "human review"):
        print(f"=== {want.upper()} ===")
        for r in rows:
            if r["verdict"] == want:
                print(f"  {r['reservoir'][:26]:26} claims {r['claimed_name'][:20]:20} | {r['why'][:64]}")
        print()
    print("=== confirmed, but another body is also within 1 km ===")
    for r in rows:
        if r["verdict"] == "confirmed" and "also within" in r["why"]:
            print(f"  {r['reservoir'][:26]:26} {r['why'][:76]}")

if __name__ == "__main__":
    main()
