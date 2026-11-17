'use strict';

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const view = $('#view');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = name => `<svg class="i"><use href="#i-${name}"/></svg>`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// api() comes from api.js (server or browser-storage backend)

// DB stores UTC "YYYY-MM-DD HH:MM:SS(.sss)"
const toDate = s => new Date(s.replace(' ', 'T') + 'Z');
const fmtDate = s => s ? toDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtTime = s => s ? toDate(s).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
function ago(s) {
  const sec = (Date.now() - toDate(s)) / 1000;
  if (sec < 60) return 'just now';
  const units = [[60, 'minute'], [24, 'hour'], [30, 'day'], [12, 'month'], [Infinity, 'year']];
  let v = sec / 60;
  for (const [step, unit] of units) {
    if (v < step) return `${plural(Math.floor(v), unit)} ago`;
    v /= step;
  }
}
const daysOut = s => Math.max(0, Math.floor((Date.now() - toDate(s)) / 864e5));

// Book "cover": stable muted colour from the title.
const COVERS = ['#1d1e19', '#97341a', '#56594a', '#7a2a14', '#3a3b33', '#8b6a3e', '#45473b', '#6b2b1a'];
function thumb(title) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="thumb" style="background:${COVERS[h % COVERS.length]}" aria-hidden="true">${esc(title.trim()[0]?.toUpperCase())}</span>`;
}
const initials = name => esc(name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase());
const statusBadge = b => b.loan_id ? '<span class="badge warn">On loan</span>' : '<span class="badge ok">Available</span>';

function toast(msg, error = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' error' : '');
  el.innerHTML = icon(error ? 'x' : 'check') + `<span>${esc(msg)}</span>`;
  $('#toasts').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, error ? 4500 : 2600);
}

function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ---------- modal ----------
const modal = $('#modal');
const modalForm = $('#modal-form');
let onSubmit = null;

function openModal({ title, body, submit = 'Save', danger = false, handler }) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = body;
  $('#modal-error').hidden = true;
  const btn = $('#modal-submit');
  btn.textContent = submit;
  btn.className = 'btn ' + (danger ? 'danger' : 'primary');
  btn.disabled = false;
  btn.hidden = !handler;
  onSubmit = handler;
  modal.showModal();
  modal.querySelector('input:not([type=hidden]), select')?.focus();
}
const closeModal = () => modal.close();

modalForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!onSubmit) return;
  const btn = $('#modal-submit');
  btn.disabled = true;
  try {
    const msg = await onSubmit(Object.fromEntries(new FormData(modalForm)));
    closeModal();
    if (msg) toast(msg);
    render();
  } catch (err) {
    const el = $('#modal-error');
    el.textContent = err.message;
    el.hidden = false;
  } finally {
    btn.disabled = false;
  }
});
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); }); // click on backdrop

const field = (label, name, value = '', attrs = '', hint = '') => `
  <label class="field"><span class="label">${label}</span>
    <input name="${name}" value="${esc(value)}" ${attrs}>
    ${hint ? `<span class="hint">${hint}</span>` : ''}
  </label>`;

// ---------- forms ----------
function bookForm(book) {
  openModal({
    title: book ? 'Edit book' : 'Add book',
    submit: book ? 'Save changes' : 'Add book',
    body: field('Title', 'title', book?.title, 'required maxlength="200" autocomplete="off"')
        + field('Author', 'author', book?.author, 'required maxlength="120" autocomplete="off"'),
    handler: async d => {
      if (book) { await api('PUT', `api/books/${book.id}`, d); return 'Book updated.'; }
      const b = await api('POST', 'api/books', d);
      return `“${b.title}” added to the catalogue.`;
    },
  });
}

function memberForm(m) {
  openModal({
    title: m ? 'Edit member' : 'Add member',
    submit: m ? 'Save changes' : 'Add member',
    body: field('Full name', 'name', m?.name, 'required maxlength="120" autocomplete="off"')
        + field('Member ID', 'id', m?.id ?? state.nextId, 'required inputmode="numeric" pattern="[0-9]{1,9}"',
            m ? 'Changing the ID also updates this member’s loans.' : 'Must be unique. Members use this ID to borrow books.')
        + field('Phone number', 'phone', m?.phone, 'required type="tel" maxlength="22" placeholder="e.g. 012-345 6789"'),
    handler: async d => {
      if (m) { await api('PUT', `api/members/${m.id}`, d); return 'Member updated.'; }
      const r = await api('POST', 'api/members', d);
      return `${r.name} registered with ID ${r.id}.`;
    },
  });
}

async function issueForm(preset = {}) {
  let books, members;
  try {
    [books, members] = await Promise.all([api('GET', 'api/books?status=available'), api('GET', 'api/members')]);
  } catch (e) { return toast(e.message, true); }
  if (!members.length || !books.length) {
    return openModal({
      title: 'Issue book',
      body: `<p class="notice">${!members.length ? 'Register a member first.' : 'No books are available to borrow right now.'}</p>`,
    });
  }
  const opt = (v, label, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
  openModal({
    title: 'Issue book',
    submit: 'Issue book',
    body: `
      <label class="field"><span class="label">Member</span>
        <select name="member_id" required>
          <option value="">Select a member…</option>
          ${members.map(m => opt(m.id, `${m.name} · ID ${m.id}`, m.id === preset.member_id)).join('')}
        </select></label>
      <label class="field"><span class="label">Book</span>
        <select name="book_id" required>
          <option value="">Select an available book…</option>
          ${books.map(b => opt(b.id, `${b.title} — ${b.author}`, b.id === preset.book_id)).join('')}
        </select>
        <span class="hint">${plural(books.length, 'book')} available</span></label>`,
    handler: async d => {
      const l = await api('POST', 'api/loans', d);
      return `“${l.title}” issued to ${l.member_name}.`;
    },
  });
}

function confirmModal({ title, text, submit, danger, run }) {
  openModal({ title, submit, danger, body: `<p class="confirm-text">${text}</p>`, handler: run });
}
const returnLoan = (id, title, who) => confirmModal({
  title: 'Return book', submit: 'Mark as returned',
  text: `Return <strong>${esc(title)}</strong> from <strong>${esc(who)}</strong>? It becomes available again.`,
  run: async () => { await api('POST', `api/loans/${id}/return`); return `“${title}” returned.`; },
});

// ---------- pages ----------
const state = { books: { q: '', status: '' }, members: { q: '' }, loans: { q: '', status: 'active' }, nextId: '' };
const cache = { books: [], members: [] }; // last rows rendered, for edit/delete lookups

const searchBox = (ph, value) => `
  <label class="search">${icon('search')}
    <input type="search" id="q" placeholder="${ph}" value="${esc(value)}" autocomplete="off" aria-label="${ph}"><kbd>/</kbd>
  </label>`;
const seg = (opts, cur, key) => `<div class="seg" role="group">${opts.map(([v, l]) =>
  `<button type="button" data-seg="${key}" data-val="${v}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`;
const emptyRow = (cols, title, sub) => `<tr class="empty"><td colspan="${cols}"><strong>${title}</strong><span>${sub}</span></td></tr>`;

const pages = {
  dashboard: {
    title: 'Dashboard',
    async shell() {
      const s = await api('GET', 'api/stats');
      const pct = s.books ? Math.round(s.available / s.books * 100) : 0;
      const stat = (label, ic, value, sub) => `
        <div class="panel stat"><span class="stat-label">${icon(ic)}${label}</span>
        <span class="stat-value">${value}</span><span class="stat-sub">${sub}</span></div>`;
      return `
        <div class="page-head"><div><h1>Dashboard</h1><p>Overview of the library today.</p></div></div>
        <section class="stats">
          ${stat('Total books', 'book', s.books, 'in the catalogue')}
          ${stat('Available', 'check', s.available, `<span class="meter"><span style="width:${pct}%"></span></span>${pct}% of catalogue`)}
          ${stat('On loan', 'out', s.borrowed, plural(s.loans_total, 'loan') + ' all time')}
          ${stat('Members', 'users', s.members, 'registered')}
        </section>
        <div class="grid-2">
          <section class="panel">
            <div class="panel-head"><h2>Currently on loan</h2><a href="#/circulation">View all</a></div>
            ${s.active.length ? `<ul class="list">${s.active.map(l => `
              <li>${thumb(l.title)}
                <div class="grow"><div class="strong">${esc(l.title)}</div>
                  <div class="sub">${esc(l.member_name)} · ID ${l.member_id} · ${plural(daysOut(l.borrowed_at), 'day')} out</div></div>
                <button class="btn sm" data-return="${l.id}" data-title="${esc(l.title)}" data-who="${esc(l.member_name)}">${icon('return')}Return</button>
              </li>`).join('')}</ul>`
            : '<div class="empty-block"><strong>Nothing on loan</strong><span>Every book is on the shelf.</span></div>'}
          </section>
          <section class="panel">
            <div class="panel-head"><h2>Recent activity</h2></div>
            ${s.activity.length ? `<ul class="list activity">${s.activity.map(a => `
              <li><span class="act ${a.type}">${icon(a.type === 'borrow' ? 'out' : 'return')}</span>
                <div class="grow"><div><span class="strong">${esc(a.member_name)}</span> ${a.type === 'borrow' ? 'borrowed' : 'returned'} ${esc(a.title)}</div>
                  <div class="sub">${ago(a.at)}</div></div></li>`).join('')}</ul>`
            : '<div class="empty-block"><strong>No activity yet</strong><span>Borrows and returns appear here.</span></div>'}
          </section>
        </div>`;
    },
  },

  books: {
    title: 'Books',
    shell: () => `
      <div class="page-head"><div><h1>Books</h1><p>Manage the library’s catalogue.</p></div>
        <div class="head-actions"><button class="btn primary" data-action="add-book">${icon('plus')}Add book</button></div></div>
      <section class="panel">
        <div class="toolbar">${searchBox('Search title or author…', state.books.q)}
          ${seg([['', 'All'], ['available', 'Available'], ['borrowed', 'On loan']], state.books.status, 'books')}
          <span class="count" id="count"></span></div>
        <table class="table"><thead><tr><th>No.</th><th>Title</th><th>Author</th><th>Status</th><th>Borrowed by</th><th></th></tr></thead>
        <tbody id="rows"></tbody></table>
      </section>`,
    async rows() {
      const { q, status } = state.books;
      const rows = cache.books = await api('GET', `api/books?q=${encodeURIComponent(q)}&status=${status}`);
      $('#count').textContent = plural(rows.length, 'book');
      return rows.length ? rows.map(b => `
        <tr>
          <td class="mono" data-label="No.">${String(b.id).padStart(4, '0')}</td>
          <td class="primary-cell"><div class="title-cell">${thumb(b.title)}<span class="strong">${esc(b.title)}</span></div></td>
          <td data-label="Author" class="muted">${esc(b.author)}</td>
          <td data-label="Status">${statusBadge(b)}</td>
          <td data-label="Borrowed by">${b.loan_id ? `${esc(b.borrowed_by_name)} <span class="sub">· ID ${b.borrowed_by}</span>` : '<span class="sub">—</span>'}</td>
          <td class="row-actions">
            ${b.loan_id
              ? `<button class="btn sm" data-return="${b.loan_id}" data-title="${esc(b.title)}" data-who="${esc(b.borrowed_by_name)}">${icon('return')}Return</button>`
              : `<button class="btn sm" data-issue-book="${b.id}">${icon('out')}Issue</button>`}
            <button class="icon-btn" data-edit-book="${b.id}" aria-label="Edit ${esc(b.title)}">${icon('edit')}</button>
            <button class="icon-btn danger" data-del-book="${b.id}" aria-label="Delete ${esc(b.title)}">${icon('trash')}</button>
          </td>
        </tr>`).join('')
        : (q || status ? emptyRow(6, 'No matching books', 'Try another search or filter.')
                       : emptyRow(6, 'No books yet', 'Add your first book to start the catalogue.'));
    },
  },

  members: {
    title: 'Members',
    shell: () => `
      <div class="page-head"><div><h1>Members</h1><p>Registered library members.</p></div>
        <div class="head-actions"><button class="btn primary" data-action="add-member">${icon('plus')}Add member</button></div></div>
      <section class="panel">
        <div class="toolbar">${searchBox('Search name, ID or phone…', state.members.q)}<span class="count" id="count"></span></div>
        <table class="table"><thead><tr><th>Member</th><th>Member ID</th><th>Phone</th><th class="num">On loan</th><th class="num">Total loans</th><th>Joined</th><th></th></tr></thead>
        <tbody id="rows"></tbody></table>
      </section>`,
    async rows() {
      const rows = cache.members = await api('GET', `api/members?q=${encodeURIComponent(state.members.q)}`);
      state.nextId = state.members.q ? state.nextId : rows.reduce((m, r) => Math.max(m, r.id), 99) + 1;
      $('#count').textContent = plural(rows.length, 'member');
      return rows.length ? rows.map(m => `
        <tr>
          <td class="primary-cell"><div class="title-cell"><span class="avatar">${initials(m.name)}</span><span class="strong">${esc(m.name)}</span></div></td>
          <td data-label="Member ID" class="mono">${m.id}</td>
          <td data-label="Phone" class="muted">${esc(m.phone) || '—'}</td>
          <td data-label="On loan" class="num">${m.active_loans ? `<span class="badge warn">${m.active_loans}</span>` : '<span class="sub">0</span>'}</td>
          <td data-label="Total loans" class="num">${m.total_loans}</td>
          <td data-label="Joined" class="muted">${fmtDate(m.created_at)}</td>
          <td class="row-actions">
            <button class="btn sm" data-issue-member="${m.id}">${icon('out')}Issue</button>
            <button class="icon-btn" data-edit-member="${m.id}" aria-label="Edit ${esc(m.name)}">${icon('edit')}</button>
            <button class="icon-btn danger" data-del-member="${m.id}" aria-label="Delete ${esc(m.name)}">${icon('trash')}</button>
          </td>
        </tr>`).join('')
        : (state.members.q ? emptyRow(7, 'No matching members', 'Try another name, ID or phone number.')
                           : emptyRow(7, 'No members yet', 'Register a member so they can borrow books.'));
    },
  },

  circulation: {
    title: 'Loans & returns',
    shell: () => `
      <div class="page-head"><div><h1>Loans &amp; returns</h1><p>Every borrow and return, newest first.</p></div></div>
      <section class="panel">
        <div class="toolbar">${searchBox('Search book, member or ID…', state.loans.q)}
          ${seg([['active', 'On loan'], ['returned', 'Returned'], ['', 'All']], state.loans.status, 'loans')}
          <span class="count" id="count"></span></div>
        <table class="table"><thead><tr><th>Book</th><th>Member</th><th>Borrowed</th><th>Returned</th><th>Status</th><th></th></tr></thead>
        <tbody id="rows"></tbody></table>
      </section>`,
    async rows() {
      const { q, status } = state.loans;
      const rows = await api('GET', `api/loans?q=${encodeURIComponent(q)}&status=${status}`);
      $('#count').textContent = plural(rows.length, 'record');
      return rows.length ? rows.map(l => `
        <tr>
          <td class="primary-cell"><div class="title-cell">${thumb(l.title)}<div><div class="strong">${esc(l.title)}</div><div class="sub">${esc(l.author)}</div></div></div></td>
          <td data-label="Member">${esc(l.member_name)} <span class="sub">· ID ${l.member_id}</span></td>
          <td data-label="Borrowed">${fmtDate(l.borrowed_at)} <span class="sub">${fmtTime(l.borrowed_at)}</span></td>
          <td data-label="Returned">${l.returned_at ? `${fmtDate(l.returned_at)} <span class="sub">${fmtTime(l.returned_at)}</span>` : '<span class="sub">—</span>'}</td>
          <td data-label="Status">${l.returned_at ? '<span class="badge plain">Returned</span>' : `<span class="badge warn">On loan · ${plural(daysOut(l.borrowed_at), 'day')}</span>`}</td>
          <td class="row-actions">${l.returned_at ? '' : `<button class="btn sm" data-return="${l.id}" data-title="${esc(l.title)}" data-who="${esc(l.member_name)}">${icon('return')}Return</button>`}</td>
        </tr>`).join('')
        : emptyRow(6, status === 'active' ? 'Nothing on loan' : 'No records', q ? 'Try another search.' : 'Issued books show up here.');
    },
  },
};

// ---------- router ----------
let current;
const route = () => {
  const m = location.hash.match(/^#\/(\w+)/);
  return m && pages[m[1]] ? m[1] : 'dashboard';
};

async function render(full = false) {
  const name = route();
  const page = pages[name];
  try {
    if (full || name !== current) {
      current = name;
      document.title = `${page.title} · LIBRIX`;
      $('#crumb').textContent = page.title;
      document.querySelectorAll('.nav a').forEach(a => a.toggleAttribute('aria-current', a.dataset.page === name));
      view.innerHTML = await page.shell();
      view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter');
      if (name === 'dashboard') return;
    } else if (name === 'dashboard') {
      view.innerHTML = await page.shell();
      return;
    }
    $('#rows').innerHTML = await page.rows();
  } catch (e) {
    toast(e.message, true);
    if (!view.innerHTML) view.innerHTML = `<div class="panel empty-block"><strong>Couldn’t load data</strong><span>${esc(e.message)}</span></div>`;
  }
}

window.addEventListener('hashchange', () => { document.body.classList.remove('nav-open'); render(true); });

// ---------- events ----------
const refreshRows = debounce(() => render());
view.addEventListener('input', e => {
  if (e.target.id !== 'q') return;
  const key = { books: 'books', members: 'members', circulation: 'loans' }[current];
  state[key].q = e.target.value;
  refreshRows();
});

document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-action]');
  if (!t) return;
  const d = t.dataset;
  const findBook = id => cache.books.find(b => b.id === Number(id));
  const findMember = id => cache.members.find(m => m.id === Number(id));

  if (d.action === 'close-modal') closeModal();
  else if (d.action === 'toggle-nav') document.body.classList.toggle('nav-open');
  else if (d.action === 'close-nav') document.body.classList.remove('nav-open');
  else if (d.action === 'add-book') bookForm();
  else if (d.action === 'add-member') memberForm();
  else if (d.action === 'issue') issueForm();
  else if (d.seg) {
    state[d.seg].status = d.val;
    t.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === t));
    render();
  }
  else if (d.return) returnLoan(d.return, d.title, d.who);
  else if (d.issueBook) issueForm({ book_id: Number(d.issueBook) });
  else if (d.issueMember) issueForm({ member_id: Number(d.issueMember) });
  else if (d.editBook) bookForm(findBook(d.editBook));
  else if (d.editMember) memberForm(findMember(d.editMember));
  else if (d.delBook) {
    const b = findBook(d.delBook);
    if (b.loan_id) return toast('This book is on loan. Return it before deleting.', true);
    confirmModal({
      title: 'Delete book', submit: 'Delete book', danger: true,
      text: `Delete <strong>${esc(b.title)}</strong> by ${esc(b.author)}? Its loan history is removed too. This can’t be undone.`,
      run: async () => { await api('DELETE', `api/books/${b.id}`); return 'Book deleted.'; },
    });
  }
  else if (d.delMember) {
    const m = findMember(d.delMember);
    if (m.active_loans) return toast(`${m.name} still has ${plural(m.active_loans, 'book')} on loan.`, true);
    confirmModal({
      title: 'Delete member', submit: 'Delete member', danger: true,
      text: `Delete <strong>${esc(m.name)}</strong> (ID ${m.id})? Their loan history is removed too. This can’t be undone.`,
      run: async () => { await api('DELETE', `api/members/${m.id}`); return 'Member deleted.'; },
    });
  }
});

document.addEventListener('keydown', e => {
  if (e.key === '/' && !modal.open && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
    const q = $('#q');
    if (q) { e.preventDefault(); q.focus(); }
  }
});

render(true);

api.mode().then(m => { $('#storage').textContent = m === 'server' ? 'Data saved to SQLite' : 'Data saved in this browser'; });
