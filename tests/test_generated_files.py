"""The owner table for committed data files, held to the repository.

`data/generated-files.json` says who writes each committed data file and which
of them the daily refresh commits. Prose said the same thing in four places and
none of them was checked, which is how `data/drought/usdm-huc4.json` came to be
recomputed every morning by the workflow and staged by none of them: the
committed file sat a week behind the polygons beside it, and the only thing
that noticed was a test about drought, not about ownership.

These tests are deliberately about *classification*, not about content. A new
committed data file has to be classified before it can be merged, which is the
cheapest possible moment to decide whether a person or a program owns it.
"""

import json
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / "data" / "generated-files.json"
MANIFEST = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
FILES = MANIFEST["files"]

#: Committed data this table does not describe, and does not need to.
#: Configuration and lockfiles are not measurements.
NOT_DATA = {
    "package.json", "package-lock.json", "tsconfig.json",
    ".claude/launch.json", "data/generated-files.json",
}


def committed_data_files() -> set[str]:
    """Every committed `.json`/`.geojson` that is a measurement or a roster."""
    listed = subprocess.run(
        ["git", "ls-files", "*.json", "*.geojson"],
        cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
    return {
        path for path in listed
        if path not in NOT_DATA
        # A TypeScript project's own config, wherever the project lives. The
        # root one is named in NOT_DATA above; the question service brought a
        # second, and a third would ask this question again. A tsconfig is
        # never a measurement, so this answers it once.
        and not path.endswith("/tsconfig.json")
        and not path.startswith("public/assets/")
        and not path.startswith("node_modules/")
    }


class TestTheTableItself:
    def test_every_class_used_is_declared(self):
        declared = set(MANIFEST["classes"])
        used = {entry["class"] for entry in FILES}
        assert used <= declared, f"undeclared class: {sorted(used - declared)}"

    def test_every_listed_file_exists(self):
        """Absent means unowned, with one stated exception.

        A path carrying `appears_when` is written only when its condition
        happens -- the drought archive waits for the monitor to publish a new
        week -- so it is owned and classified from the day its writer learns
        to write it. The condition is prose for a person; what this holds is
        that claiming one is deliberate, because the alternative is a table
        where any absent path can be explained away.
        """
        missing = [
            e["path"] for e in FILES
            if not (ROOT / e["path"]).exists() and "appears_when" not in e
        ]
        assert missing == [], f"listed but absent: {missing}"

    def test_a_file_that_waits_for_a_condition_says_what_it_waits_for(self):
        for entry in FILES:
            if "appears_when" not in entry:
                continue
            assert entry["writer"] is not None, entry["path"]
            assert entry["appears_when"].strip(), entry["path"]

    def test_every_writer_exists(self):
        """A writer that has been renamed is worse than no writer at all: it
        reads as an instruction and fails when someone follows it."""
        missing = []
        for entry in FILES:
            writer = entry["writer"]
            if writer is None:
                continue
            script = writer.split()[0]
            if not (ROOT / script).exists():
                missing.append(writer)
        assert missing == [], f"named writer does not exist: {missing}"

    def test_a_file_nobody_writes_is_owned_by_a_person(self):
        for entry in FILES:
            if entry["writer"] is None:
                assert entry["class"] in {"reviewed-by-hand", "frozen"}, entry["path"]
            else:
                assert entry["class"] != "reviewed-by-hand", entry["path"]

    def test_only_generated_files_are_committed_by_the_refresh(self):
        for entry in FILES:
            if entry["staged_by_refresh"]:
                assert entry["class"].startswith("generated"), (
                    f"{entry['path']} is committed by the daily job but is not "
                    "classed as generated")


class TestTheRepository:
    def test_every_committed_data_file_is_classified(self):
        """The point of the table: a new payload cannot arrive unowned."""
        classified = {entry["path"] for entry in FILES}
        unclassified = sorted(committed_data_files() - classified)
        assert unclassified == [], (
            "add these to data/generated-files.json with an owner: "
            f"{unclassified}")

    def test_every_offered_drought_level_is_committed_by_the_refresh(self):
        """ADR-064 offers two levels, and a reader who changes the level
        fetches a different file. Committing one and not the other strands the
        reader on another week -- which is exactly what happened while the file
        list lived in the workflow."""
        staged = {e["path"] for e in FILES if e["staged_by_refresh"]}
        coverage = sorted(
            str(path.relative_to(ROOT))
            for path in (ROOT / "data" / "drought").glob("usdm-huc[0-9].json"))
        assert coverage, "no coverage files found"
        assert set(coverage) <= staged, (
            f"computed every morning but never committed: {sorted(set(coverage) - staged)}")


class TestTheRefreshScript:
    """The script must read the list rather than carry its own copy."""

    SCRIPT = ROOT / "scripts" / "refresh-daily.sh"

    def test_the_script_exists_and_parses(self):
        assert self.SCRIPT.exists()
        subprocess.run(["bash", "-n", str(self.SCRIPT)], check=True)

    def test_the_script_reads_the_manifest_rather_than_a_literal_list(self):
        source = self.SCRIPT.read_text(encoding="utf-8")
        assert "generated-files.json" in source
        # The failure this prevents: someone adds a payload to the manifest and
        # the workflow keeps committing the six files it was born with.
        assert "git add reservoirs.json" not in source

    @pytest.mark.parametrize("path", sorted(
        e["path"] for e in FILES if e["staged_by_refresh"]))
    def test_the_dry_run_names_every_published_file(self, path):
        result = subprocess.run(
            ["bash", str(self.SCRIPT), "--dry-run"],
            cwd=ROOT, capture_output=True, text=True, check=True)
        assert path in result.stdout

    def test_the_commit_does_not_stage_a_path_that_may_not_exist(self):
        """Staging a pathspec that matches nothing fails on the spot, and
        staging runs before the commit -- so one absent path is not a missing
        file, it is no data commit at all that morning. A path that waits for
        a condition has to be left out of the staging list until the condition
        happens, which is what the `stageable` mode does."""
        source = self.SCRIPT.read_text(encoding="utf-8")
        assert "git add $(published_files stageable" in source

    def test_the_plan_says_which_paths_are_still_waiting(self):
        """The dry run keeps naming every published path, including one not
        written yet, and says what it is waiting for rather than dropping it
        from the plan."""
        waiting = [e for e in FILES
                   if e["staged_by_refresh"] and "appears_when" in e
                   and not (ROOT / e["path"]).exists()]
        if not waiting:
            pytest.skip("every conditional path has appeared")
        result = subprocess.run(
            ["bash", str(self.SCRIPT), "--dry-run"],
            cwd=ROOT, capture_output=True, text=True, check=True)
        for entry in waiting:
            line = next(l for l in result.stdout.splitlines()
                        if entry["path"] in l)
            assert "not staged yet" in line, line
