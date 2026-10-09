// Paket 289 (09.10.2026): F1a Führerscheinkontrolle — Prüfvermerk ohne Nummer, Fälligkeit, Ampel, Freigabe
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  einstellungLesen, klassenLesen, siehtAusWieNummer, naechsteAm, plusMonate, eingabePruefen, fahrerUebersicht, stufeText, zaehlen,
  INTERVALL_STANDARD,
} from '../out/fuehrerscheinKontrolle.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const H = '2026-10-09';
const MA = '11111111-1111-4111-8111-111111111111';
const MB = '22222222-2222-4222-8222-222222222222';

test('Einstellung: Intervall 1–12 (Standard 6), Fahrerliste nur gültige IDs', () => {
  assert.equal(INTERVALL_STANDARD, 6);
  assert.deepEqual(einstellungLesen(null), { intervall: 6, fahrer: [] });
  assert.equal(einstellungLesen({ fsIntervall: 12 }).intervall, 12);
  assert.equal(einstellungLesen({ fsIntervall: 0 }).intervall, 6);
  assert.equal(einstellungLesen({ fsIntervall: 13 }).intervall, 6);
  assert.equal(einstellungLesen({ fsIntervall: '3' }).intervall, 6);
  assert.deepEqual(einstellungLesen({ fahrer: [MA, MA, 'x', 5, MB] }).fahrer, [MA, MB]);
});

test('Klassen und Nummern-Schutz', () => {
  assert.deepEqual(klassenLesen('be, b  c1'), { ok: true, wert: 'B, BE, C1' });
  assert.deepEqual(klassenLesen(''), { ok: true, wert: null });
  assert.equal(klassenLesen('B, X9').ok, false);
  assert.equal(siehtAusWieNummer('B0721XYZ123'), true);
  assert.equal(siehtAusWieNummer('Fahrer ist ok'), false);
  assert.equal(siehtAusWieNummer('Brillenpflicht'), false, 'reines Wort ohne Ziffer');
});

test('Fälligkeit: Intervall, Monatsende, früher bei Ablauf der Karte, Mangel sofort', () => {
  assert.equal(plusMonate('2026-08-31', 6), '2027-02-28');
  assert.equal(naechsteAm('2026-10-09', 6, null, 'gueltig'), '2027-04-09');
  assert.equal(naechsteAm('2026-10-09', 6, '2026-12-01', 'gueltig'), '2026-12-01');
  assert.equal(naechsteAm('2026-10-09', 6, '2030-01-01', 'gueltig'), '2027-04-09');
  assert.equal(naechsteAm('2026-10-09', 6, null, 'mangel'), '2026-10-09');
});

test('Eingabe prüfen: Name, Datum, keine Zukunft, kein Gültig bei abgelaufener Karte, keine Nummer', () => {
  const basis = { name: 'Max Muster', geprueftAm: H, klassen: 'b', intervall: 6, heute: H };
  const ok = eingabePruefen({ ...basis, mitarbeiterId: MA, bemerkung: '  Brille  ' });
  assert.equal(ok.ok, true);
  assert.equal(ok.zeile.klassen, 'B');
  assert.equal(ok.zeile.mitarbeiter_id, MA);
  assert.equal(ok.zeile.bemerkung, 'Brille');
  assert.equal(ok.zeile.naechste_am, '2027-04-09');
  assert.equal(eingabePruefen({ ...basis, name: ' ' }).ok, false);
  assert.equal(eingabePruefen({ ...basis, geprueftAm: '2026-10-10' }).ok, false);
  assert.equal(eingabePruefen({ ...basis, geprueftAm: '2026-02-30' }).ok, false);
  assert.equal(eingabePruefen({ ...basis, dokumentBis: '2026-10-01' }).ok, false);
  assert.equal(eingabePruefen({ ...basis, dokumentBis: '2026-10-01', ergebnis: 'mangel' }).ok, true);
  const nr = eingabePruefen({ ...basis, bemerkung: 'Nr B0721XYZ123' });
  assert.equal(nr.ok, false);
  assert.match(nr.grund, /keine Führerscheinnummer/);
  assert.equal(eingabePruefen({ ...basis, mitarbeiterId: 'quatsch' }).zeile.mitarbeiter_id, null);
});

