import type { Env, ReminderRow } from "../../_lib/types";
import { badRequest, json, nowIso, readJson } from "../../_lib/util";

/** PATCH /api/reminders/:id — toggle done, edit body/due_date. */
export const onRequestPatch: PagesFunction<Env> = async ({
  params,
  request,
  env,
}) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest("bad id");
  const reminder = await env.DB.prepare("SELECT * FROM reminders WHERE id = ?")
    .bind(id)
    .first<ReminderRow>();
  if (!reminder) return json({ error: "not found" }, 404);

  const body = await readJson<{
    done?: boolean;
    body?: string;
    due_date?: string | null;
  }>(request);
  if (!body) return badRequest("invalid JSON body");

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (body.done !== undefined) {
    sets.push("done = ?", "done_at = ?");
    binds.push(body.done ? 1 : 0, body.done ? nowIso() : null);
  }
  if (typeof body.body === "string" && body.body.trim()) {
    sets.push("body = ?");
    binds.push(body.body.trim());
  }
  if (body.due_date !== undefined) {
    if (body.due_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) {
      return badRequest("due_date must be YYYY-MM-DD or null");
    }
    sets.push("due_date = ?");
    binds.push(body.due_date);
  }
  if (!sets.length) return badRequest("nothing to update");

  binds.push(id);
  await env.DB.prepare(`UPDATE reminders SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();
  const updated = await env.DB.prepare("SELECT * FROM reminders WHERE id = ?")
    .bind(id)
    .first<ReminderRow>();
  return json({ reminder: updated });
};

/** DELETE /api/reminders/:id */
export const onRequestDelete: PagesFunction<Env> = async ({ params, env }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest("bad id");
  await env.DB.prepare("DELETE FROM reminders WHERE id = ?").bind(id).run();
  return json({ ok: true });
};
