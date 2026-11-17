'use strict';
// Run: npm test  — exercises the API against a throwaway DB seeded from fixture .txt files.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('./server');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'librix-'));
const files = {
  'booklog.txt': 'Harry Potter\r\nSolo Levelling\r\n',
  'authorslog.txt': 'J.K Rowling\r\nChugong\r\n',
  'borrowlog.txt': '1 100\r\n0 -1\r\n',
  'namelog.txt': 'Reader One\r\nReader Two\r\n',
  'IDlog.txt': '100\r\n101\r\n',
  'phoneNumlog.txt': '0100000001\r\n1.23457e+08\r\n',
};
for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(tmp, f), c);

let server, base;
const call = async (method, url, body) => {
  const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

test.before(() => new Promise(res => {
  server = createServer(path.join(tmp, 'test.db'), tmp).listen(0, () => {
    base = `http://localhost:${server.address().port}`;
    res();
  });
}));
test.after(() => new Promise(res => server.close(() => { fs.rmSync(tmp, { recursive: true, force: true }); res(); })));

test('imports legacy C++ data', async () => {
  const books = (await call('GET', '/api/books')).body;
  assert.equal(books.length, 2);
  assert.equal(books[0].borrowed_by, 100);
  assert.equal(books[1].loan_id, null);
  const members = (await call('GET', '/api/members')).body;
  assert.deepEqual(members.map(m => [m.id, m.phone]), [[100, '100000001'], [101, '123457000']]);
});

test('books: create, validate, search, edit, delete', async () => {
  assert.equal((await call('POST', '/api/books', { title: '  ', author: 'X' })).status, 400);
  const b = (await call('POST', '/api/books', { title: 'Atomic  Habits', author: 'James Clear' }));
  assert.equal(b.status, 201);
  assert.equal(b.body.title, 'Atomic Habits');
  assert.equal((await call('GET', '/api/books?q=CLEAR')).body.length, 1, 'author search, case-insensitive');
  assert.equal((await call('GET', '/api/books?q=%25')).body.length, 0, 'LIKE wildcards are escaped');
  assert.equal((await call('GET', '/api/books?status=available')).body.length, 2);
  assert.equal((await call('PUT', `/api/books/${b.body.id}`, { title: 'Atomic Habits 2', author: 'J. Clear' })).body.author, 'J. Clear');
  assert.equal((await call('PUT', '/api/books/9999', { title: 'a', author: 'b' })).status, 404);
  assert.equal((await call('DELETE', `/api/books/${b.body.id}`)).status, 200);
  assert.equal((await call('DELETE', '/api/books/1')).status, 409, 'cannot delete a book on loan');
});

test('members: unique ID, phone kept as text, ID change carries loans', async () => {
  assert.equal((await call('POST', '/api/members', { id: 100, name: 'Dup', phone: '0123456789' })).status, 409);
  assert.equal((await call('POST', '/api/members', { id: 102, name: 'R', phone: 'abc' })).status, 400);
  const m = await call('POST', '/api/members', { id: '102', name: 'Reader Three', phone: '0195659123' });
  assert.equal(m.status, 201);
  assert.equal(m.body.phone, '0195659123', 'leading zero preserved');
  assert.equal((await call('PUT', '/api/members/100', { id: 101, name: 'Reader One', phone: '0100000001' })).status, 409);
  assert.equal((await call('PUT', '/api/members/100', { id: 200, name: 'Reader One', phone: '0100000001' })).status, 200);
  assert.equal((await call('GET', '/api/books')).body[0].borrowed_by, 200, 'loan follows renamed ID');
  assert.equal((await call('DELETE', '/api/members/200')).status, 409, 'cannot delete member with loans');
  assert.equal((await call('DELETE', '/api/members/102')).status, 200);
});

test('borrow and return rules', async () => {
  assert.equal((await call('POST', '/api/loans', { member_id: 999, book_id: 2 })).status, 404, 'unknown member');
  assert.equal((await call('POST', '/api/loans', { member_id: 101, book_id: 1 })).status, 409, 'already borrowed');
  const loan = await call('POST', '/api/loans', { member_id: 101, book_id: 2 });
  assert.equal(loan.status, 201);
  assert.equal((await call('POST', '/api/loans', { member_id: 200, book_id: 2 })).status, 409);
  assert.equal((await call('GET', '/api/stats')).body.available, 0);
  assert.equal((await call('POST', `/api/loans/${loan.body.id}/return`)).status, 200);
  assert.equal((await call('POST', `/api/loans/${loan.body.id}/return`)).status, 409, 'double return');
  const s = (await call('GET', '/api/stats')).body;
  assert.equal(s.available, 1);
  assert.equal(s.activity[0].type, 'return');
  assert.equal((await call('GET', '/api/loans?status=returned')).body.length, 1);
});

test('bad input handled', async () => {
  const r = await fetch(base + '/api/books', { method: 'POST', body: '{nope' });
  assert.equal(r.status, 400);
  assert.equal((await call('GET', '/api/nothing')).status, 404);
  assert.equal((await fetch(base + '/../server.js')).status, 404);
});
