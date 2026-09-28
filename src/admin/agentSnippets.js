// =============================================================================
// The ready-to-paste settings shown in "Connect an AI agent" (agentPanel.js).
// DOM-free so it can be tested in Node (agent/test/core.test.js).
// =============================================================================

/** The three ways to connect an agent, with the helper's real path filled in. */
export function agentSnippets(exe) {
  return {
    mcp: JSON.stringify({ mcpServers: { roxys: { command: exe, args: ['mcp'] } } }, null, 2),
    python: [
      'import json, subprocess',
      '',
      `ROXYS = r"${exe}"`,
      '',
      'def roxys(command, *args):',
      '    """Run a Roxys command and return its JSON answer."""',
      '    out = subprocess.run([ROXYS, command, *args], capture_output=True, text=True, encoding="utf-8")',
      '    if out.returncode != 0:',
      '        raise RuntimeError(out.stderr.strip())',
      '    return json.loads(out.stdout)',
      '',
      '# Example: roxys("search", "--country", "Indonesia", "--category", "Beach")',
    ].join('\n'),
    test: `& "${exe}" overview`,
  };
}
