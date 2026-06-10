import type { ActionItemRow, Env } from "../../_lib/types";
import { badRequest, json, nowIso, readJson } from "../../_lib/util";

/** PATCH /api/action_items/:id — toggle done (body: { done: boolean }). */
export const onRequestPatch: PagesFunction<Env> = async ({
  params,
  request,
  env,
}) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest("bad id");
  const item = await env.DB.prepare("SELECT * FROM action_items WHERE id = ?")
    .bind(id)
    .first<ActionItemRow>();
  if (!item) return json({ error: "not found" }, 404);

  const body = await readJson<{ done?: boolean }>(request);
  const done = body?.done === undefined ? !item.done : Boolean(body.done);

  await env.DB.prepare(
    "UPDATE action_items SET done = ?, done_at = ? WHERE id = ?",
  )
    .bind(done ? 1 : 0, done ? nowIso() : null, id)
    .run();
  const updated = await env.DB.prepare(
    "SELECT * FROM action_items WHERE id = ?",
  )
    .bind(id)
    .first<ActionItemRow>();
  return json({ action_item: updated });
};
