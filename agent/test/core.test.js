import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { overview, searchPlaces, getPlace, makeClientFile, exportCsv, writeUnique, ToolError } from '../core.js';
import { resolvePaths, appDataDir, APP_ID, STORE_FILE } from '../paths.js';
import { clientSlug, buildClientFile } from '../../src/data/clientBuild.js';
import { validateClientFile, DEFAULT_DISCLAIMER } from '../../src/data/schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const MASTER = path.join(here, 'fixtures', 'master.json');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'roxys-agent-'));
const opts = (docs) => ({ master: MASTER, docs });
const base = { client: 'Smith Family', valid_from: '2026-10-01', valid_until: '2026-10-14' };

test('overview counts places, countries, categories and problems', async () => {
  const o = await overview({}, opts());
  assert.deepEqual(o.totals, { places: 7, categories: 3, countries: 2 });
  assert.deepEqual(o.countries, [{ name: 'Indonesia', places: 4 }, { name: 'Thailand', places: 3 }]);
  assert.deepEqual(o.needs_attention, { missing_coordinates: 1, missing_country: 0, no_category: 1 });
  assert.match(o.documents_folder, /not set/);
});

test('names match in English, French or German, ignoring case and accents', async () => {
  const r = await searchPlaces({ country: 'indonésie', category: 'STRAND' }, opts());
  assert.deepEqual(r.places.map((p) => p.id), ['poi-1', 'poi-6']);
  const fr = await searchPlaces({ country: 'Thaïlande', category: 'restaurant', lang: 'fr' }, opts());
  assert.equal(fr.places[0].category, 'Restaurant');
  assert.equal(fr.places[0].country, 'Thaïlande');
});

test('an unknown name lists the valid options', async () => {
  await assert.rejects(searchPlaces({ category: 'Museums' }, opts()), (e) => e instanceof ToolError && /Valid categories: Beach, Food, Hikes/.test(e.message));
});

test('search by words, missing coordinates, limit; place details', async () => {
  assert.equal((await searchPlaces({ query: 'crab' }, opts())).places[0].name, 'Jay Fai');
  assert.deepEqual((await searchPlaces({ missing_coordinates: true }, opts())).places.map((p) => p.id), ['poi-6']);
  const lim = await searchPlaces({ limit: 2 }, opts());
  assert.equal(lim.total, 7);
  assert.equal(lim.returned, 2);
  const p = await getPlace({ id: 'poi-3' }, opts());
  assert.equal(p.note, 'Start at 3am.');
  assert.equal(p.has_coordinates, true);
  await assert.rejects(getPlace({ id: 'nope' }, opts()), ToolError);
});

test('client file: same rules as the admin, valid for the client app', async () => {
  const docs = tmp();
  const r = await makeClientFile({ ...base, countries: 'Indonesia', categories: 'Beach, Food' }, opts(docs));
  assert.equal(r.places, 2); // the beach without coordinates is left out
  const file = JSON.parse(fs.readFileSync(r.files[0].path, 'utf8'));
  assert.equal(path.basename(r.files[0].path), 'smith-family-recommendation-list.json');
  assert.equal(path.basename(path.dirname(r.files[0].path)), 'Recommendation lists');
  assert.deepEqual(file.categories.map((c) => c.id), ['cat-beach', 'cat-food']); // only categories in use
  assert.equal(file.content.disclaimer.en, DEFAULT_DISCLAIMER.en); // default texts baked in
  assert.equal(file.itinerary, null);
  assert.equal(file.guide, null);
  const v = validateClientFile(file);
  assert.ok(v.ok);
  assert.equal(v.data.points.length, 2);
});

test('client file: itinerary embedded raw, guide link, all formats', async () => {
  const docs = tmp();
  const itin = path.join(docs, 'trip.json');
  const raw = { title: 'Bali', stops: [{ id: 1, sort_order: 0, name: 'Ubud', lat: -8.51, lng: 115.26 }, { id: 2, sort_order: 1, name: 'Amed', lat: -8.34, lng: 115.65 }], legs: [{ from_stop_id: 1, to_stop_id: 2, transport_mode: 'car' }] };
  fs.writeFileSync(itin, JSON.stringify(raw));
  const r = await makeClientFile({ ...base, itinerary_file: itin, guide: 'https://example.com/guides/bali.pdf', formats: 'list,page,map,kml' }, opts(docs));
  assert.equal(r.itinerary_stops, 2);
  assert.deepEqual(r.files.map((f) => f.format), ['list', 'page', 'map', 'kml']);
  const file = JSON.parse(fs.readFileSync(r.files[0].path, 'utf8'));
  assert.deepEqual(file.itinerary, raw);
  assert.deepEqual(file.guide, { name: 'bali.pdf', url: 'https://example.com/guides/bali.pdf' });
  assert.match(fs.readFileSync(r.files[1].path, 'utf8'), /data:image\/png;base64,/); // logo embedded
  assert.match(fs.readFileSync(r.files[3].path, 'utf8'), /<kml/);
});

test('client file: embedded PDF guide, and non-PDF refused', async () => {
  const docs = tmp();
  const pdf = path.join(docs, 'guide.pdf');
  fs.writeFileSync(pdf, '%PDF-1.4\n%fake\n');
  const r = await makeClientFile({ ...base, guide: pdf }, opts(docs));
  const file = JSON.parse(fs.readFileSync(r.files[0].path, 'utf8'));
  assert.equal(file.guide.name, 'guide.pdf');
  assert.ok(file.guide.dataUri.startsWith('data:application/pdf;base64,'));
  const txt = path.join(docs, 'notes.txt');
  fs.writeFileSync(txt, 'hello');
  await assert.rejects(makeClientFile({ ...base, guide: txt }, opts(docs)), /not a PDF/);
});

