import { csvToRecords } from "../_lib/import-core";
import type { Env } from "../_lib/types";
import { badRequest, json, koyfinUrl } from "../_lib/util";

/**
 * POST /api/import — semicolon-separated CSV (the "Stones Turned" Excel
 * export) in the request body; creates companies + one note per non-empty
 * notes cell. Rows whose company name already exists are skipped, so
 * re-importing is safe.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const csv = await request.text();
  if (!csv.trim()) return badRequest("empty body — send the CSV as raw text");

  const records = csvToRecords(csv);
  if (!records.length) return badRequest("no importable rows found");

  const { results: existingRows } = await env.DB.prepare(
    "SELECT name FROM companies",
  ).all<{ name: string }>();
  const existing = new Set(existingRows.map((r) => r.name.trim().toLowerCase()));

  const stmts: D1PreparedStatement[] = [];
  let imported = 0;
  let skipped = 0;
  for (const r of records) {
    if (existing.has(r.name.trim().toLowerCase())) {
      skipped++;
      continue;
    }
    existing.add(r.name.trim().toLowerCase());
    imported++;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO companies (name, ticker, status, pass_reason, source, source_detail, koyfin_url, aliases, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)`,
      ).bind(
        r.name,
        r.ticker,
        r.status,
        r.pass_reason,
        r.source,
        r.source_detail,
        koyfinUrl(r.ticker),
        r.created_at,
        r.created_at,
      ),
    );
    stmts.push(
      env.DB.prepare(
        `INSERT INTO status_history (company_id, from_status, to_status, changed_at)
         VALUES ((SELECT MAX(id) FROM companies), NULL, ?, ?)`,
      ).bind(r.status, r.created_at),
    );
    if (r.note) {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO notes (company_id, note_type, body, created_at)
           VALUES ((SELECT MAX(id) FROM companies), 'note', ?, ?)`,
        ).bind(r.note, r.created_at),
      );
    }
  }

  if (stmts.length) await env.DB.batch(stmts);
  return json({ imported, skipped });
};
