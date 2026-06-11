import { z } from "zod";
import type { ActionItemRow, CompanyRow, NoteRow, ReminderRow } from "./types";
import { NOTE_TYPES, SOURCES, STATUSES } from "./types";
import { koyfinUrl, nowIso, parseAliases } from "./util";

const nullableString = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v : null));

export const confirmDraftSchema = z.object({
  company_id: z
    .number()
    .int()
    .nullish()
    .transform((v) => v ?? null),
  new_company: z
    .object({
      name: z.string().min(1),
      ticker: nullableString,
      exchange: nullableString,
      market_cap_musd: z
        .number()
        .nullish()
        .transform((v) => v ?? null),
      currency: nullableString,
      source: z
        .enum(SOURCES)
        .nullish()
        .transform((v) => v ?? null),
      source_detail: nullableString,
    })
    .nullish()
    .transform((v) => v ?? null),
  note_type: z.enum(NOTE_TYPES).default("note"),
  note_body: z.string().min(1),
  raw_transcript: nullableString,
  action_items: z.array(z.string().min(1)).default([]),
  status_change: z
    .enum(STATUSES)
    .nullish()
    .transform((v) => v ?? null),
  pass_reason: nullableString,
  mentioned_as: nullableString,
  horizon: z
    .enum(["core", "tactical"])
    .nullish()
    .transform((v) => v ?? null),
  conviction: z
    .number()
    .int()
    .min(1)
    .max(5)
    .nullish()
    .transform((v) => v ?? null),
  next_earnings_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((v) => v ?? null),
  reminders: z
    .array(
      z.object({
        body: z.string().min(1),
        due_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullish()
          .transform((v) => v ?? null),
        trigger: nullableString,
      }),
    )
    .default([]),
});

export type ConfirmDraft = z.infer<typeof confirmDraftSchema>;

export interface ConfirmResult {
  company: CompanyRow | null;
  note: NoteRow;
  action_items: ActionItemRow[];
  reminders: ReminderRow[];
}

/**
 * Writes a confirmed capture draft in one D1 batch (atomic): company (if
 * new), note, action items, status change + history, and alias learning.
 *
 * Within the batch, `(SELECT MAX(id) FROM companies)` / `(SELECT MAX(id)
 * FROM notes)` reference the row just inserted — safe because ids are
 * AUTOINCREMENT (monotonic, never reused) and the app is single-user.
 */