test('Übersicht: letzte Kontrolle je Fahrer, Ampel, Sortierung, Fahrer ohne Kontrolle', () => {
  const k = [
    { id: '1', mitarbeiter_id: MA, person_name: 'Anna', geprueft_am: '2026-01-05', ergebnis: 'gueltig', naechste_am: '2026-07-05' },
    { id: '2', mitarbeiter_id: MA, person_name: 'Anna', geprueft_am: '2026-09-20', ergebnis: 'gueltig', naechste_am: '2026-10-20' },
    { id: '3', mitarbeiter_id: null, person_name: 'Gast Fahrer', geprueft_am: '2026-03-01', ergebnis: 'gueltig', naechste_am: '2026-09-01' },
    { id: '4', mitarbeiter_id: null, person_name: 'Mona', geprueft_am: '2026-10-01', ergebnis: 'mangel', naechste_am: '2026-10-01' },
    { id: '5', mitarbeiter_id: null, person_name: 'Olaf', geprueft_am: '2026-10-01', ergebnis: 'gueltig', naechste_am: '2027-04-01' },
  ];
  const u = fahrerUebersicht([{ id: MA, name: 'Anna Beispiel' }, { id: MB, name: 'Bernd Neu' }], k, H);
  assert.deepEqual(u.map((z) => z.stufe), ['mangel', 'ueberfaellig', 'fehlt', 'bald', 'ok']);
  const anna = u.find((z) => z.mitarbeiterId === MA);
  assert.equal(anna.name, 'Anna Beispiel');
  assert.equal(anna.anzahl, 2);
  assert.equal(anna.letzte.id, '2');
  assert.equal(anna.tage, 11);
  assert.match(stufeText(anna), /Fällig in 11 Tagen/);
  assert.match(stufeText(u.find((z) => z.name === 'Gast Fahrer')), /Überfällig seit 38 Tagen/);
  assert.deepEqual(zaehlen(u), { fehlt: 1, mangel: 1, ueberfaellig: 1, bald: 1, ok: 1 });
});

test('Seite, SQL, Freigabe: gesperrt ohne Freigabe, Datenbank prüft mit, keine Nummer-Spalte', () => {
  const seite = lies('app/dashboard/erp/fuhrpark/fuehrerschein/page.tsx');
  assert.match(seite, /useRechtsFreigabe\('fuehrerschein'\)/);
  assert.match(seite, /const gesperrt = !freigabe\.aktiv;/);
  assert.match(seite, /!gesperrt && !form && <button/);
  assert.match(seite, /eingabePruefen\(/);
  const sql = lies('supabase-sql/p289-fuehrerschein-kontrolle.sql');
  assert.match(sql, /with check \(owner_user_id = auth\.uid\(\) and public\.rechts_freigabe_besteht\('fuehrerschein'\)\)/);
  assert.match(sql, /and public\.rechts_freigabe_besteht\('fuehrerschein'\)\);/);
  assert.match(sql, /before update on public\.fuehrerschein_kontrolle/);
  assert.doesNotMatch(sql, /for update to authenticated/);
  assert.doesNotMatch(sql, /^\s+[a-z_]*(nummer|_nr|kopie|foto|bild)[a-z_]*\s+(text|bytea|uuid|varchar)/im, 'keine Spalte für Nummer oder Kopie');
  assert.match(lies('app/dashboard/erp/fuhrpark/page.tsx'), /href="\/dashboard\/erp\/fuhrpark\/fuehrerschein"/);
  assert.match(lies('lib/rechtsFreigaben.ts'), /wo: 'Fuhrpark → Führerscheinkontrolle',\n\s+verfuegbar: true,/);
});
