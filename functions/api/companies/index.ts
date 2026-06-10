import type { CompanyRow, Env, Status } from "../../_lib/types";
import { STATUSES } from "../../_lib/types";
import { badRequest, json, koyfinUrl, nowIso, readJson } from "../../_lib/util";

interface ListedCompany extends CompanyRow {
  days_in_status: number;
  open_action_items: number;
}

/** GET /api/companies?status=&q= — list/filter/search (name, ticker, aliases). */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q")?.trim();

  const where: string[] = [];
  const binds: unknown[] = [];
  if (status) {
    if (!STATUSES.includes(status as Status)) return badRequest("bad status");
    where.push("c.status = ?");
    binds.push(status);
  }
  if (q) {
    where.push("(c.name LIKE ? OR c.ticker LIKE ? OR c.aliases LIKE ?)");
    const like = `%${q}%`;
    binds.push(like, like, like);
  }

  const sql = `
    SELECT c.*,
      CAST(julianday('now') - julianday(COALESCE(h.last_change, c.created_at)) AS INTEGER) AS days_in_status,
      (SELECT COUNT(*) FROM action_items a WHERE a.company_id = c.id AND a.done = 0) AS open_action_items
    FROM companies c
    LEFT JOIN (
      SELECT company_id, MAX(changed_at) AS last_change
      FROM status_history GROUP BY company_id
    ) h ON h.company_id = c.id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY c.updated_at DESC`;

  const { results } = await env.DB.prepare(sql)
    .bind(...binds)
    .all<ListedCompany>();
  return json({ companies: results });
};

/** POST /api/companies — manual create (capture is the main path). */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<Partial<CompanyRow>>(request);
  if (!body?.name?.trim()) return badRequest("name required");
  const status = (body.status as Status) ?? "inbox";
  if (!STATUSES.includes(status)) return badRequest("bad status");
  const now = nowIso();

  const res = await env.DB.prepare(
    `INSERT INTO companies
       (name, ticker, exchange, market_cap_musd, currency, status, pass_reason,
        conviction, source, source_detail, koyfin_url, model_url, substack_url,
        ir_subscribed, ir_email_used, ir_notes, aliases, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      body.name.trim(),
      body.ticker ?? null,
      body.exchange ?? null,
      body.market_cap_musd ?? null,
      body.currency ?? null,
      status,
      body.pass_reason ?? null,
      body.conviction ?? null,
      body.source ?? null,
      body.source_detail ?? null,
      body.koyfin_url ?? koyfinUrl(body.ticker),
      body.model_url ?? null,
      body.substack_url ?? null,
      body.ir_subscribed ?? 0,
      body.ir_email_used ?? null,
      body.ir_notes ?? null,
      JSON.stringify(Array.isArray(body.aliases) ? body.aliases : []),
      now,
      now,
    )
    .run();

  const id = res.meta.last_row_id;
  await env.DB.prepare(
    `INSERT INTO status_history (company_id, from_status, to_status, changed_at)
     VALUES (?, NULL, ?, ?)`,
  )
    .bind(id, status, now)
    .run();

  const company = await env.DB.prepare("SELECT * FROM companies WHERE id = ?")
    .bind(id)
    .first<CompanyRow>();
  return json({ company }, 201);
};
