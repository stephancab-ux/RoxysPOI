# Offline map packs (PMTiles)

This folder holds the **offline vector basemaps** the client app downloads for
offline use. Each pack is one `.pmtiles` archive covering one country (focused on
a buffered area around that client's points). The app reads tiles directly from
the archive — no tile server, no API key.

A browser **cannot** generate these — you (the agency) build them once with the
keyless `pmtiles` CLI and drop them here. The app then fetches a pack on demand
and caches it in the device's IndexedDB.

## 1. Install the `pmtiles` CLI (one time)

```bash
# macOS
brew install pmtiles
# or download a release binary for your OS:
# https://github.com/protomaps/go-pmtiles/releases
```

## 2. Get the bounding box for a country

Open the **Admin → Client file** screen, choose the client's countries and
categories, and read the line it prints for each country, e.g.:

```
Indonesia → indonesia.pmtiles · --bbox=114.4012,-8.8503,115.7531,-8.0489
```

That bbox is already buffered around the client's actual points.

## 3. Extract the regional pack

Extract just that region from the public Protomaps daily planet build (no API
key). Use a **recent** date for the planet file:

```bash
pmtiles extract https://build.protomaps.com/20240101.pmtiles indonesia.pmtiles \
  --bbox=114.4012,-8.8503,115.7531,-8.0489 \
  --maxzoom=14
```

- `--maxzoom=14` gives street-level detail at a sane size (typically a few MB
  for a region/island). The app overzooms beyond 14.
- Old planet builds are pruned — if the URL 404s, pick a newer `YYYYMMDD`.

## 4. Name it and put it here

The file name must match the app's slug for that country: lowercase, spaces and
punctuation replaced with `-`. Examples:

| Country     | File name           |
| ----------- | ------------------- |
| Indonesia   | `indonesia.pmtiles` |
| Sri Lanka   | `sri-lanka.pmtiles` |
| New Zealand | `new-zealand.pmtiles` |

Commit the file under `public/data/packs/` (or host it on any static host on the
**same origin**; cross-origin hosts must send `Access-Control-Allow-Origin`).

> Note: `.pmtiles` files are git-ignored by default (`.gitignore`) so large
> binaries don't bloat the repo accidentally. Remove that ignore line, or
> `git add -f public/data/packs/yourpack.pmtiles`, to commit a pack on purpose.

## 5. Done

In the client app's **Settings → Offline maps**, that country now shows a working
**Download** button. After downloading, the app serves the basemap from
IndexedDB whenever the device is offline within the pack's area, and switches
back to online OpenStreetMap when a connection returns.
