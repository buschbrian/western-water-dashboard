"""One measured daily series summarised: the block a level or a volume publishes.

Shared by the terminal-lake record (ADR-118) and the reviewed reservoir
surface elevation (ADR-135), so the two cannot describe a level in two ways.
The current value, dated record extremes, dated 7-, 30- and 365-day changes
and the same-date seasonal rank from the reservoir estimator, unchanged
(`pipeline.seasonal.seasonal_rank`).
"""

import pandas as pd

from .history import value_asof
from .numbers import _round
from .seasonal import seasonal_rank

CHANGE_WINDOWS = (("7d", 7), ("30d", 30), ("365d", 365))


def summarize_measurement(series: pd.Series, last_date: pd.Timestamp, *, places: int,
                          with_pct: bool, change_tolerance_days: int = 10) -> dict:
    """Current value, record extremes, dated changes and the same-date rank.

    `places` is how the figure is rounded: a level is read to hundredths of a
    foot and a volume to whole acre-feet. `with_pct` is False for elevation --
    a percentage change in a level above an arbitrary datum has no hydrologic
    meaning, which is why ADR-112 refused percent-of-datum outright.
    """
    current = float(series.iloc[-1])
    out = {
        "current": _round(current, places),
        "as_of": last_date.date().isoformat(),
        "record_high": _round(float(series.max()), places),
        "record_high_date": series.idxmax().date().isoformat(),
        "record_low": _round(float(series.min()), places),
        "record_low_date": series.idxmin().date().isoformat(),
        "first_obs": series.index[0].date().isoformat(),
        "n_obs": int(series.size),
    }
    for label, days in CHANGE_WINDOWS:
        found = value_asof(series, last_date - pd.Timedelta(days=days),
                           tolerance_days=change_tolerance_days)
        past, past_date = found if found else (None, None)
        out[f"change_{label}"] = _round(None if past is None else current - past, places)
        if with_pct:
            out[f"change_{label}_pct"] = (
                None if not past else _round((current - past) / past * 100, 1))
        # What the change is a change from: the tolerance means "365-day
        # change" has covered 355 to 375 days, and the record says which.
        out[f"change_{label}_reference_date"] = (
            None if past_date is None else past_date.date().isoformat())
        out[f"change_{label}_elapsed_days"] = (
            None if past_date is None else int((last_date - past_date).days))
    rank = seasonal_rank(series, last_date, current)
    out["seasonal_rank"] = rank[0] if rank else None
    out["seasonal_rank_of"] = rank[1] if rank else None
    return out
