'use strict';
// Shared API client. Talks to the Node/SQLite server when one is running (npm start).
// On static hosting (GitHub Pages) there is no server, so the same API is served from
// localStorage, with the same validation and lending rules as server.js.
(() => {
  const KEY = 'librix-data-v1';
  const SEED = { // anonymized demo data, used as the first-run state in browser mode
    books: [['Harry Potter', 'J.K Rowling'], ['The Beginning After The End', 'TurtleMe'], ['Solo Levelling', 'Chugong'],
      ['The Fragrant Flower Blooms with Dignity', 'Saka Mikami'], ['The Angel Next Door Spoils Me Rotten', 'Saekisan'], ['Sample Book', 'Sample Author']],
    members: [[100, 'Reader One', '0100000001'], [101, 'Reader Two', '0100000002'], [102, 'Reader Three', '0100000003']],
    loans: [[2, 100]],
  };

  let mode; // Promise<'server' | 'local'>
  const detect = () => mode ??= fetch('api/stats', { cache: 'no-store' })
    .then(r => (r.headers.get('content-type') || '').includes('application/json') ? 'server' : 'local')
    .catch(() => 'local');

  async function api(method, url, body) {
    if (await detect() === 'local') return local(method, url, body);
    let res;
    try {
      res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
    } catch {
      throw new Error('Cannot reach the LIBRIX server. Is it running?');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
    return data;
  }
  api.mode = detect;

  // ---------- browser (localStorage) backend ----------
  const now = () => new Date().toISOString().replace('T', ' ').slice(0, 23);
  const fail = msg => { throw new Error(msg); };

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && Array.isArray(d.books)) return d;
    } catch {}
    const t = now();
    const d = {
      seq: { book: SEED.books.length, loan: SEED.loans.length },
      books: SEED.books.map(([title, author], i) => ({ id: i + 1, title, author, created_at: t })),
      members: SEED.members.map(([id, name, phone]) => ({ id, name, phone, created_at: t })),
      loans: SEED.loans.map(([book_id, member_id], i) => ({ id: i + 1, book_id, member_id, borrowed_at: t, returned_at: null })),
    };
    save(d);
    return d;
  }
  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); }
    catch { fail('Could not save: browser storage is full or disabled.'); }
  }

  // same rules as server.js
  function text(v, field, max) {
    if (typeof v !== 'string' || !v.trim()) fail(`${field} is required.`);
    v = v.trim().replace(/\s+/g, ' ');
    if (v.length > max) fail(`${field} must be at most ${max} characters.`);
    return v;
  }
  function memberId(v) {
    const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v;
    if (!Number.isInteger(n) || n < 1 || n > 999999999) fail('Member ID must be a whole number between 1 and 999999999.');
    return n;
  }
  function phone(v) {
    const p = typeof v === 'string' ? v.trim() : '';
    if (!/^\+?[0-9][0-9 -]{5,18}[0-9]$/.test(p)) fail('Phone must be 7–20 digits (spaces, dashes and a leading + allowed).');
    return p;
  }
  const has = (hay, q) => String(hay).toLowerCase().includes(q);

  function local(method, url, body = {}) {
    const u = new URL(url, location.href);
    const path = u.pathname.slice(u.pathname.indexOf('api/'));
    const q = (u.searchParams.get('q') || '').trim().toLowerCase();
    const status = u.searchParams.get('status');
    const d = load();

    const member = id => d.members.find(m => m.id === Number(id));
    const activeLoan = bookId => d.loans.find(l => l.book_id === bookId && !l.returned_at);
    const bookRow = b => {
      const l = activeLoan(b.id);
      return { ...b, loan_id: l?.id ?? null, borrowed_by: l?.member_id ?? null, borrowed_by_name: l ? member(l.member_id).name : null, borrowed_at: l?.borrowed_at ?? null };
    };
    const loanRow = l => {
      const b = d.books.find(x => x.id === l.book_id);
      return { ...l, title: b.title, author: b.author, member_name: member(l.member_id).name };
    };
    const getBook = id => d.books.find(b => b.id === Number(id)) || fail('Book not found.');
    const getMember = id => member(id) || fail(`Member ID ${id} not found.`);
    const route = (m, re) => method === m && u && (route.p = path.match(re));

    if (route('GET', /^api\/stats$/)) {
      const borrowed = d.loans.filter(l => !l.returned_at).length;
      const events = d.loans.flatMap(l => {
        const r = loanRow(l);
        const e = [{ type: 'borrow', at: l.borrowed_at, id: l.id, title: r.title, member_name: r.member_name, member_id: l.member_id }];
        if (l.returned_at) e.push({ ...e[0], type: 'return', at: l.returned_at });
        return e;
      });
      return {
        books: d.books.length, borrowed, members: d.members.length, loans_total: d.loans.length, available: d.books.length - borrowed,
        active: d.loans.filter(l => !l.returned_at).map(loanRow).sort((a, b) => b.borrowed_at.localeCompare(a.borrowed_at) || b.id - a.id).slice(0, 6),
        activity: events.sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id || b.type.localeCompare(a.type)).slice(0, 8),
      };
    }

    if (route('GET', /^api\/books$/)) return d.books.map(bookRow)
      .filter(b => (has(b.title, q) || has(b.author, q)) && (status === 'available' ? !b.loan_id : status === 'borrowed' ? b.loan_id : true));
    if (route('POST', /^api\/books$/)) {
      const b = { id: ++d.seq.book, title: text(body.title, 'Title', 200), author: text(body.author, 'Author', 120), created_at: now() };
      d.books.push(b); save(d); return bookRow(b);
    }
    if (route('PUT', /^api\/books\/(\d+)$/)) {
      const b = getBook(route.p[1]);
      const title = text(body.title, 'Title', 200), author = text(body.author, 'Author', 120);
      Object.assign(b, { title, author }); save(d); return bookRow(b);
    }
    if (route('DELETE', /^api\/books\/(\d+)$/)) {
      const b = getBook(route.p[1]);
      if (activeLoan(b.id)) fail('This book is on loan. Return it before deleting.');
      d.books = d.books.filter(x => x !== b); d.loans = d.loans.filter(l => l.book_id !== b.id);
      save(d); return { ok: true };
    }

    if (route('GET', /^api\/members$/)) return d.members
      .map(m => ({ ...m, active_loans: d.loans.filter(l => l.member_id === m.id && !l.returned_at).length, total_loans: d.loans.filter(l => l.member_id === m.id).length }))
      .filter(m => has(m.name, q) || has(m.id, q) || has(m.phone, q))
      .sort((a, b) => a.id - b.id);
    if (route('POST', /^api\/members$/)) {
      const id = memberId(body.id), name = text(body.name, 'Name', 120), ph = phone(body.phone);
      if (member(id)) fail(`Member ID ${id} is already taken.`);
      const m = { id, name, phone: ph, created_at: now() };
      d.members.push(m); save(d); return m;
    }
    if (route('PUT', /^api\/members\/(\d+)$/)) {
      const m = getMember(route.p[1]), oldId = m.id;
      const id = memberId(body.id ?? oldId), name = text(body.name, 'Name', 120), ph = phone(body.phone);
      if (id !== oldId && member(id)) fail(`Member ID ${id} is already taken.`);
      Object.assign(m, { id, name, phone: ph });
      d.loans.forEach(l => { if (l.member_id === oldId) l.member_id = id; }); // ON UPDATE CASCADE
      save(d); return m;
    }
    if (route('DELETE', /^api\/members\/(\d+)$/)) {
      const m = getMember(route.p[1]);
      if (d.loans.some(l => l.member_id === m.id && !l.returned_at)) fail('This member still has books on loan. Return them before deleting.');
      d.members = d.members.filter(x => x !== m); d.loans = d.loans.filter(l => l.member_id !== m.id);
      save(d); return { ok: true };
    }

    if (route('GET', /^api\/loans$/)) return d.loans.map(loanRow)
      .filter(l => (has(l.title, q) || has(l.member_name, q) || has(l.member_id, q))
        && (status === 'active' ? !l.returned_at : status === 'returned' ? l.returned_at : true))
      .sort((a, b) => (b.returned_at || b.borrowed_at).localeCompare(a.returned_at || a.borrowed_at) || b.id - a.id);
    if (route('POST', /^api\/loans$/)) {
      const mid = memberId(body.member_id);
      getMember(mid);
      const bid = Number(body.book_id);
      if (!Number.isInteger(bid)) fail('Choose a book.');
      if (activeLoan(getBook(bid).id)) fail('That book is already on loan.');
      const l = { id: ++d.seq.loan, book_id: bid, member_id: mid, borrowed_at: now(), returned_at: null };
      d.loans.push(l); save(d); return loanRow(l);
    }
    if (route('POST', /^api\/loans\/(\d+)\/return$/)) {
      const l = d.loans.find(x => x.id === Number(route.p[1])) || fail('Loan not found.');
      if (l.returned_at) fail('This book was already returned.');
      l.returned_at = now(); save(d); return loanRow(l);
    }
    fail('Not found.');
  }

  window.api = api;
})();
