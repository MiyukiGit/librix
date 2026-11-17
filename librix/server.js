'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { open } = require('./db');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, msg) => { throw new HttpError(status, msg); };

// ---------- validation ----------
function text(v, field, max) {
  if (typeof v !== 'string' || !v.trim()) fail(400, `${field} is required.`);
  v = v.trim().replace(/\s+/g, ' ');
  if (v.length > max) fail(400, `${field} must be at most ${max} characters.`);
  return v;
}
function memberId(v) {
  const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v;
  if (!Number.isInteger(n) || n < 1 || n > 999999999) fail(400, 'Member ID must be a whole number between 1 and 999999999.');
  return n;
}
function phone(v) {
  const p = typeof v === 'string' ? v.trim() : '';
  if (!/^\+?[0-9][0-9 -]{5,18}[0-9]$/.test(p)) fail(400, 'Phone must be 7–20 digits (spaces, dashes and a leading + allowed).');
  return p;
}
const likeTerm = q => `%${String(q || '').trim().replace(/[\\%_]/g, '\\$&')}%`;

// ---------- API ----------
function api(db) {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);

  const BOOK_SELECT = `
    SELECT b.id, b.title, b.author, b.created_at,
           l.id AS loan_id, l.member_id AS borrowed_by, m.name AS borrowed_by_name, l.borrowed_at
    FROM books b
    LEFT JOIN loans l ON l.book_id = b.id AND l.returned_at IS NULL
    LEFT JOIN members m ON m.id = l.member_id`;
  const LOAN_SELECT = `
    SELECT l.id, l.book_id, b.title, b.author, l.member_id, m.name AS member_name, l.borrowed_at, l.returned_at
    FROM loans l JOIN books b ON b.id = l.book_id JOIN members m ON m.id = l.member_id`;

  const getBook = id => one(`${BOOK_SELECT} WHERE b.id = ?`, id) || fail(404, 'Book not found.');
  const getMember = id => one('SELECT * FROM members WHERE id = ?', id) || fail(404, `Member ID ${id} not found.`);

  const routes = [
    ['GET', /^\/api\/stats$/, () => {
      const c = one(`SELECT
          (SELECT count(*) FROM books) AS books,
          (SELECT count(*) FROM loans WHERE returned_at IS NULL) AS borrowed,
          (SELECT count(*) FROM members) AS members,
          (SELECT count(*) FROM loans) AS loans_total`);
      return {
        ...c,
        available: c.books - c.borrowed,
        active: all(`${LOAN_SELECT} WHERE l.returned_at IS NULL ORDER BY l.borrowed_at DESC, l.id DESC LIMIT 6`),
        activity: all(`
          SELECT * FROM (
            SELECT 'borrow' AS type, l.borrowed_at AS at, l.id, b.title, m.name AS member_name, l.member_id
              FROM loans l JOIN books b ON b.id = l.book_id JOIN members m ON m.id = l.member_id
            UNION ALL
            SELECT 'return', l.returned_at, l.id, b.title, m.name, l.member_id
              FROM loans l JOIN books b ON b.id = l.book_id JOIN members m ON m.id = l.member_id
              WHERE l.returned_at IS NOT NULL)
          ORDER BY at DESC, id DESC, type DESC LIMIT 8`),
      };
    }],

    // Books — search mirrors searchBooksAuthor: case-insensitive substring on title OR author.
    ['GET', /^\/api\/books$/, (_, q) => {
      const where = ["(b.title LIKE ?1 ESCAPE '\\' OR b.author LIKE ?1 ESCAPE '\\')"];
      if (q.get('status') === 'available') where.push('l.id IS NULL');
      if (q.get('status') === 'borrowed') where.push('l.id IS NOT NULL');
      return all(`${BOOK_SELECT} WHERE ${where.join(' AND ')} ORDER BY b.id`, likeTerm(q.get('q')));
    }],
    ['POST', /^\/api\/books$/, (_, __, body) => {
      const { lastInsertRowid } = run('INSERT INTO books (title, author) VALUES (?, ?)',
        text(body.title, 'Title', 200), text(body.author, 'Author', 120));
      return [201, getBook(lastInsertRowid)];
    }],
    ['PUT', /^\/api\/books\/(\d+)$/, ([id], _, body) => {
      getBook(id);
      run('UPDATE books SET title = ?, author = ? WHERE id = ?',
        text(body.title, 'Title', 200), text(body.author, 'Author', 120), id);
      return getBook(id);
    }],
    ['DELETE', /^\/api\/books\/(\d+)$/, ([id]) => {
      if (getBook(id).loan_id) fail(409, 'This book is on loan. Return it before deleting.');
      run('DELETE FROM books WHERE id = ?', id);
      return { ok: true };
    }],

    // Members
    ['GET', /^\/api\/members$/, (_, q) => all(`
      SELECT m.*,
        (SELECT count(*) FROM loans WHERE member_id = m.id AND returned_at IS NULL) AS active_loans,
        (SELECT count(*) FROM loans WHERE member_id = m.id) AS total_loans
      FROM members m
      WHERE m.name LIKE ?1 ESCAPE '\\' OR CAST(m.id AS TEXT) LIKE ?1 ESCAPE '\\' OR m.phone LIKE ?1 ESCAPE '\\'
      ORDER BY m.id`, likeTerm(q.get('q')))],
    ['POST', /^\/api\/members$/, (_, __, body) => {
      const id = memberId(body.id);
      const name = text(body.name, 'Name', 120), ph = phone(body.phone);
      if (one('SELECT 1 FROM members WHERE id = ?', id)) fail(409, `Member ID ${id} is already taken.`);
      run('INSERT INTO members (id, name, phone) VALUES (?, ?, ?)', id, name, ph);
      return [201, getMember(id)];
    }],
    ['PUT', /^\/api\/members\/(\d+)$/, ([oldId], _, body) => {
      getMember(oldId);
      const id = memberId(body.id ?? Number(oldId));
      const name = text(body.name, 'Name', 120), ph = phone(body.phone);
      if (id !== Number(oldId) && one('SELECT 1 FROM members WHERE id = ?', id)) fail(409, `Member ID ${id} is already taken.`);
      run('UPDATE members SET id = ?, name = ?, phone = ? WHERE id = ?', id, name, ph, oldId); // loans follow via ON UPDATE CASCADE
      return getMember(id);
    }],
    ['DELETE', /^\/api\/members\/(\d+)$/, ([id]) => {
      getMember(id);
      if (one('SELECT 1 FROM loans WHERE member_id = ? AND returned_at IS NULL', id))
        fail(409, 'This member still has books on loan. Return them before deleting.');
      run('DELETE FROM members WHERE id = ?', id);
      return { ok: true };
    }],

    // Loans — borrow rules from borrowBook: member must exist, book must be available.
    ['GET', /^\/api\/loans$/, (_, q) => {
      const where = ["(b.title LIKE ?1 ESCAPE '\\' OR m.name LIKE ?1 ESCAPE '\\' OR CAST(l.member_id AS TEXT) LIKE ?1 ESCAPE '\\')"];
      if (q.get('status') === 'active') where.push('l.returned_at IS NULL');
      if (q.get('status') === 'returned') where.push('l.returned_at IS NOT NULL');
      return all(`${LOAN_SELECT} WHERE ${where.join(' AND ')} ORDER BY coalesce(l.returned_at, l.borrowed_at) DESC, l.id DESC`,
        likeTerm(q.get('q')));
    }],
    ['POST', /^\/api\/loans$/, (_, __, body) => {
      const mid = memberId(body.member_id);
      getMember(mid);
      const bid = Number(body.book_id);
      if (!Number.isInteger(bid)) fail(400, 'Choose a book.');
      if (getBook(bid).loan_id) fail(409, 'That book is already on loan.');
      try {
        const { lastInsertRowid } = run('INSERT INTO loans (book_id, member_id) VALUES (?, ?)', bid, mid);
        return [201, one(`${LOAN_SELECT} WHERE l.id = ?`, lastInsertRowid)];
      } catch (e) {
        if (/UNIQUE/.test(e.message)) fail(409, 'That book is already on loan.'); // lost a race
        throw e;
      }
    }],
    ['POST', /^\/api\/loans\/(\d+)\/return$/, ([id]) => {
      const loan = one('SELECT * FROM loans WHERE id = ?', id) || fail(404, 'Loan not found.');
      if (loan.returned_at) fail(409, 'This book was already returned.');
      run("UPDATE loans SET returned_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?", id);
      return one(`${LOAN_SELECT} WHERE l.id = ?`, id);
    }],
  ];

  return async (req, url) => {
    let params;
    const match = routes.find(([m, re]) => (params = url.pathname.match(re)) && m === req.method);
    if (!match) fail(routes.some(([, re]) => re.test(url.pathname)) ? 405 : 404, 'Not found.');
    const body = ['POST', 'PUT'].includes(req.method) ? await readJson(req) : {};
    const out = match[2] && match[2](params.slice(1), url.searchParams, body);
    return Array.isArray(out) && typeof out[0] === 'number' ? out : [200, out];
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', c => {
      raw += c;
      if (raw.length > 10_000) { reject(new HttpError(413, 'Request too large.')); req.destroy(); }
    });
    req.on('end', () => {
      try {
        const v = raw ? JSON.parse(raw) : {};
        v && typeof v === 'object' && !Array.isArray(v) ? resolve(v) : reject(new HttpError(400, 'Expected a JSON object.'));
      } catch { reject(new HttpError(400, 'Invalid JSON.')); }
    });
    req.on('error', reject);
  });
}

// ---------- static files ----------
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(url, res) {
  const file = path.normalize(path.join(PUBLIC, decodeURIComponent(({ '/': '/index.html', '/app': '/app.html' })[url.pathname] || url.pathname)));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': (TYPES[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' }).end(data);
  });
}

function createServer(dbFile, legacyDir) {
  const db = open(dbFile, legacyDir);
  const handle = api(db);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return serveStatic(url, res);
    let status, payload;
    try {
      [status, payload] = await handle(req, url);
    } catch (e) {
      status = e instanceof HttpError ? e.status : 500;
      payload = { error: status === 500 ? 'Something went wrong on the server.' : e.message };
      if (status === 500) console.error(e);
    }
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
       .end(JSON.stringify(payload));
  });
  server.on('close', () => db.close());
  return server;
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer(path.join(__dirname, 'librix.db'), path.join(__dirname, '..'))
    .listen(port, () => console.log(`LIBRIX running at http://localhost:${port}`));
}
