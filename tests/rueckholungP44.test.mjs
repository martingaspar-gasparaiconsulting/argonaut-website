// ============================================================================
// tests/rueckholungP44.test.mjs — die Rueckhol-Strecke fertig machen
//
// Punkt 44, 21.09.2026. Die Strecke ist gebaut, aber noch NIRGENDS
// angeschlossen — genau der guenstige Moment, um drei Luecken zu schliessen,
// bevor die erste echte Mail hinausgeht:
//
//   1. stoppGrund() prueft nur zwei der FUENF Werbe-Status. Wer seine
//      Einwilligung zurueckzieht, bekommt die Strecke trotzdem zu Ende.
//   2. Kein Abmeldelink. Das Wort kam in der ganzen Datei nicht vor.
//   3. Die Entdopplung haengt an der Kennung. Zwei CRM-Dubletten desselben
//      Menschen ergeben zwei Strecken an dieselbe Adresse.
//
// Die 49 Bestandstests in rueckholung.test.mjs bleiben unveraendert gueltig.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stoppGrund, STOPP_TEXT, fehltZumStarten, fehltVorVersand, setzePlatzhalter,
  entdoppleNachEmail, schonOffenerLauf, dublettenZahl, emailSchluessel,
  ABMELDE_PLATZHALTER, VORLAGE, MAX_SCHRITTE,
} from '../out/rueckholung.js';

const LINK = 'https://www.argonaut-os.com/abmelden?t=abc123';

function kontakt(zusatz = {}) {
  return {
    id: 'k1', email: 'kunde@example.de', vorname: 'Anna', nachname: 'Berger',
    firma: 'Berger GmbH', werbe_einwilligung: true, ...zusatz,
  };
}

// ---------------------------------------------------------------------------
// DER WEG, DER FUNKTIONIEREN MUSS
// Geht der verloren, kann kein Betrieb mehr eine Rueckholung fahren. Das waere
// schlimmer als die Luecken, die wir schliessen.
// ---------------------------------------------------------------------------

test('DER WICHTIGSTE TEST: ein Kunde mit Einwilligung kommt weiterhin durch', () => {
  assert.equal(stoppGrund(kontakt(), '2026-01-01', '2026-09-01'), null);
});

test('die mitgelieferte Vorlage bleibt startklar', () => {
  assert.deepEqual(fehltZumStarten({ name: 'Rueckholung', ruhe_tage: 90, schritte: VORLAGE.schritte }), []);
});

// ---------------------------------------------------------------------------
// BEFUND 1 — die zurueckgezogene Einwilligung
// ---------------------------------------------------------------------------

test('BEFUND 1: ohne Einwilligung wird die Strecke gestoppt', () => {
  // werbe_einwilligung fehlt -> werbeStatus liefert 'ohne_einwilligung'.
  // Bis zum 21.09. lief die angefangene Strecke trotzdem zu Ende.
  assert.equal(stoppGrund(kontakt({ werbe_einwilligung: undefined }), null, '2026-09-01'), 'ohne_einwilligung');
  assert.equal(stoppGrund(kontakt({ werbe_einwilligung: false }), null, '2026-09-01'), 'ohne_einwilligung');
  assert.equal(stoppGrund(kontakt({ werbe_einwilligung: null }), null, '2026-09-01'), 'ohne_einwilligung');
});

test('BEFUND 1: die zurueckgezogene Einwilligung wirkt MITTEN in der Strecke', () => {
  // Der eigentliche Fall: Start am 01.09. mit Einwilligung, danach zurueckgezogen.
  // Der Kauf liegt vor dem Start, es gab keine Rueckmeldung — frueher lief
  // Schritt 2 und 3 trotzdem hinaus.
  const vorher = stoppGrund(kontakt(), '2026-01-01', '2026-09-01');
  assert.equal(vorher, null, 'mit Einwilligung muss es laufen');

  const nachher = stoppGrund(kontakt({ werbe_einwilligung: false }), '2026-01-01', '2026-09-01');
  assert.equal(nachher, 'ohne_einwilligung', 'ohne Einwilligung muss Schluss sein');
});

test('BEFUND 1: Widerspruch und Abmeldung stoppen weiterhin', () => {
  assert.equal(stoppGrund(kontakt({ werbe_widerspruch_am: '2026-09-02' }), null, '2026-09-01'), 'widersprochen');
  assert.equal(stoppGrund(kontakt({ status: 'abgemeldet' }), null, '2026-09-01'), 'abgemeldet');
});

