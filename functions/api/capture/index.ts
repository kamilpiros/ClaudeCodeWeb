import { companyDirectory } from "../../_lib/db";
import { enrichCompany } from "../../_lib/enrich";
import { ParseFailedError, parseCapture } from "../../_lib/parser";
import type { Env } from "../../_lib/types";
import { json, readJson } from "../../_lib/util";

/**
 * POST /api/capture — { text } in, parsed DRAFT out. Nothing is written to
 * D1; the user reviews/edits, then POSTs to /api/capture/confirm.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<{ text?: string }>(request);
  const text = body?.text?.trim();
  if (!text) return json({ error: "text required" }, 400);

  const directory = await companyDirectory(env.DB);

  let parsed;
  try {
    parsed = await parseCapture(env, text, directory);
  } catch (e) {
    // Capture must NEVER lose input: surface a friendly error so the
    // frontend can offer to save the raw text as an unparsed musing.
    return json(
      {
        error: e instanceof ParseFailedError ? "parse_failed" : "llm_unavailable",
        message:
          "Could not parse the note right now. You can save it as a raw musing instead.",
        raw_text: text,
      },
      502,
    );
  }

  const matched =
    parsed.company_match !== null
      ? (directory.find((c) => c.id === parsed.company_match) ?? null)
      : null;

  let newCompany = null;
  if (!matched && parsed.new_company) {
    // Enrich only new companies missing ticker/market-cap (a freshly parsed
    // company never has a market cap, so enrich whenever one is proposed).
    const enrichment = await enrichCompany(
      env,
      parsed.new_company.name,
      parsed.new_company.ticker
        ? `possible ticker: ${parsed.new_company.ticker}`
        : null,
    );
    newCompany = {
      ...parsed.new_company,
      ticker: parsed.new_company.ticker ?? enrichment?.ticker ?? null,
      exchange: enrichment?.exchange ?? null,
      market_cap_musd: enrichment?.market_cap_musd ?? null,
      currency: enrichment?.currency ?? null,
    };
  }

  return json({
    draft: {
      raw_text: text,
      company: matched,
      match_confidence: matched ? parsed.match_confidence : null,
      mentioned_as: parsed.mentioned_as,
      new_company: newCompany,
      note_type: parsed.note_type,
      note_body: parsed.note_body,
      action_items: parsed.action_items,
      suggested_status: parsed.suggested_status,
      pass_reason: parsed.pass_reason,
    },
  });
};
