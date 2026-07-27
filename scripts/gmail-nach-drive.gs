/**
 * Legt Excel-Anhaenge aus den Dönerfriitig-Mails im Drive-Ordner ab.
 *
 * Laeuft bei Google, nicht auf der Website. Der Grund: der Gmail-Connector,
 * mit dem die Website nachgefuehrt wird, kann Anhaenge nicht herunterladen.
 * Drive kann das. Dieses Script schliesst die Luecke.
 *
 * Bewusst NICHT am Dateinamen festgemacht. Entscheidend sind:
 *   1. Absender ist ein Vereinsmitglied
 *   2. die Mail ist neu, also noch nicht abgearbeitet
 *   3. es haengt eine Excel-Datei dran
 *
 * Einrichtung steht in UEBERGABE-doenerfriitig.md.
 */

// Zielordner im Drive. Steht auch in der Uebergabenotiz.
var ORDNER_ID = '1lJbMcL9YUkL1hbxCHyKgD0MmtDnG5vej';

// Wer eine Mappe verschicken darf. Wer neu dazukommt, hier ergaenzen.
var ABSENDER = [
  'sascha.jucker@zkb.ch',
  'matthias_storz@hotmail.com',
  'philippe@heilmann.swiss',
  'joel.wuillemin@tamedia.ch',
  'yannick.miller@accenture.com',
  'cyril.bouquet1@gmail.com'
];

// Wie weit zurueck geschaut wird. Grosszuegig, damit auch ein paar Tage
// Ausfall nichts verschluckt. Doppelte verhindert das Label, nicht dieser Wert.
var ZEITRAUM = '14d';

// Marke an abgearbeiteten Unterhaltungen
var LABEL = 'df-gesichert';

var EXCEL_TYPEN = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
];

function dfAnhaengeSichern() {
  var ordner = DriveApp.getFolderById(ORDNER_ID);
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);

  var suche = 'from:(' + ABSENDER.join(' OR ') + ')'
            + ' has:attachment newer_than:' + ZEITRAUM
            + ' -label:' + LABEL;

  var threads = GmailApp.search(suche, 0, 50);
  var gesichert = 0;

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      msg.getAttachments().forEach(function (att) {
        var name = att.getName() || '';
        var typ = att.getContentType() || '';
        var istExcel = EXCEL_TYPEN.indexOf(typ) >= 0 || /\.xlsx?$/i.test(name);
        if (!istExcel) return;

        // Das Maildatum vorne dran, damit die Reihenfolge im Ordner stimmt,
        // auch wenn der Statistiker den Dateinamen einmal vergisst.
        var stempel = Utilities.formatDate(msg.getDate(), 'Europe/Zurich', 'yyyy-MM-dd');
        var ziel = stempel + '_' + name;

        if (ordner.getFilesByName(ziel).hasNext()) return;   // schon da
        ordner.createFile(att.copyBlob()).setName(ziel);
        gesichert++;
        Logger.log('gesichert: ' + ziel + '  (von ' + msg.getFrom() + ')');
      });
    });
    thread.addLabel(label);
  });

  Logger.log(threads.length + ' Unterhaltungen geprueft, ' + gesichert + ' Dateien neu abgelegt.');
  return gesichert;
}

/**
 * Einmal von Hand aufrufen, um zu sehen was passieren wuerde.
 * Schreibt nichts und setzt kein Label.
 */
function dfProbelauf() {
  var suche = 'from:(' + ABSENDER.join(' OR ') + ')'
            + ' has:attachment newer_than:' + ZEITRAUM
            + ' -label:' + LABEL;
  var threads = GmailApp.search(suche, 0, 50);
  Logger.log('Suche: ' + suche);
  Logger.log('Treffer: ' + threads.length + ' Unterhaltungen');
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      msg.getAttachments().forEach(function (att) {
        var name = att.getName() || '';
        var typ = att.getContentType() || '';
        if (EXCEL_TYPEN.indexOf(typ) >= 0 || /\.xlsx?$/i.test(name)) {
          Logger.log('  ' + Utilities.formatDate(msg.getDate(), 'Europe/Zurich', 'yyyy-MM-dd')
                   + '  ' + name + '  von ' + msg.getFrom());
        }
      });
    });
  });
}
