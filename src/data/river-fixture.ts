/*
 * A synthetic river payload for the unit tests (ADR-136, ADR-144). Invented
 * values, never today's: the tests read the model's behaviour, not a reading.
 */
import type {
  NaturalRiverGauge, RiverDay, RiverGauge, RiverNormalBand, RiverPayload, ShapedRiverGauge
} from "../types";

export function riverDays(end: string, values: readonly (number | null)[],
  approval: string | null = "Provisional"): RiverDay[] {
  const last = Date.parse(`${end}T00:00:00Z`);
  return values.map((cfs, index) => ({
    date: new Date(last - (values.length - 1 - index) * 86_400_000).toISOString().slice(0, 10),
    cfs,
    approval: cfs === null ? null : approval,
    qualifiers: []
  }));
}

export function riverGauge(overrides: Partial<ShapedRiverGauge> = {}): ShapedRiverGauge {
  const values = Array.from({ length: 30 }, (_, i) => 100 + i * 10);
  const daily = overrides.daily ?? riverDays("2026-10-26", values);
  const reported = daily.filter((day) => day.cfs !== null);
  const last = daily[daily.length - 1]!;
  const weekAgo = daily[daily.length - 8]!;
  return {
    name: "Example River near Somewhere",
    usgs_name: "EXAMPLE R NR SOMEWHERE, UT",
    measurement: "daily_mean_flow",
    source_key: "usgs",
    source_label: "U.S. Geological Survey",
    source_station_id: "09999999",
    source_url: "https://api.waterdata.usgs.gov/ogcapi/v1/collections/daily/items?f=json&time_series_id=x",
    usgs_page: "https://waterdata.usgs.gov/monitoring-location/USGS-09999999/",
    time_series_id: "x",
    parameter_code: "00060",
    statistic_id: "00003",
    unit: "ft^3/s",
    state: "UT",
    lat: 38.5,
    lon: -110.1,
    drainage_area_sq_mi: 1234,
    huc8: "14070004",
    huc8_name: "Example",
    flows_toward: "Lake Powell",
    tier: "shaped",
    compared_with_normal: false,
    data_frequency: "daily",
    stale_after_days: 2,
    as_of: last.date,
    days_stale: 1,
    is_stale: false,
    fetch_ok: true,
    current_cfs: last.cfs ?? 0,
    current_approval: last.approval,
    current_qualifiers: [],
    change_7d_cfs: weekAgo.cfs === null || last.cfs === null ? null : last.cfs - weekAgo.cfs,
    change_7d_reference_date: weekAgo.cfs === null ? null : weekAgo.date,
    window_start: daily[0]!.date,
    window_end: last.date,
    window_high_cfs: Math.max(...reported.map((d) => d.cfs!)),
    window_high_date: last.date,
    window_low_cfs: Math.min(...reported.map((d) => d.cfs!)),
    window_low_date: daily[0]!.date,
    reported_days: reported.length,
    provisional_days: reported.filter((d) => d.approval === "Provisional").length,
    daily,
    ...overrides
  };
}

/** A band whose 25th to 75th percentiles bracket the fixture's last flow, 390. */
export function riverBand(as_of = "2026-10-26",
  overrides: Partial<RiverNormalBand> = {}): RiverNormalBand {
  return {
    day: as_of.slice(5), p10: 100, p25: 200, p50: 300, p75: 400, p90: 500, years: 44,
    retrieved: "2026-10-31",
    source_url: "https://api.waterdata.usgs.gov/statistics/v0/observationNormals?x",
    ...overrides
  };
}

/** A natural gauge compared with normal, or, given a reason, one withheld. */
export function naturalRiverGauge(overrides: Partial<ShapedRiverGauge> = {},
  withheld: NaturalRiverGauge["normal_withheld"] = null): NaturalRiverGauge {
  const base = riverGauge({ name: "Example Creek near Elsewhere", source_station_id: "09888888",
    flows_toward: null, ...overrides });
  const { tier: _tier, compared_with_normal: _compared, ...rest } = base;
  if (withheld) {
    return { ...rest, tier: "natural", compared_with_normal: false, normal_band: null,
      flow_class: null, normal_withheld: withheld, short_record: null };
  }
  return { ...rest, tier: "natural", compared_with_normal: true,
    normal_band: riverBand(base.as_of), flow_class: "normal", normal_withheld: null,
    short_record: false };
}

export function riverPayload(gauges: RiverGauge[] = [riverGauge()]): RiverPayload {
  return {
    schema_version: 3,
    measurement: "daily_mean_flow",
    fetched_at: "2026-10-27T13:00:00+00:00",
    run_date: "2026-10-27",
    window_days: 30,
    stale_after_days: 2,
    withdraw_after_days: 60,
    gauge_count: gauges.length,
    stale_count: gauges.filter((g) => g.is_stale).length,
    withdrawn_count: 0,
    gauges,
    withdrawn: []
  };
}
