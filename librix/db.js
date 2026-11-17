'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = `
  CREATE TABLE books (
    id         INTEGER PRIMARY KEY,
    title      TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
    author     TEXT NOT NULL CHECK (length(trim(author)) BETWEEN 1 AND 120),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE members (
    id         INTEGER PRIMARY KEY CHECK (id > 0),
    name       TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
    phone      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  -- ponytail: deleting a book/member also deletes its loan history; add snapshot columns if history must outlive records.
  CREATE TABLE loans (
    id          INTEGER PRIMARY KEY,
    book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    member_id   INTEGER NOT NULL REFERENCES members(id) ON UPDATE CASCADE ON DELETE CASCADE,
    borrowed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    returned_at TEXT
  );
  CREATE UNIQUE INDEX one_active_loan_per_book ON loans(book_id) WHERE returned_at IS NULL;
  CREATE INDEX loans_member ON loans(member_id);
`;

// Opens (and on first run creates) the database. legacyDir: folder holding the C++ program's .txt files.
function open(file, legacyDir) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  if (db.prepare('PRAGMA user_version').get().user_version === 0) {
    db.exec('BEGIN');
    try {
      db.exec(SCHEMA);
      if (legacyDir) importLegacy(db, legacyDir);
      db.exec('PRAGMA user_version = 1');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}

// Mirrors loadBooksFromFile / loadMembersFromFile: parallel files matched by line number.
function importLegacy(db, dir) {
  const lines = f => {
    try { return fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).map(s => s.trim()); }
    catch { return []; }
  };

  const [names, ids, phones] = ['namelog.txt', 'IDlog.txt', 'phoneNumlog.txt'].map(lines);
  const addMember = db.prepare('INSERT OR IGNORE INTO members (id, name, phone) VALUES (?, ?, ?)');
  for (let i = 0; i < names.length; i++) {
    const id = Number(ids[i]);
    if (!names[i] || !Number.isInteger(id) || id <= 0) continue;
    // C++ kept phones as int/double: leading zeros are gone and "1.95659e+08" already lost digits.
    const n = Number(phones[i]);
    addMember.run(id, names[i], phones[i] && Number.isFinite(n) ? String(Math.round(n)) : '');
  }

  const [titles, authors, borrows] = ['booklog.txt', 'authorslog.txt', 'borrowlog.txt'].map(lines);
  const addBook = db.prepare('INSERT INTO books (title, author) VALUES (?, ?)');
  const addLoan = db.prepare('INSERT INTO loans (book_id, member_id) SELECT ?, id FROM members WHERE id = ?');
  for (let i = 0; i < Math.min(titles.length, authors.length); i++) {
    if (!titles[i] || !authors[i]) continue;
    const { lastInsertRowid } = addBook.run(titles[i], authors[i]);
    const [flag, by] = (borrows[i] || '').split(/\s+/).map(Number);
    if (flag === 1) addLoan.run(lastInsertRowid, by);
  }
}

module.exports = { open };
