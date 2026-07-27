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

Die beiden Python-Skripte liegen im Container unter `/tmp` und sind nach einem
Neustart weg. Sie lassen sich aus dieser Notiz und den erzeugten Datensätzen
rekonstruieren, der Aufbau ist unten beschrieben.

## Quelle der Zahlen

Einzige vorliegende Arbeitsmappe: `DF_STATS_2026_07_24.xlsx`, Blätter
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

Sechs Coins zum Start FJ2023 am 10.02.2023, je CHF 190.24, zusammen CHF 1141.44.
Bitcoin 0.013 zum Start FJ2024 am 16.02.2024 für CHF 622.78.
Einsatz total **CHF 1764.22**. Abschluss FJ2024: CHF 3950.00, also 2.24-fach.

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

## Offen, dafür braucht es die alten Mappen

Die Anhänge liegen im Google Drive des Nutzers im Ordner **Gmail-Anhaenge Projekt**,
ID `1lJbMcL9YUkL1hbxCHyKgD0MmtDnG5vej`. Der Gmail-Connector kann keine Anhänge
herunterladen, nur Drive kann das.

1. Vermögensverlauf unterjährig statt nur zehn Jahrespunkte
2. Kryptobewertungen zwischen dem 28.02.2024 und dem Abschluss im Januar 2025.
   Dort ist die grösste Lücke, bekannt sind nur Anfangs- und Endwert
3. Ob Gewicht, Datum oder Preis des Goldkaufs irgendwo erfasst sind. Aktuell aus
   dem Screenshot abgeleitet
4. Gegenprüfung der Jahreszahlen 2017 bis 2022 gegen die Mappen von damals
5. Die Ausgaben je Anlass, falls in älteren Mappen einzeln verbucht

Zu jeder Mappe gehört eine Mail. Deren Text lohnt sich, dort stehen
Kassenstände und Beschlüsse im Klartext. Gmail funktioniert.

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
