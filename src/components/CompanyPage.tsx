import { useCallback, useEffect, useState } from "react";
import { api, formatDate, formatMarketCap } from "../api";
import { toast } from "../toast";
import type {
  ActionItem,
  Company,
  Note,
  NoteType,
  Quote,
  Reminder,
  Status,
  StatusHistoryEntry,
} from "../types";
import {
  NOTE_TYPE_LABELS,
  NOTE_TYPES,
  STATUS_LABELS,
  STATUSES,
} from "../types";

export function CompanyPage({ id }: { id: number }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await api.getCompany(id);
      setCompany(data.company);
      setNotes(data.notes);
      setActionItems(data.action_items);
      setHistory(data.status_history);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
    try {
      const { reminders } = await api.reminders();
      setReminders(reminders.filter((r) => r.company_id === id && !r.done));
    } catch {
      /* non-fatal */
    }
  }, [id]);

  useEffect(() => {
    reload();
    api
      .quotes()
      .then(({ quotes }) => setQuote(quotes.find((q) => q.company_id === id) ?? null))
      .catch(() => {});
  }, [reload, id]);

  async function patch(fields: Record<string, unknown>) {
    try {
      const { company: updated } = await api.patchCompany(id, fields);
      setCompany(updated);
      if ("status" in fields) reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed");
    }
  }

  if (error) return <p className="muted">{error}</p>;
  if (!company) return <p className="muted">Loading…</p>;

  const mcap = formatMarketCap(company.market_cap_musd);

  return (
    <div>
      <a href="#/pipeline" className="muted small">
        ← Pipeline
      </a>
      <h1 style={{ marginBottom: 4 }}>{company.name}</h1>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        {company.ticker && <span className="chip">{company.ticker}</span>}
        <select
          value={company.status}
          style={{ width: "auto", padding: "4px 8px", fontSize: "0.85rem" }}
          onChange={(e) => patch({ status: e.target.value as Status })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {mcap && <span className="chip">{mcap}</span>}
        {quote?.price != null && (
          <span className="chip">
            {quote.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            {quote.currency ? ` ${quote.currency}` : ""}
            {quote.change_since_baseline_pct !== null && (
              <span className={quote.change_since_baseline_pct >= 0 ? "up" : "down"}>
                {" "}
                {quote.change_since_baseline_pct >= 0 ? "+" : ""}
                {quote.change_since_baseline_pct}% since{" "}
                {quote.baseline_price_date ?? "added"}
              </span>
            )}
          </span>
        )}
        <select
          value={company.horizon ?? ""}
          style={{ width: "auto", padding: "4px 8px", fontSize: "0.85rem" }}
          onChange={(e) => patch({ horizon: e.target.value || null })}
        >
          <option value="">horizon: —</option>
          <option value="core">Core</option>
          <option value="tactical">Tactical</option>
        </select>
        {company.next_earnings_date && (
          <span className="chip">ER {company.next_earnings_date}</span>
        )}
        {company.sector && <span className="chip">{company.sector}</span>}
        {company.country && <span className="chip">{company.country}</span>}
        {company.source && (
          <span className="chip">
            {company.source}
            {company.source_detail ? `: ${company.source_detail}` : ""}
          </span>
        )}
        {(!company.sector || !company.country || !company.market_cap_musd) && (
          <button
            type="button"
            className="small"
            onClick={async () => {
              toast("Researching…");
              try {
                const { company: updated } = await api.enrichCompany(id);
                setCompany(updated);
                toast("Filled missing fields");
              } catch {
                toast("Lookup failed — try again");
              }
            }}
          >
            ✦ Auto-fill
          </button>
        )}
      </div>

      {/* Conviction */}
      <div className="card row between">
        <span className="muted small">Conviction</span>
        <span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className="small"
              style={{ border: "none", background: "none", padding: "0 3px", fontSize: "1.1rem" }}
              onClick={() => patch({ conviction: company.conviction === n ? null : n })}
            >
              {company.conviction && company.conviction >= n ? "●" : "○"}
            </button>
          ))}
        </span>
      </div>

      {company.pass_reason && (
        <div className="card small">
          <span className="muted">Pass reason: </span>
          {company.pass_reason}
        </div>
      )}

      {/* Price history */}
      {company.ticker && <PriceChart companyId={id} />}

      {/* Ownership block — only when the company is (or was) a position */}
      {(company.status === "owned" || company.status === "exited") && (
        <PositionBlock company={company} onPatch={patch} />
      )}

      {/* Links */}
      <LinkRow company={company} onPatch={patch} />

      {/* IR block */}
      <IrBlock company={company} onPatch={patch} />

      {/* Open action items */}
      {actionItems.length > 0 && (
        <>
          <h2>Open action items</h2>
          <div className="card stack">
            {actionItems.map((a) => (
              <label className="row" key={a.id}>
                <input
                  type="checkbox"
                  checked={Boolean(a.done)}
                  onChange={async (e) => {
                    await api.toggleActionItem(a.id, e.target.checked);
                    reload();
                  }}
                />
                <span className="grow small">{a.body}</span>
              </label>
            ))}
          </div>
        </>
      )}

      {/* Reminders */}
      <h2>Reminders</h2>
      <RemindersBlock companyId={id} reminders={reminders} onChanged={reload} />

      {/* Add note */}
      <h2>Add note</h2>
      <AddNote companyId={id} onAdded={reload} />

      {/* Notes timeline */}
      <h2>Notes</h2>
      {notes.length === 0 ? (
        <p className="muted small">No notes yet.</p>
      ) : (
        <div className="card">
          {notes.map((n) => (
            <div className="note-item" key={n.id}>
              <div className="row between">
                <span className="chip">{NOTE_TYPE_LABELS[n.note_type]}</span>
                <span className="row">
                  <span className="muted small">{formatDate(n.created_at)}</span>
                  <button
                    type="button"
                    className="small danger"
                    style={{ border: "none", background: "none", padding: "0 4px" }}
                    onClick={async () => {
                      if (!confirm("Delete this note?")) return;
                      await api.deleteNote(n.id);
                      reload();
                    }}
                  >
                    ✗
                  </button>
                </span>
              </div>
              <div className="pre small" style={{ marginTop: 6 }}>
                {n.body}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Status history */}
      <h2>Status history</h2>
      <div className="card">
        {history.map((h) => (
          <div className="row between small" key={h.id} style={{ padding: "4px 0" }}>
            <span>
              {h.from_status ? `${STATUS_LABELS[h.from_status]} → ` : ""}
              {STATUS_LABELS[h.to_status]}
            </span>
            <span className="muted">{formatDate(h.changed_at)}</span>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 24, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="small danger"
          onClick={async () => {
            if (
              !confirm(
                `Delete ${company.name} and ALL its notes, reminders and history? This cannot be undone.`,
              )
            )
              return;
            await api.deleteCompany(id);
            toast("Company deleted");
            window.location.hash = "#/pipeline";
          }}
        >
          Delete company…
        </button>
      </div>
    </div>
  );
}

const CHART_RANGES = ["1w", "1m", "3m", "6m", "1y", "5y"] as const;
type ChartRange = (typeof CHART_RANGES)[number];

function PriceChart({ companyId }: { companyId: number }) {
  const [range, setRange] = useState<ChartRange>("6m");
  const [data, setData] = useState<{
    points: { t: number; c: number }[];
    change_pct: number | null;
    currency: string | null;
    last: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .chart(companyId, range)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) {
          setData(null);
          setError(e instanceof Error ? e.message : "price feed unavailable");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, range]);

  const W = 320;
  const H = 96;
  let path = "";
  if (data && data.points.length > 1) {
    const cs = data.points.map((p) => p.c);
    const min = Math.min(...cs);
    const max = Math.max(...cs);
    const span = max - min || 1;
    path = data.points
      .map((p, i) => {
        const x = (i / (data.points.length - 1)) * W;
        const y = H - 6 - ((p.c - min) / span) * (H - 12);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  return (
    <div className="card stack">
      <div className="row between wrap">
        <div className="row wrap">
          {CHART_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              className={`chip clickable ${range === r ? "active" : ""}`}
              onClick={() => setRange(r)}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
        {data && (
          <span className="small" style={{ fontFamily: "var(--mono)" }}>
            {data.last.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            {data.currency ? ` ${data.currency}` : ""}{" "}
            {data.change_pct !== null && (
              <span className={data.change_pct >= 0 ? "up" : "down"}>
                {data.change_pct >= 0 ? "+" : ""}
                {data.change_pct}%
              </span>
            )}
          </span>
        )}
      </div>
      {loading ? (
        <span className="muted small">Loading price history…</span>
      ) : data && path ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          role="img"
          aria-label="price chart"
        >
          <path
            d={path}
            fill="none"
            stroke={
              data.change_pct !== null && data.change_pct < 0
                ? "var(--danger)"
                : "var(--ok)"
            }
            strokeWidth="1.8"
          />
        </svg>
      ) : (
        <span className="muted small">
          No price data{error ? ` (${error})` : ""} — check the ticker is
          Yahoo-style (e.g. 1846.HK, NESN.SW).
        </span>
      )}
    </div>
  );
}

function PositionBlock({
  company,
  onPatch,
}: {
  company: Company;
  onPatch: (fields: Record<string, unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [entry, setEntry] = useState(company.entry_price?.toString() ?? "");
  const [entryDate, setEntryDate] = useState(company.entry_date ?? "");
  const [target, setTarget] = useState(company.target_price?.toString() ?? "");
  const [exit, setExit] = useState(company.exit_criteria ?? "");

  if (!editing) {
    return (
      <div className="card stack">
        <div className="row between">
          <span className="field-label" style={{ margin: 0 }}>Position</span>
          <button type="button" className="small" onClick={() => setEditing(true)}>✎</button>
        </div>
        <div className="row wrap">
          {company.entry_price !== null && (
            <span className="chip">entry {company.entry_price}{company.entry_date ? ` · ${company.entry_date}` : ""}</span>
          )}
          {company.target_price !== null && (
            <span className="chip">target {company.target_price}</span>
          )}
          {company.entry_price === null && company.target_price === null && !company.exit_criteria && (
            <span className="muted small">
              No position details yet — babble them in a capture ("bought at
              12.50, target 20, exit if margins slip") or edit here.
            </span>
          )}
        </div>
        {company.exit_criteria && (
          <div className="small">
            <span className="muted">Exit when: </span>
            {company.exit_criteria}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card stack">
      <div className="row">
        <div className="grow">
          <div className="field-label">Entry price</div>
          <input inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} />
        </div>
        <div className="grow">
          <div className="field-label">Entry date</div>
          <input type="date" style={{ width: "100%" }} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
        </div>
        <div className="grow">
          <div className="field-label">Target</div>
          <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
      </div>
      <div>
        <div className="field-label">Exit criteria</div>
        <textarea
          style={{ minHeight: 60 }}
          value={exit}
          placeholder="When do you sell? e.g. margins < 15%, thesis broken, 2x"
          onChange={(e) => setExit(e.target.value)}
        />
      </div>
      <div className="row">
        <button
          type="button"
          className="primary small"
          onClick={async () => {
            await onPatch({
              entry_price: entry === "" ? null : Number(entry),
              entry_date: entryDate || null,
              target_price: target === "" ? null : Number(target),
              exit_criteria: exit.trim() || null,
            });
            setEditing(false);
          }}
        >
          Save
        </button>
        <button type="button" className="small" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </div>
  );
}

function LinkRow({
  company,
  onPatch,
}: {
  company: Company;
  onPatch: (fields: Record<string, unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const links: { label: string; field: string; value: string | null }[] = [
    { label: "Koyfin", field: "koyfin_url", value: company.koyfin_url },
    { label: "Excel model", field: "model_url", value: company.model_url },
    { label: "Substack", field: "substack_url", value: company.substack_url },
  ];
  const [values, setValues] = useState(() =>
    Object.fromEntries(links.map((l) => [l.field, l.value ?? ""])),
  );

  if (editing) {
    return (
      <div className="card stack">
        {links.map((l) => (
          <div key={l.field}>
            <div className="field-label">{l.label} URL</div>
            <input
              value={values[l.field]}
              onChange={(e) => setValues({ ...values, [l.field]: e.target.value })}
            />
          </div>
        ))}
        <div className="row">
          <button
            type="button"
            className="primary small"
            onClick={async () => {
              await onPatch({
                koyfin_url: values.koyfin_url || null,
                model_url: values.model_url || null,
                substack_url: values.substack_url || null,
              });
              setEditing(false);
            }}
          >
            Save
          </button>
          <button type="button" className="small" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const set = links.filter((l) => l.value);
  return (
    <div className="card row wrap">
      {set.length === 0 && <span className="muted small">No links set</span>}
      {set.map((l) => (
        <a key={l.field} href={l.value!} target="_blank" rel="noreferrer" className="chip">
          {l.label} ↗
        </a>
      ))}
      {company.model_updated_at && (
        <span className="muted small">model {formatDate(company.model_updated_at)}</span>
      )}
      <span className="grow" />
      <button type="button" className="small" onClick={() => setEditing(true)}>
        ✎
      </button>
    </div>
  );
}

function IrBlock({
  company,
  onPatch,
}: {
  company: Company;
  onPatch: (fields: Record<string, unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(company.ir_email_used ?? "");
  const [notes, setNotes] = useState(company.ir_notes ?? "");

  if (editing) {
    return (
      <div className="card stack">
        <label className="row">
          <input
            type="checkbox"
            defaultChecked={Boolean(company.ir_subscribed)}
            onChange={(e) => onPatch({ ir_subscribed: e.target.checked ? 1 : 0 })}
          />
          <span className="small">Subscribed to IR list</span>
        </label>
        <div>
          <div className="field-label">Email used</div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <div className="field-label">IR notes</div>
          <input
            value={notes}
            placeholder='e.g. "ambush announcer, no pre-announcement"'
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="row">
          <button
            type="button"
            className="primary small"
            onClick={async () => {
              await onPatch({ ir_email_used: email || null, ir_notes: notes || null });
              setEditing(false);
            }}
          >
            Save
          </button>
          <button type="button" className="small" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card row wrap">
      <span className="small">
        IR: {company.ir_subscribed ? "subscribed" : "not subscribed"}
        {company.ir_email_used ? ` (${company.ir_email_used})` : ""}
      </span>
      {company.ir_notes && <span className="muted small">· {company.ir_notes}</span>}
      <span className="grow" />
      <button type="button" className="small" onClick={() => setEditing(true)}>
        ✎
      </button>
    </div>
  );
}

function RemindersBlock({
  companyId,
  reminders,
  onChanged,
}: {
  companyId: number;
  reminders: Reminder[];
  onChanged: () => void;
}) {
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="card stack">
      {reminders.map((r) => (
        <label className="row" key={r.id}>
          <input
            type="checkbox"
            checked={false}
            onChange={async () => {
              await api.patchReminder(r.id, { done: true });
              toast("Done ✓");
              onChanged();
            }}
          />
          <span className="grow small">{r.body}</span>
          {r.due_date && (
            <span className={`chip ${r.due_date < today ? "overdue" : ""}`}>
              {r.due_date}
            </span>
          )}
          <button
            type="button"
            className="small danger"
            style={{ border: "none", background: "none", padding: "0 4px" }}
            onClick={async (e) => {
              e.preventDefault();
              if (!confirm("Delete this reminder?")) return;
              await api.deleteReminder(r.id);
              onChanged();
            }}
          >
            ✗
          </button>
        </label>
      ))}
      {reminders.length === 0 && (
        <span className="muted small">No open reminders.</span>
      )}
      <div className="row">
        <input
          className="grow"
          value={body}
          placeholder="New reminder…"
          onChange={(e) => setBody(e.target.value)}
        />
        <input
          type="date"
          style={{ width: "auto" }}
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
        <button
          type="button"
          className="small primary"
          disabled={!body.trim()}
          onClick={async () => {
            await api.createReminder({
              company_id: companyId,
              body: body.trim(),
              due_date: due || null,
            });
            setBody("");
            setDue("");
            onChanged();
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function AddNote({ companyId, onAdded }: { companyId: number; onAdded: () => void }) {
  const [body, setBody] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("note");
  const [saving, setSaving] = useState(false);

  return (
    <div className="card stack">
      <textarea
        value={body}
        style={{ minHeight: 80 }}
        placeholder="Add a note for this company (no parsing, saved directly)…"
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="row">
        <select
          value={noteType}
          style={{ width: "auto" }}
          onChange={(e) => setNoteType(e.target.value as NoteType)}
        >
          {NOTE_TYPES.map((t) => (
            <option key={t} value={t}>
              {NOTE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="primary grow"
          disabled={!body.trim() || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await api.createNote({ company_id: companyId, note_type: noteType, body: body.trim() });
              setBody("");
              toast("Note added");
              onAdded();
            } catch (e) {
              toast(e instanceof Error ? e.message : "Failed");
            } finally {
              setSaving(false);
            }
          }}
        >
          Add note
        </button>
      </div>
    </div>
  );
}
