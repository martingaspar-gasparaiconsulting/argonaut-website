// Paket 292 (09.10.2026): V1 Fahrzeugvermietung — Mietvertrag, Übergabe/Rückgabe, Rechnung
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Rechnung aus Vermietung: Recht vor dem Anlegen, Betrieb, nur zurück, Doppelschutz, keine Kaution', () => {
  const s = lies('app/api/rechnung-aus-vermietung/route.ts');
  const pruef = s.indexOf('const abr = await abrechnungPruefen(supabase, user.id);');
  assert.ok(pruef > 0 && pruef < s.indexOf('from("rechnungen").insert('));
  assert.match(s, /if \(b\.status !== "zurueck"\)/);
  assert.match(s, /status: 409/);
  assert.match(s, /vorhanden\.zahlungsstatus !== "storniert"/, 'stornierte Rechnung erlaubt eine neue');
  assert.match(s, /\.eq\("rolle", "zusatz"\)\.eq\("ergebnis", "ok"\)/, 'nur geprüfte Zusatzfahrer');
  assert.match(s, /abrechnung\(\{/, 'Posten aus lib/fahrzeugMiete');
  assert.ok(!/kaution_cent \/|kaution_einbehalt/.test(s), 'Kaution nie als Posten');
  assert.match(s, /zahlungsstatus: "storniert"/, 'Positionsfehler storniert statt löschen');
  assert.ok(!s.includes('.delete('));
});

test('Mietvertrag-Seite: Abrechnen-Recht, keine Kartendaten, keine Führerscheinnummer, Fotos privat', () => {
  const s = lies('app/dashboard/verleih/fahrzeuge/[id]/page.tsx');
  assert.match(s, /useDarfAbrechnen\(\)/);
  assert.match(s, /\/api\/rechnung-aus-vermietung/);
  assert.match(s, /createSignedUrls/, 'Fotos nur über befristete Links');
  assert.ok(!/getPublicUrl/.test(s));
  assert.ok(!/kartennummer|card_number|cvc|cvv|iban/i.test(s.replace(/KEINE Kartennummer|keine Kartennummer|NIE Kartendaten/g, '')));
  assert.ok(!/fs_nummer|fuehrerschein_nummer/i.test(s));
  assert.ok(!/parseFloat|Math\.round\([^)]*\* 100\) \/ 100/.test(s));
  const v = lies('app/dashboard/verleih/fahrzeuge/[id]/vertrag/page.tsx');
  assert.match(v, /ladeBetriebProfil\(supabase, user\.id\)/);
  assert.match(v, /b\.status === 'reserviert' \? t\(ei\.data\?\.mietbedingungen\) : t\(b\.bedingungen\)/, 'nach der Übergabe gilt die festgehaltene Fassung');
  assert.match(v, /Unterschrift Mieter/);
});
