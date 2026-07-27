// Wann ist Dönerfriitig?
//
// Jeden Freitag um 12.15 Uhr, ausser der Freitag ist ein nationaler Feiertag.
// Das ist keine Vermutung: in den Jahresblättern von 2016 bis 2026 fielen
// sechzehn Freitage auf einen solchen Feiertag, und an keinem einzigen davon
// wurde ein Termin gebucht.
//
// Genutzt vom Countdown auf der Startseite und von der Standanzeige in den
// Anwesenheitsstatistiken.

window.DF_KALENDER = (function () {
  var STUNDE = 12, MINUTE = 15;      // Beginn
  var DAUER = 75;                    // Minuten, danach gilt der Termin als vorbei

  var iso = function (d) {
    return d.getFullYear() + "-"
         + String(d.getMonth() + 1).padStart(2, "0") + "-"
         + String(d.getDate()).padStart(2, "0");
  };

  // Gauss beziehungsweise die anonyme gregorianische Osterformel
  function ostersonntag(j) {
    var a = j % 19, b = Math.floor(j / 100), c = j % 100;
    var d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var monat = Math.floor((h + l - 7 * m + 114) / 31);
    var tag = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(j, monat - 1, tag);
  }

  var versetzt = function (d, tage) {
    var x = new Date(d);
    x.setDate(x.getDate() + tage);
    return x;
  };

  // Die schweizweit geltenden Feiertage. Kantonale wie der Berchtoldstag
  // stehen bewusst nicht drin, sonst würde die Anzeige Termine wegwerfen,
  // die tatsächlich stattgefunden haben.
  function feiertage(jahr) {
    var o = ostersonntag(jahr);
    var liste = {};
    liste[iso(new Date(jahr, 0, 1))] = "Neujahr";
    liste[iso(versetzt(o, -2))] = "Karfreitag";
    liste[iso(versetzt(o, 1))] = "Ostermontag";
    liste[iso(versetzt(o, 39))] = "Auffahrt";
    liste[iso(versetzt(o, 50))] = "Pfingstmontag";
    liste[iso(new Date(jahr, 7, 1))] = "Nationalfeiertag";
    liste[iso(new Date(jahr, 11, 25))] = "Weihnachten";
    liste[iso(new Date(jahr, 11, 26))] = "Stephanstag";
    return liste;
  }

  var merker = {};
  function istFeiertag(d) {
    var j = d.getFullYear();
    if (!merker[j]) merker[j] = feiertage(j);
    return merker[j][iso(d)] || null;
  }

  // Freitag derselben Woche, auf die Startzeit gesetzt
  function freitagVon(d) {
    var x = new Date(d);
    x.setHours(STUNDE, MINUTE, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() - 5 + 7) % 7));
    return x;
  }

  /** Der letzte Dönerfriitig, der tatsächlich stattgefunden hat. */
  function letzter(jetzt) {
    jetzt = jetzt || new Date();
    var d = freitagVon(jetzt);
    if (d > jetzt) d = versetzt(d, -7);
    for (var i = 0; i < 60 && istFeiertag(d); i++) d = versetzt(d, -7);
    return d;
  }

  /**
   * Der nächste Dönerfriitig, samt den Freitagen, die wegen eines Feiertags
   * dazwischen ausfallen. Läuft der Termin gerade, ist `laeuft` gesetzt.
   */
  function naechster(jetzt) {
    jetzt = jetzt || new Date();
    var d = freitagVon(jetzt);
    var ende = new Date(d.getTime() + DAUER * 60000);
    var uebersprungen = [];
    if (!istFeiertag(d) && jetzt >= d && jetzt <= ende) {
      return { datum: d, laeuft: true, uebersprungen: uebersprungen };
    }
    if (jetzt > ende || istFeiertag(d)) {
      if (istFeiertag(d) && jetzt <= ende) {
        uebersprungen.push({ datum: new Date(d), name: istFeiertag(d) });
      }
      d = versetzt(d, 7);
    }
    for (var i = 0; i < 60 && istFeiertag(d); i++) {
      uebersprungen.push({ datum: new Date(d), name: istFeiertag(d) });
      d = versetzt(d, 7);
    }
    return { datum: d, laeuft: false, uebersprungen: uebersprungen };
  }

  return { feiertage: feiertage, istFeiertag: istFeiertag,
           letzter: letzter, naechster: naechster, iso: iso,
           beginn: { stunde: STUNDE, minute: MINUTE }, dauer: DAUER };
})();
