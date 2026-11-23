"""Build the title and body of a self-healing refresh issue.

Four conditions open a GitHub issue, keep it updated while they last, and
close themselves when they stop being true: reservoir feeds that have gone
quiet, reservoirs withdrawn for out-of-season data, a Drought Monitor
release that has not arrived, and share pictures the Pages deploy could not
capture (ADR-154), which otherwise publish their figure-free fallback with
only a log warning.

The wording used to live in `refresh-data.yml` as three `printf` blocks. That
made a reader-facing explanation of ADR-056 unreviewable except by merging it,
untestable except by waiting for a feed to go quiet, and one indentation slip
away from being rendered as a Markdown code block -- which is why those blocks
were written with `printf` into a file rather than as a heredoc in the first
place. It is ordinary text with ordinary rules, so it belongs in Python with a
test beside it.

    python tools/feed_issue_report.py stale --count 3 --names "A, B" --table "|...|"
    python tools/feed_issue_report.py withdrawn --count 1 --names "C" --table "|...|"
    python tools/feed_issue_report.py drought --days 11 --release 2026-08-14 \
        --map-week 2026-08-11
    python tools/feed_issue_report.py share --report dist/share/capture-report.json

`share` prints nothing when every picture was captured: the deploy closes the
issue then.

Writes the title to stdout's first line and the body to `--body-file`, because
`gh issue create` takes them that way.
"""

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

#: Where a reader is sent when the producer, not this pipeline, is the cause.
DROUGHT_MONITOR_URL = "https://droughtmonitor.unl.edu/"

#: The labels each condition maintains, with the colours the workflow creates
#: them under. Kept here so the label and the body that explains it are one
#: change rather than two.
LABELS = {
    "stale": ("stale-feed", "b45309",
              "A reservoir source stopped reporting on its expected cadence"),
    "withdrawn": ("withdrawn-feed", "b91c1c",
                  "A reservoir is too far out of date to publish beside the others"),
    "drought": ("late-drought", "730000",
                "The U.S. Drought Monitor has missed its weekly release"),
    "share": ("share-capture", "6d28d9",
              "A share picture fell back to its figure-free image"),
}

#: Share pictures named in the issue body; the rest are counted. Several
#: hundred can fail together when Chrome is missing, and the body has to stay
#: readable and inside GitHub's size limit.
SHARE_LISTED = 25


#: GitHub refuses an issue title longer than this. The refresh run of
#: 2026-10-13 named every quiet feed in the title during a CDEC and AWDB
#: outage, `gh issue edit` was refused, the step failed, and a red refresh run
#: means the Pages deploy that chains from it is skipped -- so a long list of
#: late feeds kept the data that *did* arrive off the site.
TITLE_LIMIT = 256


def _titled(prefix: str, names: str) -> str:
    """`prefix (A, B, C)`, kept inside GitHub's title limit.

    Names are dropped from the end and counted instead ("and 41 more"). The
    body's table still lists every one; the title only has to say which
    condition this is and start the list.
    """
    whole = f"{prefix} ({names})"
    if len(whole) <= TITLE_LIMIT:
        return whole
    listed = [name.strip() for name in names.split(",") if name.strip()]
    for keep in range(len(listed) - 1, -1, -1):
        rest = len(listed) - keep
        shown = ", ".join(listed[:keep])
        tail = f"and {rest} more"
        title = f"{prefix} ({shown}, {tail})" if shown else f"{prefix} ({rest} reservoir(s))"
        if len(title) <= TITLE_LIMIT:
            return title
    return prefix[:TITLE_LIMIT]


def _footer(checked: str, run: str = "refresh run") -> str:
    """The line every one of these issues ends with.

    A run link, because the next question after "is this still true?" is
    always "which run said so?", and an issue that updates itself otherwise
    gives no way to tell a fresh statement from a stale one.
    """
    server = os.environ.get("GITHUB_SERVER_URL")
    repository = os.environ.get("GITHUB_REPOSITORY")
    run_id = os.environ.get("GITHUB_RUN_ID")
    if server and repository and run_id:
        return (f"Last checked {checked} · "
                f"[{run}]({server}/{repository}/actions/runs/{run_id})")
    return f"Last checked {checked}"


def stale_report(count: str, names: str, table: str, checked: str) -> tuple[str, str]:
    title = _titled("Reservoir feeds have gone quiet", names)
    body = "\n\n".join([
        f"The refresh found **{count}** reservoir(s) later than their expected "
        "source cadence.",
        table,
        "A reservoir lands here when its newest reading exceeds its cadence "
        "threshold (2 days for daily data; 45 days for month-end data), or when "
        "the refresh cannot reach its source. Its last known value is still "
        "published and drawn on the map, marked late — it is not presented as "
        "current. Past 60 days it stops being published at all and moves to the "
        "withdrawn-feed issue (ADR-056).",
        "This issue is maintained automatically: it updates on every refresh "
        "and closes itself once every feed is reporting again.",
        _footer(checked),
    ])
    return title, body + "\n"


