# Connect an AI agent (Atlas) to Roxys

Roxys Admin comes with a small helper program, **`roxys-agent.exe`**, that lets
your own AI agent (for example **Atlas**, running a local model like Gemma) use
your list of places. The agent can:

- **answer questions:** "Which beaches do we have in Indonesia?"
- **make client files:** the recommendation list, the branded page, the website map and KML
- **export places** to a spreadsheet (CSV)

It **only reads** your master list and **only creates new files**. It never
changes or deletes your places, and it never overwrites an existing file (a
second file gets a name like `smith-family-recommendation-list (2).json`).

There is **no API key, no web address and no internet** involved. Atlas starts
the helper itself, on the same computer, and talks to it directly.

---

## 1. Set up (once)

1. Install the latest **Roxys Admin** for Windows (see [admin-desktop.md](admin-desktop.md)).
2. Open it with your master list, as usual.
3. In **Master data → Document storage**, choose a Documents folder. The agent
   saves client files there, in the same subfolders as the app.
4. Scroll down to **Connect an AI agent**. It shows three ready-made texts, each
   with a **Copy** button. The helper's real location is already filled in.

The helper finds your master list and Documents folder by itself, from the
settings Roxys Admin saved on this computer. If you change them in the app, the
agent follows automatically.

## 2. Connect Atlas

Use the text that matches how Atlas adds tools.

**Atlas has a list of MCP servers** (a settings file mentioning `mcpServers` or
"MCP"; most agent apps work this way). Copy **MCP settings** and add the `roxys`
entry to that list:

```json
{
  "mcpServers": {
    "roxys": {
      "command": "C:\\Users\\<you>\\AppData\\Local\\Roxys Admin\\roxys-agent.exe",
      "args": ["mcp"]
    }
  }
}
```

**You wrote Atlas's tools in Python yourself.** Copy **Python** and paste it into
your code. `roxys("overview")`, `roxys("search", "--country", "Indonesia")` and so
on return the answer as a Python dictionary. The commands are listed under
**Command line** below.

**Atlas only accepts web addresses (URL + key)**, for example Open WebUI's tool
servers. Use the free `mcpo` bridge from the Open WebUI project to serve the
helper as a local web API:

```powershell
uvx mcpo --port 8000 --api-key "choose-a-key" -- "C:\Users\<you>\AppData\Local\Roxys Admin\roxys-agent.exe" mcp
```

Then add `http://localhost:8000` with that key in Atlas.

**Not sure?** Look in Atlas's settings or code for the word "mcp". If you find
it, use the MCP settings.

## 3. Check it works

Copy **Test** from the box and paste it into PowerShell:

```powershell
& "C:\Users\<you>\AppData\Local\Roxys Admin\roxys-agent.exe" overview
```

It prints a summary of your list: places, countries and categories. `where`
instead of `overview` shows which files the helper is using.

Then ask Atlas, for example:

- "What beach places do we have in Indonesia?"
- "Make a recommendation list for the Smith family: Indonesia, beaches and food, from 2026-10-01 to 2026-10-14."

The new file appears in your Documents folder under `Recommendation lists\`. Email
it to the client as usual.

---

## What Atlas can do (the tools)

| Tool | What it does |
|---|---|
| `roxys_overview` | Totals, every country and category (with counts), and places that need attention. Atlas should call this first. |
| `roxys_search_places` | Find places by words, country and/or category (`limit` up to 100). |
| `roxys_get_place` | Everything about one place, by its id. |
| `roxys_make_client_file` | The client's files, for chosen countries × categories and dates. `formats`: `list` (default; the recommendation list the client opens in the Roxys app), `page` (branded web page), `map` (website map), `kml` (Google My Maps). Optional: `itinerary_file` (the trip JSON from the CRM), `guide` (a Travel Guide PDF path or https link), and `dry_run` (preview only). |
| `roxys_export_csv` | Save matching places as a spreadsheet in `CSV exports\`. |

Names can be written in English, French or German and are matched ignoring
upper/lower case and accents ("Indonésie", "Strand"). Lists are comma-separated:
`"Beach, Food"`. Dates are `YYYY-MM-DD`. If a name is unknown, the answer lists
the valid ones, so the agent can correct itself.

The client files are made with the app's own code: they are exactly what the
**Recommendation list** tab's buttons produce for the same choices.

**Tip for small local models.** Add this to Atlas's instructions:

> For Roxys questions, call `roxys_overview` first and use the exact country and
> category names it returns. Use `dry_run` before making a client file if you are
> unsure of the selection.

## Command line

The helper works as an ordinary command too, which is handy for testing or
scripts. Every command prints JSON.

```powershell
$roxys = "C:\Users\<you>\AppData\Local\Roxys Admin\roxys-agent.exe"
& $roxys help
& $roxys overview
& $roxys search --country Indonesia --category "Beach, Food"
& $roxys place poi-1234
& $roxys client-file --client "Smith family" --valid-from 2026-10-01 --valid-until 2026-10-14 --countries Indonesia --categories "Beach, Food" --formats list,page
& $roxys export-csv --country Thailand
```

`--master <file>` and `--docs <folder>` (or the `ROXYS_MASTER` /
`ROXYS_DOCUMENTS` environment variables) override the app's settings.

## Good to know

- **Atlas sees what the app last saved.** The app saves your list automatically a
  moment after each change. Edits in the **Texts** tab are saved when you click
  Save there.
- **Roxys Admin can stay open or closed.** The helper only reads the file.
- **Troubleshooting:**
  - "No master list is set": open Roxys Admin once and open or create your list.
  - "No Documents folder is set": choose one in **Master data → Document storage**.
- **The helper is part of the Windows app.** On a Mac, or when developing, run it
  from the project instead: `npm ci`, then `npm run agent -- overview`. For the MCP
  entry, use `"command": "node", "args": ["<project>/agent/cli.js", "mcp"]`.

## For developers

- Code lives in `agent/`: `core.js` (logic), `tools.js` (tool list), `mcp.js`
  (MCP server), `cli.js` (command line), `paths.js` (finding the app's settings).
- It reuses the app's DOM-free modules in `src/`: `data/schema.js`,
  `data/clientBuild.js`, `admin/exporters.js`, `csv/exportCsv.js`.
- **Build the standalone helper:** `npm run build:agent-exe` makes
  `agent-dist/roxys-agent(.exe)`, a Node.js single executable, so no Node install
  is needed to run it. The Windows app build does this automatically and bundles
  it next to the app (`src-tauri/tauri.windows.conf.json`).
- **Tests:** `npm test`. `ROXYS_AGENT_EXE=agent-dist/roxys-agent npm test` also
  runs the MCP test against the built binary.
