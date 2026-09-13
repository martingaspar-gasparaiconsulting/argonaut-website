import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_RUHE_TAGE, MAX_SCHRITTE, MIND_ABSTAND_TAGE, SPERRE_TAGE,
  tageZwischen, spaeter, plusTage, datumDeutsch,
  letzterKaufJeKontakt, letzteBeruehrung, ruheTage, istRuhend, nochGesperrt,
  aktiveSchritte, fehltZumStarten, beschreibe,
  stoppGrund, entscheide, nachVersand,
  setzePlatzhalter, anrede, nameFuer, VORLAGE, STOPP_TEXT,
} from '../out/rueckholung.js';

const HEUTE = '2026-09-13';

/** Ein Kontakt, der alles richtig macht: Adresse, Einwilligung, kein Widerspruch. */
function kontakt(zusatz = {}) {
  return {
    id: 'k1',
    email: 'kunde@example.de',
    vorname: 'Anna',
    nachname: 'Berger',
    firma: 'Berger GmbH',
    werbe_einwilligung: true,
    ...zusatz,
  };
}

// ------------------------------------------------------------------ Datumsrechnen

test('tageZwischen zählt ganze Tage und erkennt Unbrauchbares', () => {
  assert.equal(tageZwischen('2026-09-01', '2026-09-13'), 12);
  assert.equal(tageZwischen('2026-09-13', '2026-09-01'), -12);
  assert.equal(tageZwischen('2026-09-13', '2026-09-13'), 0);
  assert.equal(tageZwischen('kaputt', '2026-09-13'), null);
  assert.equal(tageZwischen(null, '2026-09-13'), null);
});

test('tageZwischen kommt mit vollen Zeitstempeln zurecht', () => {
  assert.equal(tageZwischen('2026-09-01T23:59:00Z', '2026-09-13T00:01:00Z'), 12);
});

test('plusTage rechnet über Monatsgrenzen', () => {
  assert.equal(plusTage('2026-09-25', 10), '2026-10-05');
  assert.equal(plusTage('2026-09-13', 0), '2026-09-13');
  assert.equal(plusTage('kaputt', 5), null);
});

test('spaeter nimmt das jüngere Datum und ist null-sicher', () => {
  assert.equal(spaeter('2026-01-01', '2026-09-13'), '2026-09-13');
  assert.equal(spaeter(null, '2026-09-13'), '2026-09-13');
  assert.equal(spaeter('2026-09-13', null), '2026-09-13');
  assert.equal(spaeter(null, null), null);
});

test('datumDeutsch macht aus ISO ein lesbares Datum', () => {
  assert.equal(datumDeutsch('2026-09-13'), '13.09.2026');
  assert.equal(datumDeutsch('unsinn'), '');
});

// ------------------------------------------------------------- Letzter Kauf

test('letzterKaufJeKontakt nimmt je Kontakt das jüngste Datum', () => {
  const map = letzterKaufJeKontakt([
    { kontakt_id: 'a', datum: '2026-01-10' },
    { kontakt_id: 'a', datum: '2026-05-02' },
    { kontakt_id: 'b', datum: '2026-03-03' },
  ]);
  assert.equal(map.get('a'), '2026-05-02');
  assert.equal(map.get('b'), '2026-03-03');
});

test('letzterKaufJeKontakt überspringt Zeilen ohne Kontakt oder ohne Datum', () => {
  const map = letzterKaufJeKontakt([
    { kontakt_id: null, datum: '2026-05-02' },
    { kontakt_id: 'a', datum: null },
    { kontakt_id: 'a', datum: 'kaputt' },
  ]);
  assert.equal(map.size, 0);
});

test('letzteBeruehrung: Kauf schlägt Kontakt schlägt Kundenbeginn', () => {
  const k = kontakt({ letzter_kontakt_am: '2026-06-01', kunde_seit: '2024-01-01' });
  assert.equal(letzteBeruehrung(k, '2026-07-01'), '2026-07-01');
  assert.equal(letzteBeruehrung(k, null), '2026-06-01');
  assert.equal(letzteBeruehrung(kontakt({ kunde_seit: '2024-01-01' }), null), '2024-01-01');
  assert.equal(letzteBeruehrung(kontakt(), null), null);
});

// ---------------------------------------------------------------- Ruhezeit

test('ruheTage hält die Grenze nach unten und oben', () => {
  assert.equal(ruheTage(5), MIN_RUHE_TAGE);
  assert.equal(ruheTage(90), 90);
  assert.equal(ruheTage(999999), 3650);
  assert.equal(ruheTage('abc'), MIN_RUHE_TAGE);
});

