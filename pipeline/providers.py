"""One adapter per provider, and the retry policy they share.

Four providers answer with storage readings -- Reclamation, the Natural
Resources Conservation Service, the California Department of Water Resources,
and the Colorado Division of Water Resources -- and each has its own URL, its
own paging, its own idea of a missing value and its own date convention.
Everything specific to a provider belongs here, so that the rest of the
pipeline sees one shape: a frame of `date` and `storage_af`, cleaned, sorted
and deduplicated.
"""

import datetime as dt
import os
import time

import pandas as pd
import requests

from .constants import AWDB_DATA_URL, RISE_RESULT_URL, local_today


RETRY_ATTEMPTS = 3
RETRY_BACKOFF_SECONDS = 2  # doubles each retry: 2s, 4s
MAX_PAGES = 50  # ~100k daily rows; a stop so a bad meta block can't spin forever

def _get_json(params: dict) -> dict:
    """GET a page from RISE, retrying on transient failures.

    RISE occasionally returns a non-JSON (often empty) body on an
    otherwise-2xx response, which crashed the whole run on 2026-08-03.
    The request itself (connect/read timeouts) must be inside the try too --
    on 2026-08-08 a bare read timeout raised from requests.get() before it
    ever reached the try block, so the retry never engaged.
    """
    for attempt in range(RETRY_ATTEMPTS):
        try:
            resp = requests.get(RISE_RESULT_URL, params=params, timeout=60)
            resp.raise_for_status()
            return resp.json()
        except (requests.exceptions.RequestException, ValueError):
            if attempt == RETRY_ATTEMPTS - 1:
                raise
            time.sleep(RETRY_BACKOFF_SECONDS * 2**attempt)
    raise AssertionError("unreachable")  # keeps type checkers honest


def fetch_rise_series(item_id: int, start: str, end: str) -> pd.DataFrame:
    """Pull one RISE catalog item's daily results, paginating as needed.

    Returns a date-sorted frame with columns [date, storage_af], already
    cleaned: null/non-numeric results dropped, duplicate dates collapsed to
    the last reading, future-dated rows removed.
    """
    rows = []
    page = 1
    while page <= MAX_PAGES:
        params = {
            "itemsPerPage": 2000,
            "order[dateTime]": "ASC",
            "itemId": item_id,
            "dateTime[after]": start,
            "dateTime[strictly_before]": end,
            "page": page,
        }
        payload = _get_json(params)
        data = payload.get("data") or []
        rows.extend(data)

        meta = payload.get("meta") or {}
        per_page = meta.get("itemsPerPage") or 0
        total = meta.get("totalItems")
        # Stop on an empty page even if meta says there should be more --
        # otherwise a bad/missing meta block pages forever.
        if not data or not per_page or total is None:
            break
        if page * per_page >= total:
            break
        page += 1

    if not rows:
        return pd.DataFrame({"date": pd.Series(dtype="datetime64[ns]"),
                             "storage_af": pd.Series(dtype="float64")})

    df = pd.DataFrame([r["attributes"] for r in rows])
    df["date"] = pd.to_datetime(df["dateTime"], format="mixed", utc=True).dt.tz_localize(None).dt.normalize()
    # RISE returns null `result` for days the gage didn't report. Those used
    # to flow straight through: a trailing null became the "latest" reading
    # and poisoned every downstream metric with NaN.
    df["storage_af"] = pd.to_numeric(df["result"], errors="coerce")
    df = df.dropna(subset=["storage_af"])

    df = df[df["date"] <= local_today()]
    df = df.sort_values("date").drop_duplicates(subset="date", keep="last")
    return df[["date", "storage_af"]].reset_index(drop=True)


def _get_awdb_json(params: dict):
    """GET AWDB JSON with the same transient-failure policy as RISE."""
    for attempt in range(RETRY_ATTEMPTS):
        try:
            resp = requests.get(AWDB_DATA_URL, params=params, timeout=60)
            resp.raise_for_status()
            return resp.json()
        except (requests.exceptions.RequestException, ValueError):
            if attempt == RETRY_ATTEMPTS - 1:
                raise
            time.sleep(RETRY_BACKOFF_SECONDS * 2**attempt)
    raise AssertionError("unreachable")


