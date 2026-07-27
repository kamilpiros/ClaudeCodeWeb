/**
 * Legt Excel-Anhaenge aus den Dönerfriitig-Mails ab, im Google Drive als Archiv
 * und im GitHub-Repository als Ausloeser fuer die automatische Nachfuehrung.
 *
 * Laeuft bei Google, nicht auf dem Rechner des Nutzers. Der Grund: der
 * Gmail-Connector, mit dem sonst gearbeitet wird, kann Anhaenge nicht
 * herunterladen. Dieses Script schliesst die Luecke.
 *
 * Bewusst NICHT am Dateinamen festgemacht. Entscheidend sind:
 *   1. Absender ist ein Vereinsmitglied
 *   2. die Unterhaltung ist noch nicht abgearbeitet, erkennbar am Label
 *   3. es haengt eine Excel-Datei dran
 *
 * Sobald die Datei in GitHub liegt, laeuft dort .github/workflows/
 * df-nachfuehren.yml los, rechnet die Datensaetze neu und pusht. Cloudflare
 * Pages deployt danach von selbst. Kein Rechner des Nutzers ist beteiligt.
 *
 * Einrichtung Schritt fuer Schritt steht in UEBERGABE-doenerfriitig.md.
 */

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

// Archivordner im Drive. Optional, aber praktisch als Ablage.
var ORDNER_ID = '1lJbMcL9YUkL1hbxCHyKgD0MmtDnG5vej';

// Ziel im Repository. Immer dieselbe Datei, damit das Repository nicht waechst.
var REPO = 'kamilpiros/ClaudeCodeWeb';
var ZWEIG = 'main';
var PFAD = 'mappen/aktuell.xlsx';

// Wer eine Mappe verschicken darf. Wer neu dazukommt, hier ergaenzen.
var ABSENDER = [
  'sascha.jucker@zkb.ch',
  'matthias_storz@hotmail.com',
  'philippe@heilmann.swiss',
  'joel.wuillemin@tamedia.ch',
  'yannick.miller@accenture.com',
  'cyril.bouquet1@gmail.com'
];

// Wie weit zurueck geschaut wird. Grosszuegig, damit ein paar Tage Ausfall
// nichts verschlucken. Doppelte verhindert das Label, nicht dieser Wert.
var ZEITRAUM = '14d';

// Marke an abgearbeiteten Unterhaltungen
var LABEL = 'df-gesichert';

var EXCEL_TYPEN = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
];

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------

function dfAnhaengeSichern() {
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  var threads = GmailApp.search(sucheBauen(), 0, 50);

  // Neueste Mail zuerst, damit bei mehreren Treffern die aktuellste Mappe
  // im Repository landet.
  var kandidaten = [];
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      msg.getAttachments().forEach(function (att) {
        if (istExcel(att)) kandidaten.push({ msg: msg, att: att });
      });
    });
  });
  kandidaten.sort(function (a, b) { return b.msg.getDate() - a.msg.getDate(); });

  Logger.log(threads.length + ' Unterhaltungen, ' + kandidaten.length + ' Excel-Anhaenge.');
  if (!kandidaten.length) {
    threads.forEach(function (t) { t.addLabel(label); });
    return 0;
  }

  // Alle ins Drive-Archiv, nur die neueste nach GitHub
  kandidaten.forEach(function (k) { insArchiv(k.msg, k.att); });
  var neueste = kandidaten[0];
  nachGithub(neueste.att, neueste.msg);

  threads.forEach(function (thread) { thread.addLabel(label); });
  return kandidaten.length;
}

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

function sucheBauen() {
  return 'from:(' + ABSENDER.join(' OR ') + ')'
       + ' has:attachment newer_than:' + ZEITRAUM
       + ' -label:' + LABEL;
}

function istExcel(att) {
  var name = att.getName() || '';
  var typ = att.getContentType() || '';
  return EXCEL_TYPEN.indexOf(typ) >= 0 || /\.xlsx?$/i.test(name);
}

function stempel(msg) {
  return Utilities.formatDate(msg.getDate(), 'Europe/Zurich', 'yyyy-MM-dd');
}

function insArchiv(msg, att) {
  if (!ORDNER_ID) return;
  var ordner = DriveApp.getFolderById(ORDNER_ID);
  var ziel = stempel(msg) + '_' + att.getName();
  if (ordner.getFilesByName(ziel).hasNext()) return;
  ordner.createFile(att.copyBlob()).setName(ziel);
  Logger.log('Archiv: ' + ziel);
}

/**
 * Legt die Mappe im Repository ab. Immer unter demselben Pfad, damit das
 * Repository nicht mit jeder Woche um ein Megabyte waechst.
 */
function nachGithub(att, msg) {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    Logger.log('FEHLER: GITHUB_TOKEN fehlt in den Skripteigenschaften. '
             + 'Projekteinstellungen, Skripteigenschaften, GITHUB_TOKEN anlegen.');
    return;
  }
  var api = 'https://api.github.com/repos/' + REPO + '/contents/' + PFAD;
  var kopf = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json'
  };

  // Liegt schon eine Datei dort, braucht der Ersatz ihren sha.
  var sha = null;
  var vorhanden = UrlFetchApp.fetch(api + '?ref=' + ZWEIG, {
    headers: kopf, muteHttpExceptions: true
  });
  if (vorhanden.getResponseCode() === 200) {
    sha = JSON.parse(vorhanden.getContentText()).sha;
  }

  var nutzlast = {
    message: 'Mappe vom ' + stempel(msg) + ' (' + att.getName() + ')',
    content: Utilities.base64Encode(att.copyBlob().getBytes()),
    branch: ZWEIG
  };
  if (sha) nutzlast.sha = sha;

  var antwort = UrlFetchApp.fetch(api, {
    method: 'put',
    headers: kopf,
    contentType: 'application/json',
    payload: JSON.stringify(nutzlast),
    muteHttpExceptions: true
  });
  var code = antwort.getResponseCode();
  if (code === 200 || code === 201) {
    Logger.log('GitHub: ' + PFAD + ' aktualisiert. Die Action laeuft jetzt an.');
  } else {
    Logger.log('GitHub antwortete ' + code + ': ' + antwort.getContentText().slice(0, 400));
  }
}

// ---------------------------------------------------------------------------
// Probelauf: zeigt nur an, schreibt nichts und setzt kein Label
// ---------------------------------------------------------------------------

function dfProbelauf() {
  var suche = sucheBauen();
  var threads = GmailApp.search(suche, 0, 50);
  Logger.log('Suche: ' + suche);
  Logger.log('Treffer: ' + threads.length + ' Unterhaltungen');

  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  Logger.log('GITHUB_TOKEN hinterlegt: ' + (token ? 'ja' : 'NEIN, bitte nachholen'));

  var n = 0;
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      msg.getAttachments().forEach(function (att) {
        if (!istExcel(att)) return;
        n++;
        Logger.log('  ' + stempel(msg) + '  ' + att.getName()
                 + '  (' + Math.round(att.getSize() / 1024) + ' KB)  von ' + msg.getFrom());
      });
    });
  });
  Logger.log(n + ' Excel-Anhaenge gefunden. Die neueste davon ginge nach GitHub.');
}
