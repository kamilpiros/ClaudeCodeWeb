import { z } from "zod";
import { anthropicRequest, responseText } from "./anthropic";
import type { AnthropicMessage, AnthropicResponse } from "./anthropic";
import { extractJson } from "./parser";
import type { Env } from "./types";

export const ENRICH_MODEL = "claude-sonnet-4-6";
const ENRICH_TIMEOUT_MS = 20_000;

const ENRICH_SYSTEM_PROMPT = `You are a financial data lookup assistant. Given a company name (and optional
context), use web search to find its stock listing details. Then return ONLY a
JSON object with this exact shape — no prose:

{
  "ticker": string | null,        // exchange-style ticker, e.g. "1846.HK", "EVC", "3661.T"
  "exchange": string | null,      // e.g. "HKEX", "NYSE", "ASX", "XETRA"
  "market_cap_musd": number | null, // approximate market cap in MILLIONS of USD
  "currency": string | null,      // listing currency, e.g. "USD", "HKD"
  "country": string | null,       // home country, e.g. "Switzerland", "Japan"
  "sector": string | null         // ONE coarse bucket: "Technology" | "Healthcare" |
                                  // "Industrials" | "Consumer" | "Financials" |
                                  // "Energy" | "Materials" | "Real Estate" |
                                  // "Utilities" | "Telecom" | "Media" | "Other"
}

Rules:
- Never invent a ticker. If unsure, use null.
- market_cap_musd is a rough number in millions of USD (e.g. 350 for $350M).
- If the company appears to be private or unlisted, ticker/exchange/currency
  are null but country and sector may still be filled.`;

const enrichmentSchema = z.object({
  ticker: z
    .string()
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
  exchange: z
    .string()
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
  market_cap_musd: z
    .number()
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  currency: z
    .string()
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
  country: z
    .string()
    .nullish()
    .catch(null)
    .transform((v) => (v && v.trim() ? v.trim() : null)),
  sector: z
    .string()
    .nullish()
    .catch(null)
    .transform((v) => (v && v.trim() ? v.trim() : null)),
});

export type Enrichment = z.infer<typeof enrichmentSchema>;

/**
 * Step 2 of the capture pipeline: single Sonnet call with the web_search
 * tool. Returns null on any failure (timeout, API error, bad JSON) — the
 * draft is then returned un-enriched and the user fills fields in later.
 */
export async function enrichCompany(
  env: Env,
  name: string,
  context: string | null,
  opts: { timeoutMs?: number } = {},
): Promise<Enrichment | null> {
  try {
    return await enrichCompanyStrict(env, name, context, opts);
  } catch {
    return null;
  }
}

/**
 * Same lookup, but failures throw with the underlying reason — used by the
 * explicit "Auto-fill" endpoint so problems are diagnosable.
 */
export async function enrichCompanyStrict(
  env: Env,
  name: string,
  context: string | null,
  opts: { timeoutMs?: number } = {},
): Promise<Enrichment | null> {
  const timeoutMs = opts.timeoutMs ?? ENRICH_TIMEOUT_MS;
  const deadline = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`lookup timed out after ${timeoutMs / 1000}s`)), timeoutMs),
  );
  return Promise.race([runEnrichment(env, name, context, timeoutMs), deadline]);
}

async function runEnrichment(
  env: Env,
  name: string,
  context: string | null,
  timeoutMs: number,
): Promise<Enrichment | null> {
  const messages: AnthropicMessage[] = [
    {
      role: "user",
      content: `Company: ${name}${context ? `\nContext: ${context}` : ""}`,
    },
  ];

  let res: AnthropicResponse = await anthropicRequest(
    env,
    enrichBody(messages),
    { timeoutMs },
  );
  // Server-side tool loop can pause; resume by re-sending with the
  // assistant turn appended (max twice within our time budget).
  for (let i = 0; i < 2 && res.stop_reason === "pause_turn"; i++) {
    messages.push({ role: "assistant", content: res.content });
    res = await anthropicRequest(env, enrichBody(messages), { timeoutMs });
  }

  const text = responseText(res);
  if (!text) throw new Error("model returned no text");
  return enrichmentSchema.parse(extractJson(text));
}

function enrichBody(messages: AnthropicMessage[]) {
  return {
    model: ENRICH_MODEL,
    max_tokens: 2000,
    system: ENRICH_SYSTEM_PROMPT,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    messages,
  };
}
