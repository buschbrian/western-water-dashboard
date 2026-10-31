import { validateSnapshot, flags, readingsCSV, chartGeometry, mapGeometry } from './model.mjs';

const $ = id => document.getElementById(id);
const names = { '10155000': 'Near Hailstone', '10155200': 'River Road Bridge near Heber', '10163000': 'At Provo' };
const number = value => new Intl.NumberFormat('en-US', { maximumSignificantDigits: 15 }).format(value);
const svgNS = 'http://www.w3.org/2000/svg';
let snapshot, selected, resizeTimer;
window.__flowPrototypeReady = { status: 'loading' };

function svgNode(tag, attributes = {}, text) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function drawChart(g) {
  const width = $('chart').clientWidth || 640, height = 260;
  const geometry = chartGeometry(g.observations, width, height);
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': 'chart-title chart-desc' });
  svg.append(svgNode('title', { id: 'chart-title' }, `${names[g.site]} daily mean flow`));
  svg.append(svgNode('desc', { id: 'chart-desc' }, 'Each dot is a daily mean in cubic feet per second. Gaps are days without a value. Exact values and source flags are in the table.'));
  for (const value of [geometry.low, (geometry.high + geometry.low) / 2, geometry.high]) {
    const y = geometry.y(value);
    svg.append(svgNode('line', { x1: 52, x2: width - 16, y1: y, y2: y, class: 'grid' }));
    svg.append(svgNode('text', { x: 45, y: y + 4, 'text-anchor': 'end' }, number(value)));
  }
  svg.append(svgNode('text', { x: 52, y: height - 8 }, snapshot.start.slice(5)));
  svg.append(svgNode('text', { x: width - 16, y: height - 8, 'text-anchor': 'end' }, snapshot.end.slice(5)));
  for (const segment of geometry.paths) {
    svg.append(svgNode('path', { class: 'flow-line', d: segment.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join('') }));
    for (const p of segment) {
      const dot = svgNode('circle', { cx: p.x, cy: p.y, r: 2.5 });
      dot.append(svgNode('title', {}, `${p.date}: ${p.value} cubic feet per second`));
      svg.append(dot);
    }
  }
  $('chart').replaceChildren(svg);
}

function drawMap(g) {
  const geometry = mapGeometry(g);
  if (!geometry) { $('map').textContent = 'No cached map is available.'; return; }
  const image = document.createElement('img');
  image.src = `maps/${g.site}.jpg`; image.width = geometry.width; image.height = geometry.height;
  image.alt = `Topographic map around the Provo River gauge ${names[g.site]}.`;
  image.addEventListener('error', () => { $('map').textContent = 'The cached map could not be loaded.'; }, { once: true });
  const svg = svgNode('svg', { viewBox: `0 0 ${geometry.width} ${geometry.height}`, role: 'img', 'aria-label': 'Full upstream basin outline and gauge location; the outline needs review.' });
  svg.append(svgNode('path', { d: geometry.outline, class: 'basin', 'fill-rule': 'evenodd' }));
  svg.append(svgNode('circle', { cx: geometry.point[0], cy: geometry.point[1], r: 9, class: 'gauge' }));
  $('map').replaceChildren(image, svg);
}