def withdrawn_report(count: str, names: str, table: str, checked: str) -> tuple[str, str]:
    title = _titled("Reservoirs withdrawn for out-of-season data", names)
    body = "\n\n".join([
        f"The refresh withdrew **{count}** reservoir(s) from the published "
        "payload. They are **not on the map, not in the list, and not in any "
        "total.**",
        table,
        "A reservoir lands here when its newest reading is more than 60 days "
        "old. Being late and being from another season are different faults, "
        "and the second one is not fixed by a label: a spring reading standing "
        "in an August column is an accurate measurement of spring, and the "
        "regional storage total sums current storage with no freshness filter, "
        "so a carried-forward figure would be added into a total presented as "
        "now. See ADR-056.",
        "**What to decide:** whether the source is coming back, or whether the "
        "reservoir needs re-sourcing or retiring from the roster. Nothing is "
        "deleted — a withdrawn reservoir returns on its own the morning its "
        "source resumes, because the roster it is read from is committed and "
        "this judgement is made fresh on every run.",
        "This issue is maintained automatically: it updates on every refresh "
        "and closes itself once every reservoir is inside the publication "
        "window again.",
        _footer(checked),
    ])
    return title, body + "\n"


def drought_report(days: str, release: str, map_week: str,
                   checked: str) -> tuple[str, str]:
    title = f"The Drought Monitor has not published for {days} days"
    body = "\n\n".join([
        f"The newest drought map this project holds describes the week of "
        f"**{map_week}** and was released on **{release}**, which is **{days}** "
        "days ago.",
        "A new map is normally published every Thursday. The drought page keeps "
        "showing this one and states its age, so nothing is presented as more "
        "current than it is — but the figures stop tracking conditions on the "
        "ground while this is open.",
        f"Check the producer at {DROUGHT_MONITOR_URL} before assuming this is a "
        "fault in this pipeline.",
        _footer(checked),
    ])
    return title, body + "\n"


def share_report(report: dict, checked: str) -> tuple[str, str] | None:
    """The issue for share pictures that kept their fallback, or None when
    every picture with a frame was captured.

    `report` is the deploy's `dist/share/capture-report.json`. One issue holds
    every failure, named up to `SHARE_LISTED`, so a morning when every
    capture fails edits one issue rather than opening hundreds.
    """
    failed = list(report.get("failedFiles") or [])
    count = int(report.get("failed") or 0)
    if count <= 0 and not failed:
        return None
    count = max(count, len(failed))
    total = int(report.get("total") or 0) - int(report.get("notices") or 0)
    title = f"Share pictures kept their figure-free fallback ({count} of {total})"
    reasons = report.get("reasons") or {}

    def line(name: str) -> str:
        reason = " ".join(str(reasons.get(name) or "").replace("`", "'").split())[:200]
        return f"- `share/{name}.png`" + (f": {reason}" if reason else "")

    listed = "\n".join(line(name) for name in failed[:SHARE_LISTED])
    more = len(failed) - SHARE_LISTED
    if more > 0:
        listed += f"\n- and {more} more"
    parts = [
        f"The Pages deploy could not capture **{count}** of {total} share "
        "pictures. Each one is published as its figure-free fallback, so a "
        "link preview shows the name and no figure. No figure is wrong; one "
        "is missing.",
    ]
    if listed:
        parts.append(listed)
    if report.get("runError"):
        parts.append(f"The capture run stopped before any frame: `{report['runError']}`")
    parts += [
        "A picture lands here when its frame did not draw inside 30 seconds, "
        "the run spent its 5-minute budget, or no Chrome was found "
        "(ADR-154). The deploy log has a warning for each.",
        "This issue is maintained automatically: it updates on every deploy "
        "and closes itself once every picture is captured again.",
        _footer(checked, "deploy run"),
    ]
    return title, "\n\n".join(parts) + "\n"


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=sorted(LABELS))
    parser.add_argument("--count", default="0")
    parser.add_argument("--names", default="")
    parser.add_argument("--table", default="")
    parser.add_argument("--days", default="0")
    parser.add_argument("--release", default="")
    parser.add_argument("--map-week", dest="map_week", default="")
    parser.add_argument("--report", default=None,
                        help="the deploy's capture-report.json, for share")
    parser.add_argument("--checked", default=None,
                        help="override the timestamp, for tests")
    parser.add_argument("--body-file", default=None,
                        help="where to write the body (default: stderr-free stdout "
                             "after the title line)")
    parser.add_argument("--print-label", action="store_true",
                        help="print 'name colour description' for the label this "
                             "condition maintains, and exit")
    args = parser.parse_args(argv)

    if args.print_label:
        name, colour, description = LABELS[args.kind]
        print(f"{name}\t{colour}\t{description}")
        return 0

    checked = args.checked or _now()
    if args.kind == "share":
        if not args.report:
            parser.error("share needs --report")
        report = json.loads(Path(args.report).read_text(encoding="utf-8"))
        shared = share_report(report, checked)
        if shared is None:
            return 0
        title, body = shared
    elif args.kind == "stale":
        title, body = stale_report(args.count, args.names, args.table, checked)
    elif args.kind == "withdrawn":
        title, body = withdrawn_report(args.count, args.names, args.table, checked)
    else:
        title, body = drought_report(args.days, args.release, args.map_week, checked)

    print(title)
    if args.body_file:
        Path(args.body_file).write_text(body, encoding="utf-8")
    else:
        print()
        print(body, end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())