def fetch_awdb_series(station_triplet: str, cadence: str,
                      start: str, end: str) -> pd.DataFrame:
    """Pull an AWDB RESC storage series and normalize it to [date, storage_af].

    Daily values carry an ISO date. Monthly values carry only year/month;
    with periodRef=END they represent the end of that month, so we assign the
    calendar month-end date. The original cadence remains on the published
    reservoir record and drives its freshness threshold.
    """
    payload = _get_awdb_json({
        "stationTriplets": station_triplet,
        "elements": "RESC",
        "duration": cadence.upper(),
        "beginDate": dt.datetime.strptime(start, "%Y%m%d").date().isoformat(),
        "endDate": dt.datetime.strptime(end, "%Y%m%d").date().isoformat(),
        "periodRef": "END",
    })
    stations = payload if isinstance(payload, list) else [payload]
    values = []
    for station in stations:
        for block in (station.get("data") or []):
            values.extend(block.get("values") or [])

    rows = []
    for value in values:
        if cadence == "monthly":
            year, month = value.get("year"), value.get("month")
            date = (pd.Timestamp(year=int(year), month=int(month), day=1) +
                    pd.offsets.MonthEnd(0)) if year and month else pd.NaT
        else:
            date = pd.to_datetime(value.get("date"), errors="coerce")
        rows.append({"date": date, "storage_af": value.get("value")})

    if not rows:
        return pd.DataFrame({"date": pd.Series(dtype="datetime64[ns]"),
                             "storage_af": pd.Series(dtype="float64")})
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.normalize()
    df["storage_af"] = pd.to_numeric(df["storage_af"], errors="coerce")
    df = df.dropna(subset=["date", "storage_af"])
    df = df[df["date"] <= local_today()]
    return (df.sort_values("date").drop_duplicates(subset="date", keep="last")
              [["date", "storage_af"]].reset_index(drop=True))


#: California's own service. The station id and sensor number are the identity
#: (ADR-066); sensor 15 is reservoir storage, published in acre-feet.
CDEC_DATA_URL = "https://cdec.water.ca.gov/dynamicapp/req/JSONDataServlet"
CDEC_STORAGE_SENSOR = 15

#: The value this service writes where it has no reading.
#:
#: It is a number rather than a null, which makes it the most dangerous fact
#: about this source: a reader of `value` that treats it as a measurement
#: subtracts ten thousand acre-feet from whatever total it lands in. Measured
#: on 2026-08-20 across a week and all 238 storage stations, 537 of 1,435
#: values were this and none were null -- 37%, which is the ordinary shape of
#: the data and not an edge case.
#:
#: `fetch_cdec_series` is the only place the field is read, and it drops these
#: rather than converting them. A missing reading and an empty reservoir are
#: different facts; ADR-056 already turns on that distinction.
CDEC_MISSING_VALUE = -9999


def _get_cdec_json(params: dict):
    """GET CDEC JSON with the same transient-failure policy as the others."""
    for attempt in range(RETRY_ATTEMPTS):
        try:
            resp = requests.get(CDEC_DATA_URL, params=params, timeout=60)
            resp.raise_for_status()
            return resp.json()
        except (requests.exceptions.RequestException, ValueError):
            if attempt == RETRY_ATTEMPTS - 1:
                raise
            time.sleep(RETRY_BACKOFF_SECONDS * 2**attempt)
    raise AssertionError("unreachable")


