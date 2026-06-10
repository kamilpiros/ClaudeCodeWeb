export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

export async function readJson<T = Record<string, unknown>>(
  request: Request,
): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Best-effort Koyfin company URL from a ticker. Koyfin slugs vary, so the
 * field stays editable in the UI.
 */
export function koyfinUrl(ticker: string | null | undefined): string | null {
  if (!ticker) return null;
  return `https://app.koyfin.com/company/${encodeURIComponent(ticker.trim().toLowerCase())}`;
}

export function parseAliases(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((a) => typeof a === "string") : [];
  } catch {
    return [];
  }
}
