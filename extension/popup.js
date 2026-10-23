/* global OEHStore */
const api = globalThis.browser || globalThis.chrome;
const $ = (id) => document.getElementById(id);
let contacts = [];

async function load() { contacts = (await api.storage.local.get('contacts')).contacts || []; render(); }
async function save() { await api.storage.local.set({ contacts }); render(); }

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function itemView(c) {
  const d = el('div', 'item');
  const v = el('div', 'v', c.email || c.phone || c.url);
  if (c.validity) v.appendChild(el('span', 'badge ' + c.validity, c.validity));
  v.appendChild(el('span', 'badge', c.type));
  d.appendChild(v);
  d.appendChild(el('div', 'meta', [c.name, c.domain, c.pageTitle].filter(Boolean).join(' · ')));
  const tags = el('input'); tags.placeholder = 'tags (comma separated)'; tags.value = (c.tags || []).join(', ');
  tags.onchange = () => { c.tags = tags.value.split(',').map((t) => t.trim()).filter(Boolean); save(); };
  const notes = el('input'); notes.placeholder = 'notes'; notes.value = c.notes || '';
  notes.onchange = () => { c.notes = notes.value; save(); };
  d.append(tags, notes);
  return d;
}

function render() {
  const q = $('q').value.trim();
  const tagMatch = q.match(/^#(\S+)$/);
  const shown = OEHStore.filter(contacts, tagMatch ? { tag: tagMatch[1], type: $('type').value } : { query: q, type: $('type').value });
  const list = $('list'); list.replaceChildren();
  if ($('group').checked) {
    const g = OEHStore.groupByDomain(shown);
    for (const dom of Object.keys(g).sort()) { list.appendChild(el('h4', null, dom + ' (' + g[dom].length + ')')); g[dom].forEach((c) => list.appendChild(itemView(c))); }
  } else shown.forEach((c) => list.appendChild(itemView(c)));
  $('count').textContent = shown.length + ' / ' + contacts.length;
}

function download(name, data, mime) {
  const a = el('a'); a.href = URL.createObjectURL(new Blob([data], { type: mime })); a.download = name; a.click();
}

$('scan').onclick = async () => {
  $('status').textContent = 'Scanning…';
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  const r = await api.runtime.sendMessage({ type: 'scan', tabId: tab.id });
  $('status').textContent = r && r.error ? r.error : `+${r.added} new (${r.scan.emails} emails, ${r.scan.phones} phones, ${r.scan.socials} links)`;
  load();
};
$('q').oninput = render; $('type').onchange = render; $('group').onchange = render;
$('csv').onclick = () => download('contacts.csv', OEHStore.toCSV(contacts), 'text/csv');
$('json').onclick = () => download('contacts.json', JSON.stringify(contacts, null, 2), 'application/json');
$('import').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const text = await f.text();
  const items = f.name.endsWith('.csv') ? OEHStore.parseCSV(text) : JSON.parse(text);
  contacts = OEHStore.merge(contacts, items).list; save();
};
$('sync').onclick = async () => { const r = await api.runtime.sendMessage({ type: 'syncAll' }); $('status').textContent = r && r.synced ? 'Synced to bridge' : 'Sync off or bridge unreachable'; };
$('clear').onclick = () => { if (confirm('Delete all saved contacts?')) { contacts = []; save(); } };
load();
