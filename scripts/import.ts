/**
 * One-off import of the existing "Stones Turned" Excel export into D1.
 *
 * Expected CSV (semicolon-separated — Excel's separator in the user's
 * locale; quoted fields with embedded ; and " are handled):
 *
 *   name;ticker;status;pass_reason;source;notes;date
 *
 * Usage (Node 22+):
 *   node --experimental-strip-types scripts/import.ts stones.csv > import.sql
 *   npx wrangler d1 execute stones --remote --file=import.sql
 *
 * Generates one INSERT per company plus one note per non-empty notes cell.
 */
import { readFileSync } from "node:fs";

const STATUSES = new Set([
  "inbox",
  "dismissed",
  "quick_look",
  "worked",
  "watchlist",
  "owned",
  "exited",
]);

// Map legacy/loose status labels from the Excel to the new enum.
const STATUS_MAP: Record<string, string> = {
  pass: "dismissed",
  passed: "dismissed",
  dismissed: "dismissed",
  no: "dismissed",
  rejected: "dismissed",
  "quick look": "quick_look",
  quicklook: "quick_look",
  quick_look: "quick_look",
  glance: "quick_look",
  looked: "quick_look",
  worked: "worked",
  working: "worked",
  deep_dive: "worked",
  "deep dive": "worked",
  watch: "watchlist",
  watching: "watchlist",
  watchlist: "watchlist",
  own: "owned",
  owned: "owned",
  position: "owned",
  holding: "owned",
  sold: "exited",
  exited: "exited",
  exit: "exited",
  inbox: "inbox",
  new: "inbox",
  idea: "inbox",
};

const SOURCES = new Set([
  "substack",
  "twitter",
  "microcapclub",
  "yellowbrick",
  "person",
  "own",
  "other",
]);

function mapStatus(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (!key) return "inbox";
  if (STATUSES.has(key)) return key;
  return STATUS_MAP[key] ?? "inbox";
}

function mapSource(raw: string): { source: string | null; detail: string | null } {
  const v = raw.trim();
  if (!v) return { source: null, detail: null };
  const key = v.toLowerCase();
  if (SOURCES.has(key)) return { source: key, detail: null };
  if (key.includes("substack")) return { source: "substack", detail: v };
  if (key.includes("twitter") || key.startsWith("@") || key.includes("x.com"))
    return { source: "twitter", detail: v };
  if (key.includes("microcap")) return { source: "microcapclub", detail: v };
  if (key.includes("yellowbrick")) return { source: "yellowbrick", detail: v };
  return { source: "other", detail: v };
}

/** Minimal CSV parser with configurable delimiter and quote handling. */
export function parseCsv(text: string, delimiter = ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function sqlString(v: string | null): string {
  if (v === null || v === "") return "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

function toIsoDate(raw: string): string {
  const v = raw.trim();
  if (!v) return new Date().toISOString();
  // Accept dd.mm.yyyy (German Excel), dd/mm/yyyy, and yyyy-mm-dd.
  const de = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (de) {
    return `${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}T00:00:00.000Z`;
  }
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

function koyfinUrl(ticker: string): string | null {
  const t = ticker.trim();
  if (!t) return null;
  return `https://app.koyfin.com/company/${encodeURIComponent(t.toLowerCase())}`;
}

export function generateSql(csvText: string): string {
  const rows = parseCsv(csvText);
  if (!rows.length) return "-- empty CSV\n";
  // Skip a header row if it looks like one.
  const start = rows[0][0]?.trim().toLowerCase() === "name" ? 1 : 0;

  const out: string[] = ["BEGIN TRANSACTION;"];
  for (const row of rows.slice(start)) {
    const [name = "", ticker = "", status = "", passReason = "", source = "", notes = "", date = ""] = row.map(
      (c) => c.trim(),
    );
    if (!name) continue;
    const mappedStatus = mapStatus(status);
    const { source: src, detail } = mapSource(source);
    const created = toIsoDate(date);
    out.push(
      `INSERT INTO companies (name, ticker, status, pass_reason, source, source_detail, koyfin_url, aliases, created_at, updated_at) VALUES (` +
        [
          sqlString(name),
          sqlString(ticker || null),
          sqlString(mappedStatus),
          sqlString(passReason || null),
          sqlString(src),
          sqlString(detail),
          sqlString(ticker ? koyfinUrl(ticker) : null),
          "'[]'",
          sqlString(created),
          sqlString(created),
        ].join(", ") +
        ");",
    );
    out.push(
      `INSERT INTO status_history (company_id, from_status, to_status, changed_at) VALUES (last_insert_rowid(), NULL, ${sqlString(mappedStatus)}, ${sqlString(created)});`,
    );
    if (notes) {
      out.push(
        `INSERT INTO notes (company_id, note_type, body, created_at) VALUES ((SELECT MAX(id) FROM companies), 'note', ${sqlString(notes)}, ${sqlString(created)});`,
      );
    }
  }
  out.push("COMMIT;");
  return out.join("\n") + "\n";
}

// CLI entry point (skipped when imported by tests).
const isMain = process.argv[1]?.endsWith("import.ts");
if (isMain) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node --experimental-strip-types scripts/import.ts <file.csv> > import.sql");
    process.exit(1);
  }
  process.stdout.write(generateSql(readFileSync(file, "utf8")));
}
