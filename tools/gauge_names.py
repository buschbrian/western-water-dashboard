"""Propose a readable display name for a U.S. Geological Survey station name.

Station names are upper case with the agency's abbreviations
("DIRTY DEVIL R AB POISON SP WSH NR HANKSVILLE UT"). `propose` returns a
display name, the rules that fired, and a note for anything the rules cannot
settle. A token the rules cannot settle is left as it was and named in the
note; nothing is guessed. The name is a proposal: a person accepts it, as
with the reservoir names worksheet (ADR-137). Pure text, no network.
"""

from __future__ import annotations

import re

STATE_SUFFIX = re.compile(
    r"[\s,]+(UTAH|UT|COLO|CO|NM|AZ|ARIZ|NV|WY)\.?(?=\s*\(|\s*$)")

#: Words with one reading. Each maps to its expansion.
ABBREVIATIONS = {
    "R": "River", "RIV": "River", "RVR": "River", "RV": "River",
    "CR": "Creek", "CRK": "Creek", "CK": "Creek",
    "FK": "Fork", "EF": "East Fork", "WF": "West Fork", "NF": "North Fork",
    "SF": "South Fork", "MF": "Middle Fork",
    "NR": "near", "AB": "above", "ABV": "above",
    "BL": "below", "BLW": "below", "BEL": "below",
    "WSH": "Wash", "SPGS": "Springs", "CYN": "Canyon", "CYNLNDS": "Canyonlands",
    "RES": "Reservoir", "RESER": "Reservoir", "RESERV": "Reservoir",
    "DIV": "Diversion", "DTCH": "Ditch", "LK": "Lake", "MTN": "Mountain",
    "JCT": "Junction", "HWY": "Highway", "BRDG": "Bridge",
    "CONF": "Confluence", "TRIB": "Tributary", "RD": "Road", "BLVD": "Boulevard",
    "AVE": "Avenue", "LN": "Lane", "PKWY": "Parkway", "CMPGRND": "Campground",
    "CNTY": "County", "LWR": "Lower", "UPR": "Upper", "TUN": "Tunnel",
    "SPILWY": "Spillway", "GEORGTWN": "Georgetown", "NTL": "National",
    "NWR": "National Wildlife Refuge", "WMA": "Wildlife Management Area",
    "ALBQ": "Albuquerque", "SLC": "Salt Lake City",
}
#: Kept in capitals.
ACRONYMS = {"US", "USAF", "USAFA", "USGS", "U.S"}
ROMAN = {"II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII"}
#: Lower case anywhere but the first word.
LOWER = {"AT", "ABOVE", "BELOW", "NEAR", "OF", "THE", "AND", "IN", "ON", "TO",
         "FROM", "FOR", "BY"}
SAFE_SHORT = LOWER | {"DE", "EL", "LA", "LAS", "LOS", "DEL", "FE"}
LOCATORS = {"NR", "AB", "ABV", "BL", "BLW", "BEL", "AT", "NEAR", "ABOVE",
            "BELOW", "@"}
DIRECTION = {"N": "North", "S": "South", "E": "East", "W": "West"}
ORDINAL = re.compile(r"^\d+(ST|ND|RD|TH)$")
HIGHWAY = re.compile(r"^[A-Z]-\d+$")
MC_NAME = re.compile(r"^MC[A-Z]{3,}$")
EDGE = re.compile(r"^(\W*)(.*?)(\W*)$")


def _cap(word: str) -> str:
    if re.fullmatch(r"[A-Z]'[A-Z]{2,}", word):
        return word[0] + "'" + word[2:].capitalize()
    if MC_NAME.match(word):
        return "Mc" + word[2:].capitalize()
    return word.capitalize()


def _title(core: str) -> str:
    text = re.sub(r"[A-Za-z]+(?:'[A-Za-z]+)*", lambda m: _cap(m.group()), core)
    return re.sub(r"'S\b", "'s", text)


