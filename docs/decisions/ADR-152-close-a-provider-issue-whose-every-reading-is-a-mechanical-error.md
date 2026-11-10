# ADR-152: Close a provider issue whose every reading is a mechanical error

- Status: Accepted
- Date: 2026-11-04
- Amends: ADR-116's "the issues stay open" clause
- Unchanged: ADR-116's exclusion, its seven fields, its matcher and its no-repair rule

## Context

ADR-116 excludes a reviewed reading and keeps the provider's issue open, because
closing it "would say that it had" answered. Since then 122 California readings
have been excluded across fourteen issues (#44 to #47, #100, #103 to #111).
No provider has answered any of them.

On 2026-11-04 every excluded reading was fetched again from the CDEC JSON
service. All 122 are still served unchanged. Most of them are not a question a
provider needs to answer: they are the shape of a recording fault, visible in
the provider's own series without any outside figure.

| kind | readings | example |
|---|---:|---|
| zero between two non-zero days | 88 | Lake Valley, 16 days from December 2018 to January 2021, nine of them in a row |
| a power-of-ten shift | 11 | Lake Mathews 131 between 131,249 and 130,420 |
| a same-day exchange between two stations | 4 | Butt Valley 935,746 on 2017-12-26, Lake Almanor's reading that day |
| one digit dropped or added | 1 | Butt Valley 4,128 between 44,184 and 42,866 |
| none of these | 18 | Cogswell 9,776 between 1,646 and 1,629, one of three such readings in eighteen days |

Six issues hold only readings of the first four kinds: #44 Lake Havasu, #105
Butt Valley, #108 Courtright, #109 Lake Valley, #110 Lake Mathews and #111 Sly
Creek. An open issue that nobody will answer is not tracking anything, and it
hides the eight issues that do need an answer.

## Decision

**An issue may be closed when every reading it names is unchanged at the
provider and is a mechanical error.** The exclusions stay exactly as they are.

A reading's neighbours are the nearest readings before and after it that the
provider still serves and that are not themselves excluded: within 15 days in a
daily series, within three months in a monthly one. A reading is a mechanical
error when one of these holds:

1. **Zero.** A daily reading of 0, with both neighbours above zero.
2. **Power-of-ten shift.** The neighbours agree within 10 percent, and the
   reading multiplied or divided by 10, 100, 1,000 or 10,000 falls between them,
   with 2 percent allowance either side.
3. **One digit dropped or added.** The neighbours agree within 10 percent, the
   reading is 1,000 or more, and inserting or deleting one digit gives a value
   between them, with 1 percent allowance. A changed digit does not qualify.
4. **Same-day exchange.** In a daily series whose neighbours agree within 10
   percent, the reading equals another station's reading that day from the same
   provider, or two excluded readings of the same day each fall between the
   other station's neighbours, with 2 percent allowance.

The rule decides only when an issue may close. It never excludes a reading:
each exclusion is still a reviewed record under ADR-116. The issue is closed
with a comment that lists each reading, its neighbours, the rule it meets and
the date of the re-check, so the closure can be checked line by line.

The `issue_url` of each exclusion keeps naming the closed issue. That issue is
where the evidence is.

## Consequences

The six issues above are closed with their evidence. Eight stay open: #45, #46,
#47, #100, #103, #104, #106 and #107 each name at least one reading that no rule
explains, and those still need the provider.

A provider correction still flows through on its own. The matcher compares the
raw value, so a corrected reading at the same stamp is a different reading,
whether or not its issue is open.

A future issue whose readings all meet the rule may be closed in the same change
that adds the exclusions.

## Rejected alternatives

- **Keep every issue open (ADR-116 as written).** Fourteen open issues, of
  which six cannot be answered by anyone, make it harder to see the eight that
  can.
- **Close every issue once its readings are excluded.** The eighteen readings
  that fit no rule, such as Cogswell's three readings at six times its
  neighbours, may be real operations or a different fault. Only the provider
  can say which.
- **Count a changed digit as mechanical.** Grant Lake's 82,410 becomes 22,410
  with one digit changed and then falls between its neighbours. With ten
  candidates at every position, a changed digit matches too easily to be
  evidence. #47 stays open.
- **Use these rules to exclude readings automatically.** That is ADR-116's
  first rejected alternative again. A rule that removes readings decides the
  series is wrong on the strength of the series.
