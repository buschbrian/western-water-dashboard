import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = html.split('<script>')[1].split('</script>')[0].split('\nfetch("gauges.json"')[0];
const gauge = (site, extra = {}) => ({
  site, name: `River ${site}`, county: 'County', huc8: '16000001',
  lat: 40, lon: -111, area: 10, traced: 10, begin: '1980-01-01', last: '2026-10-20',
  covers: true, trace: 'traced', check: '', reservoirs: [], snow: [],
  page: 'https://waterdata.usgs.gov/', tier: 'natural', reason: '',
  nearRes: [], nearSnow: [], map: null, shape: [[[-112, 40], [-111, 40], [-111, 41], [-112, 40]]], ...extra,
});
function harness() {
  const elements = new Map(), handlers = new Map(), timers = new Set();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', innerHTML: '', hidden: false, classList: { toggle() {} },
      addEventListener(type, handler) { handlers.set(`${id}:${type}`, handler); },
      querySelector() { return null; },
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: get, activeElement: null, addEventListener(type, fn) { handlers.set(type, fn); } },
    window: { scrollY: 0, scrollTo() {}, addEventListener(type, fn) { handlers.set(type, fn); } },
    setTimeout(fn, ms) { const timer = { fn, ms }; timers.add(timer); return timer; },
    clearTimeout(timer) { timers.delete(timer); },
    Date, Number, String, Math, Promise, Set, Map,
  });
  vm.runInContext(`${script}\nthis.api = {state, write, draft, connect, rule, agreeNext, agreeGroup, select, visible, areaDiff, areaFlag, reviewCSV, basinGeoJSON, findings, closeMap, renderHeader, download};`, context);
  const a = context.api;
  a.state.gauges = [gauge('001'), gauge('002'), gauge('003')];
  a.state.selected = '001'; a.state.canWrite = true; a.state.ready = true;
  const writes = [];
  a.state.db = { collection() { return { doc(site) { return { set(body) { writes.push({ site, body }); return Promise.resolve(); } }; } }; } };
  return { a, elements, handlers, timers, writes, context, get };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('failed save stays visible, is excluded from saved progress, and can be retried', async () => {
  const { a, get } = harness();
  a.state.db = { collection() { return { doc() { return { set: () => Promise.reject(new Error('offline')) }; } }; } };
  assert.equal(await a.write('001', { ruling: 'check', notes: 'Check creek boundary' }), false);
  assert.equal(a.state.dirty['001'].notes, 'Check creek boundary');
  assert.equal(get('ruled-count').textContent, 0);
  assert.match(get('save-state').textContent, /failed/);
  assert.equal(get('retry-save').hidden, false);
  a.state.db = { collection() { return { doc() { return { set: () => Promise.resolve() }; } }; } };
  assert.equal(await a.write('001', {}), true);
  assert.equal(Object.keys(a.state.dirty).length, 0);
  assert.equal(get('ruled-count').textContent, 1);
});

test('notes survive switching gauges and a second note before either debounce fires', async () => {
  const { a, handlers, timers, writes } = harness();
  handlers.get('input')({ target: { id: 'notes', value: 'First gauge draft' } });
  a.select('002', false);
  handlers.get('input')({ target: { id: 'notes', value: 'Second gauge draft' } });
  a.select('001', false);
  assert.match(a.findings(a.state.gauges[0])[0].title, /completeness/);
  for (const timer of [...timers].filter(t => t.ms === 700)) timer.fn();
  await Promise.all(Object.values(a.state.pending));
  assert.equal(writes.length, 2);
  assert.equal(writes.find(w => w.site === '001').body.notes, 'First gauge draft');
  assert.equal(writes.find(w => w.site === '002').body.notes, 'Second gauge draft');
});

