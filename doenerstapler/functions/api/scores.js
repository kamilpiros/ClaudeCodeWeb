// Geteilte Bestenlisten für die Dönerfriitig-Games.
// Pro Spiel eine eigene Liste (sonst würden die Punkteskalen sich mischen);
// pro Member wird der höchste Score in Cloudflare KV gehalten (Binding: LEADERBOARD).
// GET  /api/scores?game=dash            -> { scores: [{name, score}] }
// POST /api/scores {name, score, game}  -> aktualisiert (nur wenn besser) und gibt Liste zurück

const KEY = "boards_v2";
const GAMES = new Set(["stapler", "dash"]);
const ALLOWED = new Set(["CBO", "SJU", "PKN", "YMI", "MST/MSO", "JWU"]);

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

function toList(board) {
  return Object.entries(board || {})
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

export async function onRequestGet({ request, env }) {
  const game = new URL(request.url).searchParams.get("game") || "stapler";
  if (!GAMES.has(game)) return json({ error: "unknown game" }, 400);
  const boards = await readBoards(env);
  return json({ scores: toList(boards[game]), offline: !env.LEADERBOARD });
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
  const game = String(body?.game ?? "stapler");

  if (!GAMES.has(game)) return json({ error: "unknown game" }, 400);
  if (!ALLOWED.has(name)) return json({ error: "unknown member" }, 400);
  if (!Number.isFinite(score) || score < 0 || score > 10000) {
    return json({ error: "bad score" }, 400);
  }

  if (!env.LEADERBOARD) {
    return json({ scores: [{ name, score: Math.floor(score) }], offline: true });
  }

  const boards = await readBoards(env);
  const board = boards[game] || {};
  const s = Math.floor(score);
  if (!board[name] || s > board[name]) {
    board[name] = s;
    boards[game] = board;
    await env.LEADERBOARD.put(KEY, JSON.stringify(boards));
  }
  return json({ scores: toList(board) });
}