def _vowelless(word: str) -> bool:
    return len(word) >= 3 and not re.search(r"[AEIOUY]", word)


def propose(site_name: str) -> tuple[str, str, str]:
    """(display name, rules that fired, what a person must check)."""
    text = " ".join(site_name.split())
    rules: list[str] = []
    checks: list[str] = []

    def note(rule: str) -> None:
        if rule not in rules:
            rules.append(rule)

    def check(reason: str) -> None:
        if reason not in checks:
            checks.append(reason)

    text, dropped = STATE_SUFFIX.subn("", text)
    if dropped:
        note("state suffix dropped")
    tokens = text.replace(",", " , ").replace("@", " @ ").split()
    cores = [t if t == "@" else EDGE.match(t).group(2).upper()  # type: ignore[union-attr]
             for t in tokens]
    out: list[str] = []
    for i, token in enumerate(tokens):
        if token == ",":
            out.append(",")
            continue
        if token == "@":
            out.append("at")
            note("@=at")
            continue
        lead, core, tail = EDGE.match(token).groups()  # type: ignore[union-attr]
        upper = core.upper()
        nxt = cores[i + 1] if i + 1 < len(tokens) else ""
        prev = cores[i - 1] if i else ""
        if any(c.islower() for c in core):
            out.append(token)
            continue
        word, keep_tail = None, tail

        if ORDINAL.match(upper):
            word = upper[:-2] + upper[-2:].lower()
            note("proper case")
        elif upper.isdigit() or HIGHWAY.match(upper) or upper in ACRONYMS:
            word = upper
        elif upper in ROMAN:
            word = upper
        elif re.search(r"\d", upper):
            word = upper
            check(f"{upper}: code kept as written")
        elif upper in DIRECTION and (i == 0 or nxt in ("FK", "FORK")):
            word = DIRECTION[upper]
            note(f"{upper}={word}")
        elif upper in DIRECTION:
            word = core
            check(f"{upper}: direction or initial")
        elif upper == "SP":
            word = "Spring"
            note("SP=Spring")
            check("SP: Spring or Springs")
        elif upper == "COLO":
            if nxt == "SPRINGS":
                word, keep_tail = "Colorado", ""
                note("COLO=Colorado")
            else:
                word = core
                check("COLO: Colorado or Colo. not settled")
        elif upper in ("CR", "FR") and re.match(r"^\d", nxt):
            word = core
            check(f"{upper} before a number: County Road or Forest Road")
        elif upper == "NO":
            if re.match(r"^\d", nxt):
                word, keep_tail = "No.", ""
                note("NO=No.")
            else:
                word = core
                check("NO: number or not settled")
        elif upper == "ST":
            if ORDINAL.match(prev) or prev.isdigit():
                word, keep_tail = "Street", ""
                note("ST=Street")
            elif nxt and nxt not in LOCATORS and nxt != ",":
                word, keep_tail = "St.", ""
                note("ST=St.")
            else:
                word, keep_tail = "St.", ""
                check("ST: Saint or Street")
        elif upper in ("BR", "BRD", "STA", "C"):
            word = core
            check(f"{upper}: abbreviation not settled")
        elif upper in ABBREVIATIONS:
            word = ABBREVIATIONS[upper]
            keep_tail = tail.replace(".", "")
            note(f"{upper}={word}")
        elif upper in LOWER and i > 0:
            word = upper.lower()
        else:
            parts = upper.split("-")
            for part in parts:
                if part.isalpha() and part not in SAFE_SHORT and (
                        len(part) <= 2 or _vowelless(part)):
                    check(f"{part}: abbreviation or initial not settled")
            if "." in core:
                check(f"{upper}: period inside a word")
            word = _title(core)
            note("proper case")
        out.append(lead + word + keep_tail)

    name = " ".join(out).replace(" ,", ",").strip(" ,")
    return name, "; ".join(rules), "; ".join(checks)
