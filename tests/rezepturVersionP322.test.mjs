// Paket 322 (11.10.2026): R1 Teil 2 — Speichern, Versionen, Rohstoff-Tausch, Ansatz → Charge
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { zeilenFuerSpeichern, versionVergleich, chargenNummer, ansatzRohstoffe, fehlendeChargen } from '../out/rezepturVersion.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const Z = (o) => ({ bezeichnung: '', menge: '', einheit: 'kg', preis_pro_einheit: '', rolle: 'sonstige', anteil: '', ist_rest: false, artikel_id: '', ...o });

test('Speichern Mengen-Rezept: leere Zeilen weg, deutsche Zahlen, Menge 0 = leer', () => {
  const r = zeilenFuerSpeichern('teig', [Z({ bezeichnung: 'Mehl', menge: '1.250,5', preis_pro_einheit: '0,90', rolle: 'mehl' }), Z({}), Z({ bezeichnung: 'Salz', menge: '0' })], { basis_menge: 10, basis_einheit: 'kg' });
  assert.equal(r.fehler, null);
  assert.equal(r.zeilen.length, 2);
  assert.deepEqual(r.zeilen[0], { bezeichnung: 'Mehl', menge: 1250.5, einheit: 'kg', preis_pro_einheit: 0.9, rolle: 'mehl', anteil_prozent: null, ist_rest: false, artikel_id: null });
  assert.equal(r.zeilen[1].menge, null);
});

test('Speichern Prozent-Rezeptur: Rest aufgefüllt, Menge für den Standard-Ansatz exakt', () => {
  const r = zeilenFuerSpeichern('mischung', [
    Z({ bezeichnung: 'Tensid', anteil: '12,5', artikel_id: 'a1', preis_pro_einheit: '2,40' }), Z({}),
    Z({ bezeichnung: 'Duft', anteil: '0,3' }), Z({ bezeichnung: 'Wasser', ist_rest: true }),
  ], { basis_menge: 250, basis_einheit: 'kg' });
  assert.equal(r.fehler, null);
  assert.deepEqual(r.zeilen.map((z) => z.anteil_prozent), [12.5, 0.3, 87.2]);
  assert.deepEqual(r.zeilen.map((z) => z.menge), [31.25, 0.75, 218]);
  assert.equal(r.zeilen[0].artikel_id, 'a1');
  assert.equal(r.zeilen[2].ist_rest, true);
  assert.ok(r.zeilen.every((z) => z.einheit === 'kg' && z.rolle === 'sonstige'));
  const ohneAnsatz = zeilenFuerSpeichern('mischung', [Z({ bezeichnung: 'A', anteil: '100' })], { basis_menge: null, basis_einheit: null });
  assert.equal(ohneAnsatz.zeilen[0].menge, null);
  const falsch = zeilenFuerSpeichern('mischung', [Z({ bezeichnung: 'A', anteil: '70' }), Z({ bezeichnung: 'B', anteil: '40' }), Z({ ist_rest: true })], { basis_menge: 1, basis_einheit: 'kg' });
  assert.match(falsch.fehler, /110 %/);
  assert.deepEqual(falsch.zeilen, []);
});

test('Versionsvergleich: geändert, neu, weg — Name ohne Groß-/Kleinschreibung', () => {
  const alt = [{ bezeichnung: 'Tensid', anteil_prozent: 12.5, preis_pro_einheit: 2.4 }, { bezeichnung: 'Duft', anteil_prozent: 0.3 }, { bezeichnung: 'Wasser', anteil_prozent: 87.2 }];
  const neu = [{ bezeichnung: 'tensid ', anteil_prozent: 13, preis_pro_einheit: 2.1 }, { bezeichnung: 'Wasser', anteil_prozent: 86.5 }, { bezeichnung: 'Farbe', anteil_prozent: 0.5 }];
  const v = versionVergleich(alt, neu);
  assert.deepEqual(v.map((a) => a.art), ['geaendert', 'geaendert', 'neu', 'weg']);
  assert.equal(v[0].text, '12,5 % → 13 %, Preis 2,4 → 2,1 €');
  assert.equal(v[2].text, 'neu: 0,5 %');
  assert.equal(v[3].text, 'entfernt (war 0,3 %)');
  assert.deepEqual(versionVergleich(alt, alt), []);
  assert.equal(versionVergleich([{ bezeichnung: 'Mehl', menge: 18, einheit: 'kg' }], [{ bezeichnung: 'Mehl', menge: 20, einheit: 'kg' }])[0].text, '18 kg → 20 kg');
});

test('Chargennummer in Berliner Zeit (auch über Mitternacht UTC)', () => {
  assert.equal(chargenNummer(new Date('2026-10-11T12:30:00Z')), 'RZ-20261011-1430');
  assert.equal(chargenNummer(new Date('2026-12-31T23:15:00Z')), 'RZ-20270101-0015');
});

test('Ansatz → Charge: nur Rohstoffe mit Anteil, Einwaage exakt, fehlende Chargen benannt', () => {
  const r = ansatzRohstoffe(['Tensid', '', 'Duft', 'Wasser'], [12.5, 0, 0.3, 87.2], 98, [' ROH-1 ', 'x', '', null]);
  assert.deepEqual(r, [
    { bezeichnung: 'Tensid', menge: 12.25, charge_nr: 'ROH-1' },
    { bezeichnung: 'Duft', menge: 0.294, charge_nr: null },
    { bezeichnung: 'Wasser', menge: 85.456, charge_nr: null },
  ]);
  assert.equal(Math.round(r.reduce((s, x) => s + x.menge, 0) * 1000), 98000);
  assert.deepEqual(fehlendeChargen(r), ['Duft', 'Wasser']);
});

test('Seite + SQL: Speichern atomar, Version unveränderbar, Charge in Quarantäne, Wächter bleibt', () => {
  const s = lies('app/dashboard/rezeptur/page.tsx');
  assert.match(s, /rpc\('rezeptur_zutaten_speichern'/);
  assert.match(s, /rpc\('rezeptur_version_anlegen'/);
  assert.match(s, /rpc\('rezeptur_rohstoff_tauschen'/);
  assert.match(s, /rpc\('rezeptur_ansatz_charge'/);
  assert.doesNotMatch(s, /from\('rezeptur_zutaten'\)\.(insert|delete)/);
  const z = lies('app/dashboard/rezeptur/[id]/ansatz/page.tsx');
  assert.match(z, /einwaage\(auf\.anteile, ansatz, 3\)/);
  assert.match(z, /redirect\('\/auth\/login'\)/);
  const sql = lies('supabase-sql/p322-rezeptur-versionen-charge.sql');
  assert.match(sql, /revoke insert, update, delete, truncate on public\.rezeptur_version from authenticated/);
  assert.match(sql, /'quarantaene'/);
  assert.match(sql, /function public\.rezeptur_ansatz_charge[\s\S]*?security invoker/);
  assert.match(sql, /darf_ich_modul_aendern\('rezeptur'\)/);
  assert.doesNotMatch(sql, /\bdrop (table|column)\b/i);
  assert.doesNotMatch(sql, /for (all|insert|update|delete) to authenticated[\s\S]{0,80}rezeptur_version/);
});
