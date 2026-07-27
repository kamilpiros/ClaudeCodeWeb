# Übergabe Dönerfriitig

Notiz für eine neue Sitzung. Liegt bewusst ausserhalb von `doenerstapler/`, damit
Cloudflare Pages sie nicht mit veröffentlicht. Root directory der Pages-Seite ist
`doenerstapler`.

## Stand

Die Seite läuft auf www.dönerfriitig.ch (Punycode `xn--dnerfriitig-rfb.ch`),
Cloudflare Pages, Deploy automatisch bei jedem Push auf `main`.

| Datei | Zweck |
| --- | --- |
| `index.html` | Hero mit Logo, Countdown auf Freitag 12.15, drei Eingänge |
| `stats.html` | Anwesenheitsstatistiken, sechs Reiter |
| `vermoegen.html` | Vereinsvermögen, fünf Reiter |
| `games.html`, `dash.html`, `stapler.html`, `gluecksrad.html` | die drei Spiele |
| `df-data.js` | Anwesenheitsdatensatz, erzeugt von `/tmp/build_data.py` |
| `df-assets.js` | Vermögensdatensatz, erzeugt von `/tmp/build_assets.py` |
| `functions/api/scores.js` | Bestenlisten, Cloudflare KV, Binding `LEADERBOARD` |
| `functions/api/gold.js` | Live-Goldkurs, mehrere offene Quellen, KV als Zwischenspeicher |

Neue Schlüssel in `df-assets.js` seit dem 27.07.2026: `timeline`, `fiscalYears`,
`crypto.marks`, `gold.marks`, `gold.ozFromCrypto`, `events`, `reserveSplit2020`,
`sources`, `checked`. Dazu tragen die Einträge in `years` neu `from`, `to` und
`meets`. Woher das kommt, steht weiter unten.

**Auf der Seite genutzt werden davon nur** `timeline`, `fiscalYears` und
`crypto.marks`. Der Rest ist Beleg für diese Notiz und bewusst nicht auf der Seite:
Der Nutzer will dort Zahlen sehen, keine Methodendiskussion. Wer die Herleitung
sucht, findet sie hier.

**Zum Caching, bitte ernst nehmen.** Es gibt drei Sicherungen, alle drei werden
gebraucht:

1. `doenerstapler/_headers` setzt für alles
   `Cache-Control: public, max-age=0, must-revalidate`. Cloudflare Pages liest
   die Datei aus dem Wurzelverzeichnis der Seite. Das regelt nur, was ab jetzt
   gecacht wird.
2. Die Verweise auf `df-assets.js` und `df-data.js` tragen einen
   Versionsparameter, in `index.html`, `stats.html` und `vermoegen.html`.
   **Nach jedem Lauf des Skripts das Datum in allen drei Dateien mitziehen:**

       cd doenerstapler
       sed -i "s/?v=[0-9]*/?v=$(date +%Y%m%d)/g" index.html stats.html vermoegen.html

   Nur das erreicht eine Kopie, die schon im Browser eines Mitglieds liegt.
   Ohne den Parameter zeigt die Seite alte Zahlen, und wenn die Seite neue
   Felder erwartet, bleibt sie bei diesem Mitglied sogar leer. Genau das ist
   am 27.07.2026 zweimal passiert, einmal je Datensatz.
3. `renderAll()` fängt Fehler je Reiter ab.

Die Übersicht zeigt neben dem Goldkurs eine zweite Anzeige mit dem zuletzt
nachgetragenen Dönerfriitig. Sie wird grün, wenn dieser Termin auf oder nach dem
letzten Freitag 12.15 Uhr liegt, und rot mit Tagesangabe, wenn seither nichts
nachgetragen wurde. Damit sieht man auf einen Blick, ob die Automatik hängt.
Der Wochentag stammt aus derselben Annahme wie der Countdown auf der Startseite.
Fällt ein Dönerfriitig einmal aus, springt die Anzeige nach acht Tagen trotzdem
auf rot. Das ist Absicht, denn von aussen ist ein Ausfall nicht von einem
fehlenden Nachtrag zu unterscheiden. Passen Seite und Datensatz einmal
   nicht zusammen, meldet sich nur der betroffene Reiter statt der ganzen Seite.

