import { describe, expect, it } from "vitest";
import { generateSql, parseCsv } from "../scripts/import";
import { freshDb } from "./d1";

describe("CSV import script", () => {
  it("parses semicolon-delimited rows with quotes", () => {
    const rows = parseCsv('a;"b;c";d\ne;"f""g";h\n');
    expect(rows).toEqual([
      ["a", "b;c", "d"],
      ["e", 'f"g', "h"],
    ]);
  });

  it("generates SQL that loads into the schema", async () => {
    const csv = [
      "name;ticker;status;pass_reason;source;notes;date",
      "EuroEyes;1846.HK;owned;;MicroCapClub;LASIK leader in DE/CN;01.03.2024",
      'Some AG;;passed;"too levered; cyclical";Substack XYZ;;2024-05-12',
      "Macro idea co;;watch;;;watching rates play;15.06.2024",
    ].join("\n");

    const sql = generateSql(csv);
    const db = freshDb();
    db.db.exec(sql);

    const companies = await db
      .prepare("SELECT name, status, pass_reason, source FROM companies ORDER BY id")
      .all<{ name: string; status: string; pass_reason: string | null; source: string | null }>();
    expect(companies.results).toHaveLength(3);
    expect(companies.results[0]).toMatchObject({
      name: "EuroEyes",
      status: "owned",
      source: "microcapclub",
    });
    expect(companies.results[1]).toMatchObject({
      name: "Some AG",
      status: "dismissed",
      pass_reason: "too levered; cyclical",
      source: "substack",
    });
    expect(companies.results[2].status).toBe("watchlist");

    // one note per non-empty notes cell
    const notes = await db
      .prepare("SELECT COUNT(*) AS n FROM notes")
      .first<{ n: number }>();
    expect(notes!.n).toBe(2);

    // every company gets an initial status_history row
    const history = await db
      .prepare("SELECT COUNT(*) AS n FROM status_history")
      .first<{ n: number }>();
    expect(history!.n).toBe(3);
  });
});
