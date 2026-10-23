'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../extension/src/extractor.js');

test('plain emails', () => {
  assert.deepEqual(X.extractEmails('Write to Jane.Doe@Example.com, or ops@sub.example.co.uk.'), ['jane.doe@example.com', 'ops@sub.example.co.uk']);
});
test('obfuscated [at] [dot]', () => {
  assert.ok(X.extractEmails('jane [at] example [dot] com').includes('jane@example.com'));
  assert.ok(X.extractEmails('jane(at)example(dot)org').includes('jane@example.org'));
  assert.ok(X.extractEmails('jane AT example DOT io').includes('jane@example.io'));
  assert.ok(X.extractEmails('jane {at} mail {dot} example {dot} net').includes('jane@mail.example.net'));
});
test('html entities and url-encoding', () => {
  assert.ok(X.extractEmails('jane&#64;example&#46;com').includes('jane@example.com'));
  assert.ok(X.extractEmails('jane&#x40;example.com').includes('jane@example.com'));
  assert.ok(X.extractEmails('jane&commat;example.com').includes('jane@example.com'));
  assert.ok(X.extractEmails('mailto:jane%40example.com').includes('jane@example.com'));
});
test('ignores image filenames and dedupes', () => {
  assert.deepEqual(X.extractEmails('logo@2x.png a@b.io A@B.IO'), ['a@b.io']);
});
test('phones', () => {
  const p = X.extractPhones('Call +1 (555) 123-4567 or 020 7946 0958. Version 1.2 in 2024.');
  assert.ok(p.includes('+1 (555) 123-4567'));
  assert.ok(p.includes('020 7946 0958'));
  assert.equal(p.length, 2);
});
test('social links', () => {
  const s = X.extractSocialLinks(['https://github.com/someone', 'https://www.x.com/foo#a', 'https://example.com/about']);
  assert.deepEqual(s, ['https://github.com/someone', 'https://www.x.com/foo']);
});
test('extractAll with mailto/tel links', () => {
  const r = X.extractAll({ url: 'https://www.example.com/team', title: 'Team', text: 'Reach jane.doe [at] example [dot] com', links: ['mailto:sales@example.com?subject=hi', 'tel:+44 20 7946 0958'] });
  assert.equal(r.domain, 'example.com');
  assert.deepEqual(r.emails.map((e) => e.email).sort(), ['jane.doe@example.com', 'sales@example.com']);
  assert.equal(r.emails.find((e) => e.email.startsWith('jane')).name, 'Jane Doe');
  assert.equal(r.emails.find((e) => e.email.startsWith('sales')).name, '');
  assert.ok(r.phones.includes('+44 20 7946 0958'));
});
