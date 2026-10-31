"""Manual review import must preserve evidence and fail before any partial write."""

import csv
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tools import import_gauge_rulings as I  # noqa: E402


def write_csv(path, fields, rows):
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def fixture(tmp_path, *, existing=False):
    worksheet, export = tmp_path / "worksheet.csv", tmp_path / "rulings.csv"
    rows = [{field: "" for field in I.FIELDS} for _ in range(2)]
    for site, row in zip(("01234567", "10123456"), rows):
        row.update(usgs_site_no=site, site_name="Synthetic creek",
                   suggested_ruling="check", trace_check="Unverified outlet")
    if existing:
        rows[0].update(reviewer_ruling="check", notes="Retain this manual review")
    write_csv(worksheet, I.FIELDS, rows)
    incoming = dict(usgs_site_no="01234567", reviewer_ruling="shaped",
                    notes='Reviewed, with "source"\nSecond line.',
                    updated_at="2026-10-24T12:00:00.000Z", save_state="saved")
    write_csv(export, I.EXPORT_FIELDS, [incoming])
    return worksheet, export, rows, incoming


def test_preview_never_writes_and_apply_changes_only_review_fields(tmp_path):
    worksheet, export, rows, _ = fixture(tmp_path)
    original = worksheet.read_bytes()
    preview = I.merge(export, worksheet)
    assert not preview["applied"] and worksheet.read_bytes() == original
    assert preview["changes"][0]["usgs_site_no"] == "01234567"
    assert I.merge(export, worksheet, apply=True)["applied"]
    merged = I.read_csv(worksheet.read_bytes(), I.FIELDS)
    assert merged[1] == rows[1]
    assert {k: v for k, v in merged[0].items() if k not in I.REVIEW_FIELDS} == {
        k: v for k, v in rows[0].items() if k not in I.REVIEW_FIELDS}
    assert merged[0]["notes"] == 'Reviewed, with "source"\nSecond line.'
    after = worksheet.read_bytes()
    assert not I.merge(export, worksheet, apply=True)["changes"]
    assert worksheet.read_bytes() == after


def test_existing_review_requires_explicit_site_replacement(tmp_path):
    worksheet, export, _, _ = fixture(tmp_path, existing=True)
    before = worksheet.read_bytes()
    assert I.merge(export, worksheet)["conflicts"] == ["01234567"]
    with pytest.raises(ValueError, match="existing review"):
        I.merge(export, worksheet, apply=True)
    assert worksheet.read_bytes() == before
    assert I.merge(export, worksheet, apply=True, replace={"01234567"})["applied"]


@pytest.mark.parametrize("field,value,reason", [
    ("usgs_site_no", "99999999", "not in the worksheet"),
    ("usgs_site_no", "1234567", "invalid site number"),
    ("save_state", "unsaved", "save state"),
    ("save_state", "", "save state"),
    ("reviewer_ruling", "admit", "invalid reviewer_ruling"),
    ("updated_at", "yesterday", "invalid updated_at"),
    ("updated_at", "2026-10-24", "time zone"),
    ("notes", " ", "needs notes"),
])
def test_one_bad_row_refuses_entire_batch(tmp_path, field, value, reason):
    worksheet, export, _, incoming = fixture(tmp_path)
    bad = dict(incoming, usgs_site_no="10123456")
    bad[field] = value
    write_csv(export, I.EXPORT_FIELDS, [incoming, bad])
    before = worksheet.read_bytes()
    with pytest.raises(ValueError, match=reason):
        I.merge(export, worksheet, apply=True)
    assert worksheet.read_bytes() == before


@pytest.mark.parametrize("target", ["export", "worksheet"])
def test_duplicate_ids_refuse_the_whole_import(tmp_path, target):
    worksheet, export, rows, incoming = fixture(tmp_path)
    write_csv(export if target == "export" else worksheet,
              I.EXPORT_FIELDS if target == "export" else I.FIELDS,
              [incoming, incoming] if target == "export" else [rows[0], rows[0]])
    before = worksheet.read_bytes()
    with pytest.raises(ValueError, match="duplicate site"):
        I.merge(export, worksheet, apply=True)
    assert worksheet.read_bytes() == before