Ein Deploy braucht rund eine Minute. Wer danach die alte Fassung sieht, lädt mit
Umschalt und Neu laden hart nach.

## Automatischer Abgleich

Die Seite hält sich selbst aktuell. Kein Rechner des Nutzers ist beteiligt, die
Kette läuft vollständig auf Google, GitHub und Cloudflare:

    Gmail
      │  Apps Script, stündlich
      ▼
    GitHub  mappen/aktuell.xlsx
      │  Push löst die Action aus
      ▼
    GitHub Action  df-nachfuehren.yml
      │  rechnet df-assets.js und df-data.js neu, pusht
      ▼
    Cloudflare Pages deployt

### 1. `scripts/gmail-nach-drive.gs`

Google Apps Script im Konto des Nutzers. Sucht Mails von den Vereinsmitgliedern
mit Excel-Anhang, legt jeden davon im Drive-Archiv ab und schiebt den neuesten
über die GitHub-API nach `mappen/aktuell.xlsx`.

**Es prüft keinen Dateinamen.** Kriterien sind Absender, Anhangstyp und ob die
Unterhaltung schon das Label `df-gesichert` trägt. Nötig ist das Script, weil der
Gmail-Connector keine Anhänge herunterladen kann.

Einrichtung:

1. Ein GitHub-Token erzeugen: github.com, Einstellungen, Developer settings,
   Personal access tokens, Fine-grained tokens. Nur Zugriff auf
   `kamilpiros/ClaudeCodeWeb`, Berechtigung `Contents: Read and write`.
