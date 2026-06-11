import { MIGRATIONS } from "./migrations.generated";

/**
 * Runtime auto-migration: every deploy brings its migrations with it and
 * applies any pending ones on the first API request. Removes the need to
 * ever run `wrangler d1 migrations apply` against production.
 *
 * Databases that were previously migrated by wrangler are detected by
 * their schema artifacts and baselined without re-running anything.
 */

const migratedDbs = new WeakSet<D1Database>();

export async function ensureMigrated(db: D1Database): Promise<void> {
  if (migratedDbs.has(db)) return;

  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
    )
    .run();

  const { results } = await db
    .prepare("SELECT name FROM app_migrations")
    .all<{ name: string }>();
  const applied = new Set(results.map((r) => r.name));

  // First run against a DB that wrangler already migrated: record what is
  // demonstrably present so we don't re-run it.
  if (applied.size === 0) {
    for (const m of MIGRATIONS) {
      if (await artifactPresent(db, m.name)) {
        await db
          .prepare("INSERT INTO app_migrations (name, applied_at) VALUES (?, ?)")
          .bind(m.name, new Date().toISOString())
          .run();
        applied.add(m.name);
      }
    }
  }

  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) continue;
    const stmts = splitSql(m.sql).map((s) => db.prepare(s));
    stmts.push(
      db
        .prepare("INSERT INTO app_migrations (name, applied_at) VALUES (?, ?)")
        .bind(m.name, new Date().toISOString()),
    );
    await db.batch(stmts);
  }

  migratedDbs.add(db);
}

/**
 * Strip comments and split a migration file into individual statements.
 * Inline `--` comments are removed per line, which is safe because no
 * string literal in our migrations contains `--`.
 */
export function splitSql(sql: string): string[] {
  const withoutComments = sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Detect whether a known migration's effects already exist in the schema. */
async function artifactPresent(db: D1Database, name: string): Promise<boolean> {
  switch (name) {
    case "0001_init.sql":
      return tableExists(db, "companies");
    case "0002_seed.sql":
      // Ran together with 0001 historically; if companies pre-exists,
      // treat the seed as done (never re-seed an in-use database).
      return tableExists(db, "companies");
    case "0003_intelligence.sql":
      return tableExists(db, "reminders");
    case "0004_classification.sql":
      return columnExists(db, "companies", "country");
    default:
      return false;
  }
}

async function tableExists(db: D1Database, table: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(table)
    .first();
  return row !== null;
}

async function columnExists(
  db: D1Database,
  table: string,
  column: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(table)
    .first<{ sql: string }>();
  return row !== null && new RegExp(`\\b${column}\\b`).test(row.sql);
}
