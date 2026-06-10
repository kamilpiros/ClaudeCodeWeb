import type { Env, NoteRow, NoteType } from "../../_lib/types";
import { NOTE_TYPES } from "../../_lib/types";
import { badRequest, json, nowIso, readJson } from "../../_lib/util";

/**
 * POST /api/notes — direct note create. Used by the company-page "add note"
 * box (skips company matching) and by the "save raw text as musing"
 * fallback when parsing fails.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<{
    company_id?: number | null;
    note_type?: NoteType;
    body?: string;
    raw_transcript?: string | null;
  }>(request);
  const text = body?.body?.trim();
  if (!text) return badRequest("body required");
  const noteType = body?.note_type ?? "note";
  if (!NOTE_TYPES.includes(noteType)) return badRequest("bad note_type");
  const companyId = body?.company_id ?? null;
  if (companyId !== null) {
    const exists = await env.DB.prepare("SELECT id FROM companies WHERE id = ?")
      .bind(companyId)
      .first();
    if (!exists) return badRequest("company not found");
  }

  const res = await env.DB.prepare(
    `INSERT INTO notes (company_id, note_type, body, raw_transcript, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(companyId, noteType, text, body?.raw_transcript ?? null, nowIso())
    .run();

  const note = await env.DB.prepare("SELECT * FROM notes WHERE id = ?")
    .bind(res.meta.last_row_id)
    .first<NoteRow>();
  return json({ note }, 201);
};