2. [script.google.com](https://script.google.com), neues Projekt, Inhalt von
   `scripts/gmail-nach-drive.gs` einfügen, speichern.
3. Projekteinstellungen, Skripteigenschaften, Eigenschaft `GITHUB_TOKEN`
   anlegen und den Token einsetzen.
4. Funktion `dfProbelauf` ausführen. Fragt einmal nach Berechtigung für Gmail
   und Drive. Das Protokoll zeigt danach, was gefunden würde und ob der Token
   hinterlegt ist. Es schreibt nichts.
5. Für den ersten Anlauf `dfErstbefuellung` ausführen. Die ignoriert das Label
   und schiebt die neueste gefundene Mappe nach GitHub, damit die Kette einmal
   ganz durchläuft. Danach nicht mehr nötig.
6. Trigger anlegen: Funktion `dfAnhaengeSichern`, zeitgesteuert, stündlich.

Wird das Script später geändert, genügt es, den Inhalt im selben Projekt zu
ersetzen. Autorisierung, Trigger und Label bleiben bestehen.

Kommt ein Mitglied dazu, die Adresse in `ABSENDER` ergänzen.

### 2. `.github/workflows/df-nachfuehren.yml`

Läuft bei jedem Push nach `mappen/`, zusätzlich von Hand über die Actions-Seite.
Installiert openpyxl, fragt das Skript mit `--check` ob die Mappe neuer ist,
rechnet nach, zählt die Versionsparameter hoch, prüft dass nur die erwarteten
fünf Dateien geändert wurden, committet und pusht.

Ist die Mappe nicht neuer, endet der Lauf ohne Änderung. Das Ergebnis steht
jeweils in der Zusammenfassung des Laufs.

### 3. `scripts/update_from_workbook.py --check`

Entscheidet. Öffnet die Mappe, liest den letzten Termin aus dem Bussenjournal
und vergleicht ihn mit `asOf`. Rückgabe 0 heisst neuer, 1 heisst nichts zu tun.
Der Dateiname spielt an keiner Stelle eine Rolle.

Ohne `--check` bricht das Skript ebenfalls ab, wenn die Mappe nicht neuer ist.
Zusätzlich prüft es vor dem Schreiben, ob sich ein abgeschlossenes Vereinsjahr
verändert hat oder die Debitoren des laufenden Jahres sinken. Beides deutet auf
einen Fehler hin und stoppt den Lauf. `--force` übergeht alle Prüfungen und
gehört nur nach Sichtprüfung gesetzt.

Getestet am 27.07.2026: gleiche und ältere Mappe werden abgelehnt, eine neuere
wird eingelesen und erzeugt wieder den bekannten Datensatz, eine manipulierte
Jahreszahl löst die Sicherung aus.

## Neue Mappe einlesen

    python scripts/update_from_workbook.py DF_STATS_2026_08_07.xlsx

Das Skript liegt im Repository und ersetzt das Herumstochern von Hand. Es zieht
aus der Mappe `years`, `fiscalYears`, `ledger`, `spending`, den neuen
Zeitreihenpunkt sowie `asOf` und `source`. Mit `--gold` führt es zusätzlich die
Goldkursreihe nach, mit `--dry-run` zeigt es nur, was sich ändern würde.

Bewusst unangetastet bleiben die von Hand belegten Blöcke: `crypto.marks`,
`gold.marks`, `events`, `reserveSplit2020`, `bench` und `gold.series`. Diese
stehen in keiner Mappe maschinenlesbar und würden bei einem Neuaufbau verloren
gehen.

Geprüft: gegen `DF_STATS_2026_07_24.xlsx` erzeugt das Skript einen inhaltlich
identischen Datensatz. Wer es ändert, sollte diesen Test wiederholen.

Danach den Versionsparameter an `df-assets.js` in `vermoegen.html` hochzählen,
sonst sehen die Mitglieder die alten Zahlen.

Das Skript führt **beide** Datensätze nach, `df-assets.js` und `df-data.js`.
Die Bausteine liegen in `scripts/df_stats.py` (Mappe lesen) und
`scripts/df_data.py` (Anwesenheiten rechnen).

Aus den Jahresblättern kommen Anwesenheitsmatrix, Bussenjournal, Ämtli, Titel
und Shirtstatus. Daraus werden Jahreswerte, Bestenlisten, kumulierte Reihen,
Kopf an Kopf, Serien und die Saisonauswertung gerechnet. Das Vereinsjahr 2016
hat kein Blatt und wird als Zusammenfassung aus dem bestehenden Datensatz
übernommen.

Weitere Eigenheiten, die dabei abgefangen werden:

- Im Blatt 2026 steht in der Kürzelzeile des Bussenjournals ein `#VALUE!`
  statt `JWU`. Die Lücke wird aus der Reihenfolge der Anwesenheitsspalten
  gefüllt.
- Im Blatt 2018 hat das Bussenjournal sieben Spalten, die siebte gehört JWI
  und trägt kein Kürzel. Sie bleibt unzugeordnet, so wie es sein soll.
- Leere Zellen in der Anwesenheitsmatrix zählen als abwesend. Ohne das fehlen
  Termine in Kopf an Kopf und in der Saisonauswertung.
- `pen` je Mitglied kommt aus der Summenzeile des Blattes, `penItemised` aus
  dem Journal. Wo pauschal gebucht wurde, klaffen die beiden auseinander.

**Eine Zahl ändert sich gegenüber dem alten Aufbau:** JWU hatte im Blatt 2018
eine LIFO-Buchung über CHF 5.00 vom 22.12.2017, deren Datum als Text statt als
Datum erfasst ist. Der alte Aufbau hat die Zeile deshalb übersprungen. Jetzt
zählt sie mit, JWUs LIFO 2018 steigt von 5.50 auf 10.50 und `penItemised` von
211.50 auf 216.50. Das Bussentotal 216.50 bleibt gleich, Ränge und Summen
ändern sich nicht.

Die beiden alten Python-Skripte lagen im Container unter `/tmp` und sind nach
einem Neustart weg. Sie lassen sich aus dieser Notiz und den erzeugten Datensätzen
rekonstruieren, der Aufbau ist unten beschrieben.

## Quelle der Zahlen

Aktuellste Arbeitsmappe: `DF_STATS_2026_07_24.xlsx`, Blätter
`Stats 2017` bis `Stats 2026`, `All-time DF Stats`, `Participation`.

openpyxl stürzt beim Öffnen ab (`ValueError: Max value is 52`, `pitchFamily`).
Abhilfe: `xl/drawings/`, `xl/charts/`, `xl/media/` und die passenden
Beziehungen aus dem Zip entfernen, Ergebnis als `df_clean.xlsx` speichern.

### Bilanzblock je Jahresblatt

- `T5` TOTAL ASSETS, `O16` oder `P16` DEBITORS TOTAL, `S16` Reserve, `S15`
  Rückstellung Merchandise
- Die Beschriftung der Reserve wechselt: CÄSHRESERVES 2019 bis 2022,
  CRYPTORESERVES 2023 und 2024, GOLDRESERVES 2025, Investments 2026
- **Falle:** Blatt 2025 hat die Merchandise-Rückstellung in der Reserve drin,
  Blatt 2026 rechnet sie heraus und addiert sie separat zum Total. Für die
  Zeitreihe immer brutto ausweisen, dann stimmt jedes Jahr
  Debitoren plus Reserve gleich Total.

| FJ | Debitoren | Reserve | Art | Total |
| --- | --- | --- | --- | --- |
| 2017 | 975.00 | – | keine | 975.00 |
| 2018 | 1441.50 | – | keine | 1441.50 |
| 2019 | 947.75 | 447.70 | Bargeld | 1395.45 |
| 2020 | 914.25 | 412.68 | Bargeld | 1326.93 |
| 2021 | 925.00 | 885.68 | Bargeld | 1810.68 |
| 2022 | 1377.50 | 813.42 | Bargeld | 2190.92 |
| 2023 | 1947.00 | 1048.27 | Krypto | 2995.27 |
| 2024 | 1432.50 | 3950.00 | Krypto | 5382.50 |
| 2025 | 1240.50 | 5358.00 | Gold | 6598.50 |
| 2026 | 1036.50 | 5238.00 | Gold | 6274.50 |

Vereinsjahr ist nicht Kalenderjahr, es läuft von Chlöpfete zu Chlöpfete.
FJ2026 zum Beispiel vom 12.12.2025 bis 24.07.2026.

### Goldposition

Aus dem Revolut-Depot des Vereins, Screenshot des Nutzers:
**1.5961 XAU**, also 49.644 Gramm, Wert CHF 4498.34 bei plus 10.77 Prozent.
Daraus Einstand CHF 4060.97, das sind CHF 2544.31 je Unze.

Drei unabhängige Gegenproben, alle stimmig:

- Einstand 2544.31 je Unze liegt zwischen den Monatsdurchschnitten Januar 2025
  (2465.00) und Februar 2025 (2615.10), passt also auf den Start von FJ2025 am
  31.01.2025
- Revisionsbericht FJ2025: Goldreserve CHF 5358.00 per 05.12.2025, das sind
  3356.93 je Unze, zwischen November (3284.70) und Dezember 2025 (3433.80)
- Der Screenshot selbst: 4498.34 für 1.5961 XAU sind 2818.33 je Unze, das passt
  in den Sommer 2025. Der Screenshot ist also **nicht aktuell**.

Verkauft wurde nie. Krypto wurde in Gold getauscht, das Gold liegt unangetastet.

### Kryptodepot

Sechs Coins zum Start FJ2023 am 10.02.2023, je rund CHF 190, zusammen CHF 1139.94.
Bitcoin 0.013 zum Start FJ2024 am 16.02.2024 für CHF 622.78.
Einsatz total **CHF 1762.72** (Zelle `AA32`, Blatt 2024). Abschluss FJ2024:
CHF 3950.00, also 2.24-fach. Die vollständige Bewertungsreihe steht weiter unten.

| Member | Coin | Einheiten | 05.01.2024 | 28.02.2024 |
| --- | --- | --- | --- | --- |
| MSO/MST | Livepeer | 21.46701712 | 128.83 | 278.86 |
| SJU | Ripple | 514.907349 | 251.07 | 266.14 |
| PKN | Radicle | 100.37945723 | 170.57 | 186.71 |
| JWU | Shiba Inu | 15448414.2267 | 128.38 | 150.14 |
| YMI | Sushi Swap | 147.60700398 | 138.75 | 201.64 |
| CBO | Ether | 0.12023725 | 230.68 | 353.86 |
| Verein | Bitcoin | 0.013 | – | 718.31 |

**Falle:** die Spalte «Value 16.02» im Blatt 2023 ist keine Bewertung, sondern der
Einsatz abzüglich Kaufgebühr. Alle sechs stehen dort bei 185 bis 186. Die
Gebühren betrugen 1.84 bis 2.60 Prozent. Nicht als Kurswert verwenden.

Geprüft an den Stückzahlen: 21.467 Livepeer zu CHF 6.00 am 05.01.2024 und zu
CHF 12.99 am 28.02.2024 entspricht dem echten Kursverlauf von LPT.

### Eventausgaben, abgeleitet

Mechanik laut Verein: Bussen werden an der Chlöpfete einkassiert, davon werden
die ein bis zwei Anlässe pro Jahr bezahlt, der Rest geht in die Reserve.

    Ausgaben = einkassierte Debitoren − was neu in die Reserve floss
    neu in die Reserve = Anschaffungswert zu Jahresbeginn − Marktwert am Vorjahresende

Der Anschaffungswert ist wichtig, sonst erscheint die Rendite als Ausgabe.

| FJ | einkassiert | in Reserve | Ausgaben |
| --- | --- | --- | --- |
| 2019 | 947.75 | −35.02 | 982.77 |
| 2020 | 914.25 | 473.00 | 441.25 |
| 2021 | 925.00 | −72.26 | **997.26** |
| 2022 | 1377.50 | 328.02 | 1049.48 |
| 2023 | 1947.00 | 622.78 | 1324.22 |
| 2024 | 1432.50 | 110.97 | 1321.53 |
| 2025 | 1240.50 | −120.00 | 1360.50 |

Total CHF 7477.01, im Schnitt 1068 je Jahr, 85 Prozent aller je eingezogenen
Bussen. Belege: Blatt 2021 nennt selbst eine Zeile `spent 997.26` in `W18`, die
Rechnung trifft sie exakt. Blatt 2023 `W20` notiert 630 CHF an Quo Vadis 2023.
FJ2017 und FJ2018 fehlen, weil der erste Kassenübertrag drei Jahre zusammenfasst.

### Kursdaten

Beide über `raw.githubusercontent.com`, andere Finanzhosts sperrt der Proxy.

- Gold in USD je Unze, Monatswerte:
  `https://raw.githubusercontent.com/datasets/gold-prices/main/data/monthly.csv`
- Wechselkurs CHF je USD, Monatswerte, Zeilen mit `Country == "Switzerland"`:
  `https://raw.githubusercontent.com/datasets/exchange-rates/main/data/monthly.csv`

Unze gleich 31.1034768 Gramm.

## Auswertung der Altmappen, Stand 27.07.2026

Die Anhänge liegen im Google Drive des Nutzers im Ordner **Gmail-Anhaenge Projekt**,
ID `1lJbMcL9YUkL1hbxCHyKgD0MmtDnG5vej`, in drei Unterordnern nach Absender. Der
Gmail-Connector kann keine Anhänge herunterladen, nur Drive kann das.

**Ausgewertet: 62 Arbeitsmappen vom 29.10.2021 bis 24.07.2026**, dazu vier PDF und
die Revisionsberichte FJ2024 und FJ2025 aus Gmail. Ältere Mappen als 29.10.2021
existieren im Drive nicht.

Vorgehen, falls es noch einmal gebraucht wird: `download_file_content` liefert die
Datei base64-kodiert; bei Überlänge legt der Harness das Ergebnis als JSON unter
`tool-results/` ab. Von dort dekodieren, mit dem oben beschriebenen Zip-Trick
säubern und mit openpyxl lesen. So kostet keine Mappe Kontext.

### 1. Unterjähriger Verlauf: erledigt

**Die Mappenstände braucht es dafür gar nicht.** Jedes Jahresblatt führt rechts
ein Bussenjournal: Spalte `Date:`, Spalte `Reason:`, danach eine Betragsspalte je
Mitglied. Kumuliert man das nach Datum, bekommt man die Debitoren an jedem
einzelnen Dönerfriitig, und zwar für alle zehn Vereinsjahre. Ergebnis: 409 Punkte
in `df-assets.js` unter `ledger`, dazu `timeline` mit den 66 Mappenständen als
Gegenprobe.

Beim Auslesen zu beachten:

- Das Blatt 2018 hat **sieben** Betragsspalten, weil Jin damals mitzählte. Die
  siebte trägt statt `Amount:` die Kopfzeile `J dä verräter`. Wer nur auf
  `Amount:` filtert, verliert eine ganze Spalte.
- Einzelne Daten stehen als Text `22.12.2017` statt als Datum.
- **Die Pauschalen.** In den Jahren 2018 bis 2020 und 2022 wurden die Bussen von
  CBO und YMI nur als Jahressumme gebucht, nicht je Termin. Die fehlen im
  Journal, stehen aber in der Mitgliederzeile 20. Betroffen sind 366.00 (2018),
  363.00 (2019), 65.75 (2020) und 180.50 (2022). Die Seite verteilt diesen Rest
  gleichmässig über die Termine des Jahres, damit jede Jahreskurve exakt auf dem
  bekannten Jahrestotal endet. Die Beträge stehen in `ledgerResidual`.
- Im Blatt 2020 ist `DEBITORS TOTAL` bereits netto: die Spalte `Paid: 50` je
  Mitglied, zusammen 300.00, ist abgezogen. Die Verteilung des Rests fängt das
  automatisch mit auf.

**Die Reserve ist während eines Vereinsjahrs konstant** und entspricht dem Wert,
der auf dem Blatt dieses Jahres steht. Empirisch geprüft an den Mappenständen von
2021, 2022, 2023, 2025 und 2026: mitten im Jahr steht dort immer genau der Wert
des Jahresabschlusses. Der Sprung passiert an der Chlöpfete.

Neu auch alle Fiskaljahresgrenzen aus dem Bussenjournal, unter `fiscalYears`:

| FJ | von | bis | Termine |
| --- | --- | --- | --- |
| 2017 | 23.12.2016 | 24.11.2017 | 48 |
| 2018 | 01.12.2017 | 08.02.2019 | 62 |
| 2019 | 15.02.2019 | 10.01.2020 | 47 |
| 2020 | 24.01.2020 | 21.05.2021 | 66 |
| 2021 | 28.05.2021 | 11.03.2022 | 42 |
| 2022 | 18.03.2022 | 03.02.2023 | 46 |
| 2023 | 10.02.2023 | 09.02.2024 | 52 |
| 2024 | 16.02.2024 | 24.01.2025 | 50 |
| 2025 | 31.01.2025 | 05.12.2025 | 43 |
| 2026 | 12.12.2025 | 24.07.2026 | 29 laufend |

FJ2020 dauerte 483 Tage, die Chlöpfete wurde in der Pandemie mehrfach verschoben.
Im Blatt 2024 steht eine verirrte Buchung vom 28.04.2023, die den scheinbaren
Jahresbeginn verfälscht. Massgeblich ist die Zeile `Yearly Amount` mit 16.02.2024.

### 2. Kryptolücke: teilweise geschlossen

Elf belegte Stände, in `crypto.marks`. Die Lücke ist jetzt 28.02.2024 bis 05.12.2024.

| Datum | CHF | Art |
| --- | --- | --- |
| 10.02.2023 | 1141.44 | Einzahlung, 6 Coins brutto |
| 16.02.2023 | 1114.96 | nach Kaufgebühr |
| 17.03.2023 | 1082.42 | Kurs je Coin |
| 12.05.2023 | 901.92 | Kurs je Coin |
| 29.09.2023 | 1006.68 | Kurs je Coin |
| 05.01.2024 | 1048.27 | Abschluss FJ2023 |
| 09.02.2024 | 1084.40 | revidierte Mappe |
| 16.02.2024 | 1762.72 | Einsatz total nach BTC-Zukauf |
| 28.02.2024 | 2155.66 | letzte Bewertung Coin für Coin |
| 05.12.2024 | 2981.00 | nur noch Summe |
| 24.01.2025 | 3950.00 | Schätzung |

**Korrektur zur alten Notiz:** Einsatz total ist **1762.72**, nicht 1764.22. Zelle
`AA32` im Blatt 2024 nennt 1762.71951057644. Die sechs Coins kosteten je 189.93 bis
190.11, nicht exakt 190.24.

**Neue Falle:** die Mappe vom 02.10.2023 zeigt unter der Kopfzeile `Rate (12.05.2023)`
andere Zahlen als die Mappe vom Juni. Die Werte wurden nachgeführt, die Kopfzeile
nicht. Die 1006.68 gehören zu Ende September 2023.

**Neue Falle:** der Revisionsbericht FJ2024 nennt die Position wörtlich
«Kryptoreserve Schätzig MSO/MST». Die 3950.00 sind eine Schätzung, keine Bewertung.

### 3. Goldposition: geklärt, ohne Beleg aber stimmig

Gewicht, Kaufdatum und Kaufpreis sind in keiner Mappe und in keiner Mail erfasst.
Erfasst sind nur Frankenbeträge mit Stichtag, in `gold.marks`:

| Stichtag | CHF | CHF je Unze | ergibt Unzen |
| --- | --- | --- | --- |
| 07.02.2025 | 3100.00 | 2615.10 | 1.185 |
| 08.10.2025 | 5105.79 | 3236.52 | 1.578 |
| 05.12.2025 | 5358.00 | 3433.84 | 1.560 |

Die letzten zwei ergeben dasselbe Gewicht wie die 1.5961 XAU aus dem Screenshot.
Vierte Gegenprobe: 3950 CHF kaufen im Januar 2025 zu 2465.02 je Unze **1.6024
Unzen**, praktisch genau die 1.5961 XAU. Der gesamte Kryptoerlös ist also im Gold.

**Falle:** die 3100 tragen die Notiz `*ca. Wert 7.2.25` und blieben von Februar bis
Oktober 2025 unverändert stehen. Das entspricht nur 1.19 Unzen. Es ist eine grobe
Schätzung, kein Bestandsnachweis, und darf nicht als Beleg für einen Abfluss
gelesen werden.

### 4. Gegenprüfung 2017 bis 2022: bestätigt

Jede Mappe schleppt die abgeschlossenen Vorjahre als eigenes Blatt mit. Jedes
Jahresblatt 2017 bis 2025 trägt in allen 62 Mappen **identische Zahlen**, keine
einzige Abweichung. Die Tabelle oben in dieser Notiz stimmt.

Zusätzlich belegt der Wochenbericht vom 29.10.2021 im Blatt `Participation` die
Zusammensetzung der Kasse FJ2020:

    Cäsh Reserves vo dä letschtä Brüglete (scho izahlt):   112.68
    Jahresbiitrag für Investitione (nöd investiert):       300.00
    Buesse 2020:                                           914.25
    Total 2020:                                           1326.93

Wichtig: die Reserve ist nicht nur Restgeld. Es fliesst auch ein Jahresbeitrag für
Investitionen hinein, FJ2020 waren das 50 CHF je Mitglied. Im Blatt 2020 steht das
als `CÄSHRESERVES + Paid` mit einer Spalte `Paid: 50` je Mitglied.

### 5. Ausgaben je Anlass: nur zwei Posten belegt

Keine Mappe führt eine Liste der Anlässe mit Einzelbeträgen. Ausdrücklich verbucht
sind nur:

- Blatt 2021, `W18`: `spent 997.26`. Gegenprobe: 1810.68 minus 997.26 ergibt exakt
  die Reserve 813.42 für FJ2022. Das ist der beste Test der Ableitungsmethode.
- Blatt 2023, `W20`: 105 mal 6 gleich 630 CHF für Quo Vadis 2023, vom Financier
  bezahlt, Geld von den Mitgliedern bereits geleistet. Ob Vereinsvermögen oder
  nicht wird laut Notiz noch diskutiert.

Die Jahreswerte bleiben also gerechnet, nicht belegt.

### Zur Frage, ob Krypto für einen Anlass verbraucht wurde

**Nein.** Der Abschlussbetrag FJ2024 von 3950 CHF ist im Gold vollständig
wiederzufinden, siehe Punkt 3. Wären davon 850 CHF abgeflossen, wie es der Sprung
von 3950 auf 3100 nahelegt, läge der Bestand bei rund 1.2 Unzen. Im Oktober und im
Dezember 2025 weisen die Mappen aber übereinstimmend knapp 1.6 Unzen aus. Die 3100
sind eine zu tiefe Schätzung, kein Abfluss.

**Eine Ausnahme bleibt offen:** der Abschluss FJ2025 führt die Reserve mit 5358.00,
das Blatt 2026 übernimmt sie brutto mit 5238.00, beide zum selben Stichtag
05.12.2025. Die Differenz von 120 CHF entspricht etwa 0.035 Unzen. Keine Mappe und
kein Revisionsbericht nennt einen Grund. Korrektur der Bewertung oder tatsächlicher
Bezug lässt sich ohne Kontoauszug von Revolut nicht entscheiden. Das ist die
einzige Stelle, an der die Reserve je kleiner wurde.

### Nicht geprüft

- Die Mailtexte wurden nur stichprobenweise gelesen. Die beiden Revisionsberichte
  ganz, der Rest über Betreff und Vorschau. Die Wochenberichte stecken ohnehin als
  Volltext im Blatt `Participation` der Mappen und wurden dort durchsucht.
- Kein Kontoauszug von Revolut, keine Belege für einzelne Anlässe.
- Im Drive liegt ein PDF `Anlagevorschlag831691.pdf` vom 23.06.2025. Das ist ein
  privater ZKB-Vorschlag über 100000 CHF für Cyril Bouquet persönlich, kein
  Vereinsvermögen. Gehört nicht auf die Seite.

## Bekannte Fehler in der Mappe

- PKN 2023 enthält eine Spende von CHF 33.07 im Bussentotal
- YMI 2024 im All-time-Blatt ist offenbar aus 2023 kopiert, 476.00 statt 393.50.
  Massgebend sind die Jahresblätter
- In den Jahren 2016 sowie 2018 bis 2020 wurden Bussen teils nur als
  Jahrespauschale gebucht. Der nicht aufgeschlüsselte Rest erscheint in
  `stats.html` als Segment «Pauschal»

## Sprache und Form

Hochdeutsch, kein Schweizerdeutsch. Keine Gedankenstriche und keine Bindestriche
in Fliesstexten der Seite. Schrift überall Comic Sans. Hintergrund `#2c386d`,
exakt die Farbe des Vereinslogos. Logo ohne Rahmen.
