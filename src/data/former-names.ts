/*
 * The names this roster used to carry, and the station each one became.
 *
 * Twenty-six provider names were normalized on 2026-08-22 under ADR-079, and
 * eighteen more on 2026-10-31 in the roster-wide sweep and fifteen dam or
 * code names replaced with the water's recorded name the same day (CHANGELOG; three
 * differ only in capitals, which the lookup ignores, and have no entry) --
 * operator parentheticals removed, gauge abbreviations expanded, plant
 * numbering replaced by the water's own name. The rulings live in
 * `names-worksheet.csv`; this module is what keeps every link written
 * against the old spelling working.
 *
 * Embedded rather than fetched for the same reason `public/retired-route.js`
 * embeds its URL translations: a former name is part of the site's link
 * contract, not an observation about the world, and resolving one must not
 * cost a request or an async hop inside a synchronous lookup.
 *
 * Keys are lowercased old names; values are station ids (ADR-066).
 */
export const FORMER_NAMES: Readonly<Record<string, string>> = Object.freeze({
  "mossyrock dam (riffe lk)": "14234800:WA:BOR",
  "new exchequer-lk mcclure": "EXC",
  "warm springs (lake sonoma)": "WRS",
  "hell hole (pcwa)": "HHL",
  "courtright (pg&e)": "CTG",
  "coyote (lake mendocino)": "COY",
  "hidden dam (hensley)": "HID",
  "huntington lake (usbr)": "HNT",
  "lake davis (dwr)": "DAV",
  "lake pillsbury nr potter vly 24hr avg": "LPY",
  "englebright (usace)": "ENG",
  "loon lake (smud)": "LON",
  "florence lake (sce)": "FLR",
  "ice house (smud)": "ICH",
  "viva naughton res": "09223100:WY:BOR",
  "pit r no 7 reservoir": "PT7",
  "santiago creek res (irvine lake)": "SGC",
  "coyote res-sta clara": "CYC",
  "caples lake (eid)": "CPL",
  "stumpy meadows reservoir(mark edson dam)": "EDN",
  "gem  lake": "GLK",
  "pit r no 6 reservoir": "PT6",
  "thompson falls res": "12390000:MT:BOR",
  "marlette lk nr carson city": "10336710:NV:BOR",
  "nevada creek res": "12336500:MT:BOR",
  "lake natoma  (nimbus dam)": "NAT",
  "rye patch re nr rye patch, nv": "10334500:NV:BOR",
  "stagecoach reservoir nr oak creek": "09237495:CO:BOR",
  "howard hansen": "12105800:WA:BOR",
  "lake san antonio, monterey co": "ATN",
  "san antonio reservoir, alameda co": "SAT",
  "jackson meadows (nevada co wd)": "JCK",
  "dwinnell reservoir near edgewood": "DRE",
  "bear river at camp far west dam": "CFW",
  "bucks lake storage": "BCL",
  "u san leandro": "USL",
  "lake mc swain": "MCS",
  "oroville dam": "ORO",
  "cherry valley dam": "CHV",
  "morena dam": "MOR",
  "crane valley": "CNV",
  "briones dam": "BIO",
  "bear valley dam": "BRV",
  "cuyamaca dam": "CUY",
  "el capitan dam": "ELC",
  "frenchman dam": "FRD",
  "gibraltar dam": "GBL",
  "isabella dam": "ISB",
  "los banos dam": "LBS",
  "pine flat dam": "PNF",
  "ruth dam": "RTD",
  "soulajule dam": "SLJ",
  "terminus dam": "TRM",
  "cragin dam reservoir": "09398300:AZ:BOR",
  "conconully lake salmon lake dam": "12446453:WA:BOR",
  "dmad": "09UTDMAD:UT:BOR"
});
