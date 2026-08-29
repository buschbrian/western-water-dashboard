"""Small committed daily histories for providers that publish dense readings.

SRP publishes five-minute values and clips history to three years. Keeping one
daily representative per date lets the morning refresh request only the
missing interval without changing the estimator that receives the series.
"""

import json
from pathlib import Path

import pandas as pd


def empty_series() -> pd.DataFrame:
    return pd.DataFrame({"date": pd.Series(dtype="datetime64[ns]"),
                         "storage_af": pd.Series(dtype="float64")})


def load_source_history(path: Path) -> dict[str, pd.DataFrame]:
    if not path.exists():
        return {}
    document = json.loads(path.read_text(encoding="utf-8"))
    if document.get("schema_version") != 1 or not isinstance(document.get("series"), dict):
        raise ValueError(f"{path.name}: unsupported source-history schema")
    result = {}
    for key, values in document["series"].items():
        if not isinstance(values, list):
            raise ValueError(f"{path.name}: {key} is not a row array")
        frame = pd.DataFrame(values, columns=["date", "storage_af"])
        frame["date"] = pd.to_datetime(frame["date"], errors="coerce").dt.normalize()
        frame["storage_af"] = pd.to_numeric(frame["storage_af"], errors="coerce")
        if frame.isna().any().any() or (frame["storage_af"] < 0).any():
            raise ValueError(f"{path.name}: {key} has an invalid row")
        result[key] = (frame.sort_values("date", kind="stable")
                            .drop_duplicates("date", keep="last")
                            .reset_index(drop=True))
    return result


def merge_source_series(previous: pd.DataFrame | None,
                        incoming: pd.DataFrame) -> pd.DataFrame:
    """The cached days, with today's fetch winning wherever the two overlap.

    The overlap is the point: a provider revises a provisional reading after
    it publishes it, and the refresh re-requests a few days of tail for that
    reason. So the sort has to be stable. `previous` and `incoming` hold one
    row per date each, which means every overlapping date is a tie, and an
    unstable sort resolves a tie whichever way it likes -- keeping the stale
    cached value on about half the overlap and making the cache a place a
    correction goes to die. Stable, with `incoming` concatenated second, is
    what makes `keep="last"` mean "the newer fetch".
    """
    frames = [frame for frame in (previous, incoming)
              if frame is not None and not frame.empty]
    if not frames:
        return empty_series()
    return (pd.concat(frames, ignore_index=True)
              .sort_values("date", kind="stable")
              .drop_duplicates("date", keep="last").reset_index(drop=True))


def source_history_document(series: dict[str, pd.DataFrame], updated: str) -> dict:
    return {"schema_version": 1, "updated": updated, "series": {
        key: [[row.date.strftime("%Y-%m-%d"), float(row.storage_af)]
              for row in frame.itertuples()]
        for key, frame in sorted(series.items())
    }}
