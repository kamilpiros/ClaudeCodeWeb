import type { CompanyRow, DirectoryEntry } from "./types";
import { parseAliases } from "./util";

/**
 * Compact company directory injected into the parser prompt:
 * [{id, name, ticker, aliases, status}] for ALL companies (fine at personal
 * scale; if >500 companies ever, trim to names/aliases only).
 */
export async function companyDirectory(
  db: D1Database,
): Promise<DirectoryEntry[]> {
  const { results } = await db
    .prepare("SELECT id, name, ticker, aliases, status FROM companies")
    .all<Pick<CompanyRow, "id" | "name" | "ticker" | "aliases" | "status">>();
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    ticker: r.ticker,
    aliases: parseAliases(r.aliases),
    status: r.status,
  }));
}

export async function getCompany(
  db: D1Database,
  id: number,
): Promise<CompanyRow | null> {
  return db
    .prepare("SELECT * FROM companies WHERE id = ?")
    .bind(id)
    .first<CompanyRow>();
}
