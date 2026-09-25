// Paket A3 (25.09.2026) — der Guide nach Rolle, Rang und Datenstand.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  rolleAus, rollenHinweis, seiteErledigt, fehlendeVoraussetzungen,
  naechsterStartSchritt, startFortschritt, rangLage, guideLage, firmaFelderAusProfil,
} from '../out/guideLage.js';

const RECHTE = fs.readFileSync(new URL('../lib/rechte.ts', import.meta.url), 'utf8');
const NAV = [...RECHTE.matchAll(/\{ label: '([^']+)', href: '(\/dashboard[^']*)'([^}]*)\}/g)]
  .map((m) => ({ label: m[1], href: m[2], exakt: /exakt: true/.test(m[3]) }));

const LEER_CHEF = { firmaOk: false, uebungswelt: false, kunden: 0, mitarbeiter: 0, eingeladen: 0, kurse: 0 };

test('Rolle: kein Mitarbeiter-Datensatz = Chef', () => {
  assert.equal(rolleAus(false), 'chef');
  assert.equal(rolleAus(true), 'mitarbeiter');
});

test('Mitarbeiter auf einer Chef-Seite bekommt den ehrlichen Hinweis — der Chef nicht', () => {
  assert.match(rollenHinweis('chef', 'mitarbeiter'), /pflegt der Chef/);
  assert.equal(rollenHinweis('chef', 'chef'), null);
  assert.equal(rollenHinweis('beide', 'mitarbeiter'), null);
  const g = guideLage('/dashboard/einstellungen', NAV, 'mitarbeiter', {});
  assert.match(g.rollenHinweis, /pflegt der Chef/);
  assert.equal(g.aktionHref, undefined, 'keine Aufforderung auf eine Seite, die er nicht pflegt');
});

test('Unbekannter Datenstand: der Guide behauptet nichts', () => {
  assert.equal(seiteErledigt('/dashboard/crm', {}), undefined);
  assert.equal(naechsterStartSchritt('chef', {}), null);
  assert.equal(startFortschritt('chef', {}), -1);
  assert.equal(rangLage(undefined), null);
  const g = guideLage('/dashboard/angebote', NAV, 'chef', {});
  assert.deepEqual(g.fehlt, []);
  assert.equal(g.stimmung, 'neutral');
});

test('Neuer Betrieb: zuerst Firmendaten, dann Uebungswelt, dann Mitarbeiter …', () => {
  assert.equal(naechsterStartSchritt('chef', LEER_CHEF).href, '/dashboard/onboarding');
  assert.match(naechsterStartSchritt('chef', LEER_CHEF).text, /Firmendaten/);
  const s2 = { ...LEER_CHEF, firmaOk: true };
  assert.match(naechsterStartSchritt('chef', s2).text, /Übungswelt/);
  const s3 = { ...s2, uebungswelt: true };
  // ohne Mitarbeiter draengt der Guide nicht (Ein-Mann-Betrieb) -> gleich Kunden
  assert.equal(naechsterStartSchritt('chef', s3).href, '/dashboard/crm');
  const s4 = { ...s3, mitarbeiter: 2 };
  assert.equal(naechsterStartSchritt('chef', s4).href, '/dashboard/rechte');
  const s5 = { ...s4, eingeladen: 1 };
  assert.equal(naechsterStartSchritt('chef', s5).href, '/dashboard/crm');
  assert.equal(naechsterStartSchritt('chef', { ...s5, kunden: 3 }), null);
  assert.equal(startFortschritt('chef', { ...s5, kunden: 3 }), 100);
});

test('Ein-Mann-Betrieb: Rechte und Einladung entfallen', () => {
  const s = { firmaOk: true, uebungswelt: true, mitarbeiter: 0, eingeladen: 0, kunden: 0 };
  // kein Draengen zu Mitarbeitern, Rechten oder Einladung — weiter zu den Kunden
  assert.equal(naechsterStartSchritt('chef', s).href, '/dashboard/crm');
  assert.equal(naechsterStartSchritt('chef', { ...s, kunden: 1 }), null);
});

