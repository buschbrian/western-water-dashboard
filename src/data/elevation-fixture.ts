import type { ReservoirElevation } from "../types";

/* Synthetic: nothing here is a reading anyone published. */
export function syntheticElevation(overrides: Partial<ReservoirElevation> = {}): ReservoirElevation {
  return {
    unit: "ft",
    vertical_datum: "NGVD29",
    source_item_id: 508,
    source_url: "https://data.usbr.gov/catalog/2362/item/508",
    current: 3500.25,
    as_of: "2026-10-20",
    record_high: 3700.5,
    record_high_date: "1990-07-01",
    record_low: 3400,
    record_low_date: "1970-04-01",
    first_obs: "1965-01-01",
    n_obs: 20000,
    change_7d: 1.5,
    change_7d_reference_date: "2026-10-13",
    change_7d_elapsed_days: 7,
    change_30d: -2.25,
    change_30d_reference_date: "2026-09-20",
    change_30d_elapsed_days: 30,
    change_365d: null,
    change_365d_reference_date: null,
    change_365d_elapsed_days: null,
    seasonal_rank: 3,
    seasonal_rank_of: 40,
    datum_offset: {
      to_datum: "NAVD88", offset_ft: 2.9, range_ft: [2.9, 3.0], readings: 100,
      usgs_site: "09379900", parameters: { NAVD88: "62615", NGVD29: "62614" },
      source_url: "https://waterdata.usgs.gov/monitoring-location/USGS-09379900/",
      measured: "2026-10-27"
    },
    reference_levels: [
      { elevation_ft: 3700, label: "Full level, the top of the spillway", authority: "Bureau of Reclamation",
        url: "https://example.gov/a.pdf" },
      { elevation_ft: 3490, label: "Lowest level for making power", authority: "Bureau of Reclamation",
        url: "https://example.gov/a.pdf" },
      { elevation_ft: 3370, label: "Water below this level cannot be released",
        authority: "Bureau of Reclamation", url: "https://example.gov/a.pdf" }
    ],
    ...overrides
  };
}

/* An operator's project datum, stated against a national one (Lake Mead's
 * kind of datum). Synthetic values. */
export function syntheticProjectElevation(): ReservoirElevation {
  return syntheticElevation({
    vertical_datum: "project",
    datum_name: "Hoover Dam powerhouse datum",
    datum_relation: {
      datum: "NGVD29", add_ft: 0.55, quote: "Add 0.55 feet to convert to NGVD29",
      source_url: "https://example.gov/survey.pdf"
    },
    datum_offset: null,
    reference_levels_datum_stated: false,
    record_starts: {
      date: "1941-08-06", reason: "when Testwater first rose to the spillway",
      basis: "Synthetic.", quote: "Synthetic.", source_url: "https://example.gov/survey.pdf"
    },
    derived_offset: {
      to_datum: "NAVD88", offset_ft: 2.9, basis: "Calculated, not measured.",
      sources: [{ citation: "Survey mark", url: "https://www.ngs.noaa.gov/cgi-bin/ds_mark.prl?PidBox=X" }],
      checked: "2026-10-27"
    }
  });
}
