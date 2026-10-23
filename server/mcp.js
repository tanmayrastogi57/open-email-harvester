#!/usr/bin/env node
'use strict';
/* Dependency-free MCP server over stdio (JSON-RPC 2.0, newline-delimited). */
const db = require('./db.js');
const S = require('../extension/src/store.js');

const str = { type: 'string' };
const filterProps = { query: str, tag: str, type: { type: 'string', enum: ['email', 'phone', 'social'] }, domain: str };
const TOOLS = [
  { name: 'list_contacts', description: 'List saved contacts, optionally filtered by query/tag/type/domain.', inputSchema: { type: 'object', properties: filterProps } },
  { name: 'search_contacts', description: 'Full-text search across saved contacts.', inputSchema: { type: 'object', properties: { query: str }, required: ['query'] } },
  { name: 'add_contacts', description: 'Add one or more contacts ({email|phone|url, name, tags, notes, domain}). Deduplicated.', inputSchema: { type: 'object', properties: { contacts: { type: 'array', items: { type: 'object' } } }, required: ['contacts'] } },
  { name: 'tag_contact', description: 'Add tags and/or set notes on a contact by id (the email, phone or url).', inputSchema: { type: 'object', properties: { id: str, tags: { type: 'array', items: str }, notes: str }, required: ['id'] } },
  { name: 'remove_contact', description: 'Delete a contact by id.', inputSchema: { type: 'object', properties: { id: str }, required: ['id'] } },
  { name: 'extract_from_text', description: 'Extract emails (incl. obfuscated), phones and social links from raw text/HTML you provide; optionally save.', inputSchema: { type: 'object', properties: { text: str, html: str, url: str, title: str, links: { type: 'array', items: str }, save: { type: 'boolean' } } } },
  { name: 'validate_email', description: 'Offline syntax + disposable + role-account check.', inputSchema: { type: 'object', properties: { email: str }, required: ['email'] } },
  { name: 'list_domains', description: 'Contact counts grouped by domain.', inputSchema: { type: 'object', properties: {} } },
  { name: 'export_contacts', description: 'Export contacts as CSV or JSON text.', inputSchema: { type: 'object', properties: Object.assign({ format: { type: 'string', enum: ['csv', 'json'] } }, filterProps) } },
];

function call(name, a) {
  switch (name) {
    case 'list_contacts': return db.list(a);
    case 'search_contacts': return db.list({ query: a.query });
    case 'add_contacts': return db.add(a.contacts);
    case 'tag_contact': return db.tag(a.id, a.tags, a.notes) || { error: 'not found' };
    case 'remove_contact': return { removed: db.remove(a.id) };
    case 'extract_from_text': { const s = db.extract(a); if (a.save) s.saved = db.add(S.fromScan(s)); return s; }
    case 'validate_email': return db.validate(a.email);
    case 'list_domains': return db.groups();
    case 'export_contacts': return db.exportAs(a.format || 'json', a);
    default: throw new Error('Unknown tool: ' + name);
  }
}

function handle(msg) {
  const { id, method, params } = msg;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  if (method === 'initialize') return ok({ protocolVersion: (params && params.protocolVersion) || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'open-email-harvester', version: '1.0.0' } });
  if (method === 'tools/list') return ok({ tools: TOOLS });
  if (method === 'ping') return ok({});
  if (method === 'tools/call') {
    try {
      const r = call(params.name, params.arguments || {});
      return ok({ content: [{ type: 'text', text: typeof r === 'string' ? r : JSON.stringify(r, null, 2) }] });
    } catch (e) { return ok({ isError: true, content: [{ type: 'text', text: String(e.message || e) }] }); }
  }
  if (id === undefined) return null; // notification
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
}

module.exports = { handle, TOOLS };
if (require.main === module) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let out;
      try { out = handle(JSON.parse(line)); } catch { out = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }; }
      if (out) process.stdout.write(JSON.stringify(out) + '\n');
    }
  });
}
