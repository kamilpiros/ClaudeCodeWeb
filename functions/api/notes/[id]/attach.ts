import type { Env, NoteRow } from "../../../_lib/types";
import { badRequest, json, readJson } from "../../../_lib/util";

/** PATCH /api/notes/:id/attach — { company_id } links a musing to a company. */
export const onRequestPatch: PagesFunction<Env> = async ({
  params,
  request,
  env,
}) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest("bad id");
  const body = await readJson<{ company_id?: number }>(request);
  const companyId = body?.company_id;
  if (!Number.isInteger(companyId)) return badRequest("company_id required");

  const note = await env.DB.prepare("SELECT * FROM notes WHERE id = ?")
    .bind(id)
    .first<NoteRow>();
  if (!note) return json({ error: "not found" }, 404);
  const company = await env.DB.prepare("SELECT id FROM companies WHERE id = ?")
    .bind(companyId)
    .first();
  if (!company) return badRequest("company not found");

  await env.DB.prepare("UPDATE notes SET company_id = ? WHERE id = ?")
    .bind(companyId, id)
    .run();
  const updated = await env.DB.prepare("SELECT * FROM notes WHERE id = ?")
    .bind(id)
    .first<NoteRow>();
  return json({ note: updated });
};
