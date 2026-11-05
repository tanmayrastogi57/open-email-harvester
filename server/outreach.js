'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const FILE = process.env.OEH_OUTREACH_DATA || path.join(os.homedir(), '.open-email-harvester', 'outreach.json');
const STATUSES = ['new', 'sent', 'followed_up', 'replied', 'interview', 'rejected', 'bounced', 'closed'];

function now() { return new Date().toISOString(); }
function normEmail(email) { return String(email || '').trim().toLowerCase(); }
function load() {
  try {
    const value = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
function save(list) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}
function eventId(event) {
  return event.id || [event.type, event.messageId || '', event.at || ''].join(':');
}
function cleanEvent(event) {
  const e = Object.assign({}, event);
  e.type = e.type || 'note';
  e.at = e.at || now();
  e.id = eventId(e);
  return e;
}
function applyEvent(record, event) {
  const e = cleanEvent(event);
  record.events = record.events || [];
  if (!record.events.some((x) => x.id === e.id)) record.events.push(e);
  const when = e.at;
  if (e.type === 'sent' || e.type === 'followup') record.lastOutboundAt = [record.lastOutboundAt, when].filter(Boolean).sort().pop();
  if (e.type === 'reply') record.lastInboundAt = [record.lastInboundAt, when].filter(Boolean).sort().pop();
  if (e.type === 'sent' && !record.firstContactAt) record.firstContactAt = when;
  if (e.type === 'reply') record.status = 'replied';
  else if (e.type === 'bounce' && record.status !== 'replied') record.status = 'bounced';
  else if (e.type === 'followup' && !['replied', 'bounced'].includes(record.status)) record.status = 'followed_up';
  else if (e.type === 'sent' && record.status === 'new') record.status = 'sent';
}
function mergeOne(list, incoming) {
  const email = normEmail(incoming.email);
  if (!email) throw new Error('outreach record requires email');
  let record = list.find((x) => normEmail(x.email) === email);
  const added = !record;
  if (!record) {
    record = {
      id: email,
      email,
      status: 'new',
      tags: [],
      events: [],
      createdAt: now(),
      updatedAt: now(),
    };
    list.push(record);
  }
  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'events' || key === 'tags' || key === 'email' || value === undefined || value === null || value === '') continue;
    record[key] = value;
  }
  record.email = email;
  record.id = email;
  record.tags = [...new Set([...(record.tags || []), ...(Array.isArray(incoming.tags) ? incoming.tags : [])])];
  for (const event of incoming.events || []) applyEvent(record, event);
  if (incoming.event) applyEvent(record, incoming.event);
  if (!STATUSES.includes(record.status)) record.status = 'new';
  record.updatedAt = now();
  return added;
}
function list(query = {}) {
  const q = String(query.query || '').toLowerCase();
  const due = query.due === 'true' || query.due === true;
  const today = now().slice(0, 10);
  return load().filter((r) => {
    if (query.status && r.status !== query.status) return false;
    if (query.tag && !(r.tags || []).includes(query.tag)) return false;
    if (due && (!r.nextFollowUpAt || r.nextFollowUpAt.slice(0, 10) > today || ['closed', 'rejected'].includes(r.status))) return false;
    if (q && !JSON.stringify(r).toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
function upsert(records) {
  const listValue = load();
  const items = Array.isArray(records) ? records : [records];
  let added = 0;
  for (const item of items.filter(Boolean)) if (mergeOne(listValue, item)) added++;
  save(listValue);
  return { added, updated: items.length - added, total: listValue.length };
}
function recordEvent(email, event) {
  const listValue = load();
  mergeOne(listValue, { email, event });
  save(listValue);
  return listValue.find((x) => x.email === normEmail(email));
}
function setFollowUp(email, nextFollowUpAt, note) {
  const listValue = load();
  const record = listValue.find((x) => x.email === normEmail(email));
  if (!record) return null;
  record.nextFollowUpAt = nextFollowUpAt || null;
  if (note) record.notes = note;
  record.updatedAt = now();
  save(listValue);
  return record;
}
function summary() {
  const records = load();
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const record of records) counts[record.status] = (counts[record.status] || 0) + 1;
  const due = list({ due: true }).length;
  return { total: records.length, counts, due, file: FILE };
}
function exportJson(query) { return JSON.stringify(list(query), null, 2); }

module.exports = { FILE, STATUSES, list, upsert, recordEvent, setFollowUp, summary, exportJson };
