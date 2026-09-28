// =============================================================================
// The tool list, shared by the MCP server (agent/mcp.js) and the command line
// (agent/cli.js). Inputs are flat strings/numbers/booleans — lists are
// comma-separated — which is what small local models handle best.
// =============================================================================

import { overview, searchPlaces, getPlace, makeClientFile, exportCsv } from './core.js';

export const VERSION = '1.0.0';

export const INSTRUCTIONS = `Roxys Travel Plan helper: read the agency's list of recommended places (points of interest) and make client travel files.
- Call roxys_overview first to see which countries and categories exist, and use those exact names.
- Lists (countries, categories, formats) are comma-separated, e.g. "Indonesia, Thailand".
- Dates are YYYY-MM-DD. Nothing here changes or deletes places; new files never overwrite old ones.`;

const lang = { type: 'string', description: 'Language for category and country names: en, fr or de (default en).' };
const country = { type: 'string', description: 'Only these countries (comma-separated names in English, French or German).' };
const category = { type: 'string', description: 'Only these categories (comma-separated names, e.g. "Beach, Food").' };
const query = { type: 'string', description: 'Words to find in the place name or note.' };

export const TOOLS = [
  {
    name: 'roxys_overview',
    command: 'overview',
    title: 'Overview of the list',
    description: 'Totals and the full list of countries and categories (with how many places each), plus places that need attention. Call this first.',
    readOnly: true,
    input: { lang },
    run: overview,
  },
  {
    name: 'roxys_search_places',
    command: 'search',
    title: 'Search places',
    description: 'Find places by words, country and/or category. Returns up to `limit` places with id, name, category, country, a short note and the Google Maps link.',
    readOnly: true,
    input: {
      query,
      country,
      category,
      missing_coordinates: { type: 'boolean', description: 'Only places that have no map position yet.' },
      limit: { type: 'number', description: 'How many places to return (default 20, max 100).' },
      lang,
    },
    run: searchPlaces,
  },
  {
    name: 'roxys_get_place',
    command: 'place',
    title: 'Place details',
    description: 'Everything about one place (full note, coordinates, link), by its id from roxys_search_places.',
    readOnly: true,
    input: { id: { type: 'string', description: 'The place id, e.g. "poi-…".', required: true, positional: true }, lang },
    run: getPlace,
  },
  {
    name: 'roxys_make_client_file',
    command: 'client-file',
    title: 'Make a client travel file',
    description:
      'Create the files a client receives, from the chosen countries × categories, valid between two dates. Saved as NEW files in the Roxys Documents folder (never overwrites). formats: list = recommendation list the client opens in the Roxys app (default), page = branded web page, map = website map, kml = Google My Maps. Use dry_run to preview counts without saving.',
    readOnly: false,
    input: {
      client: { type: 'string', description: 'Client name or label, e.g. "Smith family".', required: true },
      valid_from: { type: 'string', description: 'First day the client can use the file (YYYY-MM-DD).', required: true },
      valid_until: { type: 'string', description: 'Last day (YYYY-MM-DD); the client app locks after it.', required: true },
      countries: { type: 'string', description: 'Countries to include, comma-separated (default: all).' },
      categories: { type: 'string', description: 'Categories to include, comma-separated (default: all).' },
      formats: { type: 'string', description: 'Comma-separated: list, page, map, kml (default: list).' },
      itinerary_file: { type: 'string', description: 'Optional: path to the trip itinerary JSON exported from the CRM, to show the route.' },
      guide: { type: 'string', description: 'Optional: a Travel Guide PDF, as a file path (embedded) or an https link.' },
      dry_run: { type: 'boolean', description: 'Only report what would be created; save nothing.' },
      lang,
    },
    run: makeClientFile,
  },
  {
    name: 'roxys_export_csv',
    command: 'export-csv',
    title: 'Export places to CSV',
    description: 'Save matching places (all by default) as a new spreadsheet (CSV) in the Roxys Documents folder.',
    readOnly: false,
    input: { query, country, category, lang },
    run: exportCsv,
  },
];
