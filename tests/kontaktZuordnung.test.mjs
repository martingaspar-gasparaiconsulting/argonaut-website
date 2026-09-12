import test from 'node:test';
import assert from 'node:assert/strict';
import {
  istUuid, normalisiereEmail, kontaktIdPerEmail,
  vereineTermine, naechsterTermin, zuordnungsWeg,
} from '../out/kontaktZuordnung.js';

// ============================================================================
// Diese Tests halten fest, was C2 leisten muss (nachgereicht am 12.09.2026).
//
// lib/kontaktZuordnung.ts entscheidet, an welchem Kunden ein Termin haengt.
// Der Dateikopf sagt selbst: "Ein falsch zugeordneter Termin waere schlimmer
// als gar keine Zuordnung." Genau das pruefen die Tests hier — vor allem,
// dass bei Zweifel NICHTS zugeordnet wird statt irgendetwas.
// ============================================================================

// ---------------------------------------------------------------- istUuid

test('nur eine echte UUID gilt als UUID', () => {
  assert.equal(istUuid('20dacbde-d2f2-43b8-9881-577ebce83639'), true);
  assert.equal(istUuid(' 20DACBDE-D2F2-43B8-9881-577EBCE83639 '), true, 'gross und mit Leerzeichen');
  assert.equal(istUuid('20dacbde-d2f2-43b8-9881-577ebce8363'), false, 'ein Zeichen zu kurz');
  assert.equal(istUuid('20dacbde_d2f2_43b8_9881_577ebce83639'), false, 'Unterstriche statt Bindestriche');
  assert.equal(istUuid(''), false);
  assert.equal(istUuid(null), false);
  assert.equal(istUuid(undefined), false);
  assert.equal(istUuid(12345), false);
  assert.equal(istUuid({ id: 'x' }), false);
});

test('eine Filter-Injektion kommt nicht als UUID durch', () => {
  // Der Wert geht in eine Supabase-Abfrage. Genau dagegen ist die Pruefung da.
  assert.equal(istUuid("20dacbde-d2f2-43b8-9881-577ebce83639,or(true)"), false);
  assert.equal(istUuid('*'), false);
  assert.equal(istUuid("' or 1=1 --"), false);
});

// ------------------------------------------------------- normalisiereEmail

test('E-Mails werden vergleichbar gemacht', () => {
  assert.equal(normalisiereEmail('  Martin@Firma.DE '), 'martin@firma.de');
  assert.equal(normalisiereEmail('a@b.c'), 'a@b.c');
});

test('was kein @ enthaelt, ist keine E-Mail', () => {
  assert.equal(normalisiereEmail('martin'), '');
  assert.equal(normalisiereEmail(''), '');
  assert.equal(normalisiereEmail(null), '');
  assert.equal(normalisiereEmail(undefined), '');
  assert.equal(normalisiereEmail(42), '');
});

// ------------------------------------------------------- kontaktIdPerEmail

const KONTAKTE = [
  { id: '11111111-1111-4111-8111-111111111111', email: 'chef@bau-mueller.de' },
  { id: '22222222-2222-4222-8222-222222222222', email: 'Buero@Bau-Mueller.DE' },
  { id: '33333333-3333-4333-8333-333333333333', email: null },
];

test('der Kontakt zur E-Mail wird gefunden', () => {
  assert.equal(kontaktIdPerEmail(KONTAKTE, 'chef@bau-mueller.de'), '11111111-1111-4111-8111-111111111111');
});

test('Gross- und Kleinschreibung spielt keine Rolle', () => {
  // Der Kunde schreibt vom Handy, die Adresse kommt in anderer Schreibweise.
  assert.equal(kontaktIdPerEmail(KONTAKTE, 'BUERO@bau-mueller.de'), '22222222-2222-4222-8222-222222222222');
  assert.equal(kontaktIdPerEmail(KONTAKTE, '  buero@BAU-MUELLER.de  '), '22222222-2222-4222-8222-222222222222');
});

test('ohne Treffer wird NICHT der naechstbeste genommen', () => {
  // Das ist der wichtigste Test der Datei. Lieber kein Kontakt als der falsche.
  assert.equal(kontaktIdPerEmail(KONTAKTE, 'fremd@woanders.de'), null);
  assert.equal(kontaktIdPerEmail(KONTAKTE, 'bau-mueller.de'), null, 'ohne @ gar kein Vergleich');
  assert.equal(kontaktIdPerEmail(KONTAKTE, ''), null);
  assert.equal(kontaktIdPerEmail(KONTAKTE, null), null);
});

test('ein Kontakt ohne brauchbare Kennung wird uebergangen', () => {
  const kaputt = [{ id: 'keine-uuid', email: 'chef@bau-mueller.de' }];
  assert.equal(kontaktIdPerEmail(kaputt, 'chef@bau-mueller.de'), null);
});