def test_clear_and_notes_only_records_remain_explicit(tmp_path):
    worksheet, export, _, incoming = fixture(tmp_path, existing=True)
    incoming.update(reviewer_ruling="", notes="")
    write_csv(export, I.EXPORT_FIELDS, [incoming])
    with pytest.raises(ValueError, match="existing review"):
        I.merge(export, worksheet, apply=True)
    I.merge(export, worksheet, apply=True, replace={"01234567"})
    incoming["notes"] = "Outlet still needs review"
    write_csv(export, I.EXPORT_FIELDS, [incoming])
    I.merge(export, worksheet, apply=True)
    row = I.read_csv(worksheet.read_bytes(), I.FIELDS)[0]
    assert row["reviewer_ruling"] == "" and row["notes"] == incoming["notes"]


@pytest.mark.parametrize("text", [
    "usgs_site_no,reviewer_ruling\n01234567,check\n",
    ",".join(I.EXPORT_FIELDS) + "\n01234567,check\n",
    ",".join(I.EXPORT_FIELDS) + '\n01234567,check,"unclosed',
])
def test_malformed_export_never_writes(tmp_path, text):
    worksheet, export, _, _ = fixture(tmp_path)
    export.write_text(text)
    before = worksheet.read_bytes()
    assert I.main([str(export), "--worksheet", str(worksheet), "--apply"]) == 2
    assert worksheet.read_bytes() == before


def test_cli_preview_reports_conflicts_and_rejects_mistyped_replace(tmp_path, capsys):
    worksheet, export, _, _ = fixture(tmp_path, existing=True)
    before = worksheet.read_bytes()
    assert I.main([str(export), "--worksheet", str(worksheet)]) == 2
    assert json.loads(capsys.readouterr().out)["conflicts"] == ["01234567"]
    assert I.main([str(export), "--worksheet", str(worksheet), "--apply",
                   "--replace", "10123456"]) == 2
    assert worksheet.read_bytes() == before


def test_a_conflict_blocks_unrelated_valid_updates_too(tmp_path):
    worksheet, export, _, incoming = fixture(tmp_path, existing=True)
    write_csv(export, I.EXPORT_FIELDS, [dict(incoming, usgs_site_no="10123456"), incoming])
    before = worksheet.read_bytes()
    with pytest.raises(ValueError, match="existing review"):
        I.merge(export, worksheet, apply=True)
    assert worksheet.read_bytes() == before


def test_write_failure_keeps_original_and_cleans_temporary_file(tmp_path, monkeypatch):
    worksheet, export, _, _ = fixture(tmp_path)
    before = worksheet.read_bytes()

    def refuse_replace(self, target):
        raise OSError("simulated write failure")

    monkeypatch.setattr(Path, "replace", refuse_replace)
    assert I.main([str(export), "--worksheet", str(worksheet), "--apply"]) == 2
    assert worksheet.read_bytes() == before
    assert sorted(p.name for p in tmp_path.iterdir()) == ["rulings.csv", "worksheet.csv"]


def test_concurrent_worksheet_edit_is_retained(tmp_path, monkeypatch):
    worksheet, export, _, _ = fixture(tmp_path)
    edited = worksheet.read_bytes().replace(b"Unverified outlet", b"New outlet evidence")
    create_temporary = I.tempfile.NamedTemporaryFile

    def edit_before_write(**kwargs):
        worksheet.write_bytes(edited)
        return create_temporary(**kwargs)

    monkeypatch.setattr(I.tempfile, "NamedTemporaryFile", edit_before_write)
    with pytest.raises(ValueError, match="changed during import"):
        I.merge(export, worksheet, apply=True)
    assert worksheet.read_bytes() == edited
    assert sorted(p.name for p in tmp_path.iterdir()) == ["rulings.csv", "worksheet.csv"]
