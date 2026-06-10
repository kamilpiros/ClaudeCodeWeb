import type { Env, NoteRow, NoteType } from "../../../_lib/types";
import { NOTE_TYPES } from "../../../_lib/types";
import { badRequest, json, readJson } from "../../../_lib/util";

function idFrom(params: Record<string, unknown>): number | null {
  const id = Number(params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** PATCH /api/notes/:id — edit body / note_type / company_id. */
export const onRequestPatch: PagesFunction<Env> = async ({
  params,
  request,
  env,
}) => {
  const id = idFrom(params);
  if (!id) return badRequest("bad id");
  const note = await env.DB.prepare("SELECT * FROM notes WHERE id = ?")
    .bind(id)
    .first<NoteRow>();
  if (!note) return json({ error: "not found" }, 404);

  const body = await readJson<{
    body?: string;
    note_type?: NoteType;
    company_id?: number | null;
  }>(request);
  if (!body) return badRequest("invalid JSON body");

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (typeof body.body === "string" && body.body.trim()) {
    sets.push("body = ?");
    binds.push(body.body.trim());
  }
  if (body.note_type !== undefined) {
    if (!NOTE_TYPES.includes(body.note_type)) return badRequest("bad note_type");
    sets.push("note_type = ?");
    binds.push(body.note_type);
  }
  if (body.company_id !== undefined) {
    if (body.company_id !== null) {
      const exists = await env.DB.prepare(
        "SELECT id FROM companies WHERE id = ?",
      )
        .bind(body.company_id)
        .first();
      if (!exists) return badRequest("company not found");
    }
    sets.push("company_id = ?");
    binds.push(body.company_id);
  }
  if (!sets.length) return badRequest("nothing to update");

  binds.push(id);
  await env.DB.prepare(`UPDATE notes SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();
  const updated = await env.DB.prepare("SELECT * FROM notes WHERE id = ?")
    .bind(id)
    .first<NoteRow>();
  return json({ note: updated });
};

/** DELETE /api/notes/:id — removes the note and its spawned action items. */
export const onRequestDelete: PagesFunction<Env> = async ({ params, env }) => {
  const id = idFrom(params);
  if (!id) return badRequest("bad id");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM action_items WHERE note_id = ?").bind(id),
    env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(id),
  ]);
  return json({ ok: true });
};
