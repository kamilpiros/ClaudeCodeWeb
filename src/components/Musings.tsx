import { useCallback, useEffect, useState } from "react";
import { api, formatDate } from "../api";
import { toast } from "../toast";
import type { Company, Note, Stats } from "../types";
import { FUNNEL_ORDER, STATUS_LABELS } from "../types";
import { CompanySearch } from "./CompanySearch";

export function Musings() {
  const [musings, setMusings] = useState<Note[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [attaching, setAttaching] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const [{ musings }, stats] = await Promise.all([api.musings(), api.stats()]);
      setMusings(musings);
      setStats(stats);
    } catch {
      /* offline: keep last data */
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div>
      <h1>Musings</h1>
      {musings.length === 0 ? (
        <p className="muted small">No unattached notes.</p>
      ) : (
        musings.map((m) => (
          <div className="card" key={m.id}>
            <div className="row between">
              <span className="chip">{m.note_type}</span>
              <span className="muted small">{formatDate(m.created_at)}</span>
            </div>
            <div className="pre small" style={{ margin: "8px 0" }}>
              {m.body}
            </div>
            {attaching === m.id ? (
              <div className="stack">
                <CompanySearch
                  placeholder="Attach to company…"
                  onSelect={async (c: Company) => {
                    try {
                      await api.attachNote(m.id, c.id);
                      toast(`Attached to ${c.name}`);
                      setAttaching(null);
                      reload();
                    } catch (e) {
                      toast(e instanceof Error ? e.message : "Failed");
                    }
                  }}
                />
                <button type="button" className="small" onClick={() => setAttaching(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="row">
                <button type="button" className="small" onClick={() => setAttaching(m.id)}>
                  Attach to company
                </button>
                <button
                  type="button"
                  className="small danger"
                  onClick={async () => {
                    if (!confirm("Delete this musing?")) return;
                    await api.deleteNote(m.id);
                    reload();
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))
      )}

      {stats && (
        <>
          <h2>Stats</h2>
          <div className="card">
            <div className="row wrap">
              {FUNNEL_ORDER.map((s) => {
                const count = stats.status_counts.find((c) => c.status === s)?.count ?? 0;
                return (
                  <span className="chip" key={s}>
                    {STATUS_LABELS[s]}: {count}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="card">
            <div className="field-label">Captures per week</div>
            <table className="stats">
              <tbody>
                {stats.captures_per_week.map((w) => (
                  <tr key={w.week}>
                    <td>{w.week}</td>
                    <td>{w.captures}</td>
                    <td className="muted">{"▪".repeat(Math.min(w.captures, 30))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="field-label">Source hit rate (reached worked/owned)</div>
            <table className="stats">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Ideas</th>
                  <th>Hits</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {stats.source_hit_rate.map((s) => (
                  <tr key={s.source}>
                    <td>{s.source}</td>
                    <td>{s.total}</td>
                    <td>{s.hits}</td>
                    <td>{Math.round(s.hit_rate * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
