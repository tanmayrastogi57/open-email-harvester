'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../extension/src/store.js');
const { validate } = require('../extension/src/validate.js');

test('merge dedupes and unions tags', () => {
  let r = S.merge([], [{ email: 'a@x.io', tags: ['t1'], domain: 'x.io', type: 'email' }]);
  r = S.merge(r.list, [{ email: 'A@x.io', tags: ['t2'], name: 'A' }, { phone: '+1 555 0100', type: 'phone' }]);
  assert.equal(r.list.length, 2);
  assert.equal(r.added, 1);
  assert.deepEqual(r.list[0].tags, ['t1', 't2']);
  assert.equal(r.list[0].name, 'A');
});
test('filter and group', () => {
  const { list } = S.merge([], [{ email: 'a@x.io', domain: 'x.io', type: 'email', tags: ['lead'] }, { email: 'b@y.io', domain: 'y.io', type: 'email' }]);
  assert.equal(S.filter(list, { tag: 'lead' }).length, 1);
  assert.equal(S.filter(list, { query: 'y.io' }).length, 1);
  assert.deepEqual(Object.keys(S.groupByDomain(list)).sort(), ['x.io', 'y.io']);
});
test('CSV round trip', () => {
  const { list } = S.merge([], [{ email: 'a@x.io', type: 'email', notes: 'hi, "there"\nline2', tags: ['a', 'b'] }]);
  const back = S.parseCSV(S.toCSV(list));
  assert.equal(back[0].email, 'a@x.io');
  assert.equal(back[0].notes, 'hi, "there"\nline2');
  assert.deepEqual(back[0].tags, ['a', 'b']);
});
test('validity hints', () => {
  assert.equal(validate('jane@example.com').status, 'ok');
  assert.equal(validate('info@example.com').status, 'role');
  assert.equal(validate('x@mailinator.com').status, 'disposable');
  assert.equal(validate('bad@@x').status, 'invalid');
});