def fetch_cdec_series(station_id: str, cadence: str,
                      start: str, end: str) -> pd.DataFrame:
    """Pull a CDEC storage series and normalize it to [date, storage_af].

    The same contract the other two providers answer with: a date-sorted frame
    with nulls dropped, duplicate dates collapsed to the last reading, and
    nothing dated after today.

    Two differences this service brings:

    **`-9999` means no reading** and is dropped here (`CDEC_MISSING_VALUE`).
    This is the only place `value` is read.

    **The dates are not ISO.** They arrive as `2026-8-10 00:00`, unpadded, and
    there are two of them -- `date` is the reading's own day and `obsDate` is
    when the service recorded it. The reading date is the one a storage series
    is indexed by, the same choice the other two providers' fetchers make.

    **A monthly reading is stamped at the start of the month it measures, and
    the water was measured at the end of it.** Verified against the same
    station's daily series: Oroville's monthly value dated `2026-6-1` is
    3,082,292 acre-feet, which is the daily reading for **30 June**; 1 June
    was 3,327,054. So the stamp names the month and the value is its last day,
    and the date is moved to the end of the month here -- the calendar is
    corrected, never the reading.

    It matters for more than tidiness. Every date this pipeline publishes
    means "when the water was measured": `days_stale` is computed from it and
    ADR-056 withdraws a record 60 days past it. Left at the month's start, all
    33 monthly California stations read 50 days late on the day they were
    admitted and would have been withdrawn as quiet feeds before September,
    while reporting perfectly normally. The month-end feed this project
    already had -- the Conservation Service's -- stamps the last day, so this
    also makes one convention of two.
    """
    payload = _get_cdec_json({
        "Stations": station_id,
        "SensorNums": str(CDEC_STORAGE_SENSOR),
        "dur_code": "M" if cadence == "monthly" else "D",
        "Start": dt.datetime.strptime(start, "%Y%m%d").date().isoformat(),
        "End": dt.datetime.strptime(end, "%Y%m%d").date().isoformat(),
    })
    rows = []
    for value in (payload if isinstance(payload, list) else []):
        reading = value.get("value")
        # Dropped, never converted: see CDEC_MISSING_VALUE.
        if not isinstance(reading, (int, float)):
            continue
        if reading == CDEC_MISSING_VALUE or reading < 0:
            continue
        rows.append({"date": value.get("date"), "storage_af": float(reading)})

    if not rows:
        return pd.DataFrame({"date": pd.Series(dtype="datetime64[ns]"),
                             "storage_af": pd.Series(dtype="float64")})
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.normalize()
    df["storage_af"] = pd.to_numeric(df["storage_af"], errors="coerce")
    df = df.dropna(subset=["date", "storage_af"])
    if cadence == "monthly":
        # See the docstring: the stamp names the month, the value is its last
        # day. `MonthEnd(0)` moves a date inside a month to that month's end
        # and leaves one already there alone, so this is idempotent if the
        # service ever changes its convention. The today filter below then
        # drops a month still in progress rather than publishing a date in
        # the future -- which costs at most the current month's row, and only
        # if the service ever begins stamping one before the month is over.
        df["date"] = df["date"] + pd.offsets.MonthEnd(0)
    df = df[df["date"] <= local_today()]
    return (df.sort_values("date").drop_duplicates(subset="date", keep="last")
              [["date", "storage_af"]].reset_index(drop=True))


#: Colorado's own service. The telemetry `abbrev` is the identity (ADR-066);
#: storage is published in acre-feet and the daily endpoint folds each day's
#: readings behind one row (`measCount` says how many stood behind it).
CDSS_BASE_URL = "https://dwr.state.co.us/Rest/GET/api/v2"
CDSS_STATIONS_URL = f"{CDSS_BASE_URL}/telemetrystations/telemetrystation"
CDSS_SERIES_URL = f"{CDSS_BASE_URL}/telemetrystations/telemetrytimeseriesday"


