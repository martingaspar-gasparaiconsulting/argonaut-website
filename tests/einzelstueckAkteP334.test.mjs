// ============================================================================
// tests/einzelstueckAkteP334.test.mjs — Paket 334 (12.10.2026)
// BV2b Teil 3: Handelsakte nach Art des Einzelstücks
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { akteTeile, akteReiterAus, merkmaleListe, merkmaleZahl, akteUnterzeile } from '../out/einzelstueckBestand.js';
import { inseratAmpel } from '../out/kfzAkte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Kfz und ohne SQL p332: alle Teile der Akte wie bisher', () => {
  const alle = { energie: true, probefahrt: true, tresor: true, hu: true, finDienste: true, bewertung: true, kfzAusstattung: true, polster: true };
  assert.deepEqual(akteTeile('kfz', true), alle);
  assert.deepEqual(akteTeile('boot', false), alle, 'ohne p332 nichts ausblenden');
  assert.deepEqual(akteReiterAus('kfz', true), []);
  assert.deepEqual(akteReiterAus('uhr_schmuck', false), []);
});

test('Teile je Art: Boot, Maschine, Uhr, Kunst, Fahrrad', () => {
  assert.deepEqual(akteReiterAus('boot', true), ['energie', 'tresor'], 'Boot: Probefahrt ja, kein Brief, keine CO2-Pflicht');
  assert.deepEqual(akteReiterAus('maschine', true), ['energie'], 'Maschine: Probefahrt und Papiere ja');
  assert.deepEqual(akteReiterAus('uhr_schmuck', true), ['energie', 'probefahrt', 'tresor']);
  assert.deepEqual(akteReiterAus('kunst_antik', true), ['energie', 'probefahrt', 'tresor']);
  assert.deepEqual(akteReiterAus('fahrrad', true), ['energie', 'tresor']);
  const m = akteTeile('maschine', true);
  assert.equal(m.hu, true, 'zugelassene Maschine kann HU haben');
  assert.equal(m.finDienste, false);
  assert.equal(m.bewertung, false, 'DAT/Schwacke nur Kfz');
  assert.equal(akteTeile('boot', true).hu, false);
  assert.equal(akteTeile('boot', true).polster, false);
});

test('Merkmale-Karte: alle Merkmale der Art, leere als „—", interne markiert', () => {
  const l = merkmaleListe('boot', { laenge_m: 12.5, liegeplatz: 'Steg 4', fremd: 'x' });
  assert.equal(l.length, 10);
  assert.deepEqual(l[0], { key: 'laenge_m', label: 'Länge', text: '12,5 m', intern: false, gesetzt: true });
  assert.equal(l.find((x) => x.key === 'liegeplatz').intern, true);
  assert.equal(l.find((x) => x.key === 'breite_m').text, '—');
  assert.ok(!l.some((x) => x.key === 'fremd'));
  assert.equal(merkmaleZahl('boot', { laenge_m: 12.5, trailer: false, rumpf: '' }), 2, '„nein" ist eine Angabe, leer nicht');
  assert.equal(merkmaleZahl('kfz', { laenge_m: 1 }), 0);
  assert.deepEqual(merkmaleListe('boot', null).filter((x) => x.gesetzt), []);
});

test('Kopfzeile: Kfz wie bisher, sonst Datum-Wort und Zähler', () => {
  const kfz = { interne_nr: 'F-0001', erstzulassung: '2022-03-01', km_stand: 18400, leistung_kw: 331, kraftstoff: 'Benzin' };
  assert.equal(akteUnterzeile('kfz', kfz, 450), 'F-0001 · EZ 03/2022 · 18.400 km · 450 PS (331 kW) · Benzin');
  assert.equal(akteUnterzeile('kfz', { ...kfz, km_stand: null }, null), 'F-0001 · EZ 03/2022 · — km · Benzin');
  assert.equal(akteUnterzeile('maschine', { ...kfz, erstzulassung: '2018-01-01', betriebsstunden: 4250 }, null), 'F-0001 · Baujahr 2018 · 4.250 Bh');
  assert.equal(akteUnterzeile('kunst_antik', { ...kfz, erstzulassung: '1890-01-01' }, null), 'F-0001 · Entstehung 1890');
});

test('Inserats-Ampel: Einzelstück zählt Merkmale statt Energie und CO₂', () => {
  const basis = { marke: 'Bavaria', modell: 'C42', vk_brutto: 189000, status: 'bestand', kraftstoff: null, verbrauch_komb: null, co2_g_km: null, co2_klasse: null,
    vorschaden: null, inserat_titel: 'Bavaria C42', inserat_text: 'x'.repeat(200), inseriert: true, ausstattung: ['a', 'b', 'c', 'd', 'e'], fotos: 12 };
  const kfz = inseratAmpel(basis);
  assert.equal(kfz.prozent, 75, 'Auto ohne CO₂-Angaben verliert 25');
  assert.ok(kfz.punkte.some((p) => p.name === 'Energie und CO₂'));
  const boot = inseratAmpel(basis, { merkmale: 3 });
  assert.equal(boot.prozent, 100);
  assert.ok(!boot.punkte.some((p) => p.name === 'Energie und CO₂'));
  assert.equal(boot.punkte.find((p) => p.name === 'Merkmale').hinweis, '3 Merkmale (empfohlen 3+)');
  assert.equal(inseratAmpel(basis, { merkmale: 0 }).prozent, 75);
  assert.equal(inseratAmpel(basis, null).prozent, 75, 'null = Kfz wie bisher');
});

test('Akte: Reiter nach Art, Teile nur wo die Art sie hat', () => {
  const a = lies('app/dashboard/kfz/bestand/[id]/page.tsx');
  assert.match(a, /setMitArt\(Object\.prototype\.hasOwnProperty\.call\(a, 'art'\)\)/);
  assert.match(a, /const sichtReiter = REITER\.filter\(\(\[k\]\) => !reiterAus\.includes\(k\)\)/);
  assert.match(a, /reiterAus\.includes\(reiter\) \? 'uebersicht' : reiter/, 'versteckter Reiter per ?reiter= fällt auf die Übersicht');
  assert.doesNotMatch(a, /\{reiter === '/, 'Inhalte hängen am wirksamen Reiter');
  assert.match(a, /\{teile\.finDienste && <KfzHistorie/);
  assert.match(a, /\{teile\.bewertung && <KfzBewertung/);
  assert.match(a, /\{teile\.hu && <label style=\{s\.lab\}>HU bis/);
  assert.match(a, /\.\.\.\(teile\.hu \? \{ hu_bis: zust\.hu_bis \|\| null \} : \{\}\)/, 'HU unsichtbar = unverändert');
  assert.match(a, /\.\.\.\(teile\.polster \? \{ polster: polster\.trim\(\) \|\| null \} : \{\}\)/, 'Polster unsichtbar = unverändert');
  assert.match(a, /inseratAmpel\(entwurfFelder, teile\.energie \? null : \{ merkmale: merkmaleZahl\(art, akte\.merkmale\) \}\)/);
  assert.match(a, /merkmaleListe\(art, akte\.merkmale\)/);
  assert.doesNotMatch(a, /\bdu\b|\bdein|KI-Agent/i);
});
