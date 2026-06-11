/**
 * Shared CSV-import logic for the "Stones Turned" Excel export, used both
 * by the in-app importer (POST /api/import) and the CLI script.
 *
 * Expected columns (semicolon-separated):
 *   name;ticker;status;pass_reason;source;notes;date
 */

const STATUSES = new Set([
  "inbox",
  "dismissed",
  "quick_look",
  "worked",
  "watchlist",
  "owned",
  "exited",
]);

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

export function mapStatus(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (!key) return "inbox";
  if (STATUSES.has(key)) return key;
  return STATUS_MAP[key] ?? "inbox";
}

export function mapSource(raw: string): {
  source: string | null;
  detail: string | null;
} {
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

export function toIsoDate(raw: string): string {
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

export interface ImportRecord {
  name: string;
  ticker: string | null;
  status: string;
  pass_reason: string | null;
  source: string | null;
  source_detail: string | null;
  note: string | null;
  created_at: string;
}

/** Parse a whole CSV into import records, skipping a header row if present. */
export function csvToRecords(csvText: string): ImportRecord[] {
  const rows = parseCsv(csvText);
  if (!rows.length) return [];
  const start = rows[0][0]?.trim().toLowerCase() === "name" ? 1 : 0;
  const records: ImportRecord[] = [];
  for (const row of rows.slice(start)) {
    const [name = "", ticker = "", status = "", passReason = "", source = "", notes = "", date = ""] =
      row.map((c) => c.trim());
    if (!name) continue;
    const { source: src, detail } = mapSource(source);
    records.push({
      name,
      ticker: ticker || null,
      status: mapStatus(status),
      pass_reason: passReason || null,
      source: src,
      source_detail: detail,
      note: notes || null,
      created_at: toIsoDate(date),
    });
  }
  return records;
}