def _get_cdss_json(url: str, params: dict):
    """GET a CDSS envelope, with the same transient-failure policy as the others.

    Two things are this service's own. The answer is always an *envelope* --
    `{PageNumber, PageCount, ResultCount, ResultList}` -- never a bare list,
    so the caller reads `ResultList`. And **a station or window with no rows
    is an HTTP 404 carrying a text body** ("returns zero records from CDSS"),
    which for every other service means a failure. Here it means "no data":
    a reservoir whose telemetry stopped in 2021 answers its whole recent
    history that way. A 404 whose body says zero records is therefore an
    empty answer, returned as `[]`; any other 404 is still raised, because a
    reshaped route is a failure and must look like one.

    The service also publishes its own quota -- 1,000 requests and 600,000
    rows per day, resetting at midnight Mountain -- on `x-rate-*` response
    headers. Nothing here reads them yet; the refresh's ~400k rows fit, and
    the audit tools that approach the limit report their own consumption.
    """
    for attempt in range(RETRY_ATTEMPTS):
        try:
            resp = requests.get(url, params=params, timeout=60)
            if resp.status_code == 404 and b"zero records" in resp.content:
                return []
            resp.raise_for_status()
            payload = resp.json()
            if isinstance(payload, dict) and "ResultList" in payload:
                return payload["ResultList"] or []
            return payload
        except (requests.exceptions.RequestException, ValueError):
            if attempt == RETRY_ATTEMPTS - 1:
                raise
            time.sleep(RETRY_BACKOFF_SECONDS * 2**attempt)
    raise AssertionError("unreachable")


def fetch_cdss_series(abbrev: str, start: str, end: str) -> pd.DataFrame:
    """Pull a CDSS daily storage series and normalize it to [date, storage_af].

    The same contract the other three providers answer with: a date-sorted
    frame with nulls dropped, duplicate dates collapsed to the last reading,
    and nothing dated after today.

    What this service adds:

    **Dates carry no time zone** (`2026-07-01T00:00:00`) and need no
    correction: unlike California's monthly stamp, the value behind a day's
    row is that day's reading (its own `measCount` readings folded together),
    so the date is kept as written. The calendar needs no repair here.

    **No sentinel has been observed** -- dead stations answer 404 rather than
    publishing a filler value -- but a negative or null `measValue` is dropped
    anyway, on the same principle as every other provider: no reading and an
    empty reservoir are different facts.
    """
    rows = _get_cdss_json(CDSS_SERIES_URL, {
        "abbrev": abbrev,
        "parameter": "STORAGE",
        "startDate": dt.datetime.strptime(start, "%Y%m%d").date().isoformat(),
        "endDate": dt.datetime.strptime(end, "%Y%m%d").date().isoformat(),
        "format": "json",
    })
    cleaned = []
    for value in rows if isinstance(rows, list) else []:
        reading = value.get("measValue")
        if not isinstance(reading, (int, float)) or reading < 0:
            continue
        cleaned.append({"date": value.get("measDate"), "storage_af": float(reading)})
    if not cleaned:
        return pd.DataFrame({"date": pd.Series(dtype="datetime64[ns]"),
                             "storage_af": pd.Series(dtype="float64")})
    df = pd.DataFrame(cleaned)
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.normalize()
    df["storage_af"] = pd.to_numeric(df["storage_af"], errors="coerce")
    df = df.dropna(subset=["date", "storage_af"])
    df = df[df["date"] <= local_today()]
    return (df.sort_values("date").drop_duplicates(subset="date", keep="last")
              [["date", "storage_af"]].reset_index(drop=True))


#: The U.S. Geological Survey's modern OGC daily-values collection. Parameter
#: 00054 is the agency's own code for reservoir storage in acre-feet. The API
#: key is deliberately supplied in a header so it cannot enter a requested URL
#: or a provider log (ADR-098).
USGS_DV_URL = "https://api.waterdata.usgs.gov/ogcapi/v0/collections/daily/items"
USGS_LEGACY_DV_URL = "https://waterservices.usgs.gov/nwis/dv"
USGS_API_KEY_ENV = "USGS_API_KEY"
USGS_STORAGE_PARAMETER = "00054"
USGS_PAGE_LIMIT = 10000

SRP_BASE_URL = "https://streamflow.watershedconnection.com/api/watershedconnectiondata"
SRP_STATIONS_URL = f"{SRP_BASE_URL}/getstationlist"
SRP_SERIES_URL = f"{SRP_BASE_URL}/getmeasurementdata"
DNRC_STAGE_URL = "https://gis.dnrc.mt.gov/arcgis/rest/services/WRD/WMB_StAGE/MapServer"
DNRC_SERIES_URL = f"{DNRC_STAGE_URL}/2/query"