test('istRuhend erkennt einen echten Rückhol-Fall', () => {
  const e = istRuhend(kontakt(), '2026-01-01', HEUTE, 90);
  assert.equal(e.ruhend, true);
  assert.equal(e.tageStill, 255);
});

test('istRuhend sagt NEIN, solange die Ruhezeit nicht erreicht ist', () => {
  const e = istRuhend(kontakt(), '2026-08-20', HEUTE, 90);
  assert.equal(e.ruhend, false);
  assert.match(e.grund, /von 90 Tagen still/);
});

test('istRuhend sagt NEIN ohne E-Mail-Adresse', () => {
  const e = istRuhend(kontakt({ email: '' }), '2026-01-01', HEUTE, 90);
  assert.equal(e.ruhend, false);
  assert.equal(e.grund, STOPP_TEXT.keine_adresse);
});

test('istRuhend sagt NEIN bei Widerspruch — auch wenn die Einwilligung gesetzt ist', () => {
  const e = istRuhend(kontakt({ werbe_widerspruch_am: '2026-02-02' }), '2026-01-01', HEUTE, 90);
  assert.equal(e.ruhend, false);
  assert.match(e.grund, /widersprochen/);
});

test('istRuhend sagt NEIN ohne ausdrückliche Einwilligung', () => {
  const e = istRuhend(kontakt({ werbe_einwilligung: false }), '2026-01-01', HEUTE, 90);
  assert.equal(e.ruhend, false);
  assert.match(e.grund, /ohne_einwilligung/);
});

test('istRuhend sagt NEIN, wenn gar kein Datum bekannt ist', () => {
  const e = istRuhend(kontakt(), null, HEUTE, 90);
  assert.equal(e.ruhend, false);
  assert.equal(e.tageStill, null);
});

test('istRuhend sagt NEIN bei einem Datum in der Zukunft', () => {
  const e = istRuhend(kontakt(), '2027-01-01', HEUTE, 90);
  assert.equal(e.ruhend, false);
  assert.match(e.grund, /Zukunft/);
});

test('istRuhend setzt die Untergrenze auch gegen eine zu kleine Einstellung durch', () => {
  // 14 Tage eingestellt, 20 Tage still — mit der Untergrenze von 30 kein Fall.
  const e = istRuhend(kontakt(), '2026-08-24', HEUTE, 14);
  assert.equal(e.ruhend, false);
});

test('nochGesperrt schützt vor einem zweiten Durchlauf', () => {
  assert.equal(nochGesperrt('2026-08-01', HEUTE), true);
  assert.equal(nochGesperrt('2026-01-01', HEUTE), false);
  assert.equal(nochGesperrt(null, HEUTE), false);
  assert.equal(SPERRE_TAGE, 180);
});

// ------------------------------------------------------------ Strecke prüfen

const guteStrecke = { name: 'Rückholung', ruhe_tage: 90, schritte: VORLAGE.schritte };

test('die mitgelieferte Vorlage ist startklar', () => {
  assert.deepEqual(fehltZumStarten(guteStrecke), []);
});

test('aktiveSchritte sortiert und lässt Abgeschaltetes weg', () => {
  const s = aktiveSchritte({
    schritte: [
      { schritt: 3, nach_tagen: 20, betreff: 'c', text: 'c' },
      { schritt: 1, nach_tagen: 0, betreff: 'a', text: 'a' },
      { schritt: 2, nach_tagen: 10, betreff: 'b', text: 'b', aktiv: false },
    ],
  });
  assert.deepEqual(s.map((x) => x.schritt), [1, 3]);
});

test('fehltZumStarten verlangt Name, Nachricht, Betreff und Text', () => {
  const fehlt = fehltZumStarten({ name: 'x', schritte: [{ schritt: 1, nach_tagen: 0, betreff: '', text: '' }] });
  assert.ok(fehlt.some((f) => /Name/.test(f)));
  assert.ok(fehlt.some((f) => /Betreff/.test(f)));
  assert.ok(fehlt.some((f) => /Text/.test(f)));
});

test('fehltZumStarten verlangt Mindestabstand zwischen zwei Nachrichten', () => {
  const fehlt = fehltZumStarten({
    name: 'Rückholung',
    schritte: [
      { schritt: 1, nach_tagen: 0, betreff: 'a', text: 'a' },
      { schritt: 2, nach_tagen: 1, betreff: 'b', text: 'b' },
    ],
  });
  assert.ok(fehlt.some((f) => f.includes(`${MIND_ABSTAND_TAGE} Tage Abstand`)));
});