test('an older save completion does not mark a newer draft as saved', async () => {
  const { a } = harness();
  let resolve;
  a.state.db = { collection() { return { doc() { return { set: () => new Promise(r => { resolve = r; }) }; } }; } };
  const first = a.write('001', { ruling: 'check' });
  await tick();
  a.draft('001', { notes: 'A newer unsaved note' });
  resolve(); await first;
  assert.equal(a.state.dirty['001'].notes, 'A newer unsaved note');
});

test('a save timeout retains the draft for export and retry', async () => {
  const { a, timers } = harness();
  a.state.db = { collection() { return { doc() { return { set: () => new Promise(() => {}) }; } }; } };
  const pending = a.write('001', { ruling: 'check' });
  await tick();
  [...timers].find(t => t.ms === 15000).fn();
  assert.equal(await pending, false);
  assert.equal(a.state.dirty['001'].ruling, 'check');
});

test('agree next advances exactly once in the unruled queue after success', async () => {
  const { a } = harness(); a.state.unruled = true;
  await a.agreeNext();
  assert.equal(a.state.selected, '002');
  assert.equal(a.state.rulings['001'].ruling, 'natural');
});

test('agree next stays on a failed save', async () => {
  const { a } = harness();
  a.state.db = { collection() { return { doc() { return { set: () => Promise.reject(new Error('offline')) }; } }; } };
  await a.agreeNext(); assert.equal(a.state.selected, '001');
});

test('initial snapshot gates editing and remote snapshots preserve dirty local notes', async () => {
  const { a, context } = harness(); let snapshot;
  a.state.ready = false; a.state.canWrite = false;
  const db = { collection() { return { onSnapshot(fn) { snapshot = fn; } }; } };
  context.window.claude = { use: async name => name === 'db' ? db : { can: async () => true } };
  await a.connect(); assert.equal(a.state.ready, false);
  const snap = data => ({ metadata: { hasPendingWrites: false }, docChanges: () => [{ type: 'modified', doc: { id: '001', data: () => data } }] });
  snapshot(snap({ ruling: 'check', notes: 'Server note' }));
  assert.equal(a.state.ready, true); assert.equal(a.state.canWrite, true);
  a.draft('001', { notes: 'Local note' });
  snapshot(snap({ ruling: 'natural', notes: 'Older server note' }));
  assert.equal(a.state.rulings['001'].notes, 'Local note');
});

test('read-only permission and a missing database cannot write', async () => {
  const { a, context, writes } = harness();
  context.window.claude = undefined;
  await a.connect();
  assert.equal(await a.write('001', { ruling: 'natural' }), false);
  assert.equal(writes.length, 0);
});

test('area flags use the published area as denominator and take priority across tiers', () => {
  const { a } = harness();
  a.state.gauges = [gauge('001', { tier: 'check' }), gauge('002', { area: 50, traced: 400 })];
  assert.equal(a.areaDiff(a.state.gauges[1]), 7);
  assert.equal(a.visible()[0].site, '002');
  assert.equal(a.areaFlag(gauge('x', { traced: 12.5 })), false);
  assert.equal(a.areaDiff(gauge('x', { area: 0 })), null);
});

test('CSV includes only touched gauges, preserves quoted notes and distinguishes unsaved changes', () => {
  const { a } = harness();
  a.draft('001', { ruling: 'check', notes: 'Read "remarks"\nNot resolved' });
  const csv = a.reviewCSV();
  assert.match(csv, /"001","check","Read ""remarks""\nNot resolved"/);
  assert.match(csv, /"unsaved"/); assert.doesNotMatch(csv, /"002"/);
});

test('basin export carries the gauge, boundary and uncertainty without claiming a correction', () => {
  const { a } = harness(); const data = a.basinGeoJSON(a.state.gauges[0]);
  assert.equal(data.type, 'FeatureCollection');
  assert.equal(data.features[0].geometry.type, 'MultiPolygon');
  assert.equal(data.features[0].geometry.coordinates[0][0].length, 4);
  assert.match(data.features[0].properties.status, /unverified simplified/);
  assert.equal(data.features[1].properties.usgs_site_no, '001');
});

