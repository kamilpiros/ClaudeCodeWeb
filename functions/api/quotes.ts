import { getQuotes } from "../_lib/quotes";
import type { CompanyRow, Env } from "../_lib/types";
import { json } from "../_lib/util";

/**
 * GET /api/quotes — best-effort delayed quotes for all companies with a
 * ticker in an active status. Cached 15 min; first quote per company is
 * stored as its baseline ("price when added").
 */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT id, ticker, baseline_price, baseline_price_date FROM companies
     WHERE ticker IS NOT NULL
       AND status IN ('inbox','quick_look','worked','watchlist','owned')`,
  ).all<
    Pick<CompanyRow, "id" | "ticker" | "baseline_price" | "baseline_price_date">
  >();
  const quotes = await getQuotes(env.DB, results);
  return json({ quotes });
};
