// =============================================================================
// Roxys agent helper — the logic behind every tool. READ-ONLY on the master
// list: it reads the file the desktop app autosaves and only ever creates NEW
// files in the Documents folder (never overwrites, never touches the master).
// The client-file rules are the app's own (src/data/clientBuild.js,
// src/admin/exporters.js), so outputs match the admin's buttons exactly.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeMaster, withDefaultContent, hasCoords, countriesOf, countryName, categoryName, setCountryNames,
} from '../src/data/schema.js';
import { buildClientFile, clientSlug, DELIVERABLES } from '../src/data/clientBuild.js';
import { validateItinerary } from '../src/data/itinerary.js';
import { buildBrandedHtml, buildStandaloneHtml, buildKml } from '../src/admin/exporters.js';
import { buildPointsCsv } from '../src/csv/exportCsv.js';
import { resolvePaths } from './paths.js';
import { countryNamesTable, logoDataUri } from './assets.js';

setCountryNames(countryNamesTable());

/** An error meant for the agent: a plain message it can act on (no stack). */
export class ToolError extends Error {}

const LANGS = ['en', 'fr', 'de'];
const FORMATS = Object.keys(DELIVERABLES); // list, page, map, kml
const GUIDE_MAX_MB = 20;
const NOTE_PREVIEW = 200;

const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const langOf = (lang) => (LANGS.includes(lang) ? lang : 'en');

// ---- Loading the master list -------------------------------------------------
let _cache = null; // { file, mtimeMs, size, master }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Read + normalize the master file (cached until it changes on disk). */
async function loadMaster(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    throw new ToolError(`The master list file was not found: ${file}. Open Roxys Admin and check Master data → Master list location.`);
  }
  if (_cache && _cache.file === file && _cache.mtimeMs === stat.mtimeMs && _cache.size === stat.size) return _cache;
  // The app may be mid-save (the write truncates then rewrites): retry briefly.
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const master = withDefaultContent(normalizeMaster(raw));
      const s = fs.statSync(file);
      _cache = { file, mtimeMs: s.mtimeMs, size: s.size, master };
      return _cache;
    } catch (e) {
      lastErr = e;
      await sleep(200);
    }
  }
  throw new ToolError(`Could not read the master list (${file}): ${lastErr.message}`);
}

/** Resolve paths + load the master. `opts` = { master?, docs? } overrides. */
async function context(opts = {}) {
  const paths = resolvePaths(opts);
  if (!paths.master) {
    throw new ToolError(
      'No master list is set. Open Roxys Admin once and open or create your list (the helper then finds it automatically), or pass --master <file>.'
    );
  }
  const { master, mtimeMs } = await loadMaster(paths.master);
  return { paths, master, savedAt: new Date(mtimeMs).toISOString() };
}

// ---- Matching names the way people (and small models) type them -------------
/** Canonical country names in the list, matched by EN/FR/DE name, ignoring case/accents. */
function countryIndex(master) {
  const idx = new Map();
  for (const c of countriesOf(master.pois)) for (const l of LANGS) idx.set(fold(countryName(c, l)), c);
  return idx;
}
function categoryIndex(master) {
  const idx = new Map();
  for (const c of master.categories) {
    idx.set(fold(c.id), c.id);
    for (const n of [c.name, c.names?.en, c.names?.fr, c.names?.de]) if (n) idx.set(fold(n), c.id);
  }
  return idx;
}

/**
 * Parse a comma-separated list of names into a Set of canonical values.
 * Empty / "all" / "*" → every value. Unknown names → a ToolError listing the options.
 */
function resolveNames(input, idx, all, kind, options) {
  const text = Array.isArray(input) ? input.join(',') : String(input ?? '').trim();
  if (!text || ['all', '*'].includes(fold(text))) return new Set(all);
  // Try the whole string first (a name could contain a comma), then split.
  const whole = idx.get(fold(text));
  if (whole) return new Set([whole]);
  const out = new Set();
  const unknown = [];
  for (const part of text.split(',').map((s) => s.trim()).filter(Boolean)) {
    const hit = idx.get(fold(part));
    hit ? out.add(hit) : unknown.push(part);
  }
  if (unknown.length) throw new ToolError(`Unknown ${kind}: ${unknown.join(', ')}. Valid ${kind}: ${options.join(', ')}.`);
  return out;
}
function resolveCountries(input, master, lang) {
  const all = countriesOf(master.pois);
  return resolveNames(input, countryIndex(master), all, 'countries', all.map((c) => countryName(c, lang)));
}
function resolveCategories(input, master, lang) {
  const all = master.categories.map((c) => c.id);
  return resolveNames(input, categoryIndex(master), all, 'categories', master.categories.map((c) => categoryName(c, lang)));
}

