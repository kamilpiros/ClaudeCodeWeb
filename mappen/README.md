# mappen

Hier legt das Apps Script `scripts/gmail-nach-drive.gs` die jeweils neueste
Arbeitsmappe als `aktuell.xlsx` ab, sobald der Statistiker eine Mail mit
Excel-Anhang verschickt.

Jeder Push in diesen Ordner startet den Ablauf in
`.github/workflows/df-nachfuehren.yml`: Der prüft, ob die Mappe neuer ist als
der Stand der Website, rechnet die Datensätze neu und pusht sie. Cloudflare
Pages deployt danach von selbst.

Immer derselbe Dateiname, damit das Repository nicht mit jeder Woche um ein
Megabyte wächst. Das Archiv aller Mappen liegt im Google Drive.
