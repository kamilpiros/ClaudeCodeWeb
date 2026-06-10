import { useCallback, useEffect, useState } from "react";
import { api, formatDate, formatMarketCap } from "../api";
import { toast } from "../toast";
import type {
  ActionItem,
  Company,
  Note,
  NoteType,
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
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

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
        {company.currency && <span className="chip">{company.currency}</span>}
        {company.source && (
          <span className="chip">
            {company.source}
            {company.source_detail ? `: ${company.source_detail}` : ""}
          </span>
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
                <span className="muted small">{formatDate(n.created_at)}</span>
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