test('eine leere oder fehlende Kontaktliste faellt nicht um', () => {
  assert.equal(kontaktIdPerEmail([], 'chef@bau-mueller.de'), null);
  assert.equal(kontaktIdPerEmail(null, 'chef@bau-mueller.de'), null);
  assert.equal(kontaktIdPerEmail(undefined, 'chef@bau-mueller.de'), null);
});

// ----------------------------------------------------------- vereineTermine

const T_KUNDE = [
  { id: 'a', titel: 'Aufmass', beginn_am: '2026-09-20T09:00:00Z', kontakt_id: '11111111-1111-4111-8111-111111111111' },
  { id: 'b', titel: 'Montage', beginn_am: '2026-09-10T09:00:00Z', kontakt_id: '11111111-1111-4111-8111-111111111111' },
];
const T_EMAIL = [
  { id: 'b', titel: 'Montage', beginn_am: '2026-09-10T09:00:00Z', kunde_email: 'chef@bau-mueller.de' },
  { id: 'c', titel: 'Abnahme', beginn_am: '2026-09-25T09:00:00Z', kunde_email: 'chef@bau-mueller.de' },
];

test('beide Wege ergeben eine Liste ohne Doppelte', () => {
  const raus = vereineTermine(T_KUNDE, T_EMAIL);
  assert.equal(raus.length, 3, 'b darf nur einmal vorkommen');
  assert.deepEqual(raus.map((t) => t.id), ['c', 'a', 'b'], 'neueste zuerst');
});

test('der Weg ueber den Kunden gewinnt bei Doppelten', () => {
  // Wichtig fuer die Anzeige: die Zeile mit kontakt_id soll ueberleben,
  // sonst stuende in der Akte "ueber E-Mail gefunden" an einem Termin,
  // der fest am Kunden haengt.
  const raus = vereineTermine(T_KUNDE, T_EMAIL);
  const b = raus.find((t) => t.id === 'b');
  assert.equal(b.kontakt_id, '11111111-1111-4111-8111-111111111111');
});

test('Zeilen ohne id verschwinden nicht', () => {
  const ohneId = [{ titel: 'Altdaten', beginn_am: '2026-09-01T09:00:00Z' }];
  const raus = vereineTermine(ohneId, ohneId);
  assert.equal(raus.length, 2, 'nicht entdoppelbar — bleiben beide drin');
});

test('leere Seiten ergeben eine leere Liste', () => {
  assert.deepEqual(vereineTermine(null, null), []);
  assert.deepEqual(vereineTermine([], undefined), []);
});

test('ein unlesbares Datum wirft die Sortierung nicht um', () => {
  const wirr = [
    { id: 'x', beginn_am: 'kein Datum' },
    { id: 'y', beginn_am: '2026-09-20T09:00:00Z' },
  ];
  const raus = vereineTermine(wirr, []);
  assert.equal(raus.length, 2);
  assert.equal(raus[0].id, 'y', 'das lesbare Datum steht oben');
});

// ---------------------------------------------------------- naechsterTermin

const JETZT = '2026-09-12T12:00:00Z';

test('der naechste Termin ist der fruehste in der Zukunft', () => {
  const liste = [
    { id: 'a', beginn_am: '2026-09-25T09:00:00Z' },
    { id: 'b', beginn_am: '2026-09-20T09:00:00Z' },
    { id: 'c', beginn_am: '2026-09-01T09:00:00Z' },
  ];
  assert.equal(naechsterTermin(liste, JETZT).id, 'b');
});

test('liegt alles in der Vergangenheit, gibt es keinen naechsten', () => {
  const liste = [{ id: 'c', beginn_am: '2026-09-01T09:00:00Z' }];
  assert.equal(naechsterTermin(liste, JETZT), null);
});

test('ein Termin genau jetzt zaehlt noch als kommend', () => {
  const liste = [{ id: 'n', beginn_am: JETZT }];
  assert.equal(naechsterTermin(liste, JETZT).id, 'n');
});

test('leere Liste ergibt null statt eines Absturzes', () => {
  assert.equal(naechsterTermin([], JETZT), null);
  assert.equal(naechsterTermin(null, JETZT), null);
  assert.equal(naechsterTermin(undefined, JETZT), null);
});

// ------------------------------------------------------------ zuordnungsWeg

test('woran der Termin haengt, ist in der Akte ablesbar', () => {
  assert.equal(zuordnungsWeg({ kontakt_id: '11111111-1111-4111-8111-111111111111' }), 'kunde');
  assert.equal(zuordnungsWeg({ kontakt_id: null }), 'email');
  assert.equal(zuordnungsWeg({ kontakt_id: 'keine-uuid' }), 'email', 'kaputte Kennung gilt nicht als Kunde');
  assert.equal(zuordnungsWeg({}), 'email');
});
