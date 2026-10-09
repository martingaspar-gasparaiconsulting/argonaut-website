// Paket 155 (28.09.2026) — Umzug Schritt 8: je Branchengruppe ein Muster-Umzugskarton
// durch die ECHTEN Import-Programme — gegen den LIVE-Feldkatalog der Datenbank
// (tests/fixtures/live-katalog-2026-09-28.csv, Nur-Lese-Abfrage vom 28.09.2026).
// Handwerk/Bau ist der Haldenberg-Karton (umzugPlanP147). Hier die uebrigen neun Gruppen.
//
// Je Datei: 1) der Umzug-Stapel erkennt das richtige Ziel (oder sperrt geschuetzte Daten),
// 2) die Zuordnung + Pruefung mit dem Live-Katalog laesst keine Zeile fallen und
// verschluckt keine Spalte, 3) Stichproben: Werte landen im richtigen Feld.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { leseCsv, pruefeAlles, zielDef } from '../out/importParser.js';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, EIGEN, MOTOR_TABELLEN } from '../out/importMotor.js';
import { erkenneDatei, umzugPlan, geschuetztGrund } from '../out/umzugPlan.js';
import { importErlaubt } from '../out/importRechte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8').replace(/^﻿/, '');
const DIR = 'tests/fixtures/umzug-gruppen/';

// --- Live-Katalog: je Tabelle „spalte:datentyp:pflicht:generiert | …" ---
function leseKatalog() {
  const t = leseCsv(lies('tests/fixtures/live-katalog-2026-09-28.csv'));
  const iT = t.kopf.indexOf('tabelle'); const iS = t.kopf.indexOf('spalten'); const iA = t.kopf.indexOf('anzahl');
  const raus = [];
  for (const z of t.zeilen) {
    const teile = String(z[iS]).split(' | ').map((x) => x.split(':'));
    assert.equal(teile.length, Number(z[iA]), `Katalog ${z[iT]} vollstaendig`);
    for (const [spalte, datentyp, pflicht, generiert] of teile) raus.push({ tabelle: z[iT], spalte, datentyp, pflicht: pflicht === '1', generiert: generiert === '1' });
  }
  return raus;
}
const LIVE = leseKatalog();
const CHEF = { chef: true, module: [], schreibModule: null };
const chefDarf = (k) => importErlaubt(k, CHEF).ok;

function datei(pfad) {
  const t = leseCsv(lies(DIR + pfad));
  return { name: pfad.split('/')[1], kopf: t.kopf, zeilen: t.zeilen };
}
/** Durch den Motor wie im Import-Center: Live-Katalog, Vorschlag, Pruefung. */
function durch(zielKey, d) {
  const k = katalogFuerZiel(zielKey, LIVE);
  assert.ok(k && k.ausDb, `${zielKey}: Katalog aus der Datenbank`);
  const map = vorschlagMapping(d.kopf, d.zeilen, k.ziel);
  const b = pruefeAlles(zielKey, map, d.kopf, d.zeilen, { ziel: k.ziel });
  const bil = spaltenBilanz(d.kopf, d.zeilen, map, k.ziel);
  return { map, b, bil };
}

