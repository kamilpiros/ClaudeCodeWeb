# 🥙 Dönerfriitig — Games

Kleine Smartphone-Games für den **Dönerfriitig**-Verein, gebaut fürs Web im
Browser. Beim Öffnen wählt man auf der Landing-Page das Spiel. Mit prozeduralem
**Tropical-House-Sound** (live per Web Audio API erzeugt, kein Audio-File nötig).

### 🥙 Döner-Stapler
Tippe im richtigen Moment, um Zutaten aufeinanderzustapeln – der Überhang wird
abgeschnitten und es wird immer schneller. Wer am höchsten stapelt, kommt auf
die geteilte Bestenliste.

### 🎰 Bussen-Glücksrad
Dreh das Rad. Zwei Modi: **Bussen** (verteilt CHF-13.--Busse & Co. spielerisch)
und **Wer zahlt?** (lost einen Member aus). Mit Tick-Sound beim Drehen.

- **Member:** CBO, SJU, PKN, YMI, MST/MSO, JWU 🥒
- **Geteilte Bestenliste** über alle Member (Cloudflare KV)
- **Funktioniert offline** – Scores werden lokal gepuffert
- 🔊-Knopf oben rechts schaltet den Sound stumm
- Installierbar als PWA («Zum Home-Bildschirm hinzufügen»)

## Lokal testen

Es braucht keinen Build. Für die echte Bestenliste (Pages Function) am besten:

```sh
npx wrangler pages dev .
```

Dann auf dem Handy im selben WLAN die angezeigte Adresse öffnen. Ohne Server
genügt zum Anschauen auch ein simpler Static-Server (`npx serve .`) – dann ist
die Bestenliste nur lokal.

## Deployen (Cloudflare Pages)

1. **KV-Namespace** für die Bestenliste anlegen:
   ```sh
   npx wrangler kv namespace create LEADERBOARD
   ```
   Die ausgegebene `id` in `wrangler.toml` einsetzen (ersetzt die Null-id).

2. Als **Cloudflare Pages**-Projekt deployen:
   - Build command: *(leer)*
   - Build output directory: `.`  (dieser Ordner `doenerstapler/`)
   - Das KV-Binding `LEADERBOARD` unter Pages → Settings → Functions → KV
     namespace bindings hinzufügen (Variable: `LEADERBOARD`).

   Oder direkt per CLI:
   ```sh
   npx wrangler pages deploy .
   ```

Ohne KV-Binding läuft das Spiel weiterhin – die Bestenliste ist dann pro Gerät
lokal statt geteilt.

## Logo

Lege euer Vereinslogo als `logo.png` (quadratisch, ~512×512) in diesen Ordner.
Es erscheint auf dem Startscreen und als App-Icon. Fehlt die Datei, wird ein
🥙-Emoji angezeigt.

## Dateien

```
index.html                 Landing-Page / Spielauswahl
stapler.html                Döner-Stapler (Canvas, vanilla JS, kein Build)
gluecksrad.html             Bussen-Glücksrad
audio.js                    Tropical-House-Sound-Engine + SFX (Web Audio API)
style.css                   gemeinsames Styling
functions/api/scores.js     Bestenliste-API (GET/POST), KV-Persistenz
manifest.webmanifest        PWA-Manifest
wrangler.toml               Cloudflare Pages + KV Config
```

## Spielregeln-Gag

Passend zum Verein: 0 Zutaten gestapelt = Anspielung auf die **CHF 13.- Busse**.
Höhere Scores spielen auf **DF Chlöpfete** & Co. an. 😄