test('BEFUND 1: der Widerspruch schlaegt auch eine gesetzte Einwilligung', () => {
  const k = kontakt({ werbe_einwilligung: true, werbe_widerspruch_am: '2026-09-02' });
  assert.equal(stoppGrund(k, null, '2026-09-01'), 'widersprochen');
});

test('BEFUND 1: jeder Stopp-Grund hat einen lesbaren Text', () => {
  for (const grund of [
    'gekauft', 'gemeldet', 'widersprochen', 'abgemeldet',
    'ohne_einwilligung', 'nicht_bestaetigt', 'keine_adresse',
    'kein_abmeldelink', 'strecke_leer',
  ]) {
    const text = STOPP_TEXT[grund];
    assert.ok(typeof text === 'string' && text.length > 5, `Text fehlt fuer ${grund}`);
  }
});

test('WAECHTER: der Einwilligungs-Stopp kommt VOR der Adresspruefung', () => {
  // Wer widersprochen hat, soll das auch dann erfahren, wenn zusaetzlich die
  // Adresse fehlt — sonst meldet die Liste 'keine_adresse' und der Betrieb
  // traegt die Adresse nach, statt den Widerspruch zu sehen.
  const k = kontakt({ email: null, werbe_widerspruch_am: '2026-09-02' });
  assert.equal(stoppGrund(k, null, '2026-09-01'), 'widersprochen');
});

test('ohne Adresse wird weiterhin nicht weitergemacht', () => {
  assert.equal(stoppGrund(kontakt({ email: null }), null, '2026-09-01'), 'keine_adresse');
  assert.equal(stoppGrund(kontakt({ email: 'kein-at-zeichen' }), null, '2026-09-01'), 'keine_adresse');
});

// ---------------------------------------------------------------------------
// BEFUND 2 — der Abmeldelink
// ---------------------------------------------------------------------------

test('BEFUND 2: eine Strecke ohne Abmeldelink ist nicht startklar', () => {
  const fehlt = fehltZumStarten({
    name: 'Ohne Link',
    schritte: [{ schritt: 1, nach_tagen: 0, betreff: 'Hallo', text: 'Ein Text ohne alles.' }],
  });
  assert.ok(fehlt.some((f) => f.includes(ABMELDE_PLATZHALTER)), fehlt.join(' | '));
});

test('BEFUND 2: der Abmeldelink muss in JEDER Nachricht stehen, nicht nur der ersten', () => {
  const fehlt = fehltZumStarten({
    name: 'Nur die erste',
    schritte: [
      { schritt: 1, nach_tagen: 0, betreff: 'a', text: `Text eins ${ABMELDE_PLATZHALTER}` },
      { schritt: 2, nach_tagen: 10, betreff: 'b', text: 'Text zwei ohne Link' },
      { schritt: 3, nach_tagen: 20, betreff: 'c', text: `Text drei ${ABMELDE_PLATZHALTER}` },
    ],
  });
  const treffer = fehlt.filter((f) => f.includes(ABMELDE_PLATZHALTER));
  assert.equal(treffer.length, 1, fehlt.join(' | '));
  assert.ok(treffer[0].includes('Nachricht 2'), treffer[0]);
});

test('BEFUND 2: alle drei Schritte der Vorlage tragen den Abmeldelink', () => {
  for (const s of VORLAGE.schritte) {
    assert.ok(String(s.text).includes(ABMELDE_PLATZHALTER), `Schritt ${s.schritt} ohne Abmeldelink`);
  }
});

test('BEFUND 2: ein fehlender Text wird weiterhin als fehlender Text gemeldet', () => {
  // Nicht als fehlender Abmeldelink — sonst sucht der Betrieb an der
  // falschen Stelle.
  const fehlt = fehltZumStarten({
    name: 'Leer', schritte: [{ schritt: 1, nach_tagen: 0, betreff: 'a', text: '' }],
  });
  assert.ok(fehlt.some((f) => /ein Text bei Nachricht 1/.test(f)), fehlt.join(' | '));
  assert.ok(!fehlt.some((f) => f.includes(ABMELDE_PLATZHALTER)), 'doppelte Meldung');
});

// ---------------------------------------------------------------------------
// BEFUND 2b — DIE FALLE: der still geleerte Platzhalter
// ---------------------------------------------------------------------------

