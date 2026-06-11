import { z } from "zod";
import { anthropicRequest, responseText } from "./anthropic";
import type { AnthropicMessage, AnthropicResponse } from "./anthropic";
import { extractJson } from "./parser";
import type { Env } from "./types";

const MODEL = "claude-sonnet-4-6";
const TIMEOUT_MS = 20_000;

const SYSTEM_PROMPT = `You are a financial calendar lookup assistant. Given a company (name, possibly a
ticker), use web search to find its NEXT scheduled earnings/results
announcement date. Then return ONLY a JSON object — no prose:

{
  "next_earnings_date": "YYYY-MM-DD" | null,  // the next FUTURE announcement
  "confidence": "confirmed" | "estimated" | null
}

Rules:
- Only a date in the future counts. If only past dates are findable, return null.
- "confirmed" when the company/IR has announced the date; "estimated" when it
  is an analyst/calendar estimate.
- null is better than a guess.`;

const schema = z.object({
  next_earnings_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  confidence: z
    .enum(["confirmed", "estimated"])
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
});

export type EarningsLookup = z.infer<typeof schema>;

/**
 * Research the next earnings date for a company. Best effort: returns null
 * on timeout/API failure/no result; the user can fill it in manually.
 */
export async function findNextEarningsDate(
  env: Env,
  name: string,
  ticker: string | null,
): Promise<EarningsLookup | null> {
  const deadline = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), TIMEOUT_MS),
  );
  try {
    return await Promise.race([run(env, name, ticker), deadline]);
  } catch {
    return null;
  }
}

async function run(
  env: Env,
  name: string,
  ticker: string | null,
): Promise<EarningsLookup | null> {
  const messages: AnthropicMessage[] = [
    {
      role: "user",
      content: `Today is ${new Date().toISOString().slice(0, 10)}.\nCompany: ${name}${ticker ? ` (${ticker})` : ""}\nWhen is its next earnings announcement?`,
    },
  ];
  let res: AnthropicResponse = await anthropicRequest(env, body(messages), {
    timeoutMs: TIMEOUT_MS,
  });
  for (let i = 0; i < 2 && res.stop_reason === "pause_turn"; i++) {
    messages.push({ role: "assistant", content: res.content });
    res = await anthropicRequest(env, body(messages), { timeoutMs: TIMEOUT_MS });
  }
  const text = responseText(res);
  if (!text) return null;
  const parsed = schema.parse(extractJson(text));
  // Guard against the model returning a past date.
  if (
    parsed.next_earnings_date &&
    parsed.next_earnings_date < new Date().toISOString().slice(0, 10)
  ) {
    return { next_earnings_date: null, confidence: null };
  }
  return parsed;
}

function body(messages: AnthropicMessage[]) {
  return {
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    messages,
  };
}

/** Due date for an earnings-anchored reminder: a few days before the event. */
export function reminderDueFromEarnings(earningsDate: string): string {
  const d = new Date(`${earningsDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 3);
  const today = new Date().toISOString().slice(0, 10);
  const due = d.toISOString().slice(0, 10);
  return due < today ? today : due;
}