export async function confirmCapture(
  db: D1Database,
  draft: ConfirmDraft,
): Promise<ConfirmResult> {
  const now = nowIso();
  const stmts: D1PreparedStatement[] = [];

  let existing: CompanyRow | null = null;
  if (draft.company_id !== null) {
    existing = await db
      .prepare("SELECT * FROM companies WHERE id = ?")
      .bind(draft.company_id)
      .first<CompanyRow>();
    if (!existing) throw new Error(`company ${draft.company_id} not found`);
  }

  const isNewCompany = existing === null && draft.new_company !== null;
  const hasCompany = existing !== null || isNewCompany;
  // SQL fragment referencing the company id usable in later batch statements.
  const companyRef = existing
    ? String(existing.id)
    : "(SELECT MAX(id) FROM companies)";

  if (isNewCompany) {
    const nc = draft.new_company!;
    const initialStatus = draft.status_change ?? "inbox";
    const aliases: string[] = [];
    if (
      draft.mentioned_as &&
      !sameName(draft.mentioned_as, nc.name) &&
      !sameName(draft.mentioned_as, nc.ticker)
    ) {
      aliases.push(draft.mentioned_as);
    }
    stmts.push(
      db
        .prepare(
          `INSERT INTO companies
             (name, ticker, exchange, market_cap_musd, currency, status,
              pass_reason, source, source_detail, koyfin_url, aliases,
              horizon, conviction, next_earnings_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          nc.name,
          nc.ticker,
          nc.exchange,
          nc.market_cap_musd,
          nc.currency,
          initialStatus,
          draft.pass_reason,
          nc.source,
          nc.source_detail,
          koyfinUrl(nc.ticker),
          JSON.stringify(aliases),
          draft.horizon,
          draft.conviction,
          draft.next_earnings_date,
          now,
          now,
        ),
    );
    stmts.push(
      db
        .prepare(
          `INSERT INTO status_history (company_id, from_status, to_status, changed_at)
           VALUES ((SELECT MAX(id) FROM companies), NULL, ?, ?)`,
        )
        .bind(initialStatus, now),
    );
  }

  if (existing) {
    // Alias learning: the user confirmed a match where the input used a
    // name not yet in this company's aliases — remember it.
    if (draft.mentioned_as) {
      const aliases = parseAliases(existing.aliases);
      const known = [existing.name, existing.ticker, ...aliases].filter(
        Boolean,
      ) as string[];
      if (!known.some((k) => sameName(k, draft.mentioned_as))) {
        aliases.push(draft.mentioned_as);
        stmts.push(
          db
            .prepare(
              "UPDATE companies SET aliases = ?, updated_at = ? WHERE id = ?",
            )
            .bind(JSON.stringify(aliases), now, existing.id),
        );
      }
    }
    const statusChanged =
      draft.status_change !== null && draft.status_change !== existing.status;
    if (
      statusChanged ||
      draft.pass_reason ||
      draft.horizon ||
      draft.conviction ||
      draft.next_earnings_date
    ) {
      stmts.push(
        db
          .prepare(
            `UPDATE companies
             SET status = ?,
                 pass_reason = COALESCE(?, pass_reason),
                 horizon = COALESCE(?, horizon),
                 conviction = COALESCE(?, conviction),
                 next_earnings_date = COALESCE(?, next_earnings_date),
                 updated_at = ?
             WHERE id = ?`,
          )
          .bind(
            statusChanged ? draft.status_change : existing.status,
            draft.pass_reason,
            draft.horizon,
            draft.conviction,
            draft.next_earnings_date,
            now,
            existing.id,
          ),
      );
    }
    if (statusChanged) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO status_history (company_id, from_status, to_status, changed_at)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(existing.id, existing.status, draft.status_change, now),
      );
    }
  }

  stmts.push(
    db
      .prepare(
        `INSERT INTO notes (company_id, note_type, body, raw_transcript, created_at)
         VALUES (${hasCompany ? companyRef : "NULL"}, ?, ?, ?, ?)`,
      )
      .bind(draft.note_type, draft.note_body, draft.raw_transcript, now),
  );

  for (const body of draft.action_items) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO action_items (company_id, note_id, body, done, created_at)
           VALUES (${hasCompany ? companyRef : "NULL"}, (SELECT MAX(id) FROM notes), ?, 0, ?)`,
        )
        .bind(body, now),
    );
  }

  for (const reminder of draft.reminders) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO reminders (company_id, note_id, body, due_date, trigger, done, created_at)
           VALUES (${hasCompany ? companyRef : "NULL"}, (SELECT MAX(id) FROM notes), ?, ?, ?, 0, ?)`,
        )
        .bind(reminder.body, reminder.due_date, reminder.trigger, now),
    );
  }

  await db.batch(stmts);

  const note = await db
    .prepare("SELECT * FROM notes WHERE id = (SELECT MAX(id) FROM notes)")
    .first<NoteRow>();
  if (!note) throw new Error("note insert failed");
  const company = hasCompany
    ? await db
        .prepare("SELECT * FROM companies WHERE id = ?")
        .bind(existing ? existing.id : note.company_id)
        .first<CompanyRow>()
    : null;
  const items = await db
    .prepare("SELECT * FROM action_items WHERE note_id = ? ORDER BY id")
    .bind(note.id)
    .all<ActionItemRow>();
  const reminders = await db
    .prepare("SELECT * FROM reminders WHERE note_id = ? ORDER BY id")
    .bind(note.id)
    .all<ReminderRow>();

  return {
    company: company ?? null,
    note,
    action_items: items.results,
    reminders: reminders.results,
  };
}

function sameName(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
