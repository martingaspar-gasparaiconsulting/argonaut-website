// ============================================================================
// tests/auftragVorlageP311.test.mjs — Paket 311 (11.10.2026) · BV2 Aufträge
// Aufträge nach Branchen-Vorlage: Wörter je Branche, Status-Schlüssel fest,
// Termin-Ampel mit einstellbarer Schwelle, gespeicherte Suchen, Kunde gewinnt.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { vorlageFuer, mitKunde, feinschliffName, bekannteModule } from '../out/branchenVorlage.js';
import { auftragAmpel, suchePasst, nichtAbgerechnet, alterTage, zaehlen, laeuft } from '../out/auftragVorlage.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const H = '2026-10-11';
const KEYS = ['entwurf', 'beauftragt', 'in_bearbeitung', 'abgeschlossen', 'storniert'];

test('Aufträge-Vorlage: Grund für alle, Status-Schlüssel in jeder Branche gleich', () => {
  assert.ok(bekannteModule().includes('auftraege'));
  const g = vorlageFuer('auftraege', '');
  assert.equal(g.einheit, 'Auftrag');
  assert.equal(g.terminWort, 'Lieferdatum');
  assert.equal(g.warnTage, 7);
  assert.equal(g.warnProzent, undefined);
  assert.deepEqual(g.status.map((s) => s.label), ['Entwurf', 'Beauftragt', 'In Bearbeitung', 'Abgeschlossen', 'Storniert']); // wie bisher
  for (const b of ['', 'Maler und Lackierer', 'Kanzlei und Steuerberatung', 'Eventmanagement', 'Agentur und Medien', 'Bäckerei', 'Gebäudereinigung']) {
    const v = vorlageFuer('auftraege', b);
    assert.deepEqual(v.status.map((s) => s.key), KEYS, b);
    assert.deepEqual(v.spalten.map((s) => s.key), ['nummer', 'kunde', 'datum', 'termin', 'netto', 'abrechnung'], b);
    assert.equal(v.spalten.find((s) => s.key === 'termin').label, v.terminWort, b);
  }
});

test('Feinschliff: gleiche Branchen-Erkennung wie bei den Projekten', () => {
  for (const b of ['Elektriker & Elektrobetriebe', 'Sanitär, Heizung, Klima', 'Maler & Lackierer', 'Dachdecker', 'SHK-Betrieb', 'Bau', 'Rechtsanwälte', 'Notare', 'Eventmanagement', 'Catering', 'IT und Systemhaus', 'PR-Agenturen', 'Gebäudereinigung', 'Elektronikhandel', 'Bäckerei', 'Architekten']) {
    assert.equal(feinschliffName('auftraege', b), feinschliffName('projekte', b), b);
  }
  const hw = vorlageFuer('auftraege', 'Maler und Lackierer');
  assert.equal(hw.terminWort, 'Ausführungstermin');
  assert.equal(hw.status[2].label, 'In Ausführung');
  assert.equal(hw.suchen.find((s) => s.key === 'nichtAbgerechnet').name, 'Fertiggestellt, nicht abgerechnet');
  const ka = vorlageFuer('auftraege', 'Steuerberatung');
  assert.equal(ka.terminWort, 'Frist');
  assert.equal(ka.spalten.find((s) => s.key === 'kunde').label, 'Mandant');
  assert.equal(ka.suchen.find((s) => s.key === 'ohneKunde').name, 'Ohne Mandant');
  const ev = vorlageFuer('auftraege', 'Hochzeitsplanung');
  assert.equal(ev.einheit, 'Buchung');
  assert.equal(ev.status[0].label, 'Option');
  assert.equal(ev.warnTage, 14);
  assert.equal(vorlageFuer('auftraege', 'Softwareentwicklung').status[3].label, 'Abgenommen');
  // Projekte unverändert (Erkennung nur ausgelagert)
  assert.equal(vorlageFuer('projekte', 'Maler').einheit, 'Baustelle');
  assert.equal(vorlageFuer('projekte', 'Eventmanagement').status[2].label, 'Durchgeführt');
});

