// Live-Protokoll der Generalversammlung am DF Quo Vadis.
//
// GET    /api/protokoll?tag=2026-08-29        -> { tag, entries: [...], live }
// POST   /api/protokoll { tag, autor, art, text }
// DELETE /api/protokoll { tag, id }           nur der jeweils neuste Eintrag
//
// Gespeichert wird im selben KV wie die Bestenlisten, unter einem Schluessel je
// Vereinstag. Faellt KV aus, antwortet die Schnittstelle mit live:false und die
// Seite schreibt nur lokal weiter, damit im Restaurant niemand vor einer
// kaputten Seite sitzt.

const PREFIX = "protokoll_v1_";
const MITGLIEDER = new Set(["CBO", "SJU", "PKN", "YMI", "MST/MSO", "JWU"]);
const ARTEN = new Set(["Beschluss", "Traktandum", "Notiz", "Zitat"]);
const MAX_TEXT = 600;
const MAX_EINTRAEGE = 400;
const RUECKNAHME_FENSTER = 15 * 60 * 1000;   // so lange laesst sich ein Tippfehler zurueckholen

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// Nur ein Datum im Format JJJJ-MM-TT, sonst koennte jeder beliebige
// KV-Schluessel angelegt werden.
function tagOk(t) {
  return typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t);
}

async function lesen(env, tag) {
  if (!env.LEADERBOARD) return null;
  try {
    return (await env.LEADERBOARD.get(PREFIX + tag, { type: "json" })) || [];
  } catch {
    return null;
  }
}

async function schreiben(env, tag, liste) {
  if (!env.LEADERBOARD) return false;
  try {
    // Ein Vereinsabend, danach braucht es den Eintrag nur noch zum Nachlesen.
    // Ohne Ablauf: das Protokoll ist ein Vereinsdokument und bleibt liegen
    await env.LEADERBOARD.put(PREFIX + tag, JSON.stringify(liste));
    return true;
  } catch {
    return false;
  }
}

const saeubern = (s) => String(s).replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);

export async function onRequestGet({ request, env }) {
  const tag = new URL(request.url).searchParams.get("tag");
  if (!tagOk(tag)) return json({ error: "Ungültiger Tag" }, 400);
  const liste = await lesen(env, tag);
  return json({ tag, entries: liste || [], live: liste !== null });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Kein gültiger Inhalt" }, 400);
  }
  const { tag, autor, art } = body || {};
  const text = saeubern(body?.text || "");

  if (!tagOk(tag)) return json({ error: "Ungültiger Tag" }, 400);
  if (!MITGLIEDER.has(autor)) return json({ error: "Unbekanntes Mitglied" }, 400);
  if (!ARTEN.has(art)) return json({ error: "Unbekannte Art" }, 400);
  if (!text) return json({ error: "Leerer Eintrag" }, 400);

  const liste = await lesen(env, tag);
  if (liste === null) return json({ error: "Speicher nicht erreichbar", live: false }, 503);

  const eintrag = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    ts: Date.now(),
    autor, art, text,
  };
  const neu = liste.concat([eintrag]).slice(-MAX_EINTRAEGE);
  const ok = await schreiben(env, tag, neu);
  if (!ok) return json({ error: "Konnte nicht speichern", live: false }, 503);
  return json({ tag, entries: neu, live: true, added: eintrag.id });
}

export async function onRequestDelete({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Kein gültiger Inhalt" }, 400);
  }
  const { tag, id } = body || {};
  if (!tagOk(tag)) return json({ error: "Ungültiger Tag" }, 400);

  const liste = await lesen(env, tag);
  if (liste === null) return json({ error: "Speicher nicht erreichbar", live: false }, 503);
  if (!liste.length) return json({ tag, entries: [], live: true });

  // Nur der neuste Eintrag laesst sich zuruecknehmen, und nur kurz nach dem
  // Erfassen. Ein Protokoll, aus dem sich spaeter Beschluesse entfernen lassen,
  // waere keins.
  const letzter = liste[liste.length - 1];
  if (letzter.id !== id) return json({ error: "Nur der neuste Eintrag" }, 409);
  if (Date.now() - letzter.ts > RUECKNAHME_FENSTER) {
    return json({ error: "Zu spät, der Eintrag steht" }, 409);
  }
  const neu = liste.slice(0, -1);
  const ok = await schreiben(env, tag, neu);
  if (!ok) return json({ error: "Konnte nicht speichern", live: false }, 503);
  return json({ tag, entries: neu, live: true });
}