test('Artifact exports use the declared downloads capability', async () => {
  const { a, context } = harness(); let saved;
  context.window.claude = { use: async () => ({ save: async request => { saved = request; } }) };
  await a.download('basin-001.json', '{}', 'application/geo+json');
  assert.equal(saved.filename, 'basin-001.json'); assert.equal(saved.data, '{}');
});

test('a watershed is agreed only on its open safe suggestions, and only after a second press', async () => {
  const { a, writes, timers } = harness();
  a.state.gauges = [
    gauge('001', { tier: 'shaped', queue: 'bulk' }),
    gauge('002', { tier: 'natural', queue: 'review' }),
    gauge('003', { tier: 'exclude', queue: 'bulk' }),
    gauge('004', { tier: 'shaped', queue: 'bulk' }),
    gauge('005', { tier: 'shaped', queue: 'bulk', huc8: '16000002' }),
  ];
  a.state.rulings['004'] = { ruling: 'natural', notes: 'Mine' };
  assert.equal(await a.agreeGroup('16000001'), 0);
  assert.equal(writes.length, 0);
  assert.equal(a.state.confirmGroup, '16000001');
  assert.equal(await a.agreeGroup('16000001'), 2);
  assert.deepEqual(writes.map(w => [w.site, w.body.ruling]), [['003', 'exclude'], ['001', 'shaped']]);
  assert.match(writes[0].body.notes, /safe suggestion/);
  assert.equal(a.state.rulings['004'].ruling, 'natural');
  // An unconfirmed first press lapses.
  await a.agreeGroup('16000002');
  [...timers].filter(t => t.ms === 6000).at(-1).fn();
  assert.equal(a.state.confirmGroup, null);
});

test('a read-only view cannot agree a watershed', async () => {
  const { a, writes } = harness();
  a.state.gauges = [gauge('001', { tier: 'shaped', queue: 'bulk' })];
  a.state.canWrite = false;
  await a.agreeGroup('16000001'); await a.agreeGroup('16000001');
  assert.equal(writes.length, 0);
});

test('the queue filter and watershed grouping order the list', () => {
  const { a } = harness();
  a.state.gauges = [
    gauge('001', { huc8: '16000002', huc8Name: 'Provo', queue: 'review' }),
    gauge('002', { huc8: '16000001', huc8Name: 'Weber', queue: 'bulk', tier: 'shaped' }),
    gauge('003', { huc8: '16000002', huc8Name: 'Provo', queue: 'bulk', tier: 'shaped' }),
  ];
  assert.deepEqual(a.visible().map(g => g.site), ['001', '003', '002']);
  a.state.pile = 'bulk';
  assert.deepEqual(a.visible().map(g => g.site), ['003', '002']);
  a.state.pile = 'look';
  assert.deepEqual(a.visible().map(g => g.site), ['001']);
});

test('dam evidence reads large storage as a caution and a dam beside the gauge as a question', () => {
  const { a } = harness();
  const large = a.findings(gauge('001', { dams: 4, damAf: 541138, share: 450.5, flow: 165.8, flowYears: 35,
    largest: ['Jordanelle Dam (363,000 AF)'], irrigation: 2, nearDams: ['Weir'] }));
  const titles = large.map(f => f.title).join(' | ');
  assert.match(titles, /hold 451% of a year's flow/);
  assert.equal(large.find(f => /hold 451/.test(f.title)).sev, 'caution');
  assert.match(titles, /2 irrigation dams upstream/);
  assert.match(titles, /within 1 km of the gauge/);
  const small = a.findings(gauge('002', { dams: 3, damAf: 500, share: 1.6, flow: 40, flowYears: 30, largest: [] }));
  assert.equal(small.find(f => /hold 1.6%/.test(f.title)).sev, 'info');
  assert.ok(small.some(f => f.title === 'No problem found by the rules'));
});