test('Echte Kunden ersetzen die Uebungswelt', () => {
  const s = { firmaOk: true, uebungswelt: false, kunden: 5, mitarbeiter: 1, eingeladen: 1 };
  assert.equal(naechsterStartSchritt('chef', s), null);
});

test('Mitarbeiter: Zeiterfassung und Academy werden gemessen', () => {
  assert.equal(naechsterStartSchritt('mitarbeiter', { zeiten: 0, kurse: 0 }).href, '/dashboard/zeiterfassung');
  assert.equal(naechsterStartSchritt('mitarbeiter', { zeiten: 4, kurse: 0 }).href, '/dashboard/academy');
  assert.equal(naechsterStartSchritt('mitarbeiter', { zeiten: 4, kurse: 1 }), null);
});

test('Fehlende Voraussetzung: steht zuerst, Knopf fuehrt dorthin', () => {
  // Chef-Blick setzt die Personalakte voraus
  const g = guideLage('/dashboard/chef-blick', NAV, 'chef', { ...LEER_CHEF, firmaOk: true, uebungswelt: true });
  assert.ok(g.fehlt.some((v) => v.href === '/dashboard/personal'), JSON.stringify(g.fehlt));
  assert.equal(g.stimmung, 'achtung');
  assert.match(g.nachricht, /^Bevor es hier losgeht, fehlt noch/);
  assert.equal(g.aktionHref, '/dashboard/personal');
  // Mit Mitarbeitern: kein Hinweis mehr
  const ok = guideLage('/dashboard/chef-blick', NAV, 'chef', { ...LEER_CHEF, mitarbeiter: 3 });
  assert.ok(!ok.fehlt.some((v) => v.href === '/dashboard/personal'));
});

test('Naechster Schritt: nicht auf der eigenen Seite, immer auf Start-Seiten', () => {
  const s = { ...LEER_CHEF, firmaOk: true, uebungswelt: true };
  assert.equal(guideLage('/dashboard/crm', NAV, 'chef', s).naechster, null);
  assert.equal(guideLage('/dashboard', NAV, 'chef', s).naechster.href, '/dashboard/crm');
});

test('Rang aus der Academy', () => {
  assert.equal(rangLage(0).name, null);
  assert.match(rangLage(0).text, /ein Kurs .* „Erste Fahrt"/);
  assert.equal(rangLage(6).name, 'Matrose');
  assert.equal(rangLage(6).naechster, 'Bootsmann');
  assert.equal(rangLage(6).fehlen, 4);
  assert.match(rangLage(40).text, /höchste Rang/);
});

test('Details: ganze Anleitung, Probe, Ziel — und Uebungswelt-Hinweis nur ganz am Anfang', () => {
  const g = guideLage('/dashboard/angebote', NAV, 'chef', LEER_CHEF);
  assert.ok(g.alleSchritte.length >= 3);
  assert.ok(g.werKurz);
  assert.ok(g.uebungsHinweis);
  assert.equal(guideLage('/dashboard/angebote', NAV, 'chef', { ...LEER_CHEF, kunden: 1 }).uebungsHinweis, null);
  assert.equal(guideLage('/dashboard/angebote', NAV, 'mitarbeiter', LEER_CHEF).uebungsHinweis, null);
});

test('Firmendaten aus der gewachsenen profiles-Zeile', () => {
  const f = firmaFelderAusProfil({ firma: 'Muster GmbH', plz: '71032', iban: '' });
  assert.equal(f.firma_name, 'Muster GmbH');
  assert.equal(f.firma_plz, '71032');
  assert.equal(f.firma_iban, '');
  assert.equal(firmaFelderAusProfil(null).firma_name, '');
});

test('Die Anzeige haengt am Layout: Rolle wird mitgegeben, Laden erst beim Aufklappen', () => {
  const layout = fs.readFileSync(new URL('../app/dashboard/layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /<KiGuideBegleiter rolle=\{mitarbeiterRes\.data \? 'mitarbeiter' : 'chef'\} \/>/);
  const b = fs.readFileSync(new URL('../app/dashboard/_components/KiGuideBegleiter.tsx', import.meta.url), 'utf8');
  assert.match(b, /if \(!offen \|\| standGeladen\) return;/);
  assert.match(b, /guideLage\(/);
});
