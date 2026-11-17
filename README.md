# LIBRIX

A library management system that began as a C++ console program and grew into a web app.

- **Live site:** https://MiyukiGit.github.io/librix/
- **C++ original:** [`librarySystem.cpp`](librarySystem.cpp)
- **Web app source:** [`librix/`](librix/)
- **Published static site:** [`docs/`](docs/) — a copy of `librix/public`

This is a **project** Pages site. Your existing user site in the separate
`MiyukiGit/MiyukiGit.github.io` repository is not touched by this project.

## Run the web app locally

Requires Node.js **22.13 or newer** (`node --version`).

```bash
cd librix
node --test test.js   # or: npm test
node server.js        # or: npm start
```

Open http://localhost:3000 for the landing page and http://localhost:3000/app for the app.
The Node server uses SQLite (`node:sqlite`, no npm packages) and imports records from the
legacy `.txt` files on first run.

## Run the C++ program

```bash
g++ -std=c++17 -o library librarySystem.cpp
./library
```

On Windows, `library.exe` can be run directly, but it is intentionally not committed here.

## How the GitHub Pages site works

GitHub Pages serves static files only, so the Node/SQLite server cannot run there.
`librix/public/api.js` detects this automatically and switches to a browser-only
`localStorage` backend with the same validation and lending rules. Changes you make on
the live site are saved **in your own browser only** — they are not uploaded anywhere.

The first-run demo catalogue contains the **27 titles supplied for the demo** — novels,
manga, manhwa and comics — with anonymized demo members. The full list is rendered directly
on the landing page (`#shelf`) as well as in the app. Real names and phone numbers from the
original `.txt` files and database are excluded from this repository. Edit `SEED.books` in
`librix/public/api.js` (and copy it to `docs/api.js`) to change the starting catalogue.

## Keeping `docs/` in sync

Pages publishes the `docs/` folder. After editing anything in `librix/public/`, copy it over:

```powershell
Copy-Item librix/public/* docs/ -Recurse -Force
```

Then commit and push — Pages will rebuild automatically.