// Gruppe -> Datei -> erwartetes Ziel ('geschuetzt:<ziel>' = gesperrt bis zur Anwalt-Freigabe)
const KARTONS = {
  handel: { '01-Kundenstamm.csv': 'kontakte', '02-Artikelstamm.csv': 'artikel', '03-Lieferanten.csv': 'lieferanten', '04-Gutscheine.csv': 'gutscheine' },
  lebensmittel: { '01-Kunden.csv': 'kontakte', '02-Artikel.csv': 'artikel', '03-HACCP-Kontrollpunkte.csv': 'haccp_plan', '04-Chargen.csv': 'chargen' },
  gastro: { '01-Gaeste.csv': 'kontakte', '02-Zimmer.csv': 'belegung', '03-Tische.csv': 'reservierung_plaetze', '04-Veranstaltungen.csv': 'veranstaltungen' },
  gesundheit: { '01-Patienten.csv': 'geschuetzt:patienten', '02-Behandlungen.csv': 'geschuetzt:praxis_behandlungen', '03-Termine.csv': 'termine' },
  tier: { '01-Tierhalter.csv': 'kontakte', '02-Tiere.csv': 'geschuetzt:tiere', '03-Impfungen.csv': 'geschuetzt:tier_behandlungen' },
  beratung: { '01-Bauherren.csv': 'kontakte', '02-Projekte.csv': 'projekte', '03-Stundenzettel.csv': 'aufwand', '04-Akten.csv': 'geschuetzt:akten', '05-Fristen.csv': 'geschuetzt:fristen' },
  immobilien: { '01-Mieter-und-Eigentuemer.csv': 'kontakte', '02-Mieteinheiten.csv': 'einheiten', '03-Mietvertraege.csv': 'mietvertraege' },
  landwirtschaft: { '01-Schlaege.csv': 'schlaege', '02-Duengung.csv': 'duengung', '03-Tierbestand.csv': 'tiergruppen' },
  verein: { '01-Mitglieder.csv': 'mitglieder', '02-Kurse.csv': 'kurse', '03-Anmeldungen.csv': 'anmeldungen', '04-Spenden.csv': 'spenden' },
};

test('Live-Katalog: alle Tabellen des Motors vorhanden', () => {
  const tabellen = new Set(LIVE.map((c) => c.tabelle));
  // Tabellen, die nach dem Katalog-Stand vom 28.09.2026 dazukamen (Paket 283: kfz_bestand)
  const spaeter = new Set(['kfz_bestand']);
  for (const t of MOTOR_TABELLEN) if (!spaeter.has(t)) assert.ok(tabellen.has(t), `live fehlt ${t}`);
});

for (const [gruppe, dateien] of Object.entries(KARTONS)) {
  test(`Karton ${gruppe}: jede Datei am richtigen Ziel (als Chef, mit Live-Katalog)`, () => {
    for (const [name, erwartet] of Object.entries(dateien)) {
      const d = datei(`${gruppe}/${name}`);
      const e = erkenneDatei(d.name, d.kopf, d.zeilen, { dbSpalten: LIVE, erlaubt: chefDarf });
      if (erwartet.startsWith('geschuetzt:')) {
        assert.equal(e.ziel, null, `${name} darf keinem anderen Ziel zugeschlagen werden`);
        assert.equal(e.sonder?.art, 'geschuetzt', name);
        assert.equal(e.kandidaten[0].ziel, erwartet.slice(11), name);
        assert.match(e.sonder.grund, /rechtliche Prüfung/);
      } else {
        assert.equal(e.ziel, erwartet, name);
        assert.equal(e.sicher, true, `${name} sicher erkannt`);
      }
    }
  });

  test(`Karton ${gruppe}: durch den Motor — keine Zeile faellt, keine Spalte verschluckt`, () => {
    for (const [name, erwartet] of Object.entries(dateien)) {
      const ziel = erwartet.replace(/^geschuetzt:/, '');
      const d = datei(`${gruppe}/${name}`);
      const r = durch(ziel, d);
      // Verweis-Pflicht (Behandlung ohne Patient …) prueft erst die Seite mit dem Bestand — hier nur die Datei.
      assert.deepEqual(r.b.fehler, [], `${gruppe}/${name}: ${JSON.stringify(r.b.fehler.slice(0, 3))}`);
      assert.equal(r.b.gut + (r.b.zusammengefasst ?? 0), d.zeilen.length, `${gruppe}/${name}: alle Zeilen`);
      assert.equal(r.bil.verschluckt, 0, `${gruppe}/${name}: nichts verschluckt`);
    }
  });
}