test('Kunde gewinnt: Status umbenennen, Spalten, Termin-Wort und Schwelle begrenzt', () => {
  const v = mitKunde(vorlageFuer('auftraege', 'Dachdecker'), {
    statusLabels: { in_bearbeitung: 'Auf dem Dach', storniert: ' ' }, spaltenSichtbar: { netto: false, datum: true, quatsch: true },
    terminWort: '  Montagetag mit sehr langem Namen über dreißig Zeichen ', warnTage: 900,
  });
  assert.equal(v.status[2].label, 'Auf dem Dach');
  assert.equal(v.status[4].label, 'Storniert');
  assert.equal(v.spalten.find((s) => s.key === 'netto').sichtbar, false);
  assert.equal(v.spalten.find((s) => s.key === 'datum').sichtbar, true);
  assert.equal(v.spalten.some((s) => s.key === 'quatsch'), false);
  assert.equal(v.terminWort.length, 30);
  assert.ok(v.terminWort.startsWith('Montagetag'));
  assert.equal(v.warnTage, 365);
  assert.equal(mitKunde(vorlageFuer('auftraege', ''), { terminWort: '   ' }).terminWort, 'Lieferdatum');
  // Projekte und Kfz bekommen kein Termin-Wort
  assert.equal(mitKunde(vorlageFuer('projekte', ''), { terminWort: 'X' }).terminWort, undefined);
  assert.equal(mitKunde(vorlageFuer('kfz-bestand', ''), { terminWort: 'X' }).terminWort, undefined);
});

test('Ampel: Termin vorbei rot, bald gelb, fertig neutral, ohne Termin grün', () => {
  assert.equal(auftragAmpel({ status: 'beauftragt', lieferdatum: '2026-10-10' }, H), 'rot');
  assert.equal(auftragAmpel({ status: 'in_bearbeitung', lieferdatum: '2026-10-11' }, H), 'gelb');
  assert.equal(auftragAmpel({ status: 'entwurf', lieferdatum: '2026-10-18' }, H), 'gelb');
  assert.equal(auftragAmpel({ status: 'entwurf', lieferdatum: '2026-10-19' }, H), 'gruen');
  assert.equal(auftragAmpel({ status: 'entwurf', lieferdatum: '2026-10-19' }, H, 8), 'gelb');
  assert.equal(auftragAmpel({ status: 'entwurf', lieferdatum: '2026-10-12' }, H, 0), 'gruen');
  assert.equal(auftragAmpel({ status: 'beauftragt' }, H), 'gruen');
  assert.equal(auftragAmpel({ status: 'beauftragt', lieferdatum: 'Quatsch' }, H), 'gruen');
  assert.equal(auftragAmpel({ status: 'abgeschlossen', lieferdatum: '2020-01-01' }, H), 'neutral');
  assert.equal(auftragAmpel({ status: 'storniert', lieferdatum: '2020-01-01' }, H), 'neutral');
  assert.equal(auftragAmpel({ status: null, lieferdatum: '2026-10-01' }, H), 'rot'); // ohne Status = Entwurf
  assert.equal(laeuft({ status: 'abgeschlossen' }), false);
});

