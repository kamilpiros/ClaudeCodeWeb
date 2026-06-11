import type { Env } from "./types";

const API_URL = "https://api.anthropic.com/v1/messages";

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: unknown;
}

export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  temperature?: number;
  system?: string;
  messages: AnthropicMessage[];
  tools?: unknown[];
}

interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface AnthropicResponse {
  content: ContentBlock[];
  stop_reason: string;
  [key: string]: unknown;
}

export class AnthropicError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "AnthropicError";
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST /v1/messages with one retry on 429/5xx/network errors.
 * 4xx errors (other than 429) are not retried.
 */
export async function anthropicRequest(
  env: Env,
  body: AnthropicRequestBody,
  opts: { timeoutMs?: number } = {},
): Promise<AnthropicResponse> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  if (!env.ANTHROPIC_API_KEY) {
    throw new AnthropicError(
      "ANTHROPIC_API_KEY secret is not set on this deployment",
    );
  }
  let lastError: Error = new AnthropicError("request not attempted");

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.ok) return (await res.json()) as AnthropicResponse;
      if (res.status === 429 || res.status >= 500) {
        lastError = new AnthropicError(
          `Anthropic API ${res.status}`,
          res.status,
        );
        await sleep(1200 * (attempt + 1));
        continue;
      }
      const detail = await res.text();
      throw new AnthropicError(`Anthropic API ${res.status}: ${detail}`, res.status);
    } catch (e) {
      if (e instanceof AnthropicError && e.status !== null && e.status < 500 && e.status !== 429) {
        throw e;
      }
      lastError = e instanceof Error ? e : new Error(String(e));
      await sleep(1200 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

/** Concatenated text of all text blocks in a response. */
export function responseText(res: AnthropicResponse): string {
  return res.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
