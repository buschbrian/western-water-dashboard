import test from 'node:test';
import assert from 'node:assert/strict';
import { SITES, validateSnapshot, flags, readingsCSV, chartGeometry, mapGeometry } from './model.mjs';

const start = '2026-09-24';
const observations = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10),
  value: i === 0 ? 0 : i === 1 || i === 3 ? null : i === 2 ? -2 : i,
  source_value: i === 0 ? '0' : i === 1 || i === 3 ? null : i === 2 ? '-2' : String(i), reported: i !== 3,
  approval_status: i === 3 ? null : 'Provisional', qualifier: i === 2 ? ['ESTIMATED'] : null
}));
const gauge = site => ({ site, name: `River ${site}`, lat: 40.5, lon: -111.5,
  area: 20, traced: 21, reservoirs: [], page: `https://waterdata.usgs.gov/monitoring-location/USGS-${site}/`,
  series_id: `series-${site}`, unit: 'ft^3/s', metadata_source: 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/time-series-metadata/items?parameter_code=00060',
  series_source: 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/daily/items?datetime=2026-09-24%2F2026-10-23',
  map: { width: 960, height: 600, xmin: -12500000, xmax: -12000000, ymin: 4500000, ymax: 5000000 },
  shape: [], observations: structuredClone(observations) });
const snapshot = () => ({ schema_version: 1, data_kind: 'observed', fetched_at: '2026-10-24T12:00:00Z',
  start, end: '2026-10-23', review_screened: '2026-10-23', gauges: SITES.map(gauge) });

test('validates fixed gauge identities, full dates, and 30 values per gauge', () => {
  assert.equal(validateSnapshot(snapshot()).gauges.length, 3);
});

test('refuses malformed spans, source hosts, misplaced stations and incomplete calendars', () => {
  for (const change of [
    d => { d.end = '2026-10-22'; },
    d => { d.gauges[0].site = '99999999'; },
    d => { d.gauges[1].metadata_source = 'https://example.com/steal'; },
    d => { d.gauges[2].observations.pop(); },
    d => { d.gauges[1].observations[3].reported = false; d.gauges[1].observations[3].value = 5; },
    d => { d.gauges[0].observations[0].value = NaN; }
  ]) {
    const bad = snapshot(); change(bad);
    assert.throws(() => validateSnapshot(bad));
  }
});

test('CSV quotes fields and preserves zero, null, absent dates and provisional flags', () => {
  const data = snapshot(), text = readingsCSV(data, data.gauges[0]);
  assert.match(text, /"2026-09-24","0","true","Provisional"/);
  assert.match(text, /"2026-09-25","","true","Provisional"/);
  assert.match(text, /"2026-09-27","","false",""/);
  assert.match(text, /"ESTIMATED"/);
  const exact = snapshot(); exact.gauges[0].observations[4].source_value = '140.0100';
  exact.gauges[0].observations[4].value = 140.01;
  assert.match(readingsCSV(exact, exact.gauges[0]), /"2026-09-28","140\.0100","true"/);
});

test('quality display names every source qualifier', () => {
  assert.equal(flags({ qualifier: null }), 'None reported');
  assert.equal(flags({ qualifier: ['ESTIMATED', 'ICE'] }), 'ESTIMATED; ICE');
  assert.equal(flags({ qualifier: 'ESTIMATED' }), 'ESTIMATED');
});

test('chart keeps gaps separate, includes negative values and never invents zero observations', () => {
  const rows = [{ date: 'a', value: 10 }, { date: 'b', value: null }, { date: 'c', value: -2 }];
  const chart = chartGeometry(rows, 500, 260);
  assert.equal(chart.paths.length, 2);
  assert.equal(chart.paths[0][0].value, 10);
  assert.equal(chart.paths[1][0].value, -2);
  assert.ok(chart.paths[1][0].y < 260);
});

test('map points remain within the published drawing extent', () => {
  const geometry = mapGeometry(gauge(SITES[0]));
  assert.equal(geometry.width, 960);
  assert.ok(geometry.point[0] > 0 && geometry.point[0] < 960);
  assert.ok(geometry.point[1] > 0 && geometry.point[1] < 600);
});
