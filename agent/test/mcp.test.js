// Talks to the helper exactly as Atlas would: start it over stdio and call tools.
// Set ROXYS_AGENT_EXE=agent-dist/roxys-agent to test the built standalone binary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MASTER = path.join(here, 'fixtures', 'master.json');
const exe = process.env.ROXYS_AGENT_EXE;

test('MCP server lists the tools and answers calls', async () => {
  const docs = fs.mkdtempSync(path.join(os.tmpdir(), 'roxys-mcp-'));
  const args = ['mcp', '--master', MASTER, '--docs', docs];
  const transport = new StdioClientTransport(
    exe ? { command: path.resolve(exe), args } : { command: process.execPath, args: [path.join(here, '..', 'cli.js'), ...args] }
  );
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(transport);
  try {
    assert.match(client.getInstructions() || '', /roxys_overview first/);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name), ['roxys_overview', 'roxys_search_places', 'roxys_get_place', 'roxys_make_client_file', 'roxys_export_csv']);
    for (const t of tools) {
      // Flat inputs only: every property is a plain string/number/boolean.
      for (const [k, s] of Object.entries(t.inputSchema.properties || {})) assert.ok(['string', 'number', 'boolean'].includes(s.type), `${t.name}.${k}`);
    }
    const make = tools.find((t) => t.name === 'roxys_make_client_file');
    assert.deepEqual([...make.inputSchema.required].sort(), ['client', 'valid_from', 'valid_until']);
    assert.equal(tools.find((t) => t.name === 'roxys_overview').annotations.readOnlyHint, true);

    const o = await client.callTool({ name: 'roxys_overview', arguments: {} });
    assert.equal(JSON.parse(o.content[0].text).totals.places, 7);

    const made = await client.callTool({
      name: 'roxys_make_client_file',
      arguments: { client: 'Smith', valid_from: '2026-10-01', valid_until: '2026-10-14', categories: 'Beach' },
    });
    assert.ok(!made.isError, made.content[0].text);
    assert.ok(fs.existsSync(JSON.parse(made.content[0].text).files[0].path));

    const bad = await client.callTool({ name: 'roxys_search_places', arguments: { country: 'Mars' } });
    assert.equal(bad.isError, true);
    assert.match(bad.content[0].text, /Valid countries: Indonesia, Thailand/);
  } finally {
    await client.close();
  }
});