test('Stichproben: Werte am richtigen Platz', () => {
  const s = (g, n, z) => durch(z, datei(`${g}/${n}`)).b.saetze;
  const art = s('handel', '02-Artikelstamm.csv', 'artikel');
  assert.equal(art[0].artikelnummer, 'FK-1001');
  // Claude-Befund Schritt 8: Ladenpreis brutto -> netto mit dem Satz der Zeile (899 / 1,19)
  assert.equal(art[0].verkaufspreis, 755.46);
  assert.equal(art[0].einkaufspreis, 489);
  assert.equal(art[0].vk_brutto, undefined);
  // Metzgerei: VK netto bleibt, wie er ist
  assert.equal(s('lebensmittel', '02-Artikel.csv', 'artikel')[0].verkaufspreis, 24.9);
  const gs = s('handel', '04-Gutscheine.csv', 'gutscheine');
  // Restwert wird der Startwert, der Ursprungswert steht in der Notiz (Paket 138)
  assert.equal(gs[1].wert, 35.5);
  assert.match(gs[1].notiz, /100,00/);
  const ch = s('lebensmittel', '04-Chargen.csv', 'chargen');
  assert.equal(ch[1].status, 'quarantaene');
  const mv = s('immobilien', '03-Mietvertraege.csv', 'mietvertraege')[0];
  assert.equal(mv.kaltmiete ?? mv.miete_kalt, 720);
  const du = s('landwirtschaft', '02-Duengung.csv', 'duengung')[0];
  assert.equal(du.datum, '2026-03-15');
  const mi = s('verein', '01-Mitglieder.csv', 'mitglieder');
  assert.ok(mi.every((m) => m.__kunde === undefined || typeof m.__kunde === 'string'));
  const fr = s('beratung', '05-Fristen.csv', 'fristen');
  assert.equal(fr[0].art, 'notfrist');
  assert.equal(fr[1].frist_datum, '2026-10-12');
  const pat = s('gesundheit', '01-Patienten.csv', 'patienten')[0];
  assert.equal(pat.name, 'Helga Brandl');
  assert.ok(pat.__gesundheit.some((g) => g.art === 'allergie' && g.text === 'Pflaster'));
  assert.equal(pat.hinweise, undefined);
});

test('Reihenfolge je Karton: erst worauf verwiesen wird', () => {
  const plan = (gruppe) => umzugPlan(Object.keys(KARTONS[gruppe]).map((n) => {
    const d = datei(`${gruppe}/${n}`);
    const e = erkenneDatei(d.name, d.kopf, d.zeilen, { dbSpalten: LIVE, erlaubt: chefDarf });
    return { datei: n, ziel: e.ziel, sonder: e.sonder, sicher: e.sicher };
  })).eintraege.map((e) => e.ziel ?? `(${e.sonder?.art})`);
  const vor = (liste, a, b) => assert.ok(liste.indexOf(a) >= 0 && liste.indexOf(a) < liste.indexOf(b), `${a} vor ${b}: ${liste.join(', ')}`);
  vor(plan('immobilien'), 'einheiten', 'mietvertraege');
  vor(plan('immobilien'), 'kontakte', 'mietvertraege');
  vor(plan('verein'), 'kurse', 'anmeldungen');
  vor(plan('landwirtschaft'), 'schlaege', 'duengung');
  vor(plan('beratung'), 'kontakte', 'projekte');
  // Geschuetzte Dateien stehen am Ende, ohne Schritt
  const g = plan('gesundheit');
  assert.equal(g[0], 'termine');
  assert.deepEqual(g.slice(1), ['(geschuetzt)', '(geschuetzt)']);
});

