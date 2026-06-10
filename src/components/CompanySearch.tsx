import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Company } from "../types";

/**
 * Search dropdown for picking a company (switch a matched company, attach a
 * musing). Debounced free-text search against /api/companies?q=.
 */
export function CompanySearch(props: {
  placeholder?: string;
  onSelect: (company: Company) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Company[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const { companies } = await api.listCompanies({ q: q.trim() });
        setResults(companies.slice(0, 12));
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <div className="dropdown">
      <input
        value={q}
        placeholder={props.placeholder ?? "Search companies…"}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && results.length > 0 && (
        <div className="menu">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                props.onSelect(c);
                setQ("");
                setResults([]);
                setOpen(false);
              }}
            >
              {c.name}
              {c.ticker ? ` · ${c.ticker}` : ""}{" "}
              <span className="muted">({c.status})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
