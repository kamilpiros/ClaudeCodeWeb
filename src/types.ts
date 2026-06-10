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

export const FUNNEL_ORDER: Status[] = [
  "inbox",
  "quick_look",
  "worked",
  "watchlist",
  "owned",
  "exited",
  "dismissed",
];

export const STATUS_LABELS: Record<Status, string> = {
  inbox: "Inbox",
  quick_look: "Quick look",
  worked: "Worked",
  watchlist: "Watchlist",
  owned: "Owned",
  exited: "Exited",
  dismissed: "Dismissed",
};

export const NOTE_TYPES = [
  "note",
  "thesis_update",
  "exit_criteria",
  "meeting",
  "musing",
  "post_mortem",
] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  note: "Note",
  thesis_update: "Thesis update",
  exit_criteria: "Exit criteria",
  meeting: "Meeting",
  musing: "Musing",
  post_mortem: "Post-mortem",
};

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

export interface Company {
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
  days_in_status?: number;
  open_action_items?: number;
}

export interface Note {
  id: number;
  company_id: number | null;
  note_type: NoteType;
  body: string;
  raw_transcript: string | null;
  created_at: string;
}

export interface ActionItem {
  id: number;
  company_id: number | null;
  note_id: number | null;
  body: string;
  done: number;
  created_at: string;
  done_at: string | null;
}

export interface StatusHistoryEntry {
  id: number;
  company_id: number;
  from_status: Status | null;
  to_status: Status;
  changed_at: string;
}

export interface DraftNewCompany {
  name: string;
  ticker: string | null;
  exchange: string | null;
  market_cap_musd: number | null;
  currency: string | null;
  source: Source | null;
  source_detail: string | null;
}

export interface CaptureDraft {
  raw_text: string;
  company: {
    id: number;
    name: string;
    ticker: string | null;
    status: Status;
  } | null;
  match_confidence: "high" | "medium" | "low" | null;
  mentioned_as: string | null;
  new_company: DraftNewCompany | null;
  note_type: NoteType;
  note_body: string;
  action_items: string[];
  suggested_status: Status | null;
  pass_reason: string | null;
}

export interface Stats {
  status_counts: { status: Status; count: number }[];
  captures_per_week: { week: string; captures: number }[];
  source_hit_rate: {
    source: string;
    total: number;
    hits: number;
    hit_rate: number;
  }[];
}
