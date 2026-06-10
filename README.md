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
zero-UUID, which is only there so local dev works out of the box), then apply
migrations:

```sh
npm run db:migrate:remote     # schema + seed companies
```

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
