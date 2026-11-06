'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cryptoModule = require('node:crypto');
const outreach = require('./outreach.js');

const PORT = Number(process.env.OEH_PORT || 8765);
const CLIENT_ID = process.env.OEH_GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.OEH_GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.OEH_GOOGLE_REDIRECT_URI || `http://127.0.0.1:${PORT}/auth/gmail/callback`;
const TOKEN_FILE = process.env.OEH_GMAIL_TOKEN_DATA || path.join(os.homedir(), '.open-email-harvester', 'gmail-tokens.json');
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const SYNC_INTERVAL = Number(process.env.OEH_GMAIL_SYNC_INTERVAL_MS || 300000);

function load() { try { return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')); } catch { return {}; } }
function save(value) {
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(value, null, 2), { mode: 0o600 });
  try { fs.chmodSync(TOKEN_FILE, 0o600); } catch { /* Windows ACLs are managed by the OS. */ }
}
function configured() { return Boolean(CLIENT_ID); }
function gmailStatus() {
  const value = load();
  return { configured: configured(), connected: Boolean(value.refreshToken), email: value.email || null, lastSyncAt: value.lastSyncAt || null, lastSyncStats: value.lastSyncStats || null, tokenFile: TOKEN_FILE };
}
function authUrl() {
  if (!configured()) throw new Error('Gmail OAuth is not configured. Set OEH_GOOGLE_CLIENT_ID and OEH_GOOGLE_CLIENT_SECRET.');
  const state = cryptoModule.randomBytes(32).toString('hex');
  const value = load(); value.authState = state; value.authStateExpiresAt = Date.now() + 10 * 60 * 1000; save(value);
  const params = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', scope: SCOPES.join(' '), state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { text }; }
  if (!response.ok) throw new Error(`Google API ${response.status}: ${body.error_description || body.error?.message || body.error || response.statusText}`);
  return body;
}
async function exchangeCode(code, state) {
  const value = load();
  if (!state || state !== value.authState || Date.now() > Number(value.authStateExpiresAt || 0)) throw new Error('Invalid or expired OAuth state. Start the Gmail connection again.');
  const body = new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' });
  const tokens = await requestJson('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const next = Object.assign({}, value, { accessToken: tokens.access_token, refreshToken: tokens.refresh_token || value.refreshToken, expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000, authState: undefined, authStateExpiresAt: undefined });
  const profile = await requestJson('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  next.email = profile.emailAddress || null;
  save(next);
  startBackgroundSync();
  return gmailStatus();
}
async function disconnect() { stopBackgroundSync(); save({}); return { configured: configured(), connected: false, email: null, lastSyncAt: null, lastSyncStats: null, tokenFile: TOKEN_FILE }; }
async function accessToken() {
  const value = load();
  if (value.accessToken && Number(value.expiresAt || 0) > Date.now() + 60000) return value.accessToken;
  if (!value.refreshToken) throw new Error('Gmail is not connected.');
  const body = new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: value.refreshToken, grant_type: 'refresh_token' });
  const tokens = await requestJson('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  save(Object.assign({}, value, { accessToken: tokens.access_token, expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000 }));
  return tokens.access_token;
}
async function gmail(pathname) { return requestJson(`https://gmail.googleapis.com/gmail/v1/users/me/${pathname}`, { headers: { Authorization: `Bearer ${await accessToken()}` } }); }
async function listMessages(query, maxPages = 5) {
  const result = []; let pageToken;
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({ q: query, maxResults: '100' }); if (pageToken) params.set('pageToken', pageToken);
    const body = await gmail(`messages?${params}`); result.push(...(body.messages || [])); pageToken = body.nextPageToken; if (!pageToken) break;
  }
  return result;
}
function headers(message) { return Object.fromEntries((message.payload?.headers || []).map((h) => [String(h.name).toLowerCase(), h.value])); }
function address(value) { const text = String(value || '').trim(); const match = text.match(/<([^>]+)>/); return (match ? match[1] : text).toLowerCase(); }
function details(message) {
  const h = headers(message);
  return { messageId: message.id, threadId: message.threadId, labelIds: message.labelIds || [], at: new Date(Number(message.internalDate || Date.now())).toISOString(), from: address(h.from), to: address(h.to), subject: h.subject || '', direction: (message.labelIds || []).includes('SENT') ? 'sent' : 'inbound', text: messageText(message.payload) };
}
function messageText(part) {
  if (!part) return '';
  const own = part.body?.data ? Buffer.from(part.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') : '';
  return [own, ...(part.parts || []).map(messageText)].join('\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').slice(0, 100000);
}
async function getMessages(ids) {
  const messages = [];
  for (let i = 0; i < ids.length; i += 10) {
    const batch = await Promise.all(ids.slice(i, i + 10).map(async (item) => details(await gmail(`messages/${encodeURIComponent(item.id)}?format=full`))));
    messages.push(...batch);
  }
  return messages;
}
async function syncOutreach() {
  if (!load().refreshToken) return { connected: false, skipped: true };
  const sent = await getMessages(await listMessages('in:sent newer_than:90d'));
  const threadIds = new Set(sent.map((m) => m.threadId));
  const inboundCandidates = await getMessages(await listMessages('newer_than:90d -from:me -in:spam -in:trash'));
  const inbound = inboundCandidates.filter((m) => threadIds.has(m.threadId));
  const classified = inbound.map((message) => {
    const text = `${message.subject} ${message.text || ''}`;
    const interview = /\b(interview|schedule (?:a|an) call|technical round|next round)\b/i.test(text);
    const rejection = /\b(regret to inform|unfortunately|not moving forward|decided to proceed with other|not selected|position has been filled)\b/i.test(text);
    const url = interview ? (text.match(/https?:\/\/[^\s<>"')]+/i) || [])[0] : undefined;
    return Object.assign({}, message, { eventType: rejection ? 'rejection' : interview ? 'interview' : 'reply', interviewUrl: url });
  });
  const stats = outreach.reconcileGmail([...sent, ...classified]);
  const value = load(); value.lastSyncAt = new Date().toISOString(); value.lastSyncStats = stats; save(value);
  return Object.assign({ connected: true, lastSyncAt: value.lastSyncAt }, stats);
}
let timer;
function stopBackgroundSync() { if (timer) clearInterval(timer); timer = undefined; }
function startBackgroundSync() {
  if (timer || SYNC_INTERVAL <= 0 || !load().refreshToken) return;
  timer = setInterval(() => syncOutreach().catch(() => {}), SYNC_INTERVAL);
  timer.unref?.();
  syncOutreach().catch(() => {});
}

module.exports = { TOKEN_FILE, SCOPES, status: gmailStatus, authUrl, exchangeCode, disconnect, syncOutreach, startBackgroundSync };
