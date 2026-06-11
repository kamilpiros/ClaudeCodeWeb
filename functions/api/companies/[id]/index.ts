import { getCompany } from "../../../_lib/db";
import type {
  ActionItemRow,
  CompanyRow,
  Env,
  NoteRow,
  Status,
} from "../../../_lib/types";
import { STATUSES } from "../../../_lib/types";
import { badRequest, json, nowIso, readJson } from "../../../_lib/util";

function idFrom(params: Record<string, unknown>): number | null {
  const id = Number(params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /api/companies/:id — company + notes (desc) + open action items + history. */
export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const id = idFrom(params);
  if (!id) return badRequest("bad id");
  const company = await getCompany(env.DB, id);
  if (!company) return json({ error: "not found" }, 404);

  const [notes, actionItems, history] = await Promise.all([
    env.DB.prepare(
      "SELECT * FROM notes WHERE company_id = ? ORDER BY created_at DESC, id DESC",
    )
      .bind(id)
      .all<NoteRow>(),
    env.DB.prepare(
      "SELECT * FROM action_items WHERE company_id = ? AND done = 0 ORDER BY created_at DESC, id DESC",
    )
      .bind(id)
      .all<ActionItemRow>(),
    env.DB.prepare(
      "SELECT * FROM status_history WHERE company_id = ? ORDER BY changed_at DESC, id DESC",
    )
      .bind(id)
      .all(),
  ]);

  return json({
    company,
    notes: notes.results,
    action_items: actionItems.results,
    status_history: history.results,
  });
};

const EDITABLE_FIELDS = new Set([
  "name",
  "ticker",
  "exchange",
  "market_cap_musd",
  "currency",
  "status",
  "pass_reason",
  "conviction",
  "source",
  "source_detail",
  "koyfin_url",
  "model_url",
  "model_updated_at",
  "substack_url",
  "ir_subscribed",
  "ir_email_used",
  "ir_notes",
  "aliases",
  "horizon",
  "next_earnings_date",
  "country",
  "sector",
  "entry_price",
  "entry_date",
  "target_price",
  "exit_criteria",
]);

/** PATCH /api/companies/:id — edit any field; status changes write history. */
export const onRequestPatch: PagesFunction<Env> = async ({
  params,
  request,
  env,
}) => {
  const id = idFrom(params);
  if (!id) return badRequest("bad id");
  const company = await getCompany(env.DB, id);
  if (!company) return json({ error: "not found" }, 404);

  const body = await readJson<Record<string, unknown>>(request);
  if (!body) return badRequest("invalid JSON body");

  const sets: string[] = [];
  const binds: unknown[] = [];
  let statusChange: Status | null = null;

  for (const [key, rawValue] of Object.entries(body)) {
    if (!EDITABLE_FIELDS.has(key)) continue;
    let value = rawValue;
    if (key === "status") {
      if (!STATUSES.includes(value as Status)) return badRequest("bad status");
      if (value !== company.status) statusChange = value as Status;
    }
    if (key === "aliases" && Array.isArray(value)) value = JSON.stringify(value);
    if (key === "conviction" && value !== null) {
      const c = Number(value);
      if (!Number.isInteger(c) || c < 1 || c > 5)
        return badRequest("conviction must be 1-5 or null");
    }
    sets.push(`${key} = ?`);
    binds.push(value);
  }
  if (!sets.length) return badRequest("no editable fields in body");

  const now = nowIso();
  sets.push("updated_at = ?");
  binds.push(now, id);

  const stmts = [
    env.DB.prepare(`UPDATE companies SET ${sets.join(", ")} WHERE id = ?`).bind(
      ...binds,
    ),
  ];
  if (statusChange) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO status_history (company_id, from_status, to_status, changed_at)
         VALUES (?, ?, ?, ?)`,
      ).bind(id, company.status, statusChange, now),
    );
  }
  await env.DB.batch(stmts);

  const updated = await getCompany(env.DB, id);
  return json({ company: updated as CompanyRow });
};

/**
 * DELETE /api/companies/:id — removes the company and everything attached
 * to it (notes, action items, reminders, quotes, status history).
 */
export const onRequestDelete: PagesFunction<Env> = async ({ params, env }) => {
  const id = idFrom(params);
  if (!id) return badRequest("bad id");
  const company = await getCompany(env.DB, id);
  if (!company) return json({ error: "not found" }, 404);

  await env.DB.batch([
    env.DB.prepare("DELETE FROM action_items WHERE company_id = ?").bind(id),
    env.DB.prepare("DELETE FROM reminders WHERE company_id = ?").bind(id),
    env.DB.prepare("DELETE FROM quotes WHERE company_id = ?").bind(id),
    env.DB.prepare("DELETE FROM status_history WHERE company_id = ?").bind(id),
    env.DB.prepare("DELETE FROM notes WHERE company_id = ?").bind(id),
    env.DB.prepare("DELETE FROM companies WHERE id = ?").bind(id),
  ]);
  return json({ ok: true });
};
