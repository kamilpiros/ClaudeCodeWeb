// Live-Goldkurs für die Vermögensübersicht.
//
// GET /api/gold -> { chfPerOz, chfPerGram, usdPerOz, usdChf, ts, source }
//
// Der Kurs wird bei mehreren offenen Quellen abgeholt, weil keine davon eine
// Zusage auf Verfügbarkeit gibt. Die erste, die ein plausibles Ergebnis
// liefert, gewinnt. Das Resultat liegt danach für ein paar Minuten im KV,
// damit nicht jeder Seitenaufruf nach draussen telefoniert.

const KEY = "gold_spot_v1";
const TTL = 600;                 // Sekunden, die ein Kurs als frisch gilt
const OZ = 31.1034768;
const MIN_USD_OZ = 500, MAX_USD_OZ = 25000;    // grobe Plausibilitätsgrenzen
const MIN_FX = 0.4, MAX_FX = 2.0;

const json = (data, status = 200, maxAge = 300) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": `public, max-age=${maxAge}`,
    },
  });

async function getJson(url) {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "doenerfriitig.ch" },
    cf: { cacheTtl: 120, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`${url} antwortete ${res.status}`);
  return res.json();
}

const num = (v) => (typeof v === "number" && isFinite(v) ? v : NaN);

// --- Goldpreis in US-Dollar je Feinunze ---
const GOLD_SOURCES = [
  { name: "gold-api", run: async () => num((await getJson("https://api.gold-api.com/price/XAU")).price) },
  { name: "coincap", run: async () => {
      const d = await getJson("https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd");
      return num(d["pax-gold"]?.usd);
    } },
  { name: "metals-dev", run: async () => {
      const d = await getJson("https://api.metalpriceapi.com/v1/latest?api_key=demo&base=USD&currencies=XAU");
      const r = num(d?.rates?.XAU);
      return r ? 1 / r : NaN;
    } },
];

// --- Wechselkurs Franken je US-Dollar ---
const FX_SOURCES = [
  { name: "frankfurter", run: async () => num((await getJson("https://api.frankfurter.app/latest?from=USD&to=CHF")).rates?.CHF) },
  { name: "er-api", run: async () => num((await getJson("https://open.er-api.com/v6/latest/USD")).rates?.CHF) },
  { name: "jsdelivr", run: async () => {
      const d = await getJson("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json");
      return num(d?.usd?.chf);
    } },
];

async function firstGood(sources, lo, hi) {
  for (const s of sources) {
    try {
      const v = await s.run();
      if (v >= lo && v <= hi) return { value: v, source: s.name };
    } catch {
      // nächste Quelle probieren
    }
  }
  return null;
}

export async function onRequestGet({ env }) {
  // 1. Frischer Wert im Zwischenspeicher?
  if (env.LEADERBOARD) {
    try {
      const hit = await env.LEADERBOARD.get(KEY, { type: "json" });
      if (hit && Date.now() - hit.ts < TTL * 1000) return json({ ...hit, cached: true });
    } catch { /* ohne Zwischenspeicher weiter */ }
  }

  const [gold, fx] = await Promise.all([
    firstGood(GOLD_SOURCES, MIN_USD_OZ, MAX_USD_OZ),
    firstGood(FX_SOURCES, MIN_FX, MAX_FX),
  ]);

  if (!gold || !fx) {
    // Wenn nichts erreichbar ist, den letzten bekannten Wert zurückgeben,
    // auch wenn er älter als die Frist ist. Die Seite kennzeichnet ihn dann.
    if (env.LEADERBOARD) {
      try {
        const stale = await env.LEADERBOARD.get(KEY, { type: "json" });
        if (stale) return json({ ...stale, cached: true, stale: true });
      } catch { /* dann eben gar nichts */ }
    }
    return json({ error: "Kein Kurs verfügbar" }, 503, 30);
  }

  const payload = {
    usdPerOz: Math.round(gold.value * 100) / 100,
    usdChf: Math.round(fx.value * 10000) / 10000,
    chfPerOz: Math.round(gold.value * fx.value * 100) / 100,
    chfPerGram: Math.round((gold.value * fx.value / OZ) * 100) / 100,
    ts: Date.now(),
    source: `${gold.source} · ${fx.source}`,
  };
  if (env.LEADERBOARD) {
    try { await env.LEADERBOARD.put(KEY, JSON.stringify(payload), { expirationTtl: 86400 }); }
    catch { /* Zwischenspeicher ist optional */ }
  }
  return json(payload);
}
