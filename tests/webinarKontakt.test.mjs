import test from 'node:test';
import assert from 'node:assert/strict';
import { kontaktAusAnmeldung, uebernehmbar } from '../out/webinarKontakt.js';
import { kontaktAusLead } from '../out/leadKontakt.js';

const ANMELDUNG = {
  email: 'max@muster.de',
  name: 'Max Mustermann',
  firma: 'Muster GmbH',
  teilnahme: 'teilgenommen',
};
const WEBINAR = { titel: 'Steuern 2027', terminText: 'Dienstag, 22. September 2026 um 14:00 Uhr' };

// ── DIE Regel ───────────────────────────────────────────────────────────────

test('DIE REGEL: Die Übernahme setzt KEINE Werbe-Einwilligung', () => {
  // Wer sich für ein Webinar anmeldet, hat in genau DAS eingewilligt — nicht
  // in den Newsletter. Würde hier werbe_einwilligung gesetzt, stünde die
  // Person in lib/segmente.ts als „erlaubt" und niemand wüsste, woher.
  const k = kontaktAusAnmeldung(ANMELDUNG, WEBINAR);
  for (const feld of ['werbe_einwilligung', 'werbe_einwilligung_am', 'werbe_einwilligung_quelle', 'werbe_widerspruch_am']) {
    assert.ok(!(feld in k), `${feld} darf gar nicht erst im Insert stehen`);
  }
});

test('Die Lead-Übernahme hält sich an dieselbe Regel', () => {
  // Beide Wege ins CRM müssen sich gleich verhalten, sonst ist die Zusage
  // an den Anwalt nur für einen der beiden wahr.
  const k = kontaktAusLead({ name: 'Max Muster', email: 'a@b.de' });
  for (const feld of ['werbe_einwilligung', 'werbe_einwilligung_am', 'werbe_einwilligung_quelle', 'werbe_widerspruch_am']) {
    assert.ok(!(feld in k), `${feld} darf auch beim Lead nicht gesetzt werden`);
  }
});

test('Die Notiz sagt ausdrücklich, dass keine Werbe-Einwilligung vorliegt', () => {
  const k = kontaktAusAnmeldung(ANMELDUNG, WEBINAR);
  assert.ok(k.notizen.includes('KEINE Einwilligung'), k.notizen);
});

// ── Abbildung ───────────────────────────────────────────────────────────────

test('Name wird in Vor- und Nachname geteilt', () => {
  const k = kontaktAusAnmeldung(ANMELDUNG, WEBINAR);
  assert.equal(k.vorname, 'Max');
  assert.equal(k.nachname, 'Mustermann');
  assert.equal(k.email, 'max@muster.de');
  assert.equal(k.firma, 'Muster GmbH');
  assert.equal(k.status, 'interessent');
});

test('Ein einzelner Name wird zum Nachnamen, nicht zum Vornamen', () => {
  const k = kontaktAusAnmeldung({ ...ANMELDUNG, name: 'Mustermann' }, WEBINAR);
  assert.equal(k.vorname, null);
  assert.equal(k.nachname, 'Mustermann');
});

test('Ohne Namen bleibt es leer statt „undefined"', () => {
  const k = kontaktAusAnmeldung({ email: 'a@b.de' });
  assert.equal(k.vorname, null);
  assert.equal(k.nachname, null);
  assert.equal(k.firma, null);
  assert.ok(!k.notizen.includes('undefined'));
});

test('Die Quelle nennt das Webinar beim Namen', () => {
  assert.equal(kontaktAusAnmeldung(ANMELDUNG, WEBINAR).quelle, 'Webinar: Steuern 2027');
  assert.equal(kontaktAusAnmeldung(ANMELDUNG).quelle, 'Webinar');
});

test('Eine sehr lange Quelle wird gekappt statt abgewiesen', () => {
  const k = kontaktAusAnmeldung(ANMELDUNG, { titel: 'X'.repeat(300) });
  assert.ok(k.quelle.length <= 120);
});

test('Die Notiz unterscheidet da gewesen, gefehlt und nicht erfasst', () => {
  assert.ok(kontaktAusAnmeldung({ ...ANMELDUNG, teilnahme: 'teilgenommen' }, WEBINAR).notizen.includes('Hat teilgenommen'));
  assert.ok(kontaktAusAnmeldung({ ...ANMELDUNG, teilnahme: 'gefehlt' }, WEBINAR).notizen.includes('hat gefehlt'));
  assert.ok(kontaktAusAnmeldung({ ...ANMELDUNG, teilnahme: 'offen' }, WEBINAR).notizen.includes('nicht erfasst'));
  assert.ok(kontaktAusAnmeldung({ ...ANMELDUNG, teilnahme: null }, WEBINAR).notizen.includes('nicht erfasst'));
});

test('Webinar und Termin stehen in der Notiz', () => {
  const n = kontaktAusAnmeldung(ANMELDUNG, WEBINAR).notizen;
  assert.ok(n.includes('Steuern 2027'));
  assert.ok(n.includes('22. September 2026'));
});

// ── Wer darf übernommen werden? ─────────────────────────────────────────────

const LISTE = [
  { email: 'a@x.de', status: 'aktiv' },
  { email: 'b@x.de', status: 'unbestaetigt' },
  { email: 'c@x.de', status: 'abgemeldet' },
  { email: 'd@x.de', status: 'aktiv' },
];

test('Nur BESTÄTIGTE Anmeldungen sind übernehmbar', () => {
  // Ohne den Double-Opt-in-Klick ist nicht einmal sicher, dass die Adresse
  // der Person gehört, die dort steht.
  const aus = uebernehmbar(LISTE, []);
  assert.deepEqual(aus.map((a) => a.email), ['a@x.de', 'd@x.de']);
});

test('Wer sich ABGEMELDET hat, wandert nicht durch die Hintertür ins CRM', () => {
  const aus = uebernehmbar(LISTE, []);
  assert.ok(!aus.some((a) => a.email === 'c@x.de'));
});

test('Wer schon Kontakt ist, wird nicht doppelt angelegt', () => {
  const aus = uebernehmbar(LISTE, ['A@X.DE']);   // Groß-/Kleinschreibung egal
  assert.deepEqual(aus.map((a) => a.email), ['d@x.de']);
});

test('Dieselbe Person in zwei Terminen wird EINMAL angelegt', () => {
  const doppelt = [
    { email: 'a@x.de', status: 'aktiv' },
    { email: 'A@x.de', status: 'aktiv' },
    { email: 'b@x.de', status: 'aktiv' },
  ];
  assert.equal(uebernehmbar(doppelt, []).length, 2);
});

test('Ohne Adresse keine Übernahme', () => {
  assert.equal(uebernehmbar([{ email: '', status: 'aktiv' }, { status: 'aktiv' }], []).length, 0);
});

test('uebernehmbar verträgt Müll ohne zu werfen', () => {
  assert.deepEqual(uebernehmbar(null, null), []);
  assert.deepEqual(uebernehmbar(undefined, undefined), []);
  assert.deepEqual(uebernehmbar([null, undefined], []), []);
});
