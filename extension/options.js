const api = globalThis.browser || globalThis.chrome;
const DEFAULTS = { autoScan: false, syncEnabled: false, bridgeUrl: 'http://127.0.0.1:8765', bridgeToken: '' };
const ids = Object.keys(DEFAULTS);
(async () => {
  const s = Object.assign({}, DEFAULTS, (await api.storage.local.get('settings')).settings);
  for (const k of ids) { const e = document.getElementById(k); if (e.type === 'checkbox') e.checked = s[k]; else e.value = s[k]; }
})();
document.getElementById('save').onclick = async () => {
  const s = {};
  for (const k of ids) { const e = document.getElementById(k); s[k] = e.type === 'checkbox' ? e.checked : e.value.trim(); }
  const msg = document.getElementById('msg');
  if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/.test(s.bridgeUrl)) { msg.textContent = 'Bridge URL must be localhost.'; return; }
  if (s.autoScan) s.autoScan = await api.permissions.request({ origins: ['<all_urls>'] });
  else await api.permissions.remove({ origins: ['<all_urls>'] }).catch(() => {});
  await api.storage.local.set({ settings: s });
  msg.textContent = s.autoScan || !document.getElementById('autoScan').checked ? 'Saved.' : 'Saved (auto-scan permission denied).';
};
