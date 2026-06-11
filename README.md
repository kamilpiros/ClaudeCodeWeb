# Stones — Personal Investment Process App

A single-user PWA for frictionless capture of investment ideas and notes, a
pipeline view of every company ever looked at, and an LLM parsing layer so
capture takes under 10 seconds by voice or text.

- **Capture** (home): big text box + mic. Voice → Whisper transcript → Haiku
  parses it into a draft (matched/new company, cleaned note, action items,
  suggested status) → confirmation card → save. Parsing failures never lose
  input (save-as-raw-musing fallback + offline queue in localStorage).
- **Pipeline**: companies grouped by status in funnel order, with days-in-status,
  market cap and conviction dots. Dismissed/exited collapsed by default.
- **Company page**: status, conviction, links (Koyfin / Excel model / Substack),
  IR block, notes timeline, open action items, status history, inline add-note.
- **Musings**: unattached notes (attach/delete) + stats: funnel counts,
  captures/week, source hit-rate.

## Stack

| Layer | Tech |
| --- | --- |
| Hosting | Cloudflare Pages (static frontend) + Pages Functions (API) |
| Database | Cloudflare D1 (SQLite), migrations in `/migrations` |
| Auth | Cloudflare Access — the app contains **no** auth code |
| Frontend | React + Vite, installable PWA, mobile-first |
| LLM | Anthropic API — `claude-haiku-4-5` (parsing, strict JSON, temp 0), `claude-sonnet-4-6` + web_search (enrichment of new companies) |
| Voice | Workers AI Whisper (`@cf/openai/whisper`) via `POST /api/transcribe` |

## Project layout

```
/src        frontend (Vite + React + PWA bits)
/functions  Cloudflare Pages Functions (API routes; shared code in _lib)
/migrations D1 SQL migrations (0001 schema, 0002 seed companies)
/scripts    CSV import script + icon generator
/tests      Vitest (confirm transaction, alias learning, status history, parser JSON shape, CSV import)
```

## Setup

### 1. Create the D1 database

```sh
npx wrangler d1 create stones
```

Put the printed `database_id` into `wrangler.toml` (replacing the placeholder
zero-UUID, which is only there so local dev works out of the box).

**Migrations apply themselves.** Every deploy bundles the SQL from
`/migrations` (via `scripts/gen-migrations.mjs`, part of `npm run build`) and
an API middleware applies pending migrations on the first request — including
the initial schema + seed on a brand-new database. `wrangler d1 migrations
apply` is never required against production (it still works for local dev and
is detected/baselined, never re-run).

### 2. Create the Pages project (Git integration)

Connect the GitHub repo to Cloudflare Pages (same pattern as the BQT Partners
website):

- Build command: `npm run build`
- Build output directory: `dist`

The `wrangler.toml` at the repo root configures the `DB` (D1) and `AI`
(Workers AI) bindings for Pages Functions automatically.

### 3. Secrets

```sh
npx wrangler pages secret put ANTHROPIC_API_KEY
```

(or set it under Pages → Settings → Environment variables → "Encrypt").

### 4. Cloudflare Access (the only auth layer)

The app assumes every request that reaches it is authenticated — protect the
whole hostname with Cloudflare Access:

1. Zero Trust dashboard → **Access → Applications → Add an application →
   Self-hosted**.
2. Application domain: the Pages domain (e.g. `stones.pages.dev` and/or your
   custom domain). Path: leave empty (protect everything, including `/api/*`).
3. **Session duration: 30 days** (the maximum dropdown value; keeps the
   phone PWA logged in).
4. Add a policy: Action *Allow*, Include → *Emails* → `cyril.bouquet@bqtpartners.com`.
5. Login method: One-time PIN (email) is enough for a single user.

### 5. Local development

```sh
cp .dev.vars.example .dev.vars   # put your ANTHROPIC_API_KEY in it
npm install
npm run db:migrate:local
npm run preview                  # builds + runs wrangler pages dev on :8788
```

For fast frontend iteration run `npm run dev` (Vite on :5173, proxying `/api`
to the wrangler dev server on :8788).

> Note: the Workers AI (Whisper) binding in local dev calls the real Workers AI
> service, so `wrangler login` (or `CLOUDFLARE_API_TOKEN`) is needed for
> transcription to work locally.

### 6. iPhone install

Open the site in Safari → Share → **Add to Home Screen**. The manifest +
service worker make it a standalone app; the API is network-first and the
capture box queues raw text in localStorage when offline.

## Importing the "Stones Turned" Excel

**Easiest path: in the app.** List tab → **⇪ Import CSV** → pick the file.
Rows whose company name already exists are skipped, so re-importing is safe.

Export the sheet as CSV (semicolon-separated — the default in a German Excel
locale) with exactly these columns:

```
name;ticker;status;pass_reason;source;notes;date
```

- `status`: free-form; mapped to the app's enum (`pass`/`passed` → `dismissed`,
  `watch` → `watchlist`, `quick look` → `quick_look`, `sold` → `exited`, …;
  unknown values land in `inbox`).
- `source`: matched to `substack | twitter | microcapclub | yellowbrick |
  person | own | other`; non-matching text is kept in `source_detail`.
