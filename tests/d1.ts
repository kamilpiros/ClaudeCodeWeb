/**
 * Minimal D1Database-compatible adapter over node:sqlite (Node 22+), so the
 * confirm transaction and SQL run against a real SQLite engine in tests.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// node:sqlite is experimental and unknown to Vite's builtin list — load it
// via getBuiltinModule (Node 22.3+) so the bundler never resolves it.
type SqliteDb = {
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  };
  exec(sql: string): void;
};
const { DatabaseSync } = (
  process as unknown as {
    getBuiltinModule(name: string): { DatabaseSync: new (path: string) => SqliteDb };
  }
).getBuiltinModule("node:sqlite");

interface RunResult {
  results: unknown[];
  success: true;
  meta: { last_row_id: number; changes: number };
}

class TestStatement {
  constructor(
    private db: SqliteDb,
    private sql: string,
    private params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): TestStatement {
    return new TestStatement(this.db, this.sql, params);
  }

  async first<T = unknown>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as never[]));
    return (row as T | undefined) ?? null;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    const rows = this.db.prepare(this.sql).all(...(this.params as never[]));
    return { results: rows as T[] };
  }

  async run(): Promise<RunResult> {
    const res = this.db.prepare(this.sql).run(...(this.params as never[]));
    return {
      results: [],
      success: true,
      meta: {
        last_row_id: Number(res.lastInsertRowid),
        changes: Number(res.changes),
      },
    };
  }

  /** @internal used by batch */
  _runSync(): RunResult {
    const res = this.db.prepare(this.sql).run(...(this.params as never[]));
    return {
      results: [],
      success: true,
      meta: {
        last_row_id: Number(res.lastInsertRowid),
        changes: Number(res.changes),
      },
    };
  }
}

export class TestD1 {
  db: SqliteDb;

  constructor() {
    this.db = new DatabaseSync(":memory:");
  }

  prepare(sql: string): TestStatement {
    return new TestStatement(this.db, sql);
  }

  // D1 batch is atomic — emulate with a transaction.
  async batch(statements: TestStatement[]): Promise<RunResult[]> {
    this.db.exec("BEGIN");
    try {
      const results = statements.map((s) => s._runSync());
      this.db.exec("COMMIT");
      return results;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }
}

/** Fresh in-memory DB with all schema migrations applied (0001, 0003). */
export function freshDb(): TestD1 {
  const db = new TestD1();
  for (const file of [
    "0001_init.sql",
    "0003_intelligence.sql",
    "0004_classification.sql",
  ]) {
    db.db.exec(readFileSync(join(HERE, "..", "migrations", file), "utf8"));
  }
  return db;
}
