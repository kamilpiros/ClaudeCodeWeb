import { z } from "zod";
import { anthropicRequest, responseText } from "./anthropic";
import type { AnthropicMessage } from "./anthropic";
import type { DirectoryEntry, Env } from "./types";
import { NOTE_TYPES, SOURCES, STATUSES } from "./types";

export const PARSER_MODEL = "claude-haiku-4-5";

export const PARSER_SYSTEM_PROMPT = `You are the capture parser for a private investment-tracking app used by one
professional micro-cap investor. You receive a raw note (often a voice
transcript: informal, possibly German/English mixed, possibly rambling) plus a
directory of companies already in the database.

Return ONLY a JSON object with this exact shape:

{
  "company_match": <id of existing company, or null>,
  "match_confidence": "high" | "medium" | "low" | null,
  "mentioned_as": string | null,  // the exact name/phrase the user used to
                                  // refer to the matched company (e.g. the
                                  // transcript said "Euro Ice" for EuroEyes);
                                  // null when no company or when the user used
                                  // the canonical name/ticker
  "new_company": null | {
    "name": string,            // best-guess official name
    "ticker": string | null,   // only if stated or certain
    "source": "substack"|"twitter"|"microcapclub"|"yellowbrick"|"person"|"own"|"other"|null,
    "source_detail": string | null
  },
  "note_type": "note"|"thesis_update"|"exit_criteria"|"meeting"|"musing"|"post_mortem",
  "note_body": string,          // cleaned-up version of the input: fix
                                // transcription artifacts, keep the author's
                                // voice and ALL substance, do not summarize away
                                // numbers, names, or reasoning
  "action_items": [string],     // explicit UNDATED to-dos only ("check X", "ask Y")
  "reminders": [                // DATED/deadline-bound to-dos — anything the
                                // user must not forget by a certain time
    {
      "body": string,           // what to do, e.g. "Buy call options on Nestlé"
      "due_date": "YYYY-MM-DD" | null,  // resolve relative phrases ("next
                                // Friday", "in two weeks") from today's date;
                                // null when the timing is event-based
      "anchor": "next_earnings" | null  // "next_earnings" when the deadline is
                                // tied to the company's next earnings date
                                // ("before the next earnings", "ahead of Q2
                                // results") — the app researches that date
    }
  ],
  "suggested_status": null | "inbox"|"dismissed"|"quick_look"|"worked"|"watchlist"|"owned"|"exited",
  "pass_reason": string | null, // only when input clearly states why passing
  "horizon": "core" | "tactical" | null,  // "tactical" for short-term trades
                                // (options plays, earnings trades, swing
                                // trades, special situations with a clock);
                                // "core" for long-term holds / compounders;
                                // null when the note doesn't indicate either
  "conviction": 1|2|3|4|5|null, // only when clearly expressed ("high
                                // conviction", "small starter, not sure yet")
  "entry_price": number | null, // only when stated ("bought at 12.50")
  "target_price": number | null,// only when stated ("sell around 20", "target 18")
  "exit_criteria": string | null// only when the note states exit conditions
                                // ("exit if margins fall below 15%", "sell
                                // half at 2x"); concise, author's words
}

Rules:
- Match against names, tickers AND aliases. "P&C", "EuroEyes", "1846",
  "Smadex"/"EVC" style aliases are common. Prefer matching to creating new.
- If the note mentions no company at all (macro thoughts, process thoughts,
  personal reminders), set company_match and new_company to null and
  note_type to "musing".
- If the note mentions multiple companies, match the PRIMARY one and put the
  others into action_items as "Cross-ref: <name> — <context>".
- Only suggest a status change when the input implies it ("passing on this",
  "bought a starter", "putting this on the watchlist").
- A to-do WITH a deadline or event ("before earnings", "by Friday", "when the
  H1 report is out") goes into reminders, NOT action_items. Pre-fill as much
  as you can infer; leave fields null rather than guessing wrong.
- Never invent tickers. null is better than wrong.
- note_body language: keep whatever language the user used.`;

const nullableString = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v : null));

export const parsedCaptureSchema = z.object({
  company_match: z
    .number()
    .int()
    .nullish()
    .transform((v) => v ?? null),
  match_confidence: z
    .enum(["high", "medium", "low"])
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  mentioned_as: nullableString.catch(null),
  new_company: z
    .object({
      name: z.string().min(1),
      ticker: nullableString,
      source: z
        .enum(SOURCES)
        .nullish()
        .catch(null)
        .transform((v) => v ?? null),
      source_detail: nullableString,
    })
    .nullish()
    .transform((v) => v ?? null),
  note_type: z.enum(NOTE_TYPES).catch("note"),
  note_body: z.string().min(1),
  action_items: z.array(z.string()).catch([]),
  reminders: z
    .array(
      z.object({
        body: z.string().min(1),
        due_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullish()
          .catch(null)
          .transform((v) => v ?? null),
        anchor: z
          .enum(["next_earnings"])
          .nullish()
          .catch(null)
          .transform((v) => v ?? null),
      }),
    )
    .catch([]),
  suggested_status: z
    .enum(STATUSES)
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  pass_reason: nullableString.catch(null),
  horizon: z
    .enum(["core", "tactical"])
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  conviction: z
    .number()
    .int()
    .min(1)
    .max(5)
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  entry_price: z
    .number()
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  target_price: z
    .number()
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  exit_criteria: nullableString.catch(null),
});

export type ParsedCapture = z.infer<typeof parsedCaptureSchema>;

export class ParseFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseFailedError";
  }
}

/**
 * Extract a JSON object from model output: tolerate markdown fences and
 * stray prose around the object.
 */
export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("no JSON object found in model output");
  }
  return JSON.parse(t.slice(start, end + 1));
}

export function validateParsedCapture(raw: unknown): ParsedCapture {
  return parsedCaptureSchema.parse(raw);
}

function buildUserMessage(text: string, directory: DirectoryEntry[]): string {
  return [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    "",
    "Company directory (JSON):",
    JSON.stringify(directory),
    "",
    "Raw note:",
    '"""',
    text,
    '"""',
  ].join("\n");
}

/**
 * Step 1 of the capture pipeline: parse raw text with Haiku into a strict
 * JSON draft. If the model returns malformed JSON, retry once with a
 * "return only valid JSON" nudge, then throw ParseFailedError.
 */
export async function parseCapture(
  env: Env,
  text: string,
  directory: DirectoryEntry[],
): Promise<ParsedCapture> {
  const messages: AnthropicMessage[] = [
    { role: "user", content: buildUserMessage(text, directory) },
  ];

  let reply = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await anthropicRequest(env, {
      model: PARSER_MODEL,
      max_tokens: 3000,
      temperature: 0,
      system: PARSER_SYSTEM_PROMPT,
      messages,
    });
    reply = responseText(res);
    try {
      return validateParsedCapture(extractJson(reply));
    } catch {
      messages.push(
        { role: "assistant", content: reply },
        {
          role: "user",
          content:
            "That was not valid JSON matching the required shape. Return ONLY the JSON object, no prose, no markdown fences.",
        },
      );
    }
  }
  throw new ParseFailedError("model did not return valid JSON after retry");
}
