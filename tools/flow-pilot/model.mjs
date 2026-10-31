export const SITES = ['10155000', '10155200', '10163000'];

export function validateSnapshot(data) {
  const fail = () => { throw new Error('The saved flow data did not pass validation.'); };
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const source = value => {
    try { const url = new URL(value); return url.origin === 'https://api.waterdata.usgs.gov'
      && url.pathname.startsWith('/ogcapi/v1/collections/') && !url.username && !url.password; }
    catch { return false; }
  };
  if (!data || data.schema_version !== 1 || !['observed', 'synthetic'].includes(data.data_kind)
    || !date(data.start) || !date(data.end) || Date.parse(data.end) - Date.parse(data.start) !== 29 * 86400000
    || typeof data.fetched_at !== 'string' || !Number.isFinite(Date.parse(data.fetched_at)) || !date(data.review_screened)
    || !Array.isArray(data.gauges) || data.gauges.length !== 3) fail();
  for (const [index, g] of data.gauges.entries()) {
    if (g.site !== SITES[index] || typeof g.name !== 'string' || !g.name || typeof g.series_id !== 'string'
      || !source(g.metadata_source) || !source(g.series_source)
      || !Number.isFinite(g.area) || g.area < 0 || !Number.isFinite(g.traced) || g.traced < 0
      || g.unit !== 'ft^3/s' || !Number.isFinite(g.lat) || Math.abs(g.lat) > 85
      || !Number.isFinite(g.lon) || Math.abs(g.lon) > 180 || !Array.isArray(g.reservoirs)
      || g.reservoirs.some(r => typeof r !== 'string') || !Array.isArray(g.observations)
      || g.observations.length !== 30) fail();
    for (const [i, row] of g.observations.entries()) {
      if (!date(row.date) || Date.parse(row.date) !== Date.parse(data.start) + i * 86400000
        || (row.value !== null && !Number.isFinite(row.value))
        || (row.source_value !== null && typeof row.source_value !== 'string')
        || (row.value === null && row.source_value !== null)
        || (row.value !== null && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(row.source_value))
        || typeof row.reported !== 'boolean'
        || (!row.reported && row.value !== null)
        || (row.approval_status !== null && typeof row.approval_status !== 'string')
        || (row.qualifier !== null && typeof row.qualifier !== 'string'
          && !(Array.isArray(row.qualifier) && row.qualifier.every(q => typeof q === 'string')))) fail();
    }
  }
  return data;
}

export function flags(row) {
  return Array.isArray(row.qualifier) ? row.qualifier.join('; ') : row.qualifier || 'None reported';
}

export function readingsCSV(snapshot, gauge) {
  const cell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [['data_kind', 'site', 'series_id', 'date', 'value_cubic_feet_per_second', 'reported', 'approval_status', 'qualifier'],
    ...gauge.observations.map(row => [snapshot.data_kind, gauge.site, gauge.series_id, row.date,
      row.source_value, row.reported, row.approval_status, typeof row.qualifier === 'string' ? row.qualifier : JSON.stringify(row.qualifier)])]
    .map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function chartGeometry(rows, width, height) {
  const values = rows.flatMap(r => r.value === null ? [] : [r.value]);
  const low = Math.min(0, ...values), high = Math.max(1, ...values);
  const x = i => 52 + i * (width - 68) / (rows.length - 1);
  const y = value => 20 + (high - value) * (height - 55) / (high - low);
  const paths = [];
  let current = [];
  rows.forEach((r, i) => {
    if (r.value === null) { if (current.length) paths.push(current); current = []; }
    else current.push({ x: x(i), y: y(r.value), date: r.date, value: r.value });
  });
  if (current.length) paths.push(current);
  return { paths, low, high, y, x };
}

export function mapGeometry(g) {
  const m = g.map;
  if (!m || !['width', 'height', 'xmin', 'xmax', 'ymin', 'ymax'].every(k => Number.isFinite(m[k]))
    || m.width <= 0 || m.height <= 0 || m.xmax <= m.xmin || m.ymax <= m.ymin) return null;
  const xy = (lon, lat) => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 85 || Math.abs(lon) > 180) throw new Error('Invalid map point');
    const x = lon * Math.PI / 180 * 6378137;
    const y = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 6378137;
    return [(x - m.xmin) / (m.xmax - m.xmin) * m.width, (m.ymax - y) / (m.ymax - m.ymin) * m.height];
  };
  const shape = Array.isArray(g.shape) ? g.shape : [];
  return { width: m.width, height: m.height, point: xy(g.lon, g.lat),
    outline: shape.map(ring => ring.map((p, i) => `${i ? 'L' : 'M'}${xy(...p).join(',')}`).join('') + 'Z').join('') };
}
