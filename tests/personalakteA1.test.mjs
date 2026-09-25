// Paket A1 (25.09.2026) — Personalakte vollstaendig + Meine Unterlagen + Guide-Texte.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AKTE_PUNKTE, ORT_TEXT, pruefeSteuerId, pruefeSvNummer, pruefeIban,
  akteStand, akteSatz, schulungGueltig, sichtbarFuerMitarbeiter, gruppiereDokumente,
} from '../out/personalakte.js';
import { modulGuide, MODUL_TEXTE } from '../out/kiGuideModule.js';

const HEUTE = '2026-09-25';

const VOLL = {
  vorname: 'Anna', nachname: 'Muster', email: 'anna@example.de', telefon: null, position: 'Monteurin',
  geburtsdatum: '1990-03-15', adresse: 'Hauptstr. 1, 71032 Böblingen', eintrittsdatum: '2026-09-01',
  arbeitszeit_modell: 'vollzeit', wochenstunden: 40, urlaubsanspruch_tage: 30,
  steuer_id: '12 345 678 901', sv_nummer: '12 150390 M 123', iban: 'DE89 3704 0044 0532 0130 00',
  notfall_kontakt: 'Max Muster 0171 123', eingeladen: true,
  dokKategorien: ['vertrag', 'lohn'], nachweisErteiltAm: '2026-09-01',
  schulungen: [
    { kategorie: 'arbeitsschutz', status: 'absolviert', gueltig_bis: '2027-09-01' },
    { kategorie: 'datenschutz', status: 'absolviert', gueltig_bis: null },
  ],
};

test('Liste: Schluessel eindeutig, jeder Ort hat einen Text, Pflicht vor Empfohlen', () => {
  const keys = AKTE_PUNKTE.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const p of AKTE_PUNKTE) {
    assert.ok(ORT_TEXT[p.ort], p.key);
    assert.ok(p.warum.length > 10, p.key);
  }
  const ersteEmpf = AKTE_PUNKTE.findIndex((p) => p.gruppe === 'empfohlen');
  assert.ok(AKTE_PUNKTE.slice(ersteEmpf).every((p) => p.gruppe === 'empfohlen'));
  for (const k of ['vertrag_dok', 'nachweis', 'unterweisung', 'steuer_id', 'sv_nummer', 'iban', 'arbeitszeit']) {
    assert.equal(AKTE_PUNKTE.find((p) => p.key === k).gruppe, 'pflicht', k);
  }
});

test('Formate: Steuer-ID, SV-Nummer, IBAN mit Pruefsumme', () => {
  assert.equal(pruefeSteuerId('12 345 678 901'), true);
  assert.equal(pruefeSteuerId('01234567890'), false);
  assert.equal(pruefeSteuerId('1234567890'), false);
  assert.equal(pruefeSvNummer('12 150390 M 123'), true);
  assert.equal(pruefeSvNummer('12150390m123'), true);
  assert.equal(pruefeSvNummer('12 320390 M 123'), false);
  assert.equal(pruefeSvNummer('12 151390 M 123'), false);
  assert.equal(pruefeSvNummer('12 150390 1 123'), false);
  assert.equal(pruefeIban('DE89 3704 0044 0532 0130 00'), true);
  assert.equal(pruefeIban('DE89 3704 0044 0532 0130 01'), false);
  assert.equal(pruefeIban('DE89370400440532013'), false);
  // Pruefsumme stimmt, aber 23 statt 22 Zeichen — deutsche IBAN ist immer 22 lang
  assert.equal(pruefeIban('DE543704004405320130001'), false);
  assert.equal(pruefeIban(''), false);
});

test('Vollstaendige Akte -> gruen, 100 %', () => {
  const s = akteStand(VOLL, HEUTE);
  assert.equal(s.pflichtOffen, 0);
  assert.equal(s.empfohlenOffen, 0);
  assert.equal(s.ampel, 'gruen');
  assert.equal(s.prozent, 100);
  assert.equal(s.naechster, null);
  assert.equal(akteSatz(s), 'Die Personalakte ist vollständig.');
});

