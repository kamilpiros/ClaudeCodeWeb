import type { Env, ReminderRow } from "../../_lib/types";
import { badRequest, json, nowIso, readJson } from "../../_lib/util";

export interface ReminderWithCompany extends ReminderRow {
  company_name: string | null;
  company_ticker: string | null;
}

/** GET /api/reminders?all=1 — open reminders (or all), due first. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const all = new URL(request.url).searchParams.get("all") === "1";
  const { results } = await env.DB.prepare(
    `SELECT r.*, c.name AS company_name, c.ticker AS company_ticker
     FROM reminders r LEFT JOIN companies c ON c.id = r.company_id
     ${all ? "" : "WHERE r.done = 0"}
     ORDER BY r.done, r.due_date IS NULL, r.due_date, r.id DESC`,
  ).all<ReminderWithCompany>();
  return json({ reminders: results });
};

/** POST /api/reminders — manual create (company page / musings). */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<{
    company_id?: number | null;
    body?: string;
    due_date?: string | null;
  }>(request);
  const text = body?.body?.trim();
  if (!text) return badRequest("body required");
  const due = body?.due_date ?? null;
  if (due !== null && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return badRequest("due_date must be YYYY-MM-DD or null");
  }
  const companyId = body?.company_id ?? null;
  if (companyId !== null) {
    const exists = await env.DB.prepare("SELECT id FROM companies WHERE id = ?")
      .bind(companyId)
      .first();
    if (!exists) return badRequest("company not found");
  }
  const res = await env.DB.prepare(
    `INSERT INTO reminders (company_id, body, due_date, trigger, done, created_at)
     VALUES (?, ?, ?, 'manual', 0, ?)`,
  )
    .bind(companyId, text, due, nowIso())
    .run();
  const reminder = await env.DB.prepare("SELECT * FROM reminders WHERE id = ?")
    .bind(res.meta.last_row_id)
    .first<ReminderRow>();
  return json({ reminder }, 201);
};
