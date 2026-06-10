export interface Env {
  DB: D1Database;
  AI: Ai;
  ANTHROPIC_API_KEY: string;
}

export const STATUSES = [
  "inbox",
  "dismissed",
  "quick_look",
  "worked",
  "watchlist",
  "owned",
  "exited",
] as const;
export type Status = (typeof STATUSES)[number];

export const NOTE_TYPES = [
  "note",
  "thesis_update",
  "exit_criteria",
  "meeting",
  "musing",
  "post_mortem",
] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const SOURCES = [
  "substack",
  "twitter",
  "microcapclub",
  "yellowbrick",
  "person",
  "own",
  "other",
] as const;
export type Source = (typeof SOURCES)[number];

export interface CompanyRow {
  id: number;
  name: string;
  ticker: string | null;
  exchange: string | null;
  market_cap_musd: number | null;
  currency: string | null;
  status: Status;
  pass_reason: string | null;
  conviction: number | null;
  source: Source | null;
  source_detail: string | null;
  koyfin_url: string | null;
  model_url: string | null;
  model_updated_at: string | null;
  substack_url: string | null;
  ir_subscribed: number;
  ir_email_used: string | null;
  ir_notes: string | null;
  aliases: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteRow {
  id: number;
  company_id: number | null;
  note_type: NoteType;
  body: string;
  raw_transcript: string | null;
  created_at: string;
}

export interface ActionItemRow {
  id: number;
  company_id: number | null;
  note_id: number | null;
  body: string;
  done: number;
  created_at: string;
  done_at: string | null;
}

export interface DirectoryEntry {
  id: number;
  name: string;
  ticker: string | null;
  aliases: string[];
  status: Status;
}
