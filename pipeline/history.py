"""Reading a series at a date, and the twelve months behind today.

`value_asof` is why a change names the reading it is a change from: the
pipeline asks for a date and takes the nearest reading inside a tolerance, so
"change in 1 year" has covered 320 days to 410, and the interval it actually
measured is published beside it.
"""

import pandas as pd

from .numbers import _round


def value_asof(series: pd.Series, when: pd.Timestamp,
               tolerance_days: int = 10) -> tuple[float, pd.Timestamp] | None:
    """Most recent observation at or before `when`, with the date it was read.

    The date is returned because the label cannot be trusted without it. A
    provider is asked for a reading seven days back and answers with the
    nearest one it has, which for a month-end feed can be 45 days from the
    date asked for -- so "365-day change" has covered anything from 320 days
    to 410. The caller publishes the date and the elapsed days beside the
    figure rather than leaving the reader to assume the interval in its name.

    None when nothing falls inside the tolerance, which is a different answer
    from a change of zero.
    """
    sub = series[series.index <= when]
    if sub.empty:
        return None
    if (when - sub.index[-1]).days > tolerance_days:
        return None
    return float(sub.iloc[-1]), sub.index[-1]


def monthly_history(series: pd.Series, months: int = 12,
                    climate_months: list | None = None) -> list[dict]:
    """Last `months` calendar months: observed mean/min/max/end + two normals.

    `normal_af` is the median of that same calendar month's mean storage
    across every earlier year in the record, which is what makes the
    dashboard's 12-month chart readable as "above or below normal" rather
    than just "up or down".

    The window is anchored once, not per month (ADR-083): the anchor year is
    the earliest month in the returned window, and every month's normal draws
    on calendar years strictly before it. Cutting each month by its own year
    instead drew one baseline for the window's first calendar year and a
    second -- one year heavier and, in a drought record, drier -- for its
    last, joined invisibly at 1 January. Defensible per point; drawn as a
    continuous line, two baselines. When the whole window falls inside one
    calendar year the anchor is that year and nothing changes.

    Each row publishes `normal_years`, the number of years behind its normal:
    this repository's rule is that a median never appears without the number
    of years behind it, and this function was breaking it.

    `climate_normal_af` is the same statistic over 1991-2020, read from the
    committed table. Both are published for every month so the chart can
    switch between them without refetching, and so the difference between them
    is visible rather than being a claim the reader has to take on trust.
    """
    if series.empty:
        return []

    by_month = series.resample("MS").agg(["mean", "min", "max", "last", "count"])
    monthly_means = by_month["mean"]

    window = by_month.tail(months)
    if window.empty:
        return []
    anchor_year = int(window.index[0].year)

    out = []
    for period, row in window.iterrows():
        same_month = monthly_means[monthly_means.index.month == period.month]
        prior_years = same_month[same_month.index.year < anchor_year].dropna()
        normal = float(prior_years.median()) if not prior_years.empty else None
        climate = (climate_months[period.month]
                   if climate_months and period.month < len(climate_months)
                   else None)
        out.append({
            "month": period.strftime("%Y-%m"),
            "mean_af": _round(row["mean"]),
            "min_af": _round(row["min"]),
            "max_af": _round(row["max"]),
            "end_af": _round(row["last"]),
            "days": int(row["count"]) if not pd.isna(row["count"]) else 0,
            "normal_af": _round(normal),
            "normal_years": int(len(prior_years)),
            "climate_normal_af": _round(climate),
        })
    return out
