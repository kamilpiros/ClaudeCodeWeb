import { useState } from "react";
import { api } from "../api";
import { toast } from "../toast";
import type { CaptureDraft, Company, NoteType, Status } from "../types";
import {
  NOTE_TYPE_LABELS,
  NOTE_TYPES,
  SOURCES,
  STATUS_LABELS,
  STATUSES,
} from "../types";
import { CompanySearch } from "./CompanySearch";

interface ActionItemEdit {
  body: string;
  include: boolean;
}

interface ReminderEdit {
  body: string;
  due_date: string | null;
  trigger: string | null;
  include: boolean;
}

/**
 * The confirmation card shown after parsing: matched company (or NEW),
 * note type chip, cleaned note, action items as checkboxes, suggested
 * status. Everything is editable inline before saving.
 */
export function ConfirmCard(props: {
  draft: CaptureDraft;
  onSaved: () => void;
  onDiscard: () => void;
}) {
  const d = props.draft;
  const [company, setCompany] = useState(d.company);
  const [isNew, setIsNew] = useState(d.company === null && d.new_company !== null);
  const [newCompany, setNewCompany] = useState(
    d.new_company ?? {
      name: "",
      ticker: null,
      exchange: null,
      market_cap_musd: null,
      currency: null,
      source: null,
      source_detail: null,
    },
  );
  const [noteType, setNoteType] = useState<NoteType>(d.note_type);
  const [noteBody, setNoteBody] = useState(d.note_body);
  const [items, setItems] = useState<ActionItemEdit[]>(
    d.action_items.map((body) => ({ body, include: true })),
  );
  const [reminders, setReminders] = useState<ReminderEdit[]>(
    d.reminders.map((r) => ({ ...r, include: true })),
  );
  const [horizon, setHorizon] = useState<"core" | "tactical" | "">(
    d.horizon ?? "",
  );
  const [conviction, setConviction] = useState<number | "">(d.conviction ?? "");
  const [statusChange, setStatusChange] = useState<Status | "">(
    d.suggested_status ?? "",
  );
  const [passReason, setPassReason] = useState(d.pass_reason ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [switchingCompany, setSwitchingCompany] = useState(false);

  const hasCompany = company !== null || (isNew && newCompany.name.trim());

  async function save() {
    setSaving(true);
    try {
      await api.confirmCapture({
        company_id: company?.id ?? null,
        new_company:
          !company && isNew && newCompany.name.trim()
            ? {
                ...newCompany,
                name: newCompany.name.trim(),
                market_cap_musd:
                  newCompany.market_cap_musd === null
                    ? null
                    : Number(newCompany.market_cap_musd),
              }
            : null,
        note_type: noteType,
        note_body: noteBody.trim(),
        raw_transcript: d.raw_text,
        action_items: items.filter((i) => i.include && i.body.trim()).map((i) => i.body.trim()),
        reminders: reminders
          .filter((r) => r.include && r.body.trim())
          .map((r) => ({
            body: r.body.trim(),
            due_date: r.due_date || null,
            trigger: r.trigger,
          })),
        status_change: statusChange || null,
        pass_reason: passReason.trim() || null,
        mentioned_as: d.mentioned_as,
        horizon: horizon || null,
        conviction: conviction === "" ? null : conviction,
        next_earnings_date: d.next_earnings_date,
        entry_price: d.entry_price,
        target_price: d.target_price,
        exit_criteria: d.exit_criteria,
      });
      props.onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1>Confirm</h1>
      <div className="card stack">
        {/* Company */}
        <div>
          <div className="field-label">Company</div>
          {company ? (
            <div className="row wrap">
              <strong>{company.name}</strong>
              {company.ticker && <span className="chip">{company.ticker}</span>}
              <span className="chip">{STATUS_LABELS[company.status]}</span>
              {d.match_confidence && d.match_confidence !== "high" && (
                <span className="chip">match: {d.match_confidence}</span>
              )}
            </div>
          ) : isNew ? (
            <div className="row wrap">
              <span className="chip active">NEW</span>
              <strong>{newCompany.name || "—"}</strong>
              {newCompany.ticker && <span className="chip">{newCompany.ticker}</span>}
              {newCompany.exchange && <span className="chip">{newCompany.exchange}</span>}
              {newCompany.market_cap_musd !== null && (
                <span className="chip">
                  ~${Math.round(Number(newCompany.market_cap_musd))}M
                  {newCompany.currency ? ` · ${newCompany.currency}` : ""}
                </span>
              )}
              {newCompany.sector && <span className="chip">{newCompany.sector}</span>}
              {newCompany.country && <span className="chip">{newCompany.country}</span>}
            </div>
          ) : (
            <span className="muted">No company — saved as unattached musing</span>
          )}
          {switchingCompany ? (
            <div style={{ marginTop: 6 }}>
              <CompanySearch
                placeholder="Search to switch the matched company…"
                onSelect={(c: Company) => {
                  setCompany({ id: c.id, name: c.name, ticker: c.ticker, status: c.status });
                  setIsNew(false);
                  setSwitchingCompany(false);
                }}
              />
              <div className="row" style={{ marginTop: 6 }}>
                <button type="button" className="small" onClick={() => setSwitchingCompany(false)}>
                  Cancel
                </button>
                {d.new_company ? (
                  <button
                    type="button"
                    className="small"
                    onClick={() => {
                      setCompany(null);
                      setIsNew(true);
                      setSwitchingCompany(false);
                    }}
                  >
                    Use new: {d.new_company.name}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="small"
                    onClick={() => {
                      // The match was wrong and the company is genuinely new:
                      // start a blank company prefilled from the mention.
                      setCompany(null);
                      setIsNew(true);
                      setNewCompany({ ...newCompany, name: d.mentioned_as ?? "" });
                      setEditing(true);
                      setSwitchingCompany(false);
                    }}
                  >
                    New company…
                  </button>
                )}
                <button
                  type="button"
                  className="small"
                  onClick={() => {
                    setCompany(null);
                    setIsNew(false);
                    setSwitchingCompany(false);
                  }}
                >
                  No company (musing)
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="small"
              style={{ marginTop: 6 }}
              onClick={() => setSwitchingCompany(true)}
            >
              Switch company…
            </button>
          )}
        </div>

        {isNew && !company && editing && (
          <div className="stack">
            <div>
              <div className="field-label">Name</div>
              <input
                value={newCompany.name}
                onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
              />
            </div>
            <div className="row">
              <div className="grow">
                <div className="field-label">Ticker</div>
                <input
                  value={newCompany.ticker ?? ""}
                  onChange={(e) =>
                    setNewCompany({ ...newCompany, ticker: e.target.value || null })
                  }
                />
              </div>
              <div className="grow">
                <div className="field-label">Mkt cap ($M)</div>
                <input
                  inputMode="decimal"
                  value={newCompany.market_cap_musd ?? ""}
                  onChange={(e) =>
                    setNewCompany({
                      ...newCompany,
                      market_cap_musd: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div className="row">
              <div className="grow">
                <div className="field-label">Sector</div>
                <input
                  value={newCompany.sector ?? ""}
                  onChange={(e) =>
                    setNewCompany({ ...newCompany, sector: e.target.value || null })
                  }
                />
              </div>
              <div className="grow">
                <div className="field-label">Country</div>
                <input
                  value={newCompany.country ?? ""}
                  onChange={(e) =>
                    setNewCompany({ ...newCompany, country: e.target.value || null })
                  }
                />
              </div>
            </div>
            <div className="row">
              <div className="grow">
                <div className="field-label">Source</div>
                <select
                  value={newCompany.source ?? ""}
                  onChange={(e) =>
                    setNewCompany({
                      ...newCompany,
                      source: (e.target.value || null) as typeof newCompany.source,
                    })
                  }
                >
                  <option value="">—</option>
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grow">
                <div className="field-label">Source detail</div>
                <input
                  value={newCompany.source_detail ?? ""}
                  onChange={(e) =>
                    setNewCompany({ ...newCompany, source_detail: e.target.value || null })
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* Note type */}
        <div>
          <div className="field-label">Note type</div>
          {editing ? (
            <select
              value={noteType}
              onChange={(e) => setNoteType(e.target.value as NoteType)}
            >
              {NOTE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {NOTE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          ) : (
            <span className="chip">{NOTE_TYPE_LABELS[noteType]}</span>
          )}
        </div>

        {/* Note body */}
        <div>
          <div className="field-label">Note</div>
          {editing ? (
            <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
          ) : (
            <div className="pre">{noteBody}</div>
          )}
        </div>

        {/* Action items */}
        {(items.length > 0 || editing) && (
          <div>
            <div className="field-label">Action items</div>
            <div className="stack">
              {items.map((item, i) => (
                <div className="row" key={i}>
                  <input
                    type="checkbox"
                    checked={item.include}
                    onChange={(e) =>
                      setItems(items.map((it, j) => (j === i ? { ...it, include: e.target.checked } : it)))
                    }
                  />
                  {editing ? (
                    <input
                      className="grow"
                      value={item.body}
                      onChange={(e) =>
                        setItems(items.map((it, j) => (j === i ? { ...it, body: e.target.value } : it)))
                      }
                    />
                  ) : (
                    <span className="grow small">{item.body}</span>
                  )}
                </div>
              ))}
              {editing && (
                <button
                  type="button"
                  className="small"
                  onClick={() => setItems([...items, { body: "", include: true }])}
                >
                  + Add action item
                </button>
              )}
            </div>
          </div>
        )}

        {/* Reminders (dated to-dos) */}
        {(reminders.length > 0 || editing) && (
          <div>
            <div className="field-label">Reminders</div>
            <div className="stack">
              {reminders.map((r, i) => (
                <div className="row" key={i}>
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) =>
                      setReminders(
                        reminders.map((it, j) =>
                          j === i ? { ...it, include: e.target.checked } : it,
                        ),
                      )
                    }
                  />
                  {editing ? (
                    <input
                      className="grow"
                      value={r.body}
                      onChange={(e) =>
                        setReminders(
                          reminders.map((it, j) =>
                            j === i ? { ...it, body: e.target.value } : it,
                          ),
                        )
                      }
                    />
                  ) : (
                    <span className="grow small">
                      {r.body}
                      {r.trigger === "earnings" && (
                        <span className="muted"> (earnings-linked)</span>
                      )}
                    </span>
                  )}
                  <input
                    type="date"
                    style={{ width: "auto" }}
                    value={r.due_date ?? ""}
                    onChange={(e) =>
                      setReminders(
                        reminders.map((it, j) =>
                          j === i ? { ...it, due_date: e.target.value || null } : it,
                        ),
                      )
                    }
                  />
                </div>
              ))}
              {editing && (
                <button
                  type="button"
                  className="small"
                  onClick={() =>
                    setReminders([
                      ...reminders,
                      { body: "", due_date: null, trigger: null, include: true },
                    ])
                  }
                >
                  + Add reminder
                </button>
              )}
            </div>
          </div>
        )}

        {/* Earnings date researched at parse time */}
        {d.next_earnings_date && (
          <div className="row wrap">
            <span className="chip">Next earnings: {d.next_earnings_date}</span>
            <span className="muted small">researched — saved to the company</span>
          </div>
        )}

        {/* Position details extracted from the note */}
        {(d.entry_price !== null || d.target_price !== null || d.exit_criteria) && (
          <div className="row wrap">
            {d.entry_price !== null && <span className="chip">entry {d.entry_price}</span>}
            {d.target_price !== null && <span className="chip">target {d.target_price}</span>}
            {d.exit_criteria && (
              <span className="small muted">exit when: {d.exit_criteria}</span>
            )}
          </div>
        )}

        {/* Horizon + conviction pre-fill */}
        {hasCompany && (
          <div className="row">
            <div className="grow">
              <div className="field-label">Horizon</div>
              <select
                value={horizon}
                onChange={(e) => setHorizon(e.target.value as "core" | "tactical" | "")}
              >
                <option value="">—</option>
                <option value="core">Core (long-term)</option>
                <option value="tactical">Tactical (short-term)</option>
              </select>
            </div>
            <div className="grow">
              <div className="field-label">Conviction</div>
              <select
                value={conviction}
                onChange={(e) =>
                  setConviction(e.target.value === "" ? "" : Number(e.target.value))
                }
              >
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {"●".repeat(n)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Status change */}
        {hasCompany && (
          <div>
            <div className="field-label">
              Status change{d.suggested_status ? " (suggested)" : ""}
            </div>
            <select
              value={statusChange}
              onChange={(e) => setStatusChange(e.target.value as Status | "")}
            >
              <option value="">No change</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        )}

        {(statusChange === "dismissed" || passReason) && (
          <div>
            <div className="field-label">Pass reason</div>
            <input
              value={passReason}
              placeholder="why passing (3 words to 2 sentences)"
              onChange={(e) => setPassReason(e.target.value)}
            />
          </div>
        )}

        <div className="row">
          <button
            type="button"
            className="primary grow"
            onClick={save}
            disabled={saving || !noteBody.trim() || (isNew && !company && !newCompany.name.trim())}
          >
            {saving ? "Saving…" : "✓ Save"}
          </button>
          <button type="button" onClick={() => setEditing(!editing)}>
            {editing ? "Done" : "✎ Edit"}
          </button>
          <button type="button" className="danger" onClick={props.onDiscard}>
            ✗ Discard
          </button>
        </div>
      </div>
    </div>
  );
}
