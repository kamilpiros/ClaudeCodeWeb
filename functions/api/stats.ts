import type { Env } from "../_lib/types";
import { json } from "../_lib/util";

/**
 * GET /api/stats — funnel counts, captures per week, and sources ranked by
 * how many ideas reached worked/owned (the "source hit rate" view).
 */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const [statusCounts, weeks, sources] = await Promise.all([
    env.DB.prepare(
      "SELECT status, COUNT(*) AS count FROM companies GROUP BY status",
    ).all<{ status: string; count: number }>(),
    env.DB.prepare(
      `SELECT strftime('%Y-W%W', created_at) AS week, COUNT(*) AS captures
       FROM notes GROUP BY week ORDER BY week DESC LIMIT 12`,
    ).all<{ week: string; captures: number }>(),
    env.DB.prepare(
      `SELECT COALESCE(source, 'unknown') AS source,
              COUNT(*) AS total,
              SUM(CASE WHEN status IN ('worked','owned','exited')
                    OR EXISTS (SELECT 1 FROM status_history h
                               WHERE h.company_id = c.id
                                 AND h.to_status IN ('worked','owned'))
                  THEN 1 ELSE 0 END) AS hits
       FROM companies c
       GROUP BY COALESCE(source, 'unknown')
       ORDER BY hits DESC, total DESC`,
    ).all<{ source: string; total: number; hits: number }>(),
  ]);

  return json({
    status_counts: statusCounts.results,
    captures_per_week: weeks.results,
    source_hit_rate: sources.results.map((s) => ({
      ...s,
      hit_rate: s.total ? Math.round((s.hits / s.total) * 100) / 100 : 0,
    })),
  });
};
