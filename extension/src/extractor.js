/* Open Email Harvester - site-agnostic contact extractor (shared by extension, server and tests). */
(function (root) {
  'use strict';

  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}/g;
  const AT = '(?:\\s*(?:\\[|\\(|\\{|<)\\s*(?:at|@)\\s*(?:\\]|\\)|\\}|>)\\s*|\\s+(?:at|AT)\\s+|\\s*@\\s*)';
  const DOT = '(?:\\s*(?:\\[|\\(|\\{|<)\\s*(?:dot|\\.)\\s*(?:\\]|\\)|\\}|>)\\s*|\\s+(?:dot|DOT)\\s+|\\.)';
  const OBF_RE = new RegExp(
    '([A-Za-z0-9._%+-]+)' + AT + '([A-Za-z0-9-]+(?:' + DOT + '[A-Za-z0-9-]+)*' + DOT + '[A-Za-z]{2,24})\\b', 'g');
  const DOT_SPLIT = new RegExp(DOT, 'g');
  const PHONE_RE = /(?:\+|00)?\d[\d\s().-]{6,}\d/g;
  const SOCIAL_HOSTS = ['twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'github.com', 'gitlab.com',
    'youtube.com', 'tiktok.com', 'mastodon.social', 'threads.net', 'medium.com', 'reddit.com', 't.me',
    'discord.gg', 'bsky.app', 'pinterest.com', 'dribbble.com', 'behance.net', 'stackoverflow.com'];
  const FILE_EXT = /\.(png|jpe?g|gif|svg|webp|css|js|ico|bmp|woff2?)$/i;

  function decodeEntities(s) {
    return String(s)
      .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);?/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
      .replace(/&commat;/gi, '@').replace(/&period;/gi, '.').replace(/&amp;/gi, '&')
      .replace(/%40/g, '@');
  }

  function normalizeEmail(e) {
    return String(e).trim().replace(/^mailto:/i, '').split('?')[0].replace(/[.,;:]+$/, '').toLowerCase();
  }

  function isPlausibleEmail(e) {
    if (FILE_EXT.test(e)) return false;
    const [local, domain] = e.split('@');
    if (!local || !domain || local.length > 64 || e.length > 254) return false;
    if (/^\.|\.\.|\.$/.test(local) || /\.\./.test(domain)) return false;
    return true;
  }

  function extractEmails(text) {
    const src = decodeEntities(text || '');
    const out = new Set();
    for (const m of src.match(EMAIL_RE) || []) out.add(normalizeEmail(m));
    let m;
    OBF_RE.lastIndex = 0;
    while ((m = OBF_RE.exec(src))) {
      const domain = m[2].split(DOT_SPLIT).join('.');
      out.add(normalizeEmail(m[1] + '@' + domain));
    }
    return [...out].filter(isPlausibleEmail);
  }

  function extractPhones(text) {
    const out = new Set();
    for (const raw of String(text || '').match(PHONE_RE) || []) {
      const digits = raw.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) continue;
      if (/^(19|20)\d{2}[-.](0[1-9]|1[0-2])/.test(raw.trim())) continue; // dates
      if (/^\d+\.\d+$/.test(raw.trim())) continue; // decimals
      out.add(raw.trim().replace(/\s+/g, ' '));
    }
    return [...out];
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
  }

  function extractSocialLinks(urls) {
    const out = new Set();
    for (const u of urls || []) {
      const h = hostOf(u);
      if (SOCIAL_HOSTS.some((s) => h === s || h.endsWith('.' + s))) out.add(u.split('#')[0]);
    }
    return [...out];
  }

  function guessName(email, context) {
    if (context && context.name) return context.name;
    const local = email.split('@')[0];
    if (/^(info|contact|support|hello|admin|sales|team|office|hr|jobs|careers|noreply|no-reply)$/i.test(local)) return '';
    const parts = local.split(/[._-]+/).filter((p) => /^[a-z]{2,}$/i.test(p));
    return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
  }

  /** Extract everything from a page snapshot {text, html, links, title, url}. */
  function extractAll(page) {
    const p = page || {};
    const links = p.links || [];
    const mailtos = links.filter((l) => /^mailto:/i.test(l)).map((l) => decodeURIComponent(l.slice(7)));
    const emails = new Set(extractEmails([p.text, p.html, mailtos.join(' ')].join('\n')));
    const tels = links.filter((l) => /^tel:/i.test(l)).map((l) => decodeURIComponent(l.slice(4)));
    const phones = new Set([...extractPhones(p.text), ...tels.map((t) => t.trim())]);
    return {
      url: p.url || '',
      title: p.title || '',
      domain: hostOf(p.url || ''),
      emails: [...emails].map((email) => ({ email, name: guessName(email), domain: email.split('@')[1] })),
      phones: [...phones],
      socials: extractSocialLinks(links),
      scannedAt: new Date().toISOString(),
    };
  }

  const api = { extractEmails, extractPhones, extractSocialLinks, extractAll, decodeEntities, normalizeEmail, guessName, hostOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OEHExtractor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
