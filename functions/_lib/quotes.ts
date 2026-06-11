import type { CompanyRow, QuoteRow } from "./types";
import { nowIso } from "./util";

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_FETCHES_PER_REQUEST = 12;

export interface CompanyQuote {
  company_id: number;
  price: number | null;
  currency: string | null;
  prev_close: number | null;
  fetched_at: string;
  baseline_price: number | null;
  baseline_price_date: string | null;
  change_since_baseline_pct: number | null;
  change_1d_pct: number | null;
}

/**
 * Best-effort delayed quotes via Yahoo Finance's public chart endpoint
 * (tickers are already Yahoo-style: "1846.HK", "NESN.SW", "NOL.AX", "EVC").
 * Quotes are cached in D1 for 15 minutes; the first successful quote for a
 * company is stored as its baseline ("price when I put it on the list").
 * Any failure simply yields no quote — never an error to the user.
 */
export async function getQuotes(
  db: D1Database,
  companies: Pick<
    CompanyRow,
    "id" | "ticker" | "baseline_price" | "baseline_price_date"
  >[],
): Promise<CompanyQuote[]> {
  const withTicker = companies.filter((c) => c.ticker);
  if (!withTicker.length) return [];

  const ids = withTicker.map((c) => c.id);
  const placeholders = ids.map(() => "?").join(",");
  const { results: cached } = await db
    .prepare(`SELECT * FROM quotes WHERE company_id IN (${placeholders})`)
    .bind(...ids)
    .all<QuoteRow>();
  const cacheById = new Map(cached.map((q) => [q.company_id, q]));

  const now = Date.now();
  const stale = withTicker.filter((c) => {
    const q = cacheById.get(c.id);
    return !q || now - Date.parse(q.fetched_at) > CACHE_TTL_MS;
  });

  // Refresh a bounded number of stale quotes per request (sequentially —
  // gentle on the unofficial endpoint).
  for (const company of stale.slice(0, MAX_FETCHES_PER_REQUEST)) {
    const fetched = await fetchYahooQuote(company.ticker!);
    if (!fetched) continue;
    const row: QuoteRow = {
      company_id: company.id,
      price: fetched.price,
      currency: fetched.currency,
      prev_close: fetched.prev_close,
      fetched_at: nowIso(),
    };
    cacheById.set(company.id, row);
    const stmts = [
      db
        .prepare(
          `INSERT INTO quotes (company_id, price, currency, prev_close, fetched_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(company_id) DO UPDATE SET
             price = excluded.price, currency = excluded.currency,
             prev_close = excluded.prev_close, fetched_at = excluded.fetched_at`,
        )
        .bind(row.company_id, row.price, row.currency, row.prev_close, row.fetched_at),
    ];
    if (company.baseline_price === null && fetched.price !== null) {
      company.baseline_price = fetched.price;
      company.baseline_price_date = nowIso().slice(0, 10);
      stmts.push(
        db
          .prepare(
            `UPDATE companies SET baseline_price = ?, baseline_price_date = ?
             WHERE id = ? AND baseline_price IS NULL`,
          )
          .bind(fetched.price, company.baseline_price_date, company.id),
      );
    }
    await db.batch(stmts);
  }

  return withTicker
    .map((c) => {
      const q = cacheById.get(c.id);
      if (!q) return null;
      return {
        company_id: c.id,
        price: q.price,
        currency: q.currency,
        prev_close: q.prev_close,
        fetched_at: q.fetched_at,
        baseline_price: c.baseline_price,
        baseline_price_date: c.baseline_price_date,
        change_since_baseline_pct: pct(q.price, c.baseline_price),
        change_1d_pct: pct(q.price, q.prev_close),
      };
    })
    .filter((q): q is CompanyQuote => q !== null);
}

function pct(current: number | null, base: number | null): number | null {
  if (current === null || base === null || base === 0) return null;
  return Math.round(((current - base) / base) * 1000) / 10;
}

async function fetchYahooQuote(
  ticker: string,
): Promise<{ price: number | null; currency: string | null; prev_close: number | null } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`,
      {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          accept: "application/json",
        },
        signal: controller.signal,
      },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      chart?: {
        result?: {
          meta?: {
            regularMarketPrice?: number;
            currency?: string;
            chartPreviousClose?: number;
            previousClose?: number;
          };
        }[];
      };
    };
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) return null;
    return {
      price: meta.regularMarketPrice ?? null,
      currency: meta.currency ?? null,
      prev_close: meta.previousClose ?? meta.chartPreviousClose ?? null,
    };
  } catch {
    return null;
  }
}
