// Vergleichsindizes für die Renditekurve.
//
// GET /api/bench -> { start, series: { smi: [[monat, chf], ...], dax: [...], spx: [...] }, ts }
//
// Damit der Vergleich fair ist, rechnet die Schnittstelle DAX und S&P 500 in
// Franken um. Sonst würde man Indexstände mit Wechselkursgewinnen vermischen.
// Die Seite bringt dieselben Reihen als Notvorrat mit und nimmt diese, falls
// hier nichts Brauchbares kommt. Ergebnis liegt einen halben Tag im KV.

const KEY = "bench_monthly_v1";
const TTL = 43200;               // Sekunden, die eine Antwort als frisch gilt
const START = "2023-02";         // ab dem ersten Einsatz des Vereins

const json = (data, status = 200, maxAge = 3600) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": `public, max-age=${maxAge}`,
    },
  });

// Yahoo liefert Monatskerzen. Ein Browser-Kennzeichen ist nötig, sonst
// antwortet der Dienst mit 429.
async function monthly(symbol) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
            + `?period1=1672531200&period2=9999999999&interval=1mo`;
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (doenerfriitig.ch)" },
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`${symbol} antwortete ${res.status}`);
  const r = (await res.json())?.chart?.result?.[0];
  const ts = r?.timestamp, cl = r?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(ts) || !Array.isArray(cl)) throw new Error(`${symbol} ohne Kurse`);
  const out = {};
  ts.forEach((t, i) => {
    const c = cl[i];
    if (typeof c !== "number" || !isFinite(c) || c <= 0) return;
    out[new Date(t * 1000).toISOString().slice(0, 7)] = c;
  });
  if (Object.keys(out).length < 12) throw new Error(`${symbol} zu kurz`);
  return out;
}

// Fehlt ein Wechselkursmonat, wird zwischen den Nachbarn interpoliert.
// Wechselkurse bewegen sich träge, das ist ein vertretbarer Notbehelf.
function fill(map, months) {
  const known = Object.keys(map).sort();
  if (!known.length) return map;
  const out = { ...map };
  months.forEach((m) => {
    if (out[m]) return;
    const vor = known.filter((k) => k < m).pop();
    const nach = known.find((k) => k > m);
    if (vor && nach) out[m] = (map[vor] + map[nach]) / 2;
    else out[m] = map[vor || nach];
  });
  return out;
}

export async function onRequestGet({ env }) {
  const now = Date.now();

  if (env.LEADERBOARD) {
    try {
      const hit = await env.LEADERBOARD.get(KEY, { type: "json" });
      if (hit && now - hit.ts < TTL * 1000) return json({ ...hit, cached: true });
    } catch { /* KV nicht erreichbar, dann eben frisch holen */ }
  }

  let smi, dax, spx, usdchf, eurchf;
  try {
    [smi, dax, spx, usdchf, eurchf] = await Promise.all([
      monthly("^SSMI"), monthly("^GDAXI"), monthly("^GSPC"),
      monthly("CHF=X"), monthly("EURCHF=X"),
    ]);
  } catch (err) {
    if (env.LEADERBOARD) {
      try {
        const stale = await env.LEADERBOARD.get(KEY, { type: "json" });
        if (stale) return json({ ...stale, stale: true });
      } catch { /* dann gibt es hier nichts */ }
    }
    return json({ error: String(err && err.message || err) }, 502, 60);
  }

  const months = Object.keys(smi).filter((m) => m >= START).sort();
  const fu = fill(usdchf, months), fe = fill(eurchf, months);
  const series = { smi: [], dax: [], spx: [] };
  months.forEach((m) => {
    if (smi[m]) series.smi.push([m, Math.round(smi[m] * 100) / 100]);
    if (dax[m] && fe[m]) series.dax.push([m, Math.round(dax[m] * fe[m] * 100) / 100]);
    if (spx[m] && fu[m]) series.spx.push([m, Math.round(spx[m] * fu[m] * 100) / 100]);
  });

  const payload = { start: START, series, ts: now };
  if (env.LEADERBOARD) {
    try { await env.LEADERBOARD.put(KEY, JSON.stringify(payload), { expirationTtl: 604800 }); }
    catch { /* ohne Zwischenspeicher geht es auch, nur langsamer */ }
  }
  return json(payload);
}