test('client file: input checks', async () => {
  await assert.rejects(makeClientFile({ ...base, client: ' ' }, opts(tmp())), /client name/);
  await assert.rejects(makeClientFile({ ...base, valid_from: '2026-02-30' }, opts(tmp())), /real date/);
  await assert.rejects(makeClientFile({ ...base, valid_until: '2026-09-01' }, opts(tmp())), /on or after/);
  await assert.rejects(makeClientFile({ ...base, formats: 'pdf' }, opts(tmp())), /Unknown format/);
  await assert.rejects(makeClientFile({ ...base, countries: 'Thailand', categories: 'Hikes' }, opts(tmp())), /No places match/);
  await assert.rejects(makeClientFile(base, opts()), /No Documents folder/);
});

test('dry run writes nothing', async () => {
  const docs = tmp();
  const r = await makeClientFile({ ...base, dry_run: true, formats: 'list,kml' }, opts(docs));
  assert.equal(r.places, 5);
  assert.deepEqual(r.would_create, [path.join('Recommendation lists', 'smith-family-recommendation-list.json'), path.join('KML', 'smith-family-roxys.kml')]);
  assert.deepEqual(fs.readdirSync(docs), []);
});

test('never overwrites: numbered copies instead', async () => {
  const dir = tmp();
  assert.equal(path.basename(writeUnique(dir, 'a.json', '1')), 'a.json');
  assert.equal(path.basename(writeUnique(dir, 'a.json', '2')), 'a (2).json');
  assert.equal(path.basename(writeUnique(dir, 'a.json', '3')), 'a (3).json');
  assert.equal(fs.readFileSync(path.join(dir, 'a.json'), 'utf8'), '1');
});

test('CSV export keeps the admin columns', async () => {
  const docs = tmp();
  const r = await exportCsv({ country: 'Thailand' }, opts(docs));
  assert.equal(r.rows, 3);
  const text = fs.readFileSync(r.path, 'utf8');
  assert.ok(text.startsWith('\uFEFFTitle,Note,URL,Latitude,Longitude,Country,Category,placeId'));
});

test('the master file is never modified', async () => {
  const before = fs.readFileSync(MASTER, 'utf8');
  await makeClientFile({ ...base, formats: 'list,page,map,kml' }, opts(tmp()));
  await exportCsv({}, opts(tmp()));
  assert.equal(fs.readFileSync(MASTER, 'utf8'), before);
});

test('slugs match the admin', () => {
  assert.equal(clientSlug(' Smith & Jones Family! '), 'smith-jones-family');
  assert.equal(clientSlug('Müller'), 'm-ller');
  assert.equal(clientSlug('***'), 'client');
});

test('buildClientFile reports the same errors as the admin', () => {
  const m = { pois: [], categories: [], content: null };
  const all = { countries: new Set(['x']), categoryIds: new Set(['y']) };
  assert.equal(buildClientFile(m, { ...all, client: '', validFrom: 'a', validUntil: 'b' }).error, 'needClient');
  assert.equal(buildClientFile(m, { ...all, client: 'c', validFrom: '', validUntil: 'b' }).error, 'needDates');
  assert.equal(buildClientFile(m, { client: 'c', validFrom: 'a', validUntil: 'b', countries: new Set(), categoryIds: new Set(['y']) }).error, 'needSelection');
});

test('paths: flag > environment > the desktop app settings', () => {
  const data = tmp();
  const dir = path.join(data, APP_ID);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, STORE_FILE), JSON.stringify({ masterPath: '/drive/roxys-master.json', documentsFolder: '/drive/Docs' }));
  const env = { XDG_DATA_HOME: data };
  const app = resolvePaths({}, env, 'linux');
  assert.equal(app.master, '/drive/roxys-master.json');
  assert.equal(app.masterSource, 'app');
  assert.equal(app.docs, '/drive/Docs');
  const fromEnv = resolvePaths({}, { ...env, ROXYS_MASTER: '/env/m.json' }, 'linux');
  assert.equal(fromEnv.master, '/env/m.json');
  assert.equal(fromEnv.docs, '/drive/Docs');
  assert.equal(resolvePaths({ master: '/flag/m.json' }, { ...env, ROXYS_MASTER: '/env/m.json' }, 'linux').master, '/flag/m.json');
  const none = resolvePaths({}, { XDG_DATA_HOME: tmp() }, 'linux');
  assert.equal(none.master, null);
  assert.equal(none.settingsFound, false);
});

test('paths: Windows app-data folder, and names match the desktop app', () => {
  assert.equal(appDataDir({ APPDATA: 'C:\\Users\\roxy\\AppData\\Roaming' }, 'win32'), 'C:\\Users\\roxy\\AppData\\Roaming\\com.roxystravelplan.admin');
  const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  assert.equal(conf.identifier, APP_ID);
  assert.match(fs.readFileSync(path.join(root, 'src', 'data', 'desktopStore.js'), 'utf8'), new RegExp(`STORE_FILE = '${STORE_FILE}'`));
});

test('"Connect an AI agent" snippets carry the real Windows path', async () => {
  const { agentSnippets } = await import('../../src/admin/agentSnippets.js');
  const exe = 'C:\\Users\\Roxy\\AppData\\Local\\Roxys Admin\\roxys-agent.exe';
  const s = agentSnippets(exe);
  assert.deepEqual(JSON.parse(s.mcp), { mcpServers: { roxys: { command: exe, args: ['mcp'] } } });
  assert.ok(s.python.includes(`ROXYS = r"${exe}"`));
  assert.equal(s.test, `& "${exe}" overview`);
});