// ---- Shaping records for the agent -------------------------------------------
function placeSummary(p, cats, lang) {
  const note = p.note || '';
  return {
    id: p.id,
    name: p.name,
    category: cats.has(p.categoryId) ? categoryName(cats.get(p.categoryId), lang) : '(no category)',
    country: countryName(p.country, lang) || '(unknown)',
    note: note.length > NOTE_PREVIEW ? `${note.slice(0, NOTE_PREVIEW)}…` : note,
    google_url: p.googleUrl || '',
    lat: p.lat,
    lng: p.lng,
  };
}

/** Filter the master list the way search and export share. */
function filterPlaces(master, { query, country, category, missing_coordinates }, lang) {
  const countries = country ? resolveCountries(country, master, lang) : null;
  const cats = category ? resolveCategories(category, master, lang) : null;
  const q = fold(query);
  return master.pois
    .filter((p) => (!countries || countries.has(p.country))
      && (!cats || cats.has(p.categoryId))
      && (!missing_coordinates || !hasCoords(p))
      && (!q || fold(p.name).includes(q) || fold(p.note).includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---- Writing new files (never overwrite) --------------------------------------
/** Write `contents` to dir/filename, or "name (2).ext", "name (3).ext"… if taken. */
export function writeUnique(dir, filename, contents) {
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(filename);
  const base = filename.slice(0, filename.length - ext.length);
  for (let n = 1; n < 1000; n++) {
    const target = path.join(dir, n === 1 ? filename : `${base} (${n})${ext}`);
    try {
      fs.writeFileSync(target, contents, { encoding: 'utf8', flag: 'wx' });
      return target;
    } catch (e) {
      if (e.code !== 'EEXIST') throw new ToolError(`Could not save ${target}: ${e.message}`);
    }
  }
  throw new ToolError(`Too many files named ${filename} in ${dir}.`);
}

function requireDocs(paths) {
  if (!paths.docs) {
    throw new ToolError(
      'No Documents folder is set, so there is nowhere to save files. In Roxys Admin: Master data → Document storage → Change folder (or pass --docs <folder>).'
    );
  }
  return paths.docs;
}

// ---- Tools ----------------------------------------------------------------------
/** Where the helper looks, and what it found. */
export async function where(opts = {}) {
  const p = resolvePaths(opts);
  return {
    app_settings_file: p.settingsFile,
    app_settings_found: p.settingsFound,
    master_file: p.master,
    master_file_found: Boolean(p.master && fs.existsSync(p.master)),
    master_file_from: p.masterSource,
    documents_folder: p.docs,
    documents_folder_from: p.docsSource,
  };
}

/** Totals and breakdowns — the agent's map of what exists. */
export async function overview(args = {}, opts = {}) {
  const lang = langOf(args.lang);
  const { paths, master, savedAt } = await context(opts);
  const catIds = new Set(master.categories.map((c) => c.id));
  const byCountry = new Map();
  const byCat = new Map();
  for (const p of master.pois) {
    if (p.country) byCountry.set(p.country, (byCountry.get(p.country) || 0) + 1);
    byCat.set(p.categoryId, (byCat.get(p.categoryId) || 0) + 1);
  }
  return {
    master_file: paths.master,
    last_saved: savedAt,
    documents_folder: paths.docs || '(not set: client files cannot be saved until it is set in Roxys Admin)',
    totals: { places: master.pois.length, categories: master.categories.length, countries: byCountry.size },
    countries: countriesOf(master.pois, lang).map((c) => ({ name: countryName(c, lang), places: byCountry.get(c) })),
    categories: master.categories.map((c) => ({ name: categoryName(c, lang), emoji: c.emoji, places: byCat.get(c.id) || 0 })),
    needs_attention: {
      missing_coordinates: master.pois.filter((p) => !hasCoords(p)).length,
      missing_country: master.pois.filter((p) => !p.country).length,
      no_category: master.pois.filter((p) => !catIds.has(p.categoryId)).length,
    },
  };
}

export async function searchPlaces(args = {}, opts = {}) {
  const lang = langOf(args.lang);
  const { master } = await context(opts);
  const limit = Math.min(Math.max(parseInt(args.limit, 10) || 20, 1), 100);
  const hits = filterPlaces(master, args, lang);
  const cats = new Map(master.categories.map((c) => [c.id, c]));
  return { total: hits.length, returned: Math.min(limit, hits.length), places: hits.slice(0, limit).map((p) => placeSummary(p, cats, lang)) };
}

export async function getPlace(args = {}, opts = {}) {
  const lang = langOf(args.lang);
  const { master } = await context(opts);
  const id = String(args.id ?? '').trim();
  const p = master.pois.find((x) => x.id === id);
  if (!p) throw new ToolError(`No place with id "${id}". Use roxys_search_places to find ids.`);
  const cat = master.categories.find((c) => c.id === p.categoryId);
  return {
    ...placeSummary(p, new Map(cat ? [[cat.id, cat]] : []), lang),
    note: p.note || '',
    category_emoji: cat?.emoji || '',
    country_english: p.country || '',
    has_coordinates: hasCoords(p),
    place_id: p.placeId || '',
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function checkDate(value, name) {
  const v = String(value ?? '').trim();
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) {
    throw new ToolError(`${name} must be a real date written YYYY-MM-DD (got "${v}").`);
  }
  return v;
}

function readItinerary(file) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new ToolError(`Could not read the itinerary file ${file}: ${e.message}`);
  }
  const r = validateItinerary(raw);
  if (!r.ok) throw new ToolError(`The itinerary file is not usable: ${r.errors[0]}`);
  return { raw, stops: r.data.stops.length };
}

/** A hosted https link, or a local PDF embedded as base64 (as the admin does). */
function readGuide(value, warnings) {
  const v = String(value).trim();
  if (/^https?:\/\//i.test(v)) return { name: v.split('/').pop() || 'guide.pdf', url: v };
  let buf;
  try {
    buf = fs.readFileSync(v);
  } catch (e) {
    throw new ToolError(`Could not read the guide PDF ${v}: ${e.message}`);
  }
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new ToolError(`The guide must be a PDF file or an https link (${v} is not a PDF).`);
  if (buf.length > GUIDE_MAX_MB * 1024 * 1024) warnings.push(`The guide PDF is larger than ${GUIDE_MAX_MB} MB; the client file will be very large.`);
  return { name: path.basename(v), dataUri: `data:application/pdf;base64,${buf.toString('base64')}` };
}

function parseFormats(input) {
  const list = String(input ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return ['list'];
  const bad = list.filter((f) => !FORMATS.includes(f));
  if (bad.length) throw new ToolError(`Unknown format: ${bad.join(', ')}. Valid formats: ${FORMATS.join(', ')} (list = recommendation list for the client app, page = branded web page, map = website map, kml = Google My Maps).`);
  return [...new Set(list)];
}

const BUILD_ERRORS = {
  needClient: 'Give a client name.',
  needDates: 'Give both valid_from and valid_until (YYYY-MM-DD).',
  needSelection: 'Select at least one country and one category.',
};

/** Make the client deliverables — same rules and output as the admin's Client file tab. */
export async function makeClientFile(args = {}, opts = {}) {
  const lang = langOf(args.lang);
  const { paths, master } = await context(opts);
  const client = String(args.client ?? '').trim();
  if (!client) throw new ToolError(BUILD_ERRORS.needClient);
  const validFrom = checkDate(args.valid_from, 'valid_from');
  const validUntil = checkDate(args.valid_until, 'valid_until');
  if (validUntil < validFrom) throw new ToolError('valid_until must be on or after valid_from.');
  const countries = resolveCountries(args.countries, master, lang);
  const categoryIds = resolveCategories(args.categories, master, lang);
  const formats = parseFormats(args.formats);
  const warnings = [];
  const itinerary = args.itinerary_file ? readItinerary(String(args.itinerary_file)) : null;
  const guide = args.guide ? readGuide(args.guide, warnings) : null;

  const r = buildClientFile(master, { client, validFrom, validUntil, countries, categoryIds, itinerary: itinerary?.raw, guide });
  if (!r.ok) throw new ToolError(BUILD_ERRORS[r.error]);
  const file = r.file;
  if (!file.points.length) {
    throw new ToolError('No places match this selection (only places with coordinates are included). Check the countries and categories with roxys_overview.');
  }

  const slug = clientSlug(client);
  const summary = {
    client,
    valid_from: validFrom,
    valid_until: validUntil,
    places: file.points.length,
    countries: [...new Set(file.points.map((p) => p.country))].map((c) => countryName(c, lang)),
    categories: file.categories.map((c) => categoryName(c, lang)),
    itinerary_stops: itinerary ? itinerary.stops : 0,
    guide: guide ? (guide.url ? `link: ${guide.url}` : `embedded PDF: ${guide.name}`) : 'none',
  };
  if (args.dry_run) {
    return { ...summary, dry_run: true, would_create: formats.map((f) => path.join(DELIVERABLES[f].subfolder, `${slug}${DELIVERABLES[f].suffix}`)), warnings };
  }

  const docs = requireDocs(paths);
  const render = {
    list: () => JSON.stringify(file, null, 2),
    page: () => buildBrandedHtml(file, { logoDataUri: logoDataUri() }),
    map: () => buildStandaloneHtml(file),
    kml: () => buildKml(file),
  };
  const files = formats.map((f) => ({
    format: f,
    path: writeUnique(path.join(docs, DELIVERABLES[f].subfolder), `${slug}${DELIVERABLES[f].suffix}`, render[f]()),
  }));
  return { ...summary, files, warnings };
}

/** Export matching places to a spreadsheet (same columns as the admin's Export CSV). */
export async function exportCsv(args = {}, opts = {}) {
  const lang = langOf(args.lang);
  const { paths, master } = await context(opts);
  const rows = filterPlaces(master, args, lang);
  const docs = requireDocs(paths);
  const file = writeUnique(path.join(docs, 'CSV exports'), 'roxys-points.csv', buildPointsCsv(rows, master.categories));
  return { path: file, rows: rows.length };
}