def _usgs_api_key() -> str:
    """Return the pipeline-only API key or fail before making a request."""
    api_key = os.environ.get(USGS_API_KEY_ENV, "").strip()
    if not api_key:
        raise RuntimeError(
            f"{USGS_API_KEY_ENV} is required for the USGS OGC daily service")
    return api_key


def _get_usgs_json(url: str, params: dict | None = None):
    """GET one OGC page with the shared transient-failure policy."""
    for attempt in range(RETRY_ATTEMPTS):
        try:
            resp = requests.get(url, params=params, timeout=60,
                                headers={
                                    "User-Agent":
                                        "western-water-dashboard/refresh "
                                        "(+https://github.com/buschbrian)",
                                    "X-Api-Key": _usgs_api_key(),
                                })
            resp.raise_for_status()
            return resp.json()
        except (requests.exceptions.RequestException, ValueError):
            if attempt == RETRY_ATTEMPTS - 1:
                raise
            time.sleep(RETRY_BACKOFF_SECONDS * 2**attempt)
    raise AssertionError("unreachable")


def fetch_usgs_series(site_no: str, statistic_id: str,
                      start: str, end: str) -> pd.DataFrame:
    """Pull a USGS daily 00054 series, normalized to [date, storage_af].

    The same contract every provider answers with. What this one adds:

    **The reply is an OGC feature collection.** Storage sites do not all use
    one daily statistic, and one admitted site exposes two. The reviewed
    statistic id is therefore part of the roster and of every request rather
    than inferred from response order.

    **The calendar needs no repair.** Each reading is stamped with the day
    it belongs to -- the collection's `time` property, one date per row -- and
    the value behind that stamp is that day's figure, so dates are kept as
    written. This provider is already daily, so nothing here reduces by day.

    **A quiet site answers with an empty series**, not an error: no blocks,
    no readings, an empty frame -- the same "no usable rows" state every
    other adapter produces.
    """
    cleaned = []
    next_url: str | None = USGS_DV_URL
    params: dict | None = {
        "monitoring_location_id": f"USGS-{site_no}",
        "parameter_code": USGS_STORAGE_PARAMETER,
        "statistic_id": statistic_id,
        "datetime": (
            f"{dt.datetime.strptime(start, '%Y%m%d').date().isoformat()}/"
            f"{dt.datetime.strptime(end, '%Y%m%d').date().isoformat()}"
        ),
        "limit": USGS_PAGE_LIMIT,
        "f": "json",
    }
    page = 0
    while next_url and page < MAX_PAGES:
        payload = _get_usgs_json(next_url, params)
        params = None  # every OGC next link is already a complete URL
        page += 1
        for feature in payload.get("features") or []:
            reading = feature.get("properties") or {}
            if reading.get("monitoring_location_id") != f"USGS-{site_no}" \
                    or reading.get("parameter_code") != USGS_STORAGE_PARAMETER \
                    or reading.get("statistic_id") != statistic_id \
                    or reading.get("unit_of_measure") != "Acre-ft":
                continue
            raw = reading.get("value")
            try:
                number = float(raw)
            except (TypeError, ValueError):
                continue
            if number >= 0:
                cleaned.append({"date": reading.get("time"),
                                "storage_af": number})
        next_url = next((link.get("href") for link in payload.get("links") or []
                         if link.get("rel") == "next" and link.get("href")), None)
    if next_url:
        raise RuntimeError(f"USGS OGC pagination exceeded {MAX_PAGES} pages")
    if not cleaned:
        return pd.DataFrame({"date": pd.Series(dtype="datetime64[ns]"),
                             "storage_af": pd.Series(dtype="float64")})
    df = pd.DataFrame(cleaned)
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.normalize()
    df["storage_af"] = pd.to_numeric(df["storage_af"], errors="coerce")
    df = df.dropna(subset=["date", "storage_af"])
    df = df[df["date"] <= local_today()]
    return (df.sort_values("date").drop_duplicates(subset="date", keep="last")
              [["date", "storage_af"]].reset_index(drop=True))


