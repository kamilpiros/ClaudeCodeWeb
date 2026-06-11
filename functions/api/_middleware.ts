import { ensureMigrated } from "../_lib/migrate";
import type { Env } from "../_lib/types";
import { json } from "../_lib/util";

/**
 * Runs before every /api request: applies any pending database migrations
 * (no-op after the first request of each isolate).
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    await ensureMigrated(context.env.DB);
  } catch (e) {
    return json(
      {
        error: "migration_failed",
        message: e instanceof Error ? e.message : String(e),
      },
      500,
    );
  }
  return context.next();
};
