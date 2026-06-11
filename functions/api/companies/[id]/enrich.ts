import { getCompany } from "../../../_lib/db";
import { enrichCompany } from "../../../_lib/enrich";
import type { CompanyRow, Env } from "../../../_lib/types";
import { badRequest, json, koyfinUrl, nowIso } from "../../../_lib/util";

/**
 * POST /api/companies/:id/enrich — web-search lookup that fills ONLY the
 * missing classification fields (ticker, exchange, market cap, currency,
 * country, sector). Existing values are never overwritten.
 */
export const onRequestPost: PagesFunction<Env> = async ({ params, env }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest("bad id");
  const company = await getCompany(env.DB, id);
  if (!company) return json({ error: "not found" }, 404);

  const enrichment = await enrichCompany(
    env,
    company.name,
    company.ticker ? `ticker: ${company.ticker}` : null,
  );
  if (!enrichment) {
    return json(
      { error: "enrichment_failed", message: "Lookup failed — try again." },
      502,
    );
  }

  const newTicker = company.ticker ?? enrichment.ticker;
  await env.DB.prepare(
    `UPDATE companies SET
       ticker = COALESCE(ticker, ?),
       exchange = COALESCE(exchange, ?),
       market_cap_musd = COALESCE(market_cap_musd, ?),
       currency = COALESCE(currency, ?),
       country = COALESCE(country, ?),
       sector = COALESCE(sector, ?),
       koyfin_url = COALESCE(koyfin_url, ?),
       updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      enrichment.ticker,
      enrichment.exchange,
      enrichment.market_cap_musd,
      enrichment.currency,
      enrichment.country,
      enrichment.sector,
      koyfinUrl(newTicker),
      nowIso(),
      id,
    )
    .run();

  const updated = await getCompany(env.DB, id);
  return json({ company: updated as CompanyRow });
};