test('fehltZumStarten deckelt die Anzahl der Nachrichten', () => {
  const schritte = Array.from({ length: MAX_SCHRITTE + 1 }, (_x, i) => ({
    schritt: i + 1, nach_tagen: i * 10, betreff: 'b', text: 't',
  }));
  const fehlt = fehltZumStarten({ name: 'Zuviel', schritte });
  assert.ok(fehlt.some((f) => f.includes(String(MAX_SCHRITTE))));
});

test('fehltZumStarten erkennt doppelte Nummern', () => {
  const fehlt = fehltZumStarten({
    name: 'Doppelt',
    schritte: [
      { schritt: 1, nach_tagen: 0, betreff: 'a', text: 'a' },
      { schritt: 1, nach_tagen: 10, betreff: 'b', text: 'b' },
    ],
  });
  assert.ok(fehlt.some((f) => /eigene Nummer/.test(f)));
});

test('eine Strecke ohne Nachricht ist nicht startklar', () => {
  assert.ok(fehltZumStarten({ name: 'Leer', schritte: [] }).some((f) => /mindestens eine Nachricht/.test(f)));
});

test('beschreibe nennt Ruhezeit, Anzahl und die Sperrfrist', () => {
  const satz = beschreibe(guteStrecke);
  assert.match(satz, /90 Tagen nichts gekauft/);
  assert.match(satz, /3 Nachrichten/);
  assert.match(satz, new RegExp(`${SPERRE_TAGE} Tage Ruhe`));
});

// ------------------------------------------------------------------- Abbruch

test('stoppGrund: ein Kauf nach dem Start beendet die Strecke', () => {
  assert.equal(stoppGrund(kontakt(), '2026-09-10', '2026-09-01'), 'gekauft');
});

test('stoppGrund: ein Kauf VOR dem Start war ja gerade der Anlass', () => {
  assert.equal(stoppGrund(kontakt(), '2026-01-01', '2026-09-01'), null);
});

test('stoppGrund: ein Kauf am Starttag zählt schon als Reaktion', () => {
  assert.equal(stoppGrund(kontakt(), '2026-09-01', '2026-09-01'), 'gekauft');
});

test('stoppGrund: meldet sich der Kunde selbst, ist Schluss', () => {
  assert.equal(stoppGrund(kontakt({ letzter_kontakt_am: '2026-09-05' }), null, '2026-09-01'), 'gemeldet');
});

test('stoppGrund: Widerspruch und Abmeldung schlagen alles', () => {
  assert.equal(stoppGrund(kontakt({ werbe_widerspruch_am: '2026-09-02' }), null, '2026-09-01'), 'widersprochen');
  assert.equal(stoppGrund(kontakt({ status: 'abgemeldet' }), null, '2026-09-01'), 'abgemeldet');
});

test('stoppGrund: ohne Adresse wird nicht weitergemacht', () => {
  assert.equal(stoppGrund(kontakt({ email: null }), null, '2026-09-01'), 'keine_adresse');
});

// --------------------------------------------------------------- Entscheidung

test('entscheide: die erste Nachricht ist am Starttag fällig', () => {
  const e = entscheide({ gestartet_am: HEUTE, schritt: 0 }, guteStrecke, kontakt(), '2026-01-01', HEUTE);
  assert.equal(e.tun, 'senden');
  assert.equal(e.schritt, 1);
  assert.equal(e.betreff, VORLAGE.schritte[0].betreff);
});

test('entscheide: die zweite Nachricht wartet ihre Tage ab', () => {
  const lauf = { gestartet_am: '2026-09-10', schritt: 1 };
  const wartet = entscheide(lauf, guteStrecke, kontakt(), '2026-01-01', HEUTE);
  assert.equal(wartet.tun, 'warten');
  assert.equal(wartet.schritt, 2);
  assert.equal(wartet.faelligAm, '2026-09-20');

  const faellig = entscheide(lauf, guteStrecke, kontakt(), '2026-01-01', '2026-09-20');
  assert.equal(faellig.tun, 'senden');
  assert.equal(faellig.schritt, 2);
});

test('entscheide: ein verschlafener Tag wird nachgeholt, nicht übersprungen', () => {
  const lauf = { gestartet_am: '2026-09-01', schritt: 1 };
  const e = entscheide(lauf, guteStrecke, kontakt(), '2026-01-01', '2026-09-30');
  assert.equal(e.tun, 'senden');
  assert.equal(e.schritt, 2, 'nach einem Ausfall kommt Nachricht 2, nicht gleich 3');
});

