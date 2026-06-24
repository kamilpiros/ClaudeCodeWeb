// Geteilte Bestenliste für Döner-Stapler.
// Speichert pro Member den höchsten Score in Cloudflare KV (Binding: LEADERBOARD).
// GET  /api/scores        -> { scores: [{name, score}], updatedAt }
// POST /api/scores {name, score} -> aktualisiert (nur wenn besser) und gibt Liste zurück

const KEY = "board";
const ALLOWED = new Set(["CBO", "SJU", "PKN", "YMI", "MST/MSO", "JWU"]);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

async function readBoard(env) {
  if (!env.LEADERBOARD) return {};
  try {
    return (await env.LEADERBOARD.get(KEY, { type: "json" })) || {};
  } catch {
    return {};
  }
}

function toList(board) {
  return Object.entries(board)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

export async function onRequestGet({ env }) {
  const board = await readBoard(env);
  return json({ scores: toList(board), offline: !env.LEADERBOARD });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const name = String(body?.name ?? "").trim();
  const score = Number(body?.score);

  if (!ALLOWED.has(name)) return json({ error: "unknown member" }, 400);
  if (!Number.isFinite(score) || score < 0 || score > 10000) {
    return json({ error: "bad score" }, 400);
  }

  if (!env.LEADERBOARD) {
    // Kein KV gebunden -> nichts persistieren, aber sauber antworten (lokaler Fallback im Client greift).
    return json({ scores: [{ name, score: Math.floor(score) }], offline: true });
  }

  const board = await readBoard(env);
  const s = Math.floor(score);
  if (!board[name] || s > board[name]) {
    board[name] = s;
    await env.LEADERBOARD.put(KEY, JSON.stringify(board));
  }
  return json({ scores: toList(board) });
}
