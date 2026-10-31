/*
 * A synthetic terminal-lake payload for the unit tests (ADR-119). Invented
 * values, never today's.
 */
function measurement(current: number, extra: Record<string, unknown> = {}) {
  return {
    current, as_of: "2026-09-05",
    record_high: current + 10, record_high_date: "2019-05-03",
    record_low: current - 10, record_low_date: "2016-11-02",
    first_obs: "2015-01-01", n_obs: 4200,
    change_7d: -0.1, change_7d_reference_date: "2026-08-29", change_7d_elapsed_days: 7,
    change_30d: -0.4, change_30d_reference_date: "2026-08-06", change_30d_elapsed_days: 30,
    change_365d: 1.2, change_365d_reference_date: "2025-09-05", change_365d_elapsed_days: 365,
    seasonal_rank: 3, seasonal_rank_of: 12,
    parameter_code: "00062", statistic_id: "32400",
    ...extra
  };
}

export function lake(overrides: Record<string, unknown> = {}) {
  return {
    name: "Walker Lake", water_type: "natural_terminal_lake",
    source_key: "usgs", source_label: "U.S. Geological Survey",
    source_url: "https://api.waterdata.usgs.gov/ogcapi/v0/collections/daily/items",
    source_station_id: "10288500", state: "NV", lat: 38.67, lon: -118.77,
    data_frequency: "daily", stale_after_days: 2,
    as_of: "2026-09-05", days_stale: 1, is_stale: false, fetch_ok: true,
    elevation: measurement(3914.96, { unit: "ft", vertical_datum: "NGVD29" }),
    volume: measurement(1153000, {
      unit: "acre_feet", parameter_code: "00054",
      relation: { name: "Lopes and Smith (2007)", source_url: "https://doi.org/10.3133/sir20075012",
        in_use_from: "2014-10-01" },
      change_7d: -1200, change_30d: -5500, change_365d: 24000,
      change_7d_pct: -0.1, change_30d_pct: -0.5, change_365d_pct: 2.1,
      monthly: [{ month: "2026-08", mean_af: 1160000, min_af: 1150000, max_af: 1170000,
        end_af: 1153000, days: 31, normal_af: 1100000, normal_years: 10 }]
    }),
    arms: [], targets: [], first_obs: "2015-01-01", years_of_record: 11.7,
    huc6: "160503", huc6_name: "Walker", huc8: "16050304", huc8_name: "Walker Lake",
    ...overrides
  };
}

/** A lake measured by arm, with a level and no volume at each arm (ADR-159). */
export function armedLake(overrides: Record<string, unknown> = {}) {
  const arm = (name: string, station: string, current: number) => ({
    name, source_station_id: station, lat: 41, lon: -112.4,
    elevation: measurement(current, { unit: "ft", vertical_datum: "NGVD29",
      parameter_code: "62614", statistic_id: "00003" }),
    volume: null, first_obs: "2015-01-01"
  });
  return lake({
    name: "Great Salt Lake", state: "UT", source_station_id: null, lat: null, lon: null,
    elevation: null, volume: null,
    arms: [arm("South Arm", "10010000", 4191.2), arm("North Arm", "10010100", 4189.9)],
    huc6: "160203", huc6_name: "Great Salt Lake", huc8: "16020310",
    huc8_name: "Great Salt Lake",
    ...overrides
  });
}

export function target(overrides: Record<string, unknown> = {}) {
  return {
    name: "Long-term management level",
    authority: "State Water Resources Control Board", decision: "Decision 1631",
    source_url: "https://example.test/decision", set_on: "1994-09-28",
    vertical_datum: "NGVD29", elevation_ft: 6392,
    ...overrides
  };
}

export function payload(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 2, method_version: "m", water_type: "natural_terminal_lake",
    fetched_at: "2026-09-06T12:00:00+00:00", run_date: "2026-09-06",
    stale_after_days: 2, withdraw_after_days: 60,
    lake_count: 1, stale_count: 0, withdrawn_count: 0,
    lakes: [lake()], withdrawn: [],
    ...overrides
  };
}
