import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ensureMigrated, splitSql } from "../functions/_lib/migrate";
import { MIGRATIONS } from "../functions/_lib/migrations.generated";
import { TestD1 } from "./d1";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "migrations");

const asD1 = (db: TestD1) => db as unknown as D1Database;

describe("runtime auto-migration", () => {
  it("generated bundle matches the migrations directory exactly", () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(MIGRATIONS.map((m) => m.name)).toEqual(files);
    for (const m of MIGRATIONS) {
      expect(m.sql).toBe(readFileSync(join(MIGRATIONS_DIR, m.name), "utf8"));
    }
  });

  it("migrates a completely fresh database including the seed", async () => {
    const db = new TestD1();
    await ensureMigrated(asD1(db));
    const companies = await db
      .prepare("SELECT COUNT(*) AS n FROM companies")
      .first<{ n: number }>();
    expect(companies!.n).toBe(10); // seeded
    const reminders = await db
      .prepare("SELECT name FROM sqlite_master WHERE name = 'reminders'")
      .first();
    expect(reminders).not.toBeNull();
    const meta = await db
      .prepare("SELECT COUNT(*) AS n FROM app_migrations")
      .first<{ n: number }>();
    expect(meta!.n).toBe(MIGRATIONS.length);
  });

  it("is idempotent on a second run", async () => {
    const db = new TestD1();
    await ensureMigrated(asD1(db));
    await ensureMigrated(asD1(db)); // WeakSet shortcut
    // simulate a different isolate hitting the same DB
    const { ensureMigrated: fresh } = (await import(
      "../functions/_lib/migrate"
    )) as typeof import("../functions/_lib/migrate");
    await expect(fresh(asD1(db))).resolves.toBeUndefined();
  });

  it("baselines a database previously migrated by wrangler without re-running", async () => {
    const db = new TestD1();
    // Simulate wrangler having applied 0001 + 0003 (but not 0004), with
    // real user data in place.
    for (const name of ["0001_init.sql", "0003_intelligence.sql"]) {
      db.db.exec(readFileSync(join(MIGRATIONS_DIR, name), "utf8"));
    }
    db.db.exec(
      `INSERT INTO companies (name, status, created_at, updated_at)
       VALUES ('My Real Company', 'owned', '2026-01-01', '2026-01-01')`,
    );

    await ensureMigrated(asD1(db));

    // Seed must NOT have run (existing data untouched), 0004 must have.
    const companies = await db
      .prepare("SELECT COUNT(*) AS n FROM companies")
      .first<{ n: number }>();
    expect(companies!.n).toBe(1);
    const withCountry = await db
      .prepare("SELECT country FROM companies WHERE name = 'My Real Company'")
      .first<{ country: string | null }>();
    expect(withCountry).not.toBeNull(); // column exists now
  });

  it("splitSql strips comments and splits statements", () => {
    const parts = splitSql("-- a comment\nCREATE TABLE x (id INTEGER);\n\nINSERT INTO x VALUES (1);\n");
    expect(parts).toEqual(["CREATE TABLE x (id INTEGER)", "INSERT INTO x VALUES (1)"]);
  });
});
