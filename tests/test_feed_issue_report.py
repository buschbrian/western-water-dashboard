"""The self-healing issue bodies, checked without waiting for a feed to fail.

These were three `printf` blocks in refresh-data.yml. The bug they were written
around is still the bug: four leading spaces is a Markdown code block, so any
indentation that follows the YAML rather than the Markdown silently turns a
reader-facing explanation into a monospaced wall.
"""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import feed_issue_report as R  # noqa: E402

CHECKED = "2026-08-21 12:00 UTC"


def render(kind: str, **kwargs) -> tuple[str, str]:
    if kind == "stale":
        return R.stale_report(checked=CHECKED, **kwargs)
    if kind == "withdrawn":
        return R.withdrawn_report(checked=CHECKED, **kwargs)
    return R.drought_report(checked=CHECKED, **kwargs)


STALE = dict(count="3", names="Bear Lake, Hyrum", table="| Name | Days |\n|---|---|")
WITHDRAWN = dict(count="1", names="Yuba", table="| Name | Days |\n|---|---|")
DROUGHT = dict(days="11", release="2026-08-14", map_week="2026-08-11")


class TestShape:
    @pytest.mark.parametrize("kind,kwargs", [
        ("stale", STALE), ("withdrawn", WITHDRAWN), ("drought", DROUGHT)])
    def test_no_line_is_accidentally_a_code_block(self, kind, kwargs):
        _, body = render(kind, **kwargs)
        for line in body.split("\n"):
            if line.startswith("|"):
                continue  # a table row, which is what it looks like
            assert not line.startswith("    "), repr(line)

    @pytest.mark.parametrize("kind,kwargs", [
        ("stale", STALE), ("withdrawn", WITHDRAWN), ("drought", DROUGHT)])
    def test_every_body_says_when_it_was_checked(self, kind, kwargs):
        _, body = render(kind, **kwargs)
        assert CHECKED in body
        assert body.endswith("\n")

    @pytest.mark.parametrize("kind,kwargs", [
        ("stale", STALE), ("withdrawn", WITHDRAWN), ("drought", DROUGHT)])
    def test_the_title_is_one_line(self, kind, kwargs):
        title, _ = render(kind, **kwargs)
        assert "\n" not in title and title.strip() == title


class TestContent:
    def test_the_counts_and_names_reach_the_reader(self):
        title, body = render("stale", **STALE)
        assert "Bear Lake, Hyrum" in title
        assert "**3**" in body
        assert "| Name | Days |" in body

    def test_late_and_withdrawn_are_told_apart(self):
        """The two issues exist because the remedies differ. Neither body may
        read as the other one."""
        _, late = render("stale", **STALE)
        _, gone = render("withdrawn", **WITHDRAWN)
        assert "not presented as current" in late
        assert "not in any total" in gone
        assert "What to decide" in gone
        assert "What to decide" not in late

    def test_the_withdrawal_body_explains_the_total_it_protects(self):
        _, body = render("withdrawn", **WITHDRAWN)
        assert "ADR-056" in body
        assert "no freshness filter" in body

    def test_the_drought_body_points_at_the_producer_first(self):
        _, body = render("drought", **DROUGHT)
        assert R.DROUGHT_MONITOR_URL in body
        assert "2026-08-11" in body and "2026-08-14" in body

    def test_no_body_uses_retired_vocabulary(self):
        """ADR-006 is about visible product text, and an issue is not that --
        but 'stale' has a replacement everywhere else in this project and two
        vocabularies for one condition is how a reader learns the wrong one."""
        for kind, kwargs in [("stale", STALE), ("withdrawn", WITHDRAWN)]:
            _, body = render(kind, **kwargs)
            assert "marked stale" not in body


class TestTitleLength:
    """GitHub refuses a title over 256 characters. On 2026-10-13 a CDEC and
    AWDB outage put dozens of names in the stale title, `gh issue edit` was
    refused, and the failed step turned the refresh run red -- which skips
    the Pages deploy that chains from it."""

    MANY = ", ".join(f"Reservoir Number {index}" for index in range(60))

    @pytest.mark.parametrize("kind", ["stale", "withdrawn"])
    def test_a_long_list_stays_inside_the_limit(self, kind):
        title, body = render(kind, count="60", names=self.MANY, table="|x|")
        assert len(title) <= R.TITLE_LIMIT == 256
        assert title.startswith("Reservoir")
        assert "Reservoir Number 0" in title
        assert title.endswith("more)")
        # The count the title gives up is exact, and nothing is lost: the
        # names it leaves out are still the body's to list.
        shown = title[title.index("(") + 1:title.rindex(", and ")].split(", ")
        assert f"and {60 - len(shown)} more" in title
        assert "|x|" in body

    def test_a_short_list_is_unchanged(self):
        title, _ = render("stale", **STALE)
        assert title == "Reservoir feeds have gone quiet (Bear Lake, Hyrum)"

    def test_one_enormous_name_still_fits(self):
        title, _ = render("withdrawn", count="1", names="X" * 400, table="|x|")
        assert len(title) <= R.TITLE_LIMIT
        assert title == "Reservoirs withdrawn for out-of-season data (1 reservoir(s))"