test('Frisch angelegt -> rot, naechster Schritt ist der erste Pflichtpunkt', () => {
  const s = akteStand({ vorname: 'Neu', nachname: 'Person', eintrittsdatum: HEUTE, arbeitszeit_modell: 'vollzeit', wochenstunden: 40, urlaubsanspruch_tage: 30 }, HEUTE);
  assert.equal(s.ampel, 'rot');
  assert.equal(s.naechster.key, 'geburtsdatum');
  assert.match(akteSatz(s), /Es fehlen noch 8 von 11 Pflichtangaben/);
  assert.match(akteSatz(s), /Reiter „Stammdaten"/);
});

test('Nur Empfohlenes offen -> gelb', () => {
  const s = akteStand({ ...VOLL, notfall_kontakt: '', eingeladen: false }, HEUTE);
  assert.equal(s.ampel, 'gelb');
  assert.equal(s.empfohlenOffen, 2);
  assert.equal(s.naechster.key, 'notfall');
  assert.match(akteSatz(s), /Empfohlen fehlen noch 2/);
});

test('Falsch eingetragen zaehlt als offen, mit Hinweis', () => {
  const s = akteStand({ ...VOLL, iban: 'DE89 3704 0044 0532 0130 01', steuer_id: '123' }, HEUTE);
  const iban = s.punkte.find((p) => p.key === 'iban');
  const st = s.punkte.find((p) => p.key === 'steuer_id');
  assert.equal(iban.ok, false);
  assert.match(iban.hinweis, /Prüfsumme/);
  assert.equal(st.ok, false);
  assert.match(st.hinweis, /11 Ziffern/);
  assert.equal(s.ampel, 'rot');
});

test('Unterweisung: abgelaufen oder nicht absolviert zaehlt nicht', () => {
  assert.equal(schulungGueltig([{ kategorie: 'arbeitsschutz', status: 'absolviert', gueltig_bis: '2026-09-24' }], 'arbeitsschutz', HEUTE), false);
  assert.equal(schulungGueltig([{ kategorie: 'arbeitsschutz', status: 'absolviert', gueltig_bis: HEUTE }], 'arbeitsschutz', HEUTE), true);
  assert.equal(schulungGueltig([{ kategorie: 'arbeitsschutz', status: 'offen', gueltig_bis: null }], 'arbeitsschutz', HEUTE), false);
  assert.equal(schulungGueltig(null, 'arbeitsschutz', HEUTE), false);
});

test('Vertrag und Nachweis sind zwei getrennte Punkte', () => {
  const ohneDatei = akteStand({ ...VOLL, dokKategorien: ['lohn'] }, HEUTE);
  assert.equal(ohneDatei.punkte.find((p) => p.key === 'vertrag_dok').ok, false);
  const ohneNachweis = akteStand({ ...VOLL, nachweisErteiltAm: null }, HEUTE);
  assert.equal(ohneNachweis.punkte.find((p) => p.key === 'nachweis').ok, false);
  assert.equal(ohneNachweis.naechster.ort, 'nachweis');
});

test('Meine Unterlagen: nur freigegebene oder selbst hochgeladene', () => {
  const uid = 'u-ma';
  assert.equal(sichtbarFuerMitarbeiter({ id: '1', dateiname: 'a', kategorie: 'lohn', hochgeladen_am: null, fuer_mitarbeiter: true, hochgeladen_von: 'chef' }, uid), true);
  assert.equal(sichtbarFuerMitarbeiter({ id: '2', dateiname: 'b', kategorie: 'lohn', hochgeladen_am: null, fuer_mitarbeiter: false, hochgeladen_von: 'chef' }, uid), false);
  assert.equal(sichtbarFuerMitarbeiter({ id: '3', dateiname: 'au', kategorie: 'sonstiges', hochgeladen_am: null, fuer_mitarbeiter: false, hochgeladen_von: uid }, uid), true);
  assert.equal(sichtbarFuerMitarbeiter({ id: '4', dateiname: 'x', kategorie: 'lohn', hochgeladen_am: null, fuer_mitarbeiter: null, hochgeladen_von: null }, null), false);
  assert.equal(sichtbarFuerMitarbeiter({ id: '5', dateiname: 'x', kategorie: 'lohn', hochgeladen_am: null, fuer_mitarbeiter: false, hochgeladen_von: null }, null), false);
});

test('Meine Unterlagen: Gruppen in fester Reihenfolge, Neuestes oben, Unbekanntes -> Sonstiges', () => {
  const g = gruppiereDokumente([
    { id: '1', dateiname: 'Lohn 08', kategorie: 'lohn', hochgeladen_am: '2026-08-31' },
    { id: '2', dateiname: 'Vertrag', kategorie: 'vertrag', hochgeladen_am: '2026-01-01' },
    { id: '3', dateiname: 'Lohn 09', kategorie: 'lohn', hochgeladen_am: '2026-09-30' },
    { id: '4', dateiname: 'Komisch', kategorie: 'xyz', hochgeladen_am: '2026-09-01' },
  ]);
  assert.deepEqual(g.map((x) => x.kategorie), ['vertrag', 'lohn', 'sonstiges']);
  assert.deepEqual(g[1].docs.map((d) => d.dateiname), ['Lohn 09', 'Lohn 08']);
  assert.deepEqual(gruppiereDokumente(null), []);
});

test('Guide: Personal und Mein Bereich haben eigene Texte, Sie-Form, kein Agenten-Wort', () => {
  const links = [
    { label: '🙋 Mein Bereich', href: '/dashboard/mein-bereich' },
    { label: '👥 Personal', href: '/dashboard/personal' },
    { label: '📄 Personal-Dokumente', href: '/dashboard/personal/dokumente' },
  ];
  for (const href of ['/dashboard/personal', '/dashboard/mein-bereich', '/dashboard/personal/dokumente']) {
    const g = modulGuide(href, links);
    assert.ok(MODUL_TEXTE[href], href);
    assert.doesNotMatch(g.nachricht, /Sie sind im Bereich/, href);
    const alles = [g.nachricht, ...g.schritte].join(' ');
    assert.doesNotMatch(alles, /\b(du|dein|deine|dich|dir)\b/i, href);
    assert.doesNotMatch(alles, /Agent/i, href);
  }
  assert.match(modulGuide('/dashboard/mein-bereich', links).nachricht, /Chef/);
  assert.match(modulGuide('/dashboard/personal', links).schritte.join(' '), /Personalakte/);
});