test('Geschuetzte Daten nie an ein anderes Ziel — auch nicht fuer Mitarbeiter und ohne Katalog', () => {
  const ma = (k) => importErlaubt(k, { chef: false, module: ['crm', 'wellness', 'tier'], schreibModule: ['crm', 'wellness', 'tier'] }).ok;
  for (const [g, n] of [['gesundheit', '01-Patienten.csv'], ['tier', '02-Tiere.csv'], ['beratung', '04-Akten.csv']]) {
    const d = datei(`${g}/${n}`);
    for (const opt of [{ erlaubt: ma }, {}, { dbSpalten: LIVE, erlaubt: ma }]) {
      const e = erkenneDatei(d.name, d.kopf, d.zeilen, opt);
      assert.equal(e.ziel, null, `${n} ${JSON.stringify(Object.keys(opt))}`);
      assert.equal(e.sonder?.art, 'geschuetzt');
    }
  }
  // Nach der Freigabe (nicht mehr gesperrt), aber ohne Recht: trotzdem nicht an die Kunden
  assert.ok(zielDef('patienten').nurChef);
  const frei = { gesundheit: true, tier: true, hilfsmittel: true, kanzlei: true };
  assert.equal(geschuetztGrund('gesundheit', true, frei), null);
  assert.match(geschuetztGrund('gesundheit', false, frei), /Geschäftsleitung/);
  assert.match(geschuetztGrund('gesundheit', true), /rechtliche Prüfung/);
  // Gesperrte/nicht erlaubte Ziele erscheinen auch nicht als Ausweich-Vorschlag
  const z = datei('gastro/02-Zimmer.csv');
  const e = erkenneDatei(z.name, z.kopf, z.zeilen, { dbSpalten: LIVE, erlaubt: chefDarf });
  assert.equal(e.ziel, 'belegung');
  for (const k of e.kandidaten) assert.ok(chefDarf(k.ziel), `Vorschlag ${k.ziel} nicht erlaubt`);
  // Kundenliste mit Geburtstag: Kunden gewinnen; Patienten (gesperrt) nie als Ausweich-Vorschlag
  const kopf = ['Vorname', 'Nachname', 'Geburtsdatum', 'E-Mail', 'Firma', 'Straße', 'PLZ', 'Ort'];
  const zeilen = [['Anna', 'Berg', '01.01.1980', 'a@example.de', 'Berg GmbH', 'Weg 1', '71032', 'Böblingen']];
  assert.ok(erkenneDatei('liste.csv', kopf, zeilen, { dbSpalten: LIVE }).kandidaten.some((k) => k.ziel === 'patienten'));
  const mitRecht = erkenneDatei('liste.csv', kopf, zeilen, { dbSpalten: LIVE, erlaubt: chefDarf });
  assert.equal(mitRecht.ziel, 'kontakte');
  assert.ok(!mitRecht.kandidaten.some((k) => k.ziel === 'patienten'));
});

test('Artikel brutto -> netto: Satz aus der Zeile, sonst Standard mit Warnung; netto geht vor', async () => {
  const { mwstAusZeile } = await import('../out/importParser.js');
  const k = katalogFuerZiel('artikel', LIVE).ziel;
  const lauf = (text) => { const t = leseCsv(text); const map = vorschlagMapping(t.kopf, t.zeilen, k); return { map, b: pruefeAlles('artikel', map, t.kopf, t.zeilen, { ziel: k }) }; };
  const a = lauf('Bezeichnung;VK brutto;MwSt\nBrot;4,28;7\nWein;11,90;19 %\n');
  assert.equal(a.map['VK brutto'], 'vk_brutto');
  assert.equal(a.map['MwSt'], EIGEN, 'MwSt bleibt als Eigenes Feld erhalten');
  assert.deepEqual(a.b.saetze.map((x) => x.verkaufspreis), [4, 10]);
  assert.equal(a.b.warnungen.filter((w) => /umgerechnet/.test(w.meldung)).length, 0);
  const ohne = lauf('Bezeichnung;Bruttopreis\nKabel;11,90\n');
  assert.equal(ohne.b.saetze[0].verkaufspreis, 10);
  assert.ok(ohne.b.warnungen.some((w) => /19 % in netto umgerechnet/.test(w.meldung)));
  const beide = lauf('Bezeichnung;VK netto;VK brutto\nKabel;10,00;11,90\n');
  assert.equal(beide.b.saetze[0].verkaufspreis, 10);
  assert.equal(mwstAusZeile(['MwSt %'], ['0,07'], {}), 7);
  assert.equal(mwstAusZeile(['MwSt'], ['45'], {}), null);
  assert.equal(mwstAusZeile(['Steuersatz'], ['19'], { Steuersatz: 'mwst_satz' }), null, 'zugeordnete Spalte nicht anfassen');
});
