import { useEffect, useMemo, useState } from "react";
import { api, formatMarketCap } from "../api";
import { toast } from "../toast";
import type { Company, Quote, Status } from "../types";
import { FUNNEL_ORDER, STATUS_LABELS } from "../types";

type McapBucket = "" | "micro" | "small" | "mid" | "large";
type SortKey = "updated" | "name" | "mcap" | "days" | "change";

const MCAP_BUCKETS: { key: McapBucket; label: string; test: (m: number) => boolean }[] = [
  { key: "micro", label: "< $300M", test: (m) => m < 300 },
  { key: "small", label: "$300M–2B", test: (m) => m >= 300 && m < 2000 },
  { key: "mid", label: "$2–10B", test: (m) => m >= 2000 && m < 10000 },
  { key: "large", label: "> $10B", test: (m) => m >= 10000 },
];

/**
 * The filterable list of everything: status, sector, country, market-cap
 * bucket, horizon, free text — with sort and one-tap enrichment of
 * companies that are missing classification data.
 */
export function ListView() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [quotes, setQuotes] = useState<Map<number, Quote>>(new Map());
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [sector, setSector] = useState("");
  const [country, setCountry] = useState("");
  const [mcap, setMcap] = useState<McapBucket>("");
  const [horizon, setHorizon] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [enriching, setEnriching] = useState(false);
  const [importing, setImporting] = useState(false);

  async function reload() {
    try {
      const { companies } = await api.listCompanies();
      setCompanies(companies);
    } catch {
      /* offline */
    }
  }

  useEffect(() => {
    reload();
    api
      .quotes()
      .then(({ quotes }) => setQuotes(new Map(quotes.map((qt) => [qt.company_id, qt]))))
      .catch(() => {});
  }, []);

  const sectors = useMemo(
    () => [...new Set(companies.map((c) => c.sector).filter(Boolean))].sort() as string[],
    [companies],
  );
  const countries = useMemo(
    () => [...new Set(companies.map((c) => c.country).filter(Boolean))].sort() as string[],
    [companies],
  );
  const missingData = useMemo(
    () => companies.filter((c) => !c.sector || !c.country),
    [companies],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const bucket = MCAP_BUCKETS.find((b) => b.key === mcap);
    let list = companies.filter((c) => {
      if (status && c.status !== status) return false;
      if (sector && c.sector !== sector) return false;
      if (country && c.country !== country) return false;
      if (horizon && c.horizon !== horizon) return false;
      if (bucket && (c.market_cap_musd === null || !bucket.test(c.market_cap_musd)))
        return false;
      if (
        needle &&
        ![c.name, c.ticker, c.aliases, c.sector, c.country]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle))
      )
        return false;
      return true;
    });
    const change = (c: Company) =>
      quotes.get(c.id)?.change_since_baseline_pct ?? -Infinity;
    switch (sort) {
      case "name":
        list = [...list].sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "mcap":
        list = [...list].sort(
          (a, b) => (b.market_cap_musd ?? -1) - (a.market_cap_musd ?? -1),
        );
        break;
      case "days":
        list = [...list].sort(
          (a, b) => (b.days_in_status ?? 0) - (a.days_in_status ?? 0),
        );
        break;
      case "change":
        list = [...list].sort((a, b) => change(b) - change(a));
        break;
      default:
        list = [...list].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    }
    return list;
  }, [companies, quotes, q, status, sector, country, mcap, horizon, sort]);

  async function enrichMissing() {
    setEnriching(true);
    let done = 0;
    for (const c of missingData) {
      try {
        await api.enrichCompany(c.id);
        done++;
        toast(`Enriched ${done}/${missingData.length}: ${c.name}`);
      } catch (e) {
        toast(
          `${c.name}: ${e instanceof Error ? e.message : "lookup failed"} — continuing`,
        );
      }
    }
    setEnriching(false);
    reload();
  }

  async function importCsv(file: File) {
    setImporting(true);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: await file.text(),
      });
      const payload = (await res.json()) as {
        imported?: number;
        skipped?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      toast(`Imported ${payload.imported}, skipped ${payload.skipped} existing`);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <div className="row between">
        <h1 style={{ marginBottom: 0 }}>List</h1>
        <label className="small" style={{ cursor: "pointer" }}>
          <span className="chip clickable">{importing ? "Importing…" : "⇪ Import CSV"}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            disabled={importing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importCsv(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <div className="stack" style={{ marginTop: 14 }}>
        <input value={q} placeholder="Search…" onChange={(e) => setQ(e.target.value)} />
        <div className="row wrap">
          <select value={status} style={{ width: "auto" }} onChange={(e) => setStatus(e.target.value as Status | "")}>
            <option value="">All statuses</option>
            {FUNNEL_ORDER.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <select value={sector} style={{ width: "auto" }} onChange={(e) => setSector(e.target.value)}>
            <option value="">All sectors</option>
            {sectors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={country} style={{ width: "auto" }} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All countries</option>
            {countries.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={mcap} style={{ width: "auto" }} onChange={(e) => setMcap(e.target.value as McapBucket)}>
            <option value="">Any mkt cap</option>
            {MCAP_BUCKETS.map((b) => (
              <option key={b.key} value={b.key}>{b.label}</option>
            ))}
          </select>
          <select value={horizon} style={{ width: "auto" }} onChange={(e) => setHorizon(e.target.value)}>
            <option value="">Any horizon</option>
            <option value="core">Core</option>
            <option value="tactical">Tactical</option>
          </select>
          <select value={sort} style={{ width: "auto" }} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="updated">Recently updated</option>
            <option value="name">Name</option>
            <option value="mcap">Market cap</option>
            <option value="days">Days in status</option>
            <option value="change">% since added</option>
          </select>
        </div>
      </div>

      {missingData.length > 0 && (
        <div className="offline-banner row between" style={{ marginTop: 10 }}>
          <span>
            {missingData.length} compan{missingData.length === 1 ? "y" : "ies"} missing
            sector/country
          </span>
          <button type="button" className="small" disabled={enriching} onClick={enrichMissing}>
            {enriching ? "Researching…" : "Auto-fill via web search"}
          </button>
        </div>
      )}

      <div className="card" style={{ padding: "2px 14px", marginTop: 12 }}>
        {filtered.map((c) => {
          const quote = quotes.get(c.id);
          return (
            <a className="pipeline-row" href={`#/company/${c.id}`} key={c.id}>
              <div className="grow">
                <div>
                  <strong>{c.name}</strong>{" "}
                  {c.ticker && <span className="muted small">{c.ticker}</span>}
                  {c.horizon === "tactical" && <span className="chip tactical">T</span>}
                </div>
                <div className="muted small">
                  {STATUS_LABELS[c.status]}
                  {c.sector ? ` · ${c.sector}` : ""}
                  {c.country ? ` · ${c.country}` : ""}
                  {formatMarketCap(c.market_cap_musd) ? ` · ${formatMarketCap(c.market_cap_musd)}` : ""}
                </div>
              </div>
              {quote?.price != null && (
                <div className="price-block">
                  <div className="small">
                    {quote.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                  {quote.change_since_baseline_pct !== null && (
                    <div className={`small ${quote.change_since_baseline_pct >= 0 ? "up" : "down"}`}>
                      {quote.change_since_baseline_pct >= 0 ? "+" : ""}
                      {quote.change_since_baseline_pct}%
                    </div>
                  )}
                </div>
              )}
            </a>
          );
        })}
        {filtered.length === 0 && (
          <p className="muted small" style={{ padding: "10px 0" }}>
            Nothing matches the filters.
          </p>
        )}
      </div>
      <p className="muted small">{filtered.length} of {companies.length} companies</p>
    </div>
  );
}
