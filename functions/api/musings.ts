import type { Env, NoteRow } from "../_lib/types";
import { json } from "../_lib/util";

/** GET /api/musings — unattached notes, newest first. */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    "SELECT * FROM notes WHERE company_id IS NULL ORDER BY created_at DESC, id DESC",
  ).all<NoteRow>();
  return json({ musings: results });
};
