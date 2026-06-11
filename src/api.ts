import type {
  ActionItem,
  CaptureDraft,
  Company,
  Note,
  NoteType,
  Quote,
  Reminder,
  Stats,
  Status,
  StatusHistoryEntry,
} from "./types";

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, payload: unknown) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error: unknown }).error)
          : `HTTP ${status}`;
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, payload);
  return payload as T;
}

export const api = {
  transcribe: async (blob: Blob): Promise<string> => {
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "content-type": blob.type || "application/octet-stream" },
      body: blob,
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, payload);
    return (payload as { transcript: string }).transcript;
  },

  capture: (text: string) =>
    request<{ draft: CaptureDraft }>("POST", "/api/capture", { text }),

  confirmCapture: (draft: unknown) =>
    request<{ company: Company | null; note: Note; action_items: ActionItem[] }>(
      "POST",
      "/api/capture/confirm",
      draft,
    ),

  listCompanies: (opts: { status?: string; q?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.q) params.set("q", opts.q);
    const qs = params.toString();
    return request<{ companies: Company[] }>(
      "GET",
      `/api/companies${qs ? `?${qs}` : ""}`,
    );
  },

  getCompany: (id: number) =>
    request<{
      company: Company;
      notes: Note[];
      action_items: ActionItem[];
      status_history: StatusHistoryEntry[];
    }>("GET", `/api/companies/${id}`),

  patchCompany: (id: number, fields: Record<string, unknown>) =>
    request<{ company: Company }>("PATCH", `/api/companies/${id}`, fields),

  deleteCompany: (id: number) =>
    request<{ ok: true }>("DELETE", `/api/companies/${id}`),

  enrichCompany: (id: number) =>
    request<{ company: Company }>("POST", `/api/companies/${id}/enrich`),

  deleteReminder: (id: number) =>
    request<{ ok: true }>("DELETE", `/api/reminders/${id}`),

  createNote: (note: {
    company_id?: number | null;
    note_type?: NoteType;
    body: string;
    raw_transcript?: string | null;
  }) => request<{ note: Note }>("POST", "/api/notes", note),

  deleteNote: (id: number) => request<{ ok: true }>("DELETE", `/api/notes/${id}`),

  attachNote: (id: number, companyId: number) =>
    request<{ note: Note }>("PATCH", `/api/notes/${id}/attach`, {
      company_id: companyId,
    }),

  toggleActionItem: (id: number, done: boolean) =>
    request<{ action_item: ActionItem }>("PATCH", `/api/action_items/${id}`, {
      done,
    }),

  musings: () => request<{ musings: Note[] }>("GET", "/api/musings"),

  stats: () => request<Stats>("GET", "/api/stats"),

  reminders: () => request<{ reminders: Reminder[] }>("GET", "/api/reminders"),

  createReminder: (reminder: {
    company_id?: number | null;
    body: string;
    due_date?: string | null;
  }) => request<{ reminder: Reminder }>("POST", "/api/reminders", reminder),

  patchReminder: (
    id: number,
    fields: { done?: boolean; body?: string; due_date?: string | null },
  ) => request<{ reminder: Reminder }>("PATCH", `/api/reminders/${id}`, fields),

  quotes: () => request<{ quotes: Quote[] }>("GET", "/api/quotes"),
};

export function formatMarketCap(
  musd: number | null | undefined,
): string | null {
  if (musd === null || musd === undefined) return null;
  if (musd >= 1000) return `$${(musd / 1000).toFixed(1)}B`;
  return `$${Math.round(musd)}M`;
}

export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}
