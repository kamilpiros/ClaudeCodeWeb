import { describe, expect, it } from "vitest";
import { confirmCapture, confirmDraftSchema } from "../functions/_lib/confirm";
import type { CompanyRow } from "../functions/_lib/types";
import { freshDb, TestD1 } from "./d1";

const asD1 = (db: TestD1) => db as unknown as D1Database;

function baseDraft(overrides: Record<string, unknown> = {}) {
  return confirmDraftSchema.parse({
    company_id: null,
    new_company: null,
    note_type: "note",
    note_body: "a note",
    raw_transcript: null,
    action_items: [],
    status_change: null,
    pass_reason: null,
    mentioned_as: null,
    ...overrides,
  });
}

async function seedCompany(
  db: TestD1,
  fields: Partial<CompanyRow> = {},
): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO companies (name, ticker, status, aliases, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      fields.name ?? "EuroEyes International Eye Clinic",
      fields.ticker ?? "1846.HK",
      fields.status ?? "inbox",
      fields.aliases ?? '["1846"]',
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    )
    .run();
  return res.meta.last_row_id;
}

describe("confirmCapture transaction", () => {
  it("creates a new company with note, action items and initial status history", async () => {
    const db = freshDb();
    const result = await confirmCapture(
      asD1(db),
      baseDraft({
        new_company: {
          name: "Hammond Power Solutions",
          ticker: "HPS-A.TO",
          exchange: "TSX",
          market_cap_musd: 650,
          currency: "CAD",
          source: "microcapclub",
          source_detail: "MCC write-up",
        },
        note_body: "Transformer backlog growing, check capacity adds.",
        action_items: ["Check capacity expansion timeline", "Read latest MD&A"],
        status_change: "quick_look",
      }),
    );

    expect(result.company).not.toBeNull();
    expect(result.company!.name).toBe("Hammond Power Solutions");
    expect(result.company!.status).toBe("quick_look");
    expect(result.company!.koyfin_url).toContain("koyfin.com");
    expect(result.note.company_id).toBe(result.company!.id);
    expect(result.note.body).toContain("Transformer backlog");
    expect(result.action_items).toHaveLength(2);
    expect(result.action_items[0].company_id).toBe(result.company!.id);
    expect(result.action_items[0].note_id).toBe(result.note.id);

    const history = await db
      .prepare("SELECT * FROM status_history WHERE company_id = ?")
      .bind(result.company!.id)
      .all<{ from_status: string | null; to_status: string }>();
    expect(history.results).toHaveLength(1);
    expect(history.results[0].from_status).toBeNull();
    expect(history.results[0].to_status).toBe("quick_look");
  });

  it("attaches a note + action items to an existing company", async () => {
    const db = freshDb();
    const id = await seedCompany(db);
    const result = await confirmCapture(
      asD1(db),
      baseDraft({
        company_id: id,
        note_body: "Met IR, LASIK volumes recovering in tier-2 cities.",
        note_type: "meeting",
        action_items: ["Cross-ref: Aier Eye — China comp"],
      }),
    );
    expect(result.company!.id).toBe(id);
    expect(result.note.company_id).toBe(id);
    expect(result.note.note_type).toBe("meeting");
    expect(result.action_items).toHaveLength(1);
    expect(result.action_items[0].done).toBe(0);
  });

  it("saves an unattached musing when no company is involved", async () => {
    const db = freshDb();
    const result = await confirmCapture(
      asD1(db),
      baseDraft({
        note_type: "musing",
        note_body: "Position sizing: too timid on highest-conviction names.",
      }),
    );
    expect(result.company).toBeNull();
    expect(result.note.company_id).toBeNull();
  });

  it("rejects a draft pointing at a missing company", async () => {
    const db = freshDb();
    await expect(
      confirmCapture(asD1(db), baseDraft({ company_id: 999, note_body: "x" })),
    ).rejects.toThrow(/not found/);
  });
});

describe("status-history writes", () => {
  it("writes history and pass_reason on a status change", async () => {
    const db = freshDb();
    const id = await seedCompany(db, { status: "quick_look" });
    await confirmCapture(
      asD1(db),
      baseDraft({
        company_id: id,
        note_body: "Passing — margin story already priced in.",
        status_change: "dismissed",
        pass_reason: "fully priced",
      }),
    );
    const company = await db
      .prepare("SELECT * FROM companies WHERE id = ?")
      .bind(id)
      .first<CompanyRow>();
    expect(company!.status).toBe("dismissed");
    expect(company!.pass_reason).toBe("fully priced");

    const history = await db
      .prepare("SELECT * FROM status_history WHERE company_id = ? ORDER BY id")
      .bind(id)
      .all<{ from_status: string | null; to_status: string }>();
    expect(history.results).toHaveLength(1);
    expect(history.results[0].from_status).toBe("quick_look");
    expect(history.results[0].to_status).toBe("dismissed");
  });

  it("does not write history when status is unchanged", async () => {
    const db = freshDb();
    const id = await seedCompany(db, { status: "owned" });
    await confirmCapture(
      asD1(db),
      baseDraft({ company_id: id, note_body: "still long", status_change: "owned" }),
    );
    const history = await db
      .prepare("SELECT COUNT(*) AS n FROM status_history WHERE company_id = ?")
      .bind(id)
      .first<{ n: number }>();
    expect(history!.n).toBe(0);
  });
});

describe("alias learning", () => {
  it("appends a new alias when the input used an unknown name", async () => {
    const db = freshDb();
    const id = await seedCompany(db); // aliases: ["1846"]
    await confirmCapture(
      asD1(db),
      baseDraft({
        company_id: id,
        note_body: "Euro Ice growing nicely.",
        mentioned_as: "Euro Ice",
      }),
    );
    const company = await db
      .prepare("SELECT aliases FROM companies WHERE id = ?")
      .bind(id)
      .first<{ aliases: string }>();
    expect(JSON.parse(company!.aliases)).toEqual(["1846", "Euro Ice"]);
  });

  it("does not duplicate an existing alias, name or ticker", async () => {
    const db = freshDb();
    const id = await seedCompany(db);
    for (const mentioned of ["1846", "1846.HK", "euroeyes international eye clinic"]) {
      await confirmCapture(
        asD1(db),
        baseDraft({ company_id: id, note_body: "note", mentioned_as: mentioned }),
      );
    }
    const company = await db
      .prepare("SELECT aliases FROM companies WHERE id = ?")
      .bind(id)
      .first<{ aliases: string }>();
    expect(JSON.parse(company!.aliases)).toEqual(["1846"]);
  });

  it("stores mentioned_as as an alias on a NEW company when it differs from the name", async () => {
    const db = freshDb();
    const result = await confirmCapture(
      asD1(db),
      baseDraft({
        new_company: {
          name: "Peek & Cloppenburg",
          ticker: null,
          exchange: null,
          market_cap_musd: null,
          currency: null,
          source: null,
          source_detail: null,
        },
        note_body: "P&C retail note",
        mentioned_as: "P&C",
      }),
    );
    expect(JSON.parse(result.company!.aliases!)).toEqual(["P&C"]);
  });
});