test('entscheide: nach der letzten Nachricht ist die Strecke fertig', () => {
  const e = entscheide({ gestartet_am: '2026-01-01', schritt: 3 }, guteStrecke, kontakt(), '2025-01-01', HEUTE);
  assert.equal(e.tun, 'fertig');
});

test('entscheide: der Abbruch schlägt die Fälligkeit', () => {
  const e = entscheide({ gestartet_am: '2026-09-01', schritt: 0 }, guteStrecke, kontakt(), '2026-09-05', HEUTE);
  assert.equal(e.tun, 'stopp');
  assert.equal(e.stopp, 'gekauft');
});

test('entscheide: eine Strecke ohne aktive Nachricht stoppt statt zu senden', () => {
  const e = entscheide({ gestartet_am: HEUTE, schritt: 0 }, { name: 'x', schritte: [] }, kontakt(), null, HEUTE);
  assert.equal(e.tun, 'stopp');
  assert.equal(e.stopp, 'strecke_leer');
});

test('entscheide: abgeschaltete Nachrichten werden übersprungen', () => {
  const strecke = {
    name: 'Teil-aus',
    schritte: [
      { schritt: 1, nach_tagen: 0, betreff: 'eins', text: 'a' },
      { schritt: 2, nach_tagen: 10, betreff: 'zwei', text: 'b', aktiv: false },
      { schritt: 3, nach_tagen: 24, betreff: 'drei', text: 'c' },
    ],
  };
  const e = entscheide({ gestartet_am: '2026-08-01', schritt: 1 }, strecke, kontakt(), '2026-01-01', HEUTE);
  assert.equal(e.tun, 'senden');
  assert.equal(e.schritt, 3);
});

// ------------------------------------------------------------- Nach dem Versand

test('nachVersand setzt die nächste Fälligkeit ab STARTDATUM', () => {
  const w = nachVersand(1, guteStrecke, '2026-09-10', HEUTE);
  assert.equal(w.status, 'aktiv');
  assert.equal(w.faellig_am, '2026-09-20');
  assert.equal(w.beendet_am, null);
});

test('nachVersand schließt den Lauf nach der letzten Nachricht ab', () => {
  const w = nachVersand(3, guteStrecke, '2026-09-10', HEUTE);
  assert.equal(w.status, 'fertig');
  assert.equal(w.faellig_am, null);
  assert.equal(w.beendet_am, HEUTE);
});

// ------------------------------------------------------------- Texte

test('setzePlatzhalter füllt bekannte und leert unbekannte Platzhalter', () => {
  const t = setzePlatzhalter(
    'Hallo {{name}} von {{firma}}, {{tage}} Tage, zuletzt {{letzter_kauf}}. {{quatsch}}',
    { name: 'Anna Berger', firma: 'Berger GmbH', tage: 255, letzter_kauf: '2026-01-01' },
  );
  assert.equal(t, 'Hallo Anna Berger von Berger GmbH, 255 Tage, zuletzt 01.01.2026. ');
});

test('setzePlatzhalter kommt mit leerer Eingabe klar', () => {
  assert.equal(setzePlatzhalter(null, null), '');
  assert.equal(setzePlatzhalter('ohne Platzhalter', {}), 'ohne Platzhalter');
});

test('anrede siezt immer und kommt ohne Namen aus', () => {
  assert.equal(anrede(kontakt()), 'Guten Tag Berger,');
  assert.equal(anrede({ vorname: 'Anna' }), 'Guten Tag Anna,');
  assert.equal(anrede({}), 'Guten Tag,');
  assert.equal(anrede(null), 'Guten Tag,');
});

test('kein Kundentext der Vorlage duzt', () => {
  const alles = [VORLAGE.name, ...VORLAGE.schritte.flatMap((s) => [s.betreff, s.text])].join(' ');
  assert.ok(!/\b(du|dir|dein|deine|deinem|deinen)\b/i.test(alles), 'Vorlage muss siezen');
});

test('die letzte Nachricht der Vorlage kündigt keine weitere an', () => {
  const letzte = VORLAGE.schritte[VORLAGE.schritte.length - 1];
  assert.match(letzte.betreff + ' ' + letzte.text, /letzte Nachricht|melden uns nicht wieder/);
});

test('nameFuer bevorzugt den vollen Namen, fällt auf die Firma zurück', () => {
  assert.equal(nameFuer(kontakt()), 'Anna Berger');
  assert.equal(nameFuer({ firma: 'Berger GmbH' }), 'Berger GmbH');
  assert.equal(nameFuer({}), '');
});
