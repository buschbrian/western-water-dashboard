import gzip
import json

from tools import build_town_index as builder


def test_assigns_only_inside_points_and_preserves_names():
    units = [{"huc6": "16020204", "polygons": [[[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]]}]
    text = "USPS|GEOID|NAME|INTPTLAT|INTPTLONG\nUT|4900001|Example city|1|1\nUT|4900002|Outside CDP|3|3\nTX|4800001|Elsewhere town|1|1\n"
    assert builder.town_rows(text, units) == [
        {"id": "4900001", "name": "Example", "state": "UT", "huc8": "16020204"}]


def test_published_reference_is_bounded_and_not_a_service_area():
    raw = (builder.ROOT / "data/assistant/towns.json").read_bytes()
    payload = json.loads(raw)
    assert len(gzip.compress(raw, mtime=0)) <= builder.MAX_GZIP_BYTES
    assert "not a water-supply service area" in payload["point_definition"]
    assert len({row["id"] for row in payload["towns"]}) == len(payload["towns"])