- `notes`: one note row is created per non-empty cell.
- `date`: `dd.mm.yyyy`, `dd/mm/yyyy` or `yyyy-mm-dd`; used as `created_at`.

Then:

```sh
node --experimental-strip-types scripts/import.ts stones.csv > import.sql
npx wrangler d1 execute stones --remote --file=import.sql
```

## API

All routes under `/api`, JSON in/out:

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/transcribe` | POST | audio blob → `{ transcript }` (Workers AI Whisper) |
| `/api/capture` | POST | `{ text }` → parsed **draft** (nothing written) |
| `/api/capture/confirm` | POST | draft → writes company/note/action items/status/aliases atomically |
| `/api/companies?status=&q=` | GET | list / filter / search (name, ticker, aliases) |
| `/api/companies` | POST | manual create |
| `/api/companies/:id` | GET | company + notes + open action items + status history |
| `/api/companies/:id` | PATCH | edit any field; status changes also write `status_history` |
| `/api/notes` | POST | direct note create (company page add-note, raw-musing fallback) |
| `/api/notes/:id` | PATCH / DELETE | edit / delete a note |
| `/api/notes/:id/attach` | PATCH | `{ company_id }` — attach a musing |
| `/api/action_items/:id` | PATCH | toggle done |
| `/api/musings` | GET | unattached notes, newest first |
| `/api/stats` | GET | funnel counts, captures/week, source hit-rate |

### Parsing pipeline

1. **Parse** — `claude-haiku-4-5`, temperature 0, strict JSON validated with
   zod; the prompt receives a compact directory of all companies
   (`[{id, name, ticker, aliases, status}]`). Malformed JSON → one retry with a
   "return only valid JSON" nudge → graceful fallback to raw-musing save.
2. **Enrich** — for new companies only: one `claude-sonnet-4-6` call with the
   `web_search` tool finds ticker, exchange, market cap (USD millions) and
   currency. ~20s timeout; on failure the draft is returned un-enriched.
3. **Confirm** — a separate request writes everything in one D1 batch.
   **Alias learning:** if the input referred to a matched company by a name not
   yet in its aliases (e.g. transcript said "Euro Ice" → EuroEyes), it is
   appended to `aliases` so the next capture matches directly.

Anthropic API errors (429/5xx) are retried once, then surfaced so the UI can
offer saving the raw text as an unparsed musing — capture never loses input.

## Intelligence features

- **Reminders (tactical-trade memory).** The parser splits to-dos: undated ones
  become action items; anything deadline-bound ("buy calls before next
  earnings", "re-check by Friday") becomes a dated **reminder**. Earnings-
  anchored reminders trigger a web-search lookup of the company's next
  earnings date at capture time; the reminder is dated 3 days before it and
  the date is saved on the company (shown as an `ER` chip). Open reminders
  surface on the capture home screen ("Up next") and per company.
- **Horizon & conviction pre-fill.** Notes that read like short-term trades
  (options, earnings plays) are tagged `tactical`; long-term holds `core`.
  Conviction (1–5) is pre-filled when clearly expressed. Both editable.
- **Prices.** `GET /api/quotes` pulls best-effort delayed quotes from Yahoo
  Finance's public endpoint for companies in active statuses (cached 15 min
  in D1). The first quote per company is stored as its **baseline**, so the
  pipeline and company page show "+12% since added". Tickers should be
  Yahoo-style (`1846.HK`, `NESN.SW`, `NOL.AX`, `EVC`) — edit the ticker if a
  quote doesn't resolve. Unofficial feed: if it breaks, prices simply
  disappear; nothing else is affected.

### Daily email digest (optional, recommended)

Cloudflare Pages can't run cron, so a tiny companion Worker
(`workers/reminder-digest/`) emails you every morning at 06:00 UTC with due/
upcoming reminders and earnings in the next 7 days. Setup:

1. Create a free account at [resend.com](https://resend.com) → API Keys →
   create a key.
2. Deploy the worker and set the secret:
   ```sh
   npx wrangler deploy -c workers/reminder-digest/wrangler.toml
   npx wrangler secret put RESEND_API_KEY -c workers/reminder-digest/wrangler.toml
   ```
3. Recipient/sender are in `workers/reminder-digest/wrangler.toml` (`DIGEST_TO`,
   `DIGEST_FROM`). With Resend's free tier, `onboarding@resend.dev` can send
   to your own account email; verify your own domain in Resend to use it as
   sender.

No email is sent on days with nothing due. Without the worker, the in-app
"Up next" list still shows everything.

## Tests

```sh
npm test
```

Vitest against a real SQLite engine (Node's built-in `node:sqlite` behind a
small D1 adapter): the confirm transaction, alias learning, status-history
writes, zod validation of parser output, and the CSV import script.

## Future phases (not built; schema is ready)

- **Phase 2 — Portfolio:** daily Worker cron pulling IBKR Flex Query XML into a
  `positions` table joined on ticker; exit criteria already live as
  `exit_criteria` notes.
- **Phase 3 — Ingestion:** Email Workers for a dedicated IR address (per-company
  IR log — `ir_*` fields already exist), RSS pulls creating `inbox` companies,
  and a local script POSTing model outputs + `model_updated_at` after Excel
  updates.
