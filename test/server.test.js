'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
process.env.OEH_DATA = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'oeh-')), 'c.json');
const { handle } = require('../server/mcp.js');
const { start } = require('../server/bridge.js');

const call = (name, args) => JSON.parse(handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }).result.content[0].text);

test('MCP initialize + tools/list', () => {
  assert.equal(handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }).result.serverInfo.name, 'open-email-harvester');
  assert.ok(handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).result.tools.length >= 8);
  assert.equal(handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});
test('MCP add/tag/search/extract', () => {
  assert.equal(call('add_contacts', { contacts: [{ email: 'Jane@Example.com' }] }).added, 1);
  call('tag_contact', { id: 'jane@example.com', tags: ['lead'], notes: 'n' });
  assert.equal(call('list_contacts', { tag: 'lead' }).length, 1);
  const r = call('extract_from_text', { text: 'bob [at] example [dot] org', save: true });
  assert.equal(r.emails[0].email, 'bob@example.org');
  assert.equal(call('search_contacts', { query: 'bob' }).length, 1);
});
test('HTTP bridge', async () => {
  const srv = await start(0, '127.0.0.1');
  const base = 'http://127.0.0.1:' + srv.address().port;
  try {
    assert.equal((await (await fetch(base + '/health')).json()).ok, true);
    await fetch(base + '/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([{ email: 'c@example.net' }]) });
    const list = await (await fetch(base + '/contacts?query=example.net')).json();
    assert.equal(list.length, 1);
    const csv = await (await fetch(base + '/export?format=csv')).text();
    assert.match(csv, /c@example\.net/);
  } finally { srv.close(); }
});