def reduce_to_daily_last(frame: pd.DataFrame) -> pd.DataFrame:
    """Reduce sub-daily observations to one row per day: the day's last.

    Two providers publish far more often than daily -- the Salt River Project
    every five minutes, Montana's StAGE service every quarter hour -- and the
    estimator downstream wants one figure per date. The day's last reading is
    that figure, the same choice the daily providers' own services make.

    **Sort on the observation time, never on the calendar day.** The obvious
    spelling normalizes first and then sorts, which leaves every reading in a
    day holding an identical sort key. `sort_values` is not stable by default,
    so `keep="last"` then returns an arbitrary reading of the day rather than
    its last: a two-day fetch of five-minute values was observed publishing an
    08:10 reading as the day's storage. The full timestamp orders the readings
    the way the day actually ran, and a stable sort keeps two readings that
    share one timestamp in the order the service sent them.

    Expects `observed_at` and `date` columns; returns only the published two.
    """
    return (frame.sort_values("observed_at", kind="stable")
                 .drop_duplicates("date", keep="last")
                 [["date", "storage_af"]].reset_index(drop=True))


def _get_srp_json(url: str, params: dict):
    """GET an SRP JSON response with the common bounded retry policy."""
    for attempt in range(RETRY_ATTEMPTS):
        try:
            response = requests.get(url, params=params, timeout=120,
                                    headers={"Accept": "application/json"})
            response.raise_for_status()
            return response.json()
        except (requests.exceptions.RequestException, ValueError):
            if attempt == RETRY_ATTEMPTS - 1:
                raise
            time.sleep(RETRY_BACKOFF_SECONDS * 2**attempt)
    raise AssertionError("unreachable")


def fetch_srp_station_list() -> list[dict]:
    payload = _get_srp_json(SRP_STATIONS_URL, {"getLastReadings": "true"})
    if not isinstance(payload, list):
        raise ValueError("SRP station list is not an array")
    return payload


def validate_srp_station(row: dict, stations: list[dict]) -> None:
    station = next((item for item in stations
                    if item.get("stationId") == row["station_id"]), None)
    if station is None:
        raise ValueError(f"SRP station {row['station_id']} is missing")
    if not (station.get("reservoirDatas") or [{}])[0].get("isReservoirActive"):
        raise ValueError(f"SRP station {row['station_id']} is not active")
    measurement = next((item for item in station.get("measurements") or []
                        if item.get("measurementId") == row["measurement_id"]), None)
    if measurement is None or measurement.get("dataId") != row["data_id"] \
            or measurement.get("units") != "Acre-ft" \
            or measurement.get("displayName") != "Current Volume":
        raise ValueError(f"SRP station {row['station_id']} measurement changed")
    capacity = float((station.get("reservoirDatas") or [{}])[0]
                     .get("maxConservationStorage") or 0)
    if capacity != float(row["capacity"]["capacity_af"]):
        raise ValueError(f"SRP station {row['station_id']} full level changed")


def fetch_srp_series(measurement_id: int, history_data_id: str,
                     start: str, end: str) -> pd.DataFrame:
    """Fetch five-minute SRP storage and keep the last reading of each day."""
    payload = _get_srp_json(SRP_SERIES_URL, {
        "measurementId": measurement_id, "units": "Acre-ft",
        "startDate": dt.datetime.strptime(start, "%Y%m%d").date().isoformat(),
        "endDate": dt.datetime.strptime(end, "%Y%m%d").date().isoformat(),
    })
    readings = payload.get("timeSeriesData") if isinstance(payload, dict) else None
    if not isinstance(readings, list):
        raise ValueError("SRP history has no timeSeriesData array")
    rows = []
    for reading in readings:
        # SRP publishes explicit all-null rows for intervals with no reading.
        # They represent absence, not a changed measurement identity. A row
        # with any measurement value still has to pass every pinned check.
        if reading.get("readingValue") is None \
                and reading.get("dataId") is None \
                and reading.get("unit") is None \
                and reading.get("approval") is None \
                and reading.get("grade") is None:
            continue
        if reading.get("dataId") != history_data_id or reading.get("unit") != "Acre-ft":
            raise ValueError(f"SRP measurement {measurement_id} identity or unit changed")
        if not isinstance(reading.get("approval"), int) \
                or not isinstance(reading.get("grade"), int):
            raise ValueError(f"SRP measurement {measurement_id} quality fields changed")
        rows.append({"date": reading.get("readingDate"),
                     "storage_af": reading.get("readingValue")})
    if not rows:
        return pd.DataFrame({"date": pd.Series(dtype="datetime64[ns]"),
                             "storage_af": pd.Series(dtype="float64")})
    frame = pd.DataFrame(rows)
    frame["observed_at"] = pd.to_datetime(frame["date"], errors="coerce")
    frame["storage_af"] = pd.to_numeric(frame["storage_af"], errors="coerce")
    frame = frame.dropna(subset=["observed_at", "storage_af"])
    frame = frame[frame["storage_af"] >= 0]
    frame["date"] = frame["observed_at"].dt.normalize()
    frame = frame[frame["date"] <= local_today()]
    return reduce_to_daily_last(frame)


