#!/usr/bin/env node
// =============================================================================
// roxys-agent — command line for the Roxys agent helper.
//   roxys-agent mcp                     start the MCP server (for Atlas)
//   roxys-agent overview | search | place <id> | client-file | export-csv
//   roxys-agent where                   show which files it uses
// Every command prints JSON on stdout; errors go to stderr with exit code 1.
// =============================================================================

import { parseArgs } from 'node:util';
import { TOOLS, VERSION } from './tools.js';
import { where, ToolError } from './core.js';
import { startMcpServer } from './mcp.js';

const PATH_OPTIONS = {
  master: { type: 'string' },
  docs: { type: 'string' },
};
const dashed = (key) => key.replace(/_/g, '-');

function usage() {
  const lines = [
    `roxys-agent ${VERSION} — lets an AI agent read the Roxys master list and make client files.`,
    '',
    'Usage: roxys-agent <command> [options]',
    '',
    '  mcp            Start the MCP server (this is what Atlas runs)',
    '  where          Show which master list and Documents folder are used',
  ];
  for (const t of TOOLS) {
    const opts = Object.entries(t.input)
      .map(([k, s]) => (s.positional ? `<${k}>` : s.required ? `--${dashed(k)} …` : `[--${dashed(k)}${s.type === 'boolean' ? '' : ' …'}]`))
      .join(' ');
    lines.push(`  ${t.command.padEnd(14)} ${opts}`);
  }
  lines.push(
    '',
    'All commands accept --master <file> and --docs <folder>; by default both come',
    "from Roxys Admin's own settings (or the ROXYS_MASTER / ROXYS_DOCUMENTS variables).",
    '',
    'Example: roxys-agent client-file --client "Smith family" --valid-from 2026-10-01 --valid-until 2026-10-14 --countries Indonesia --categories "Beach, Food"'
  );
  return lines.join('\n');
}

function print(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command === '--version' || command === 'version') {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (command === 'mcp' || command === 'where') {
    const { values } = parseArgs({ args: rest, options: PATH_OPTIONS, strict: true });
    if (command === 'mcp') return startMcpServer(values);
    return print(await where(values));
  }

  const tool = TOOLS.find((t) => t.command === command);
  if (!tool) throw new ToolError(`Unknown command "${command}". Run "roxys-agent help" to see the commands.`);

  const options = { ...PATH_OPTIONS };
  for (const [key, spec] of Object.entries(tool.input)) options[dashed(key)] = { type: spec.type === 'boolean' ? 'boolean' : 'string' };
  const { values, positionals } = parseArgs({ args: rest, options, allowPositionals: true, strict: true });

  const args = {};
  for (const [key, spec] of Object.entries(tool.input)) {
    let v = values[dashed(key)];
    if (v === undefined && spec.positional) v = positionals.shift();
    if (v === undefined) {
      if (spec.required) throw new ToolError(`Missing --${dashed(key)} (${spec.description})`);
      continue;
    }
    args[key] = spec.type === 'number' ? Number(v) : v;
  }
  if (positionals.length) throw new ToolError(`Unexpected argument: ${positionals[0]}`);
  print(await tool.run(args, { master: values.master, docs: values.docs }));
}

main(process.argv.slice(2)).catch((e) => {
  process.stderr.write(`Error: ${e instanceof ToolError || e.code?.startsWith?.('ERR_PARSE_ARGS') ? e.message : e.stack || e}\n`);
  process.exitCode = 1;
});
