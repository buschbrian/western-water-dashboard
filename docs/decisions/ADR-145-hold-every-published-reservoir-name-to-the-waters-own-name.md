# ADR-145: Hold every published reservoir name to the water's own name

- Status: Accepted
- Date: 2026-10-31
- Relates to: ADR-079 (the former-name table, and the first twenty-six
  renames), ADR-058 (the water, not the dam), ADR-066 (a name is a label, a
  station is the identity), ADR-137 and ADR-138 (the same rules for gauge
  names, including lower-case de, la, del, los and las)

## Context

ADR-079 renamed twenty-six roster names that carried provider text. A sweep of
every reviewed roster and the two built-in Utah rosters on 2026-10-31 found
the same fault in eighteen more: gauge text (`Rye Patch Re nr Rye Patch, NV`,
`Stagecoach Reservoir nr Oak Creek`), county and operator tags
(`Lake San Antonio, Monterey Co`, `Jackson Meadows (Nevada Co Wd)`), a
storage word (`Bucks Lake Storage`), an abbreviation (`U San Leandro`),
wrong capitals (`Mcphee`, `Mckay`, `Lake Mccloud`, `Lake Mc Swain`), a
misspelling (`Howard Hansen`) and a dam where the water has a name
(`Oroville Dam`, `Cherry Valley Dam`, `Morena Dam`, `Crane Valley`).

## Decision

**The eighteen names change at their reviewed sources**, as ADR-079 did, and
the payloads are rewritten by their writers. A dam name is replaced only when
the water's name is documented by the position and waterbody review in
`point-verification.csv`, which records the National Hydrography Dataset and
Esri water-body names for the point. A name that is probably wrong but has no
such record is held and listed for the reviewer, not guessed.

**Old links keep working.** Fifteen old spellings join the former-name table.
The other three differ only in capitals, which the lookup ignores.

**A test holds the rule.** `tests/test_published_names.py` reads every roster
and refuses a name with a provider word, a state or county tag, a
parenthetical, stray space, capitals, a wrong `Mc` form, a capitalised `de`,
`la` or `del` inside a name, or a dam word. A small explicit list allows real
names that look odd; a second list holds the names waiting for review and
fails when a listed name leaves the roster, so neither list goes stale.

## Consequences

Every surface shows the new names after the next page load, and every saved
link resolves through the former-name table. A new roster entry with provider
text fails the test before it can be published.
