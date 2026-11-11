"""Reviewed Reclamation reservoir inflow and release; never river-gauge proxies."""
import json
import math
from pathlib import Path

import pandas as pd

from . import daily_history as H, providers as P
from .constants import WITHDRAW_AFTER_DAYS

ROOT = Path(__file__).resolve().parent.parent
ROSTER = ROOT / "admitted_reservoir_flows.json"
HISTORY = ROOT / "reservoir_flow_history.json"
FIELDS = ("source_item_id", "source_url", "definition", "definition_url")


def load_roster(path: Path = ROSTER) -> dict:
    rows = json.loads(path.read_text(encoding="utf-8"))["reservoirs"]
    for station, row in rows.items():
        if station not in {"509", "6124"} or not row.get("name"):
            raise ValueError("Reservoir flow is limited to reviewed Powell and Mead entries")
        for measure in ("inflow", "release"):
            entry = row.get(measure)
            if entry is None:
                if measure != "inflow" or not row.get("inflow_unavailable") or not row.get("inflow_review_url", "").startswith("https://"):
                    raise ValueError(f"{station}: a missing inflow needs evidence")
                continue
            parameter = "Lake/Reservoir Inflow" if measure == "inflow" else "Lake/Reservoir Release - Total"
            if entry.get("modeled") is not False or entry.get("unit") != "cfs" or entry.get("parameter") != parameter:
                raise ValueError(f"{station}: refuse modeled, unregulated or non-cfs flow")
            if type(entry.get("item_id")) is not int or type(entry.get("catalog_record")) is not int:
                raise ValueError(f"{station}: flow needs a catalog item")
            if not isinstance(entry.get("definition"), str) or not entry["definition"].strip() or not all(
                    isinstance(entry.get(k), str) and entry[k].startswith("https://")
                    for k in ("source_url", "definition_url")):
                raise ValueError(f"{station}: flow needs its definition and sources")
    return rows


def fetch(entry: dict, start: str, end: str) -> pd.DataFrame:
    response = P.SESSION.get(f"https://data.usbr.gov/rise/api/catalog-item/{entry['item_id']}", timeout=60)
    response.raise_for_status()
    data = response.json()["data"]
    metadata = data["attributes"]
    relation = data["relationships"]["catalogRecord"]["data"]["id"]
    if (metadata.get("isModeled") is not False or metadata.get("parameterUnit") != "cfs"
            or metadata.get("parameterTimestep") != "daily" or metadata.get("parameterTransformation") != "average"
            or metadata.get("parameterName") != entry["parameter"]
            or relation != f"/rise/api/catalog-record/{entry['catalog_record']}"):
        raise ValueError("Reclamation's flow identity, observed status, unit or time step changed")
    return P.fetch_rise_series(entry["item_id"], start, end, column="cfs")


def refresh(records: list[dict], previous: dict[str, dict], today: pd.Timestamp,
            path: Path = HISTORY, fetcher=fetch, roster: dict | None = None) -> dict:
    roster = load_roster() if roster is None else roster
    old = json.loads(path.read_text()) if path.exists() else {}
    stored = {r["source_station_id"]: r for r in old.get("reservoirs", [])}
    start = (today - pd.Timedelta(days=90)).strftime("%Y%m%d")
    end = (today + pd.Timedelta(days=1)).strftime("%Y%m%d")
    for record in records:
        station = str(record.get("source_station_id"))
        if station not in roster:
            continue
        row = roster[station]
        history = dict(stored.get(station, {"source_station_id": station, "name": row["name"]}))
        block = dict((previous.get(station) or {}).get("water_flow") or {})
        block.update(unit="ft^3/s", inflow_unavailable=row.get("inflow_unavailable"),
                     inflow_review_url=row.get("inflow_review_url"))
        for measure in ("inflow", "release"):
            entry = row.get(measure)
            if entry is None:
                block[measure] = None
                continue
            try:
                frame = fetcher(entry, start, end)
                if frame.empty:
                    raise ValueError("no daily flow readings")
                days = {}
                for r in frame.itertuples():
                    value = float(r.cfs)
                    if not math.isfinite(value) or (measure == "release" and value < 0):
                        raise ValueError("invalid reservoir flow value")
                    day = r.date.date().isoformat()
                    if day <= today.date().isoformat():
                        days[day] = {"values": value}
                combined = H.merge(H.decode(history.get(measure), ("values",)), days, "values")
                if not days:
                    raise ValueError("no observed flow dates")
                fields = {"source_item_id": entry["item_id"],
                          **{k: entry[k] for k in FIELDS if k != "source_item_id"}}
                history[measure] = {**fields, **H.encode(combined, ("values",))}
                as_of = max(days)
                block[measure] = {**fields, "as_of": as_of, "current": days[as_of]["values"]}
            except Exception as exc:
                print(f"WARNING: {row['name']} {measure}: {type(exc).__name__}: {exc}; keeping prior flow")
                block.setdefault(measure, None)
        record["water_flow"] = block
        for measure in ("inflow", "release"):
            reading = block.get(measure)
            if reading and (today - pd.Timestamp(reading["as_of"])).days > WITHDRAW_AFTER_DAYS:
                block[measure] = None
        stored[station] = history
    return {"schema_version": 1, "unit": "ft^3/s", "run_date": today.date().isoformat(),
            "reservoirs": sorted(stored.values(), key=lambda r: r["source_station_id"])}
