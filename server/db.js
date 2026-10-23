'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const S = require('../extension/src/store.js');
const { validate } = require('../extension/src/validate.js');
const X = require('../extension/src/extractor.js');

const FILE = process.env.OEH_DATA || path.join(os.homedir(), '.open-email-harvester', 'contacts.json');

function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } }
function save(list) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(list, null, 2)); }

function normalizeIncoming(items) {
  return (Array.isArray(items) ? items : [items]).filter(Boolean).map((c) => {
    const o = Object.assign({}, c);
    if (o.email) { o.email = X.normalizeEmail(o.email); o.type = o.type || 'email'; o.domain = o.domain || o.email.split('@')[1]; o.validity = validate(o.email).status; }
    else if (o.phone) o.type = o.type || 'phone';
    else if (o.url) o.type = o.type || 'social';
    if (typeof o.tags === 'string') o.tags = o.tags.split(',').map((t) => t.trim()).filter(Boolean);
    return o;
  });
}

module.exports = {
  FILE,
  list: (q) => S.filter(load(), q),
  add(items) { const r = S.merge(load(), normalizeIncoming(items)); save(r.list); return { added: r.added, total: r.list.length }; },
  tag(id, tags, notes) {
    const list = load(); const c = list.find((x) => x.id === String(id).toLowerCase());
    if (!c) return null;
    if (tags) c.tags = [...new Set([...(c.tags || []), ...tags])];
    if (notes != null) c.notes = notes;
    save(list); return c;
  },
  remove(id) { const list = load(); const n = list.filter((x) => x.id !== String(id).toLowerCase()); save(n); return list.length - n.length; },
  clear() { save([]); },
  exportAs(format, q) { const l = S.filter(load(), q); return format === 'csv' ? S.toCSV(l) : JSON.stringify(l, null, 2); },
  groups: () => Object.fromEntries(Object.entries(S.groupByDomain(load())).map(([k, v]) => [k, v.length])),
  extract(input) { const scan = X.extractAll(input); return scan; },
  validate,
};