test('Suchen: bekannte Regeln, Unbekanntes trifft nichts', () => {
  const a = (x) => ({ status: 'beauftragt', ...x });
  assert.equal(suchePasst('ampel=rot', a({}), 'rot', H), true);
  assert.equal(suchePasst('ampel=gelb', a({}), 'rot', H), false);
  assert.equal(suchePasst('termin<=7', a({ lieferdatum: '2026-10-18' }), 'gelb', H), true);
  assert.equal(suchePasst('termin<=7', a({ lieferdatum: '2026-10-19' }), 'gruen', H), false);
  assert.equal(suchePasst('termin<=7', a({ lieferdatum: '2026-10-10' }), 'rot', H), false);
  assert.equal(suchePasst('termin<=7', { status: 'abgeschlossen', lieferdatum: '2026-10-12' }, 'neutral', H), false);
  assert.equal(suchePasst('abgerechnet=nein', { status: 'abgeschlossen', rechnung_id: null }, 'neutral', H), true);
  assert.equal(suchePasst('abgerechnet=nein', { status: 'abgeschlossen', rechnung_id: 'r1' }, 'neutral', H), false);
  assert.equal(suchePasst('abgerechnet=nein', { status: 'in_bearbeitung' }, 'gruen', H), false);
  assert.equal(suchePasst('kunde=leer', a({}), 'gruen', H), true);
  assert.equal(suchePasst('kunde=leer', a({ firma_id: 'f1' }), 'gruen', H), false);
  assert.equal(suchePasst('kunde=leer', a({ kontakt_id: 'k1' }), 'gruen', H), false);
  assert.equal(suchePasst('kunde=leer', { status: 'storniert' }, 'neutral', H), false);
  assert.equal(suchePasst('entwurf>30', { status: 'entwurf', created_at: '2026-09-10T08:00:00Z' }, 'gruen', H), true);
  assert.equal(suchePasst('entwurf>30', { status: 'entwurf', created_at: '2026-09-11T08:00:00Z' }, 'gruen', H), false);
  assert.equal(suchePasst('entwurf>30', { status: 'beauftragt', created_at: '2026-01-01' }, 'gruen', H), false);
  assert.equal(suchePasst('entwurf>30', { status: 'entwurf', auftragsdatum: '2026-08-01' }, 'gruen', H), true);
  assert.equal(alterTage({ created_at: '2026-10-01' }, H), 10);
  assert.equal(suchePasst('irgendwas', a({}), 'rot', H), false);
  for (const b of ['', 'Maler', 'Notare', 'Eventmanagement', 'Werbeagentur']) for (const s of vorlageFuer('auftraege', b).suchen) {
    assert.ok(/^(ampel=(rot|gelb|gruen)|termin<=\d+|abgerechnet=nein|kunde=leer|entwurf>\d+)$/.test(s.regel), s.regel);
  }
});

test('Kennzahlen: wie bisher plus „nicht abgerechnet" und „überschritten"', () => {
  const liste = [
    { status: 'entwurf' }, { status: 'beauftragt', lieferdatum: '2026-10-01' }, { status: 'in_bearbeitung' },
    { status: 'abgeschlossen' }, { status: 'abgeschlossen', rechnung_id: 'r' }, { status: 'storniert', lieferdatum: '2026-01-01' },
  ];
  assert.deepEqual(zaehlen(liste, H), { offen: 2, inArbeit: 1, fertig: 2, offenAbrechnung: 1, ueberfaellig: 1 });
  assert.equal(nichtAbgerechnet({ status: 'abgeschlossen', rechnung_id: '  ' }), true);
});

test('Code-Wächter: Liste und Akte nutzen die Vorlage, Ansicht speichert für den Betrieb', () => {
  const seite = lies('app/dashboard/auftraege/page.tsx');
  assert.match(seite, /useAuftragVorlage\(supabase\)/);
  assert.match(seite, /lieferdatum, kontakt_id, firma_id, rechnung_id/);
  assert.match(seite, /suchePasst\(regel, a, auftragAmpel\(a, heuteTag, warnTage\), heuteTag\)/);
  assert.match(seite, /\+ \{vorlage\.einheit\} anlegen/);
  assert.doesNotMatch(seite, /Wähle eine Chance|Markiere im CRM/); // Mitarbeitertexte anredefrei
  assert.doesNotMatch(seite, /STATUS\[s\]\.label/);
  const akte = lies('app/dashboard/auftraege/[id]/page.tsx');
  assert.match(akte, /useAuftragVorlage\(supabase\)/);
  assert.doesNotMatch(akte, /STATUS\[(s|naechster)\]/);
  assert.match(akte, /vorlage\.terminWort/);
  const ansicht = lies('app/dashboard/auftraege/AuftragAnsicht.tsx');
  assert.match(ansicht, /owner_user_id: betrieb, modul: AUFTRAG_MODUL/);
  assert.equal((ansicht.match(/disabled=\{!istChef\}/g) || []).length, 4); // Status, Spalten, Wort, Tage
  const hook = lies('app/dashboard/auftraege/useAuftragVorlage.ts');
  assert.match(hook, /AUFTRAG_MODUL = 'auftraege'/);
});
