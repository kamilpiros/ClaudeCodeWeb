// Geteilte Bestenlisten für die Dönerfriitig-Games.
// Pro Spiel und pro Wertung eine eigene Liste:
//   dash    -> points (mehr ist besser), time (weniger ist besser)
//   stapler -> points
// Gespeichert wird pro Member nur der jeweils beste Wert (Cloudflare KV).
//
// GET  /api/scores?game=dash&metric=time    -> { scores: [{name, score}] }
// POST /api/scores { name, score, time, game }

const KEY = "boards_v3"; // neuer Schlüssel: alte, vermischte Einträge zählen nicht mehr
const GAMES = { stapler: ["points"], dash: ["points", "time"] };
const ALLOWED = new Set(["CBO", "SJU", "PKN", "YMI", "MST/MSO", "JWU"]);
const MAX_POINTS = 20000;
const MIN_TIME_MS = 3000;      // schneller ist menschlich nicht machbar
const MAX_TIME_MS = 15 * 60000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

async function readBoards(env) {
  if (!env.LEADERBOARD) return {};
  try {
    return (await env.LEADERBOARD.get(KEY, { type: "json" })) || {};
  } catch {
    return {};
  }
}

// points: absteigend (mehr ist besser), time: aufsteigend (weniger ist besser)
function toList(board, metric) {
  const rows = Object.entries(board || {}).map(([name, score]) => ({ name, score }));
  rows.sort((a, b) => (metric === "time" ? a.score - b.score : b.score - a.score));
  return rows.slice(0, 20);
}

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  const game = q.get("game") || "stapler";
  const metric = q.get("metric") || "points";
  if (!GAMES[game] || !GAMES[game].includes(metric)) {
    return json({ error: "unknown game or metric" }, 400);
  }
  const boards = await readBoards(env);
  return json({
    scores: toList((boards[game] || {})[metric], metric),
    metric,
    offline: !env.LEADERBOARD,
  });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const name = String(body?.name ?? "").trim();
  const game = String(body?.game ?? "stapler");
  const score = Number(body?.score);
  const hasTime = body?.time !== undefined && body?.time !== null;
  const time = Number(body?.time);

  if (!GAMES[game]) return json({ error: "unknown game" }, 400);
  if (!ALLOWED.has(name)) return json({ error: "unknown member" }, 400);
  if (!Number.isFinite(score) || score < 0 || score > MAX_POINTS) {
    return json({ error: "bad score" }, 400);
  }
  const timeOk =
    hasTime &&
    GAMES[game].includes("time") &&
    Number.isFinite(time) &&
    time >= MIN_TIME_MS &&
    time <= MAX_TIME_MS;

  if (!env.LEADERBOARD) {
    return json({ scores: [{ name, score: Math.floor(score) }], offline: true });
  }

  const boards = await readBoards(env);
  const g = boards[game] || (boards[game] = {});
  const pts = g.points || (g.points = {});
  const p = Math.floor(score);
  if (!pts[name] || p > pts[name]) pts[name] = p;

  if (timeOk) {
    const tb = g.time || (g.time = {});
    const t = Math.floor(time);
    if (!tb[name] || t < tb[name]) tb[name] = t;
  }

  await env.LEADERBOARD.put(KEY, JSON.stringify(boards));
  return json({ scores: toList(pts, "points"), metric: "points" });
}