test('DIE FALLE: setzePlatzhalter LEERT einen Platzhalter ohne Wert', () => {
  // Das ist gewolltes Verhalten (nie "{{vorname}}" in einer Kundenmail) — und
  // genau deshalb braucht der Abmeldelink eine eigene Pruefung.
  const text = setzePlatzhalter(`Hallo {{name}}. Abmelden: ${ABMELDE_PLATZHALTER}`, { name: 'Berger' });
  assert.ok(!text.includes(ABMELDE_PLATZHALTER), 'Platzhalter blieb stehen');
  assert.equal(text, 'Hallo Berger. Abmelden: ');
});

test('BEFUND 2b: fehltVorVersand faengt genau diese Falle', () => {
  const ohneWert = setzePlatzhalter(`Text. Abmelden: ${ABMELDE_PLATZHALTER}`, { name: 'Berger' });
  assert.equal(fehltVorVersand(ohneWert, { name: 'Berger' }), 'kein_abmeldelink');
});

test('BEFUND 2b: mit echtem Link geht die Nachricht hinaus', () => {
  const werte = { name: 'Berger', abmeldelink: LINK };
  const text = setzePlatzhalter(`Text. Abmelden: ${ABMELDE_PLATZHALTER}`, werte);
  assert.ok(text.includes(LINK));
  assert.equal(fehltVorVersand(text, werte), null);
});

test('BEFUND 2b: ein nicht ersetzter Platzhalter wird abgefangen', () => {
  // Jemand haengt den Text zusammen, ohne setzePlatzhalter zu benutzen.
  assert.equal(
    fehltVorVersand(`Text. Abmelden: ${ABMELDE_PLATZHALTER}`, { abmeldelink: LINK }),
    'kein_abmeldelink');
});

test('BEFUND 2b: ein Link, der im Text gar nicht vorkommt, genuegt nicht', () => {
  // Der Wert ist gesetzt, aber der Text traegt ihn nicht — etwa weil die
  // Vorlage den Platzhalter verloren hat.
  assert.equal(fehltVorVersand('Ein Text ganz ohne Abmeldung.', { abmeldelink: LINK }), 'kein_abmeldelink');
});

test('BEFUND 2b: leerer oder blanker Link zaehlt nicht als Link', () => {
  for (const wert of [undefined, null, '', '   ', '\t']) {
    assert.equal(fehltVorVersand('Text mit irgendwas', { abmeldelink: wert }), 'kein_abmeldelink', JSON.stringify(wert));
  }
});

test('BEFUND 2b: ein leerer Text geht nie hinaus', () => {
  assert.equal(fehltVorVersand('', { abmeldelink: LINK }), 'kein_abmeldelink');
  assert.equal(fehltVorVersand('   ', { abmeldelink: LINK }), 'kein_abmeldelink');
});

// ---------------------------------------------------------------------------
// BEFUND 3 — zwei Dubletten, ein Mensch
// ---------------------------------------------------------------------------

test('BEFUND 3: zwei CRM-Dubletten ergeben nur EINEN Lauf', () => {
  const kandidaten = [
    { kontakt_id: 'k1', email: 'anna@example.de' },
    { kontakt_id: 'k2', email: 'anna@example.de' },
    { kontakt_id: 'k3', email: 'bert@example.de' },
  ];
  const raus = entdoppleNachEmail(kandidaten);
  assert.equal(raus.length, 2);
  assert.deepEqual(raus.map((k) => k.kontakt_id), ['k1', 'k3'], 'der erste Treffer gewinnt');
  assert.equal(dublettenZahl(kandidaten), 1);
});

test('BEFUND 3: Gross- und Kleinschreibung und Leerzeichen sind dieselbe Person', () => {
  const raus = entdoppleNachEmail([
    { kontakt_id: 'k1', email: 'Anna@Example.DE' },
    { kontakt_id: 'k2', email: '  anna@example.de  ' },
    { kontakt_id: 'k3', email: 'ANNA@EXAMPLE.DE' },
  ]);
  assert.equal(raus.length, 1);
});

test('BEFUND 3: Kandidaten ohne brauchbare Adresse fallen heraus', () => {
  const raus = entdoppleNachEmail([
    { kontakt_id: 'k1', email: 'gut@example.de' },
    { kontakt_id: 'k2', email: '' },
    { kontakt_id: 'k3', email: null },
    { kontakt_id: 'k4', email: 'ohne-at-zeichen' },
    { kontakt_id: 'k5' },
  ]);
  assert.deepEqual(raus.map((k) => k.kontakt_id), ['k1']);
});