function selectGauge(site) {
  selected = site;
  const g = snapshot.gauges.find(gauge => gauge.site === site);
  $('detail').hidden = false;
  for (const button of $('stations').children) button.setAttribute('aria-pressed', String(button.dataset.site === site));
  $('gauge-name').textContent = `Provo River · ${names[site]}`;
  $('site-number').textContent = `Site ${site}`;
  $('source').href = `https://waterdata.usgs.gov/monitoring-location/USGS-${site}/`;
  const withValues = g.observations.filter(row => row.value !== null);
  const latest = withValues.at(-1);
  $('latest').textContent = latest ? `${number(latest.value)} ft³/s` : 'No value';
  $('latest-date').textContent = latest ? `${latest.date} · ${latest.approval_status || 'Approval not reported'}` : 'No daily value in this window.';
  $('coverage').textContent = `${withValues.length} of 30 days`;
  $('window').textContent = `${snapshot.start} to ${snapshot.end}`;
  const flagged = g.observations.filter(r => r.qualifier && (!Array.isArray(r.qualifier) || r.qualifier.length)).length;
  const provisional = g.observations.filter(r => r.approval_status === 'Provisional').length;
  $('quality-summary').textContent = `${provisional} days marked provisional by the source. ${flagged} days have other source flags. ${30 - withValues.length} days have no value.`;
  $('areas').textContent = `Published drainage area: ${g.area} square miles. Cached traced area: ${g.traced} square miles.`;
  $('map-date').textContent = `Cached review screen: ${snapshot.review_screened}. The outline has not been corrected.`;
  $('reservoirs').replaceChildren(...g.reservoirs.map(name => { const li = document.createElement('li'); li.textContent = name; return li; }));
  $('fetched').textContent = `Saved snapshot fetched at ${snapshot.fetched_at}. Values refer to their observation dates.`;
  $('series').textContent = `Source series: ${g.series_id}. Unit: cubic feet per second.`;
  $('metadata').href = g.metadata_source;
  $('caption').textContent = `${names[site]} · ${snapshot.start} to ${snapshot.end} · ${snapshot.data_kind === 'synthetic' ? 'Synthetic test data' : 'Source daily observations'}`;
  $('readings').replaceChildren(...[...g.observations].reverse().map(row => {
    const tr = document.createElement('tr');
    for (const text of [row.date, row.value === null ? 'No value' : row.source_value,
      row.reported ? row.approval_status || 'Not reported' : 'No observation', flags(row)]) {
      const td = document.createElement('td'); td.textContent = text; tr.append(td);
    }
    return tr;
  }));
  drawChart(g); drawMap(g);
  window.__flowPrototypeReady = { status: 'ready', dataKind: snapshot.data_kind, gauges: 3,
    selected: site, observations: g.observations.length, missing: 30 - withValues.length };
}

function download(name, content, type) {
  try {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a'); link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    $('notice').textContent = 'The file could not be saved. Keep this preview open and try again.';
  }
}

async function start() {
  try {
    const response = await fetch('snapshot.json', { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('The saved flow data could not be loaded.');
    snapshot = validateSnapshot(await response.json());
    $('notice').textContent = snapshot.data_kind === 'synthetic'
      ? 'Synthetic test data. These values are made up to test the preview. They do not describe the river.'
      : `Saved daily observations through ${snapshot.end}. Candidate gauges; review is still required.`;
    for (const g of snapshot.gauges) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.site = g.site;
      const title = document.createElement('strong'); title.textContent = names[g.site];
      const subtitle = document.createElement('small'); subtitle.textContent = `Site ${g.site} · ${g.reservoirs.length} published reservoirs upstream`;
      button.append(title, subtitle); button.addEventListener('click', () => selectGauge(g.site));
      $('stations').append(button);
    }
    selectGauge(snapshot.gauges[0].site);
    $('csv').addEventListener('click', () => download(`${snapshot.data_kind}-${selected}-daily-flow.csv`, readingsCSV(snapshot, snapshot.gauges.find(g => g.site === selected)), 'text/csv;charset=utf-8'));
    $('json').addEventListener('click', () => download(`${snapshot.data_kind}-provo-flow-snapshot.json`, JSON.stringify(snapshot, null, 2), 'application/json'));
  } catch (error) {
    $('detail').hidden = true;
    $('stations').replaceChildren();
    $('notice').dataset.error = 'true';
    $('notice').textContent = error.name === 'TimeoutError' ? 'The saved flow data took too long to load. Reload to try again.' : 'The saved flow data could not be read. Rebuild the local preview, then reload.';
    window.__flowPrototypeReady = { status: 'failed' };
  } finally {
    $('app').setAttribute('aria-busy', 'false');
  }
}

window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (snapshot && selected) drawChart(snapshot.gauges.find(g => g.site === selected)); }, 100);
});
await start();