class TestCommandLine:
    def test_it_writes_a_body_file_and_prints_the_title(self, tmp_path, capsys):
        target = tmp_path / "body.md"
        code = R.main(["stale", "--count", "2", "--names", "A, B",
                       "--table", "|x|", "--checked", CHECKED,
                       "--body-file", str(target)])
        assert code == 0
        assert capsys.readouterr().out.strip() == "Reservoir feeds have gone quiet (A, B)"
        assert "**2**" in target.read_text(encoding="utf-8")

    def test_it_can_print_the_label_the_condition_maintains(self, capsys):
        assert R.main(["withdrawn", "--print-label"]) == 0
        name, colour, description = capsys.readouterr().out.strip().split("\t")
        assert name == "withdrawn-feed" and len(colour) == 6 and description

    def test_the_run_link_appears_only_when_there_is_a_run(self, monkeypatch):
        monkeypatch.delenv("GITHUB_RUN_ID", raising=False)
        _, body = render("stale", **STALE)
        assert "actions/runs" not in body
        monkeypatch.setenv("GITHUB_SERVER_URL", "https://github.com")
        monkeypatch.setenv("GITHUB_REPOSITORY", "o/r")
        monkeypatch.setenv("GITHUB_RUN_ID", "42")
        _, body = render("stale", **STALE)
        assert "https://github.com/o/r/actions/runs/42" in body


class TestShare:
    """Share pictures the deploy could not capture (ADR-154)."""

    REPORT = {"total": 40, "captured": 35, "notices": 2, "failed": 3,
              "failedFiles": ["lake-powell", "lake-mead", "west"], "runError": None}

    def test_nothing_to_report_when_every_picture_was_captured(self):
        assert R.share_report({"total": 40, "captured": 38, "notices": 2, "failed": 0,
                               "failedFiles": []}, CHECKED) is None

    def test_names_each_failed_picture_and_counts_them(self):
        title, body = R.share_report(self.REPORT, CHECKED)
        assert title == "Share pictures kept their figure-free fallback (3 of 38)"
        for name in self.REPORT["failedFiles"]:
            assert f"`share/{name}.png`" in body
        assert CHECKED in body and body.endswith("\n")
        assert not any(line.startswith("    ") for line in body.split("\n"))

    def test_a_morning_when_every_capture_fails_stays_one_bounded_issue(self):
        files = [f"reservoir-{i}" for i in range(600)]
        title, body = R.share_report({"total": 602, "captured": 0, "notices": 2, "failed": 600,
                                      "failedFiles": files, "runError": "No installed browser was selected"},
                                     CHECKED)
        assert len(title) <= R.TITLE_LIMIT
        assert body.count("`share/") == R.SHARE_LISTED
        assert f"and {600 - R.SHARE_LISTED} more" in body
        assert "No installed browser was selected" in body
        assert len(body) < 10_000

    def test_the_cli_prints_no_title_when_all_were_captured(self, tmp_path, capsys):
        report = tmp_path / "capture-report.json"
        report.write_text('{"total": 3, "captured": 3, "notices": 0, "failed": 0, "failedFiles": []}')
        assert R.main(["share", "--report", str(report), "--body-file", str(tmp_path / "b.md")]) == 0
        assert capsys.readouterr().out == ""
        assert not (tmp_path / "b.md").exists()

    def test_the_cli_writes_the_title_and_body_for_a_failure(self, tmp_path, capsys):
        import json
        report = tmp_path / "capture-report.json"
        report.write_text(json.dumps(self.REPORT))
        body = tmp_path / "b.md"
        assert R.main(["share", "--report", str(report), "--body-file", str(body),
                       "--checked", CHECKED]) == 0
        assert capsys.readouterr().out.startswith("Share pictures kept their figure-free fallback")
        assert "`share/lake-mead.png`" in body.read_text()

    def test_the_label_is_its_own(self):
        assert R.LABELS["share"][0] == "share-capture"
        assert len({label for label, _, _ in R.LABELS.values()}) == len(R.LABELS)