test('BEFUND 3: ein laufender Lauf sperrt dieselbe Adresse, auch bei anderer Kennung', () => {
  // Genau die Luecke des Datenbank-Index: er haelt (strecke_id, kontakt_id)
  // eindeutig — zwei Kennungen mit derselben Adresse kommen durch.
  const laufende = [{ kontakt_id: 'k1', email: 'anna@example.de', status: 'aktiv' }];
  assert.equal(schonOffenerLauf('anna@example.de', laufende), true);
  assert.equal(schonOffenerLauf('ANNA@example.de', laufende), true, 'Schreibweise darf nichts aendern');
  assert.equal(schonOffenerLauf('bert@example.de', laufende), false);
});

test('BEFUND 3: ein Lauf OHNE Kennung sperrt trotzdem', () => {
  // Der Index nimmt kontakt_id is null ausdruecklich aus — hier nicht.
  const laufende = [{ kontakt_id: null, email: 'anna@example.de', status: 'aktiv' }];
  assert.equal(schonOffenerLauf('anna@example.de', laufende), true);
});

test('BEFUND 3: ein beendeter Lauf sperrt nicht', () => {
  for (const status of ['beendet', 'gestoppt', 'fertig', 'BEENDET']) {
    const laufende = [{ kontakt_id: 'k1', email: 'anna@example.de', status }];
    assert.equal(schonOffenerLauf('anna@example.de', laufende), false, status);
  }
});

test('BEFUND 3: ohne Status gilt ein Lauf vorsichtshalber als aktiv', () => {
  // Im Zweifel lieber eine Mail zu wenig als eine zu viel.
  assert.equal(schonOffenerLauf('anna@example.de', [{ email: 'anna@example.de' }]), true);
});

test('BEFUND 3: leere Liste und unbrauchbare Adresse sperren nichts', () => {
  assert.equal(schonOffenerLauf('anna@example.de', []), false);
  assert.equal(schonOffenerLauf('anna@example.de', null), false);
  assert.equal(schonOffenerLauf('', [{ email: 'anna@example.de', status: 'aktiv' }]), false);
  assert.equal(schonOffenerLauf(null, [{ email: 'anna@example.de', status: 'aktiv' }]), false);
});

test('emailSchluessel normalisiert und weist Unbrauchbares ab', () => {
  assert.equal(emailSchluessel('  Anna@Example.DE '), 'anna@example.de');
  for (const wert of ['', '   ', null, undefined, 'ohne-at', 42]) {
    assert.equal(emailSchluessel(wert), '', JSON.stringify(wert));
  }
});

// ---------------------------------------------------------------------------
// WAECHTER — was kuenftige Aenderungen nicht kaputtmachen duerfen
// ---------------------------------------------------------------------------

test('WAECHTER: die Vorlage bleibt unter der Hoechstzahl an Nachrichten', () => {
  assert.ok(VORLAGE.schritte.length <= MAX_SCHRITTE);
});

test('WAECHTER: entdoppleNachEmail veraendert die uebergebene Liste nicht', () => {
  const kandidaten = [
    { kontakt_id: 'k1', email: 'a@example.de' },
    { kontakt_id: 'k2', email: 'a@example.de' },
  ];
  const kopie = JSON.parse(JSON.stringify(kandidaten));
  entdoppleNachEmail(kandidaten);
  assert.deepEqual(kandidaten, kopie);
});

test('WAECHTER: die ganze Kette haelt zusammen', () => {
  // Ein Durchgang wie im Betrieb: entdoppeln, Sperre pruefen, Stopp pruefen,
  // Text setzen, letzter Riegel.
  const kandidaten = [
    { kontakt_id: 'k1', email: 'anna@example.de' },
    { kontakt_id: 'k2', email: 'ANNA@example.de' },
  ];
  const [einziger] = entdoppleNachEmail(kandidaten);
  assert.equal(einziger.kontakt_id, 'k1');
  assert.equal(schonOffenerLauf(einziger.email, []), false);

  const k = kontakt({ id: einziger.kontakt_id, email: einziger.email });
  assert.equal(stoppGrund(k, '2026-01-01', '2026-09-01'), null);

  const werte = { name: 'Berger', abmeldelink: LINK };
  const text = setzePlatzhalter(VORLAGE.schritte[0].text, werte);
  assert.equal(fehltVorVersand(text, werte), null);
  assert.ok(text.includes(LINK));
});
