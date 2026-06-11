import { companyDirectory, getCompany } from "../../_lib/db";
import { findNextEarningsDate, reminderDueFromEarnings } from "../../_lib/earnings";
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
        detail: e instanceof Error ? e.message : String(e),
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
      country: enrichment?.country ?? null,
      sector: enrichment?.sector ?? null,
    };
  }

  // When a reminder is anchored to "next earnings", research the date now
  // (web search) so the reminder lands with a concrete due date. Reuse any
  // already-known earnings date on the matched company if it's still ahead.
  let nextEarningsDate: string | null = null;
  const needsEarnings = parsed.reminders.some((r) => r.anchor === "next_earnings");
  const companyName = matched?.name ?? newCompany?.name ?? null;
  if (needsEarnings && companyName) {
    const today = new Date().toISOString().slice(0, 10);
    if (matched) {
      const full = await getCompany(env.DB, matched.id);
      if (full?.next_earnings_date && full.next_earnings_date >= today) {
        nextEarningsDate = full.next_earnings_date;
      }
    }
    if (!nextEarningsDate) {
      const lookup = await findNextEarningsDate(
        env,
        companyName,
        matched?.ticker ?? newCompany?.ticker ?? null,
      );
      nextEarningsDate = lookup?.next_earnings_date ?? null;
    }
  }

  const reminders = parsed.reminders.map((r) => ({
    body: r.body,
    due_date:
      r.anchor === "next_earnings" && nextEarningsDate
        ? reminderDueFromEarnings(nextEarningsDate)
        : r.due_date,
    trigger: r.anchor === "next_earnings" ? "earnings" : null,
  }));

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
      reminders,
      suggested_status: parsed.suggested_status,
      pass_reason: parsed.pass_reason,
      horizon: parsed.horizon,
      conviction: parsed.conviction,
      next_earnings_date: nextEarningsDate,
      entry_price: parsed.entry_price,
      target_price: parsed.target_price,
      exit_criteria: parsed.exit_criteria,
    },
  });
};
