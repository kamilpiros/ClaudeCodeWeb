import { describe, expect, it } from "vitest";
import {
  extractJson,
  validateParsedCapture,
} from "../functions/_lib/parser";

const validPayload = {
  company_match: 3,
  match_confidence: "high",
  mentioned_as: "Euro Ice",
  new_company: null,
  note_type: "thesis_update",
  note_body: "LASIK volumes recovering; thesis intact.",
  action_items: ["Check H1 numbers"],
  suggested_status: null,
  pass_reason: null,
};

describe("parser output validation (zod)", () => {
  it("accepts a well-formed payload", () => {
    const parsed = validateParsedCapture(validPayload);
    expect(parsed.company_match).toBe(3);
    expect(parsed.note_type).toBe("thesis_update");
    expect(parsed.action_items).toEqual(["Check H1 numbers"]);
  });

  it("accepts a new-company payload", () => {
    const parsed = validateParsedCapture({
      ...validPayload,
      company_match: null,
      match_confidence: null,
      mentioned_as: null,
      new_company: {
        name: "Hammond Power",
        ticker: null,
        source: "microcapclub",
        source_detail: "forum post",
      },
    });
    expect(parsed.new_company?.name).toBe("Hammond Power");
    expect(parsed.new_company?.ticker).toBeNull();
  });

  it("normalizes missing optional fields to null/defaults", () => {
    const parsed = validateParsedCapture({
      company_match: null,
      new_company: null,
      note_type: "musing",
      note_body: "macro thought",
    });
    expect(parsed.match_confidence).toBeNull();
    expect(parsed.mentioned_as).toBeNull();
    expect(parsed.action_items).toEqual([]);
    expect(parsed.suggested_status).toBeNull();
    expect(parsed.pass_reason).toBeNull();
  });

  it("tolerates out-of-enum noise on non-critical fields", () => {
    const parsed = validateParsedCapture({
      ...validPayload,
      match_confidence: "very-high",
      suggested_status: "buy",
      note_type: "random_thing",
    });
    expect(parsed.match_confidence).toBeNull();
    expect(parsed.suggested_status).toBeNull();
    expect(parsed.note_type).toBe("note"); // falls back to default
  });

  it("rejects payloads missing the note body", () => {
    expect(() =>
      validateParsedCapture({ ...validPayload, note_body: "" }),
    ).toThrow();
    expect(() =>
      validateParsedCapture({ company_match: null, new_company: null }),
    ).toThrow();
  });
});

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it("strips markdown fences", () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it("ignores prose around the object", () => {
    expect(extractJson('Here you go:\n{"a": {"b": 2}}\nDone.')).toEqual({
      a: { b: 2 },
    });
  });

  it("throws on output with no JSON object", () => {
    expect(() => extractJson("sorry, I cannot")).toThrow();
  });

  it("throws on malformed JSON", () => {
    expect(() => extractJson('{"a": ')).toThrow();
  });
});