def _get_dnrc_json(params: dict) -> dict:
    for attempt in range(RETRY_ATTEMPTS):
        try:
            response = requests.get(DNRC_SERIES_URL, params=params, timeout=120)
            response.raise_for_status()
            payload = response.json()
            if payload.get("error"):
                raise ValueError(str(payload["error"]))
            return payload
        except (requests.exceptions.RequestException, ValueError):
            if attempt == RETRY_ATTEMPTS - 1:
                raise
            time.sleep(RETRY_BACKOFF_SECONDS * 2**attempt)
    raise AssertionError("unreachable")


def fetch_dnrc_series(sensor_id: str, start: str, end: str) -> pd.DataFrame:
    """Fetch the owner-operated StAGE storage series and reduce it by day."""
    start_day = dt.datetime.strptime(start, "%Y%m%d").date().isoformat()
    end_day = dt.datetime.strptime(end, "%Y%m%d").date().isoformat()
    rows, offset = [], 0
    while offset // 2000 < MAX_PAGES:
        payload = _get_dnrc_json({
            "f": "json",
            "where": (f"SensorID='{sensor_id}' AND Timestamp >= DATE '{start_day}' "
                      f"AND Timestamp <= DATE '{end_day}'"),
            "outFields": "SensorID,Timestamp,RecordedValue,GradeCode,ApprovalLevel",
            "orderByFields": "Timestamp ASC", "returnGeometry": "false",
            "resultOffset": offset, "resultRecordCount": 2000,
        })
        features = payload.get("features") or []
        for feature in features:
            reading = feature.get("attributes") or {}
            if reading.get("SensorID") != sensor_id:
                raise ValueError(f"DNRC sensor identity changed for {sensor_id}")
            # DNRC publishes an explicit row with all three measurement and
            # quality fields null for a gap. It is absence, not a malformed
            # measurement, and is dropped before validating usable rows.
            if reading.get("RecordedValue") is None:
                continue
            if not isinstance(reading.get("GradeCode"), int) \
                    or not isinstance(reading.get("ApprovalLevel"), int):
                raise ValueError(f"DNRC quality fields changed for {sensor_id}")
            rows.append({"date": reading.get("Timestamp"),
                         "storage_af": reading.get("RecordedValue")})
        if len(features) < 2000 and not payload.get("exceededTransferLimit"):
            break
        offset += len(features)
        if not features:
            break
    if offset // 2000 >= MAX_PAGES:
        raise RuntimeError(f"DNRC pagination exceeded {MAX_PAGES} pages")
    if not rows:
        return pd.DataFrame({"date": pd.Series(dtype="datetime64[ns]"),
                             "storage_af": pd.Series(dtype="float64")})
    frame = pd.DataFrame(rows)
    frame["observed_at"] = pd.to_datetime(frame["date"], unit="ms", utc=True,
                                          errors="coerce").dt.tz_localize(None)
    frame["storage_af"] = pd.to_numeric(frame["storage_af"], errors="coerce")
    frame = frame.dropna(subset=["observed_at", "storage_af"])
    frame["date"] = frame["observed_at"].dt.normalize()
    frame = frame[(frame["storage_af"] >= 0) & (frame["date"] <= local_today())]
    return reduce_to_daily_last(frame)
