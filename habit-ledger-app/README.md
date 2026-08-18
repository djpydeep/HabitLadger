# Habit Ledger

A habit tracker with real accounts (email + password) so your data syncs across
any device or browser you sign into. Ledger-styled UI, unlimited habits,
per-habit streaks, and a 12-week heatmap.

## How it's built

- **Backend:** Node.js + Express + SQLite (`better-sqlite3` — a single local
  file, no external database service to set up)
- **Auth:** passwords hashed with bcrypt, sessions handled with JWTs (30-day
  expiry)
- **Frontend:** one static HTML/CSS/JS file (`public/index.html`), no build
  step, no framework

Each user's habits and completions are stored as a single JSON blob per
account in the `user_data` table — simple, and easy to inspect or back up.

## Run it locally

```bash
npm install
cp .env.example .env
# open .env and set JWT_SECRET to a long random string
npm start
```

Then open `http://localhost:3000`. Create an account, add a few habits, and
you're up and running. The database file `habit-ledger.db` is created
automatically on first run.

## Deploying it

This is a standard Node.js app, so any of these work well:

- **Render / Railway / Fly.io** — connect your GitHub repo, set the
  `JWT_SECRET` environment variable in their dashboard, and deploy. These
  platforms give you a public URL automatically (HTTPS included).
- **A VPS (DigitalOcean, Linode, etc.)** — install Node, copy the project
  over, run `npm install --production`, set environment variables, and run
  the app behind a process manager like `pm2` and a reverse proxy like
  Nginx or Caddy for HTTPS.
- **Your own web host**, if it supports Node.js apps (shared PHP-only
  hosting won't work — you need a host that can run a Node process).

**Important before you deploy:**
1. Set `JWT_SECRET` in your environment to a long random string (never reuse
   the example value). This is what keeps login sessions secure.
2. Serve the site over **HTTPS** — passwords and tokens are sent in
   API requests, so plain HTTP would expose them in transit. Most hosts
   above provide HTTPS automatically; on your own VPS, use Caddy or
   Let's Encrypt with Nginx.
3. The SQLite database is a single file (`habit-ledger.db`). Back it up
   periodically if you're self-hosting — copying that one file is enough
   to restore everything.

## API reference

All data routes require `Authorization: Bearer <token>`, returned from
signup/login.

| Method | Route         | Body                              | Notes                        |
|--------|---------------|------------------------------------|-------------------------------|
| POST   | `/api/signup` | `{ email, password, name }`       | password min 8 characters     |
| POST   | `/api/login`  | `{ email, password }`             |                                |
| GET    | `/api/me`     | —                                   | returns the signed-in user    |
| GET    | `/api/data`   | —                                   | returns `{ habits, completions }` |
| PUT    | `/api/data`   | `{ habits, completions }`         | overwrites the saved data     |

## Project structure

```
habit-ledger-app/
├── server.js          # Express API + static file server
├── package.json
├── .env.example        # copy to .env and fill in JWT_SECRET
└── public/
    └── index.html      # the whole frontend (auth screen + app)
```

## Notes on scaling up

This setup comfortably handles a small-to-medium user base on a single
server. If you outgrow SQLite down the line (heavy concurrent writes,
multiple server instances), the queries in `server.js` are simple enough
to port to Postgres or MySQL with minimal changes — the `user_data` table
holding one JSON blob per user works the same way in any relational
database.
