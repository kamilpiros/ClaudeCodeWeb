import { getCompany } from "../../../_lib/db";
import type { Env } from "../../../_lib/types";
import { badRequest, json } from "../../../_lib/util";

const RANGES: Record<string, { range: string; interval: string }> = {
  "1w": { range: "5d", interval: "60m" },
  "1m": { range: "1mo", interval: "1d" },
  "3m": { range: "3mo", interval: "1d" },
  "6m": { range: "6mo", interval: "1d" },
  "1y": { range: "1y", interval: "1d" },
  "5y": { range: "5y", interval: "1wk" },
};

/**
 * GET /api/companies/:id/chart?range=1w|1m|3m|6m|1y|5y — price history for
 * the company's ticker via Yahoo Finance's public chart endpoint.
 * Returns { points: [{t, c}], change_pct, currency }.
 */
export const onRequestGet: PagesFunction<Env> = async ({
  params,
  request,
  env,
}) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest("bad id");
  const company = await getCompany(env.DB, id);
  if (!company) return json({ error: "not found" }, 404);
  if (!company.ticker) return badRequest("company has no ticker");

  const rangeKey = new URL(request.url).searchParams.get("range") ?? "6m";
  const cfg = RANGES[rangeKey];
  if (!cfg) return badRequest(`range must be one of ${Object.keys(RANGES).join(", ")}`);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(company.ticker)}?range=${cfg.range}&interval=${cfg.interval}`,
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
    if (!res.ok) {
      return json({ error: "price_feed_error", message: `feed returned ${res.status}` }, 502);
    }
    const data = (await res.json()) as {
      chart?: {
        result?: {
          meta?: { currency?: string };
          timestamp?: number[];
          indicators?: { quote?: { close?: (number | null)[] }[] };
        }[];
      };
    };
    const result = data.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const points: { t: number; c: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (c !== null && c !== undefined) points.push({ t: timestamps[i], c });
    }
    if (points.length < 2) {
      return json({ error: "price_feed_error", message: "not enough data points" }, 502);
    }
    const first = points[0].c;
    const last = points[points.length - 1].c;
    return json({
      points,
      change_pct: first ? Math.round(((last - first) / first) * 1000) / 10 : null,
      currency: result?.meta?.currency ?? null,
      last,
    });
  } catch (e) {
    return json(
      {
        error: "price_feed_error",
        message: e instanceof Error ? e.message : String(e),
      },
      502,
    );
  }
};
