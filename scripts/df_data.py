"""Baut den Anwesenheitsdatensatz doenerstapler/df-data.js aus einer Mappe.

Alles hier ist aus den Jahresblaettern abgeleitet. Einzige Ausnahme ist das
Vereinsjahr 2016: dafuer gibt es kein Blatt, nur eine Zusammenfassung. Dieser
Eintrag wird aus dem bestehenden Datensatz uebernommen und mitgerechnet.
"""

import collections
import itertools

import df_stats as S


def _rate(att, events):
    return round(att / events, 4) if events else 0.0


def _roles(ws):
    """Aemtli, Titel und Shirt aus dem Kopf des laufenden Jahresblattes."""
    spalten = {}
    for r in range(1, 12):
        for c in range(1, 40):
            v = ws.cell(row=r, column=c).value
            if not isinstance(v, str):
                continue
            t = v.strip().lower()
            if t.startswith("ämtli") or t.startswith("amtli"):
                spalten["amt"] = c
            elif t.startswith("other titles"):
                spalten["titel"] = c
            elif "shirt" in t and "worn" in t:
                spalten["shirt"] = c
    if not spalten:
        return {}
    # Die Mitgliederzeilen stehen im Teilnahmeblock links, meist Zeile 8 bis 14
    out = {}
    for r in range(6, 18):
        name = None
        for c in range(1, 12):
            n = S.norm(ws.cell(row=r, column=c).value)
            if n:
                name = n
                break
        if not name:
            continue
        rec = {}
        for key, c in spalten.items():
            v = ws.cell(row=r, column=c).value
            if isinstance(v, str) and v.strip():
                rec[key] = v.strip()
        if rec:
            out[name] = {k: rec.get(k) for k in ("amt", "titel", "shirt") if rec.get(k)}
    return out


def build(wb, alt):
    """alt ist der bisherige Datensatz, davon wird nur das Jahr 2016 uebernommen."""
    sheets = S.year_sheets(wb)
    if not sheets:
        raise SystemExit("Keine Blaetter im Muster 'Stats JJJJ'")

    jahre, matrix = [], []          # matrix: (datum, {mitglied: bool}) ueber alle Jahre
    letzte_ws = None
    for fy, name in sheets:
        ws = wb[name]
        letzte_ws = ws
        att, who = S.attendance(ws)
        if not att:
            continue
        order = [who[c] for c in sorted(who)]
        by_reason, _, total = S.fines(ws, order)
        leute = sorted(set(order))
        events = len(att)
        rec = {}
        for m in leute:
            a = sum(1 for _, r in att if r.get(m))
            gruende = {k: round(v, 2) for k, v in sorted(by_reason.get(m, {}).items())}
            itemised = round(sum(gruende.values()), 2) if gruende else None
            pen = total.get(m)
            if pen is None:
                pen = itemised or 0.0
            rec[m] = {"att": a, "events": events, "rate": _rate(a, events),
                      "pen": round(pen, 2), "penItemised": itemised,
                      "penByReason": gruende, "miss": events - a}
        jahre.append({"year": fy, "events": events,
                      "start": att[0][0].isoformat(), "end": att[-1][0].isoformat(),
                      "members": rec})
        matrix.extend(att)

    # Das Jahr 2016 hat kein Blatt, es kommt unveraendert aus dem alten Stand.
    frueher = [y for y in alt.get("years", []) if y.get("summaryOnly")]
    jahre = sorted(frueher + jahre, key=lambda y: y["year"])
    matrix.sort(key=lambda x: x[0])

    mitglieder = sorted({m for y in jahre for m in y["members"]})
    aktuell = sorted(jahre[-1]["members"])
    ehemalig = [m for m in mitglieder if m not in aktuell]

    # ---- alltime -----------------------------------------------------------
    alltime = {}
    for m in mitglieder:
        att = ev = 0
        pen = 0.0
        gruende = collections.defaultdict(float)
        per_year, years_in = {}, []
        for y in jahre:
            s = y["members"].get(m)
            if not s:
                continue
            att += s["att"]
            ev += s["events"]
            pen += s["pen"]
            for k, v in (s["penByReason"] or {}).items():
                gruende[k] += v
            per_year[str(y["year"])] = {"att": s["att"], "events": s["events"],
                                        "rate": s["rate"], "pen": s["pen"]}
            years_in.append(y["year"])
        miss = ev - att
        alltime[m] = {
            "att": att, "events": ev, "rate": _rate(att, ev), "miss": miss,
            "pen": round(pen, 2),
            "penPerMiss": round(pen / miss, 2) if miss else 0.0,
            "penByReason": {k: round(v, 2) for k, v in sorted(gruende.items())},
            "perYear": per_year,
            "streaks": _streaks(matrix, m),
            "years": years_in,
        }

    # ---- kumulierte Teilnahmen je Jahr -------------------------------------
    cumulative = {}
    for m in mitglieder:
        lauf, reihe = 0, []
        for y in jahre:
            s = y["members"].get(m)
            if s:
                lauf += s["att"]
                reihe.append({"year": y["year"], "cum": lauf})
            else:
                # Wer in dem Jahr nicht dabei war, bekommt keine Zahl,
                # sonst laeuft die Kurve nach dem Austritt waagrecht weiter.
                reihe.append({"year": y["year"], "cum": None})
        cumulative[m] = reihe

    # ---- Kopf an Kopf ------------------------------------------------------
    h2h = {}
    for a, b in itertools.combinations(mitglieder, 2):
        both = onlyA = onlyB = neither = 0
        for _, rec in matrix:
            if a not in rec or b not in rec:
                continue
            x, y = rec[a], rec[b]
            if x and y:
                both += 1
            elif x:
                onlyA += 1
            elif y:
                onlyB += 1
            else:
                neither += 1
        if both or onlyA or onlyB or neither:
            h2h[f"{a}|{b}"] = {"both": both, "onlyA": onlyA,
                               "onlyB": onlyB, "neither": neither}

    # ---- Saison ------------------------------------------------------------
    season = {}
    for monat in range(1, 13):
        tage = [rec for d, rec in matrix if d.month == monat]
        anwesend = sum(sum(1 for v in rec.values() if v) for rec in tage)
        moeglich = sum(len(rec) for rec in tage)
        season[str(monat)] = {"events": len(tage), "rate": _rate(anwesend, moeglich)}

    return {
        "generatedFrom": alt.get("generatedFrom"),
        "members": mitglieder,
        "current": aktuell,
        "former": ehemalig,
        "years": jahre,
        "alltime": alltime,
        "cumulative": cumulative,
        "h2h": h2h,
        "roles": _roles(letzte_ws),
        "assets": alt.get("assets", {}),
        "season": season,
        "totalEvents": sum(y["events"] for y in jahre),
    }


def _streaks(matrix, m):
    """Laengste Serie anwesend und abwesend, dazu die laufende Serie."""
    best_p = best_a = cur_p = cur_a = 0
    end_p = end_a = None
    letzte = None
    for d, rec in matrix:
        if m not in rec:
            continue
        if rec[m]:
            cur_p += 1
            cur_a = 0
            if cur_p > best_p:
                best_p, end_p = cur_p, d
        else:
            cur_a += 1
            cur_p = 0
            if cur_a > best_a:
                best_a, end_a = cur_a, d
        letzte = rec[m]
    return {"bestPresent": best_p,
            "bestPresentEnd": end_p.isoformat() if end_p else None,
            "bestAbsent": best_a,
            "bestAbsentEnd": end_a.isoformat() if end_a else None,
            "current": cur_p if letzte else cur_a,
            "currentKind": "da" if letzte else "weg"}
