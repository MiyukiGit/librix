# LIBRIX

Web version of the C++ library system in `../librarySystem.cpp`.
Node.js + built-in SQLite (`node:sqlite`) backend, plain HTML/CSS/JS frontend. **No npm packages.**

## Run it

Requires Node.js **22.13 or newer** (`node --version`).

```bash
cd LibrarySystem/librix
npm start
```

Open http://localhost:3000 for the landing page; the app itself is at http://localhost:3000/app. Use `PORT=4000 npm start` for another port.

On first start, LIBRIX creates `librix.db` and imports the records from the C++ program's
`../*.txt` files (books, authors, borrow status, members). The `.txt` files are only read, never changed.
To start over with an empty or re-imported database, stop the server and delete `librix.db`.

On GitHub Pages there is no server, so `public/api.js` seeds the browser with 32 famous titles
(novels, non-fiction, manga, manhwa and comics) and anonymized demo members. Edit `SEED.books`
there to change the starting catalogue for both the landing page and the app.

Run the tests with `npm test`.

---

## Phase 1 — Analysis of the C++ program

**Data structures**

| C++ | Fields |
|---|---|
| `struct Book` | `title`, `author`, `isBorrowed`, `borrowedByID` |
| `struct Member` | `name`, `phoneNum` (int), `ID` (int, typed by the user) |

**Storage.** One text file per field, matched up by line number:
`booklog.txt` / `authorslog.txt` / `borrowlog.txt` (`"1 100"` = borrowed by member 100) for books, and
`namelog.txt` / `IDlog.txt` / `phoneNumlog.txt` for members. Everything is loaded into vectors at start-up.

**Menu features (main loop)**

1. Add book: title and author, both required.
2. Add member: name, ID, phone.
3. Display books, showing "Available" or "Borrowed by ID".
4. Display members.
5. Search: case-insensitive substring match on title **or** author.
6. Edit a book's title or author.
7. Edit a member's name, ID or phone.
8. Borrow: the member ID must exist; only available books are listed; borrowing an already-borrowed book is rejected.
9. Exit.

**Problems found in the original**

- Phone is read as `double` but stored as `int`. Leading zeros are lost, and long numbers are saved as `1.95659e+08`, which loses digits.
- Book and member edits index the vector without a range check, so out-of-range input crashes the program.
- Member IDs can be duplicated, and the prompt suggests IDs (100/101/102) that are never validated.
- There is no way to return a book, so a borrowed book stays borrowed forever.
- Parallel text files drift out of sync if the program quits midway through an entry.

## Phase 2 — Feature mapping

| C++ function | LIBRIX |
|---|---|
| `bookFunction` | Books → **Add book** (title and author required) |
| `displayBooks` | Books table with Available / On loan status and the borrower |
| `searchBooksAuthor` | Books search box (same rule: case-insensitive, title or author) and an availability filter |
| `editBooksAuthor` | Books → edit icon (title and author in one form) |
| `memberFunction` | Members → **Add member** (ID unique and validated, phone stored as text) |
| `displayMembers` | Members table, including books on loan and total loans |
| `editMembers` | Members → edit icon. Changing an ID moves that member's loans to the new ID (`ON UPDATE CASCADE`). |
| `borrowBook` | **Issue book** dialog. The member must exist, and only available books can be chosen. |
| `load*FromFile` | One-time import of the `.txt` files into SQLite |
| *(missing)* | **Return book**: closes the loan and makes the book available again |
| *(missing)* | **Delete** book or member. Blocked while a loan is active. |
| *(missing)* | **Circulation** page: borrow and return history with Active / Returned / All tabs |
| *(missing)* | **Dashboard**: totals, availability, books on loan, recent activity |

Not added, because the C++ program has no such data: ISBN, categories, due dates and fines.
Each one is a new column plus one form field if needed later.

## Phase 3 — Architecture

```
librix/
  server.js        HTTP server: JSON API, validation, static files
  db.js            SQLite schema and one-time import of the C++ .txt files
  test.js          API tests (node:test)
  public/
    index.html     landing page (+ landing.css, landing.js)
    app.html       app shell: sidebar, top bar, dialog
    logo.png       LIBRIX wordmark (transparent)
    cover-hp.jpg, cover-tbate.jpg   hero book covers (Harry Potter, The Beginning After The End)
    styles.css     design system and responsive layout
    app.js         hash-routed single-page app
```

**Schema (SQLite).** Business rules are enforced by the database where possible:

```sql
books   (id PK, title NOT NULL, author NOT NULL, created_at)
members (id PK  -- the member ID from the C++ app,
         name NOT NULL, phone TEXT, created_at)
loans   (id PK, book_id → books, member_id → members ON UPDATE CASCADE,
         borrowed_at, returned_at NULL)
UNIQUE INDEX one_active_loan_per_book ON loans(book_id) WHERE returned_at IS NULL
```

The partial unique index makes it impossible to lend the same book twice, even if two requests race.

**API**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/stats` | dashboard numbers, active loans, recent activity |
| GET/POST | `/api/books` | list (`?q=`, `?status=available\|borrowed`) / create |
| PUT/DELETE | `/api/books/:id` | edit / delete (409 if on loan) |
| GET/POST | `/api/members` | list (`?q=`) / register (409 on duplicate ID) |
| PUT/DELETE | `/api/members/:id` | edit / delete (409 if member has loans out) |
| GET/POST | `/api/loans` | history (`?status=active\|returned`, `?q=`) / borrow |
| POST | `/api/loans/:id/return` | return (409 if already returned) |

Errors come back as `{ "error": "message" }` with 400, 404 or 409 status codes, and the UI shows the message.
