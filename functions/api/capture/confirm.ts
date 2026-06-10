import { confirmCapture, confirmDraftSchema } from "../../_lib/confirm";
import type { Env } from "../../_lib/types";
import { json, readJson } from "../../_lib/util";

/**
 * POST /api/capture/confirm — the (possibly user-edited) draft in; writes
 * company (if new), note, action items, status change and alias learning in
 * one batch. Returns the created records.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson(request);
  if (!body) return json({ error: "invalid JSON body" }, 400);

  const parsed = confirmDraftSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "invalid draft", issues: parsed.error.issues },
      400,
    );
  }
  try {
    const result = await confirmCapture(env.DB, parsed.data);
    return json(result, 201);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "confirm failed" },
      400,
    );
  }
};
