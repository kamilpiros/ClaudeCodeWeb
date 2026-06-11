/**
 * CLI import of the "Stones Turned" Excel export into D1.
 *
 * NOTE: the app can also import this CSV directly (List tab → Import CSV),
 * which is the friction-free path. This script remains for bulk/offline use.
 *
 * Expected CSV (semicolon-separated; quoted fields handled):
 *   name;ticker;status;pass_reason;source;notes;date
 *
 * Usage (Node 22+):
 *   node --experimental-strip-types scripts/import.ts stones.csv > import.sql
 *   npx wrangler d1 execute stones --remote --file=import.sql
 */
import { readFileSync } from "node:fs";
import { csvToRecords, parseCsv } from "../functions/_lib/import-core.ts";

export { parseCsv };

function sqlString(v: string | null): string {
  if (v === null || v === "") return "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

function koyfinUrl(ticker: string | null): string | null {
  if (!ticker) return null;
  return `https://app.koyfin.com/company/${encodeURIComponent(ticker.toLowerCase())}`;
}

export function generateSql(csvText: string): string {
  const records = csvToRecords(csvText);
  if (!records.length) return "-- empty CSV\n";

  const out: string[] = ["BEGIN TRANSACTION;"];
  for (const r of records) {
    out.push(
      `INSERT INTO companies (name, ticker, status, pass_reason, source, source_detail, koyfin_url, aliases, created_at, updated_at) VALUES (` +
        [
          sqlString(r.name),
          sqlString(r.ticker),
          sqlString(r.status),
          sqlString(r.pass_reason),
          sqlString(r.source),
          sqlString(r.source_detail),
          sqlString(koyfinUrl(r.ticker)),
          "'[]'",
          sqlString(r.created_at),
          sqlString(r.created_at),
        ].join(", ") +
        ");",
    );
    out.push(
      `INSERT INTO status_history (company_id, from_status, to_status, changed_at) VALUES (last_insert_rowid(), NULL, ${sqlString(r.status)}, ${sqlString(r.created_at)});`,
    );
    if (r.note) {
      out.push(
        `INSERT INTO notes (company_id, note_type, body, created_at) VALUES ((SELECT MAX(id) FROM companies), 'note', ${sqlString(r.note)}, ${sqlString(r.created_at)});`,
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
    console.error(
      "usage: node --experimental-strip-types scripts/import.ts <file.csv> > import.sql",
    );
    process.exit(1);
  }
  process.stdout.write(generateSql(readFileSync(file, "utf8")));
}
