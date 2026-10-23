/* Offline validity hints: syntax + disposable domains. No network calls. */
(function (root) {
  'use strict';
  const DISPOSABLE = new Set(['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org',
    'yopmail.com', 'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc',
    'throwawaymail.com', 'fakeinbox.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'spamgourmet.com',
    'moakt.com', 'tempail.com', 'burnermail.io', 'mailnesia.com', 'mytemp.email', 'tempr.email', 'discard.email']);
  const ROLE = /^(info|contact|support|hello|admin|sales|team|office|hr|jobs|careers|noreply|no-reply|webmaster|postmaster)$/i;
  const SYNTAX = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}$/i;

  function validate(email) {
    const e = String(email || '').toLowerCase();
    const domain = e.split('@')[1] || '';
    const syntax = SYNTAX.test(e);
    const disposable = DISPOSABLE.has(domain);
    const role = ROLE.test(e.split('@')[0]);
    const status = !syntax ? 'invalid' : disposable ? 'disposable' : role ? 'role' : 'ok';
    return { syntax, disposable, role, status };
  }
  const api = { validate, DISPOSABLE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OEHValidate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
