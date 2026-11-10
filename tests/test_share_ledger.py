import copy

import pytest

from tools.build_share_ledger import extend_ledger


def payload(*rows):
    return {"reservoirs": list(rows), "withdrawn": [], "reviewed_holds": []}


def row(station, name):
    return {"source_station_id": station, "name": name}


def test_existing_addresses_and_labels_never_change():
    original = extend_ledger([], payload(row("509", "Lake Powell")))
    before = copy.deepcopy(original)
    renamed = extend_ledger(original, payload(row("509", "A new name")))
    assert original == before == renamed
    assert renamed[0]["slug"] == "lake-powell"


def test_a_withdrawal_or_absence_never_removes_an_address():
    ledger = extend_ledger([], payload(row("A", "First")))
    assert extend_ledger(ledger, payload()) == ledger
    withdrawn = payload()
    withdrawn["withdrawn"] = [row("B", "Already withdrawn")]
    extended = extend_ledger(ledger, withdrawn)
    assert extended[:1] == ledger
    assert {entry["source_station_id"] for entry in extended} == {"A", "B"}


def test_identical_names_and_different_input_order_keep_distinct_addresses():
    rows = [row("B", "Lost Creek"), row("A", "Lost Creek")]
    first = extend_ledger([], payload(*rows))
    assert first == extend_ledger([], payload(*reversed(rows)))
    assert len({entry["slug"] for entry in first}) == 2
    assert extend_ledger(first, payload(*rows)) == first


@pytest.mark.parametrize("ledger", [
    [dict(source_station_id="A", name="A", slug="../escape")],
    [dict(source_station_id="A", name="A", slug="same"),
     dict(source_station_id="B", name="B", slug="same")],
    [dict(source_station_id="A", name="A", slug="first"),
     dict(source_station_id="A", name="A", slug="second")],
])
def test_invalid_or_duplicate_permanent_addresses_are_refused(ledger):
    with pytest.raises(ValueError):
        extend_ledger(ledger, payload())


def test_missing_station_identity_is_refused_instead_of_assigning_by_name():
    with pytest.raises(ValueError):
        extend_ledger([], payload(row("", "Unknown")))
