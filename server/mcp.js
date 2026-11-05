#!/usr/bin/env node
'use strict';
/* Dependency-free MCP server over stdio (JSON-RPC 2.0, newline-delimited). */
const db = require('./db.js');
const S = require('../extension/src/store.js');
const outreach = require('./outreach.js');
const gmail = require('./gmail.js');

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
  { name: 'list_outreach', description: 'List outreach records with status, job metadata, event history, and follow-up dates.', inputSchema: { type: 'object', properties: { query: str, status: str, tag: str, due: { type: 'boolean' } } } },
  { name: 'upsert_outreach', description: 'Create or update outreach records. Include email, name, company, role, sourceUrl, metadata, tags, and/or events.', inputSchema: { type: 'object', properties: { records: { type: 'array', items: { type: 'object' } } }, required: ['records'] } },
  { name: 'record_outreach_event', description: 'Record a sent, reply, followup, interview, rejection, bounce, or note event for a recipient.', inputSchema: { type: 'object', properties: { email: str, type: str, at: str, subject: str, messageId: str, threadId: str, note: str }, required: ['email', 'type'] } },
  { name: 'set_outreach_followup', description: 'Set or clear the next follow-up date for a recipient.', inputSchema: { type: 'object', properties: { email: str, nextFollowUpAt: str, note: str }, required: ['email'] } },
  { name: 'outreach_summary', description: 'Return counts of outreach records by status and the number of due follow-ups.', inputSchema: { type: 'object', properties: {} } },
  { name: 'export_outreach', description: 'Export outreach records as JSON text.', inputSchema: { type: 'object', properties: { query: str, status: str, tag: str, due: { type: 'boolean' } } } },
  { name: 'gmail_connection_status', description: 'Show whether this local bridge has a Gmail OAuth connection and its last sync status.', inputSchema: { type: 'object', properties: {} } },
  { name: 'sync_gmail_outreach', description: 'Synchronize Gmail message metadata into the local outreach tracker. Requires a Gmail account connected through the local bridge.', inputSchema: { type: 'object', properties: {} } },
  { name: 'reconcile_outreach_from_gmail', description: 'Apply normalized Gmail metadata from an AI Gmail connector to the same idempotent reconciliation logic used by direct Gmail sync. Do not include message bodies or credentials.', inputSchema: { type: 'object', properties: { messages: { type: 'array', items: { type: 'object' } } }, required: ['messages'] } },
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
    case 'list_outreach': return outreach.list(a);
    case 'upsert_outreach': return outreach.upsert(a.records);
    case 'record_outreach_event': return outreach.recordEvent(a.email, a);
    case 'set_outreach_followup': return outreach.setFollowUp(a.email, a.nextFollowUpAt, a.note) || { error: 'not found' };
    case 'outreach_summary': return outreach.summary();
    case 'export_outreach': return outreach.exportJson(a);
    case 'gmail_connection_status': return gmail.status();
    case 'sync_gmail_outreach': return gmail.syncOutreach();
    case 'reconcile_outreach_from_gmail': return outreach.reconcileGmail(a.messages);
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
    const result = (r) => ok({ content: [{ type: 'text', text: typeof r === 'string' ? r : JSON.stringify(r, null, 2) }] });
    const failure = (e) => ok({ isError: true, content: [{ type: 'text', text: String(e.message || e) }] });
    try {
      const r = call(params.name, params.arguments || {});
      return r && typeof r.then === 'function' ? r.then(result, failure) : result(r);
    } catch (e) { return failure(e); }
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
      try {
        out = handle(JSON.parse(line));
        Promise.resolve(out).then((result) => { if (result) process.stdout.write(JSON.stringify(result) + '\n'); });
      } catch { out = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }; process.stdout.write(JSON.stringify(out) + '\n'); }
    }
  });
}
