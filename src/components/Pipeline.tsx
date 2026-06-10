import { useEffect, useMemo, useState } from "react";
import { api, formatMarketCap } from "../api";
import type { Company, Status } from "../types";
import { FUNNEL_ORDER, STATUS_LABELS } from "../types";

const COLLAPSED_BY_DEFAULT: Status[] = ["dismissed", "exited"];

export function Pipeline() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  // Expanded/collapsed state per group, kept across re-renders (searching
  // re-renders on every keystroke and would otherwise reset user toggles).
  const [openGroups, setOpenGroups] = useState<Set<Status>>(
    () => new Set(FUNNEL_ORDER.filter((s) => !COLLAPSED_BY_DEFAULT.includes(s))),
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { companies } = await api.listCompanies({ q: q.trim() || undefined });
        if (!cancelled) setCompanies(companies);
      } catch {
        /* offline: keep last data */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, q ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  const groups = useMemo(() => {
    const byStatus = new Map<Status, Company[]>();
    for (const s of FUNNEL_ORDER) byStatus.set(s, []);
    for (const c of companies) byStatus.get(c.status)?.push(c);
    return byStatus;
  }, [companies]);

  const visibleStatuses = statusFilter ? [statusFilter] : FUNNEL_ORDER;

  return (
    <div>
      <h1>Pipeline</h1>
      <div className="stack">
        <input
          value={q}
          placeholder="Search name, ticker, alias…"
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="row wrap">
          <button
            type="button"
            className={`chip clickable ${statusFilter === null ? "active" : ""}`}
            onClick={() => setStatusFilter(null)}
          >
            All
          </button>
          {FUNNEL_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip clickable ${statusFilter === s ? "active" : ""}`}
              onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            >
              {STATUS_LABELS[s]} {groups.get(s)!.length ? `· ${groups.get(s)!.length}` : ""}
            </button>
          ))}
        </div>
      </div>

      {loading && companies.length === 0 ? (
        <p className="muted">Loading…</p>
      ) : (
        visibleStatuses.map((status) => {
          const list = groups.get(status)!;
          if (!list.length) return null;
          return (
            <details
              key={status}
              className="status-group"
              open={statusFilter !== null || openGroups.has(status)}
              onToggle={(e) => {
                if (statusFilter !== null) return;
                const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                if (isOpen === openGroups.has(status)) return;
                setOpenGroups((prev) => {
                  const next = new Set(prev);
                  if (isOpen) next.add(status);
                  else next.delete(status);
                  return next;
                });
              }}
            >
              <summary>
                {STATUS_LABELS[status]} <span className="muted">({list.length})</span>
              </summary>
              <div className="card" style={{ padding: "2px 14px" }}>
                {list.map((c) => (
                  <CompanyRowView key={c.id} company={c} />
                ))}
              </div>
            </details>
          );
        })
      )}
      {!loading && companies.length === 0 && (
        <p className="muted">Nothing yet — capture your first idea.</p>
      )}
    </div>
  );
}

function CompanyRowView({ company: c }: { company: Company }) {
  const mcap = formatMarketCap(c.market_cap_musd);
  return (
    <a className="pipeline-row" href={`#/company/${c.id}`}>
      <div className="grow">
        <div>
          <strong>{c.name}</strong>{" "}
          {c.ticker && <span className="muted small">{c.ticker}</span>}
        </div>
        <div className="muted small">
          {mcap && `${mcap} · `}
          {c.days_in_status !== undefined && `${c.days_in_status}d in status`}
          {c.open_action_items ? ` · ${c.open_action_items} open` : ""}
        </div>
      </div>
      {c.conviction && (
        <span className="conviction">
          {"●".repeat(c.conviction)}
          {"○".repeat(5 - c.conviction)}
        </span>
      )}
    </a>
  );
}
