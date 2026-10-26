# Cyber Study UI 🔐

A local web app for studying the **100 Days of Cybersecurity** curriculum. It puts the repo's markdown materials, a progress calendar, a file explorer, and a "next lesson" shortcut in one browser tab.

## Features

- **📅 Progress calendar** — check in/out on any date to log *what* and *when* you studied, with per-day notes and duration.
- **📖 Markdown viewer** — read the curriculum READMEs (and `.py` scripts) right in the browser.
- **📚 File explorer** — browse the repo, click any markdown or text file to read it.
- **▶ Quick start** — a header shortcut that always points at the next unlogged lesson (auto-detected from your progress).

## Run it

```bash
cd cyber-ui
npm start        # no dependencies, uses Node's built-in http server
```

Then open **http://localhost:8787**.

Requires Node.js (v18+).

## How it works

- `server.js` — zero-dependency HTTP server. Serves the UI, lists the repo's files (`/api/tree`), reads files (`/api/file`), and saves progress (`/api/progress`).
- `public/` — the front-end (plain HTML/CSS/JS, no build step).
  - `app.js` — UI logic (calendar, check-ins, quick start).
  - `md.js` — small self-contained Markdown→HTML renderer (so no npm/CDN needed).
  - `lessons.json` — the day→topic index used for quick start and the calendar.

## Data & safety

- **Progress** is stored in `progress.json` at the repo root, so it survives restarts and you can back it up or (optionally) commit it. It is listed in `.gitignore` by default — remove that line if you want it tracked.
- **Read-only elsewhere**: the server never writes anything but `progress.json`, and it refuses to read files outside the repo root (so "Browse → file → content" can't escape this folder).
- This is a **local, single-user** tool. It has no authentication — don't expose it to a network you don't trust.

## Notes

- The curriculum itself has day gaps (e.g. Days 50 and 65–94 aren't defined in the phase READMEs). `lessons.json` mirrors exactly what the repo contains — "Start Day N" skips to the next defined lesson.