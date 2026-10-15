"""Late, and gone: the two different faults a quiet feed can have.

`carry_forward` keeps publishing a quiet feed's last value, because a point
vanishing from the map with no explanation is worse than one that says it is a
few days behind. That is true for days and false for months, so past
`WITHDRAW_AFTER_DAYS` the record leaves the payload entirely (ADR-056) -- the
regional total sums current storage with no freshness filter, so a spring
figure would not merely be shown out of season, it would be added into a total
presented as now.

A withdrawal notice carries no measurement. The validator rejects one that
does.
"""

import pandas as pd

from .constants import WITHDRAW_AFTER_DAYS


def carry_forward(previous: dict, today: pd.Timestamp, reason: str) -> dict:
    """Reuse yesterday's record for a reservoir we couldn't refresh today.

    Dropping the reservoir entirely (the old behavior) silently removed the
    point from the map with no explanation, which is strictly worse than
    showing the last known value clearly labeled as stale.
    """
    record = dict(previous)
    as_of = pd.Timestamp(record.get("as_of"))
    record["days_stale"] = int((today - as_of).days) if not pd.isna(as_of) else None
    record["is_stale"] = True
    record["fetch_ok"] = False
    record["fetch_error"] = reason
    return record


def partition_by_age(records: list[dict]) -> tuple[list[dict], list[dict]]:
    """Split the run's records into what is published and what is withdrawn.

    A record older than WITHDRAW_AFTER_DAYS is not published. It is not
    deleted either: it comes back on its own the morning its source resumes,
    because the roster it is fetched from is committed and this decision is
    made fresh on every run from the age of the data alone.

    A record with no `as_of` at all -- a reservoir that has never fetched
    successfully -- is published rather than withdrawn. That is a different
    fault with a different remedy, it is already visible through `fetch_ok`,
    and withdrawing on a missing field would hide a configuration error
    behind the mechanism built for a quiet feed.
    """
    published, withdrawn = [], []
    for record in records:
        days = record.get("days_stale")
        if days is not None and days > WITHDRAW_AFTER_DAYS:
            withdrawn.append(record)
        else:
            published.append(record)
    withdrawn.sort(key=lambda r: -(r.get("days_stale") or 0))
    return published, withdrawn


def withdrawal_notice(record: dict) -> dict:
    """What the payload says about a reservoir it is not publishing.

    Deliberately not a reservoir record: no storage, no percent full, no
    baseline. Publishing the figure in a quieter shape would be publishing
    the figure. This is the name, when it was last real, and how long ago
    that was -- enough for a reader to know the roster changed and why, and
    not enough for anything to chart it.

    The source label is here to be read as well as displayed: it is the only
    field that says which feed a notice belongs to, and `carry_withdrawals`
    is what asks.
    """
    return {
        "name": record.get("name"),
        "as_of": record.get("as_of"),
        "days_stale": record.get("days_stale"),
        "source_label": record.get("source_label"),
        "reason": "no reading inside the publication window",
    }


def carry_unrefreshed(previous: dict[str, dict], selected_stations: set[str],
                      source: str) -> list[dict]:
    """The last payload's records that a single-source run must republish.

    A run that refreshes one feed keeps the others rather than turning a
    partial refresh into a partial dashboard. What it must not keep is a
    reservoir the refreshed source's own roster no longer names: that station
    is never fetched, so "not refreshed this run" and "deliberately removed"
    look identical from the station id alone, and the reservoir republishes
    itself out of the previous payload forever.

    Withholding Leroy Anderson is where this showed (ADR-113). The roster lost
    the station, `--source cdec` did not fetch it, and the merge put it back
    with 405 reservoirs published as though nothing had changed. Only a full
    refresh dropped it, which made a reviewed removal depend on which command
    someone happened to run.

    So the refreshed source's roster is authoritative for that source, and
    every other source is carried whole. A record written before mixed-source
    provenance carries no `source_key` and is Reclamation's, which is the same
    default the envelope applies further down.
    """
    kept = []
    for station, record in previous.items():
        if station in selected_stations:
            continue
        if (record.get("source_key") or "rise") == source:
            continue
        kept.append(record)
    return kept


def carry_withdrawals(notices: list[dict], answered: set[str],
                      today: pd.Timestamp) -> list[dict]:
    """Keep the notices for every reservoir this run did not answer for.

    A withdrawn reservoir is not in `reservoirs`, so neither the merge of an
    unrefreshed source nor `carry_forward` after a failed fetch can see it,
    and `partition_by_age` cannot re-derive the notice from a record that is
    not there. The notice is carried here instead, so ADR-056's promise that
    a withdrawal is always stated survives a partial refresh and an outage.

    Matched on the reservoir name, which every notice states and which is
    unique across the roster. A reservoir this run published, or withdrew
    from today's reading, is in `answered` and carrying it would state it
    twice. Anything else keeps its last notice: a source this run did not
    refresh, and a station whose fetch failed on a morning its provider was
    down (2026-10-13: Lake Hemet left the payload entirely when CDEC was
    unreachable).

    The age is recomputed against today, because `as_of` and `days_stale` are
    one fact printed twice and a carried notice would otherwise say a
    reservoir is 477 days late beside a date 484 days ago. That is a
    subtraction over a date the notice already publishes; the reading it was
    withdrawn for is still not published.
    """
    carried = []
    for notice in notices:
        if notice.get("name") in answered:
            continue
        entry = dict(notice)
        as_of = pd.Timestamp(entry.get("as_of"))
        if not pd.isna(as_of):
            entry["days_stale"] = int((today - as_of).days)
        carried.append(entry)
    return carried
