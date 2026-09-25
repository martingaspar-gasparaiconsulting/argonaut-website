// Paket PS6 (25.09.2026) — Papiere & Identifizierung: Meldeschein/Kurtaxe, CMR, Tankkarte/Maut, GwG, Nutzungsrechte, Duenge-Fristen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  meldepflichtig, pruefeMeldeschein, meldescheinFristen, kurtaxe, alterAm,
  pruefeCmr, naechsteCmrNummer, leseKartenCsv, buchungsSchluessel, kraftstoffKlasse, pruefeTankung, pruefeMaut, kartenSummen,
  gwgPflicht, verbundeneBarzahlungen, pruefeIdentifizierung, gwgAufbewahrung,
  nutzungsStand, rechteKlausel,
  flaechenart, pruefeDuengung, duengeFristen,
} from '../out/papiereIdentifizierung.js';

const HEUTE = '2026-09-25';

test('Meldeschein: nur ohne deutsche Staatsangehoerigkeit, Pflichtfelder, Fristen', () => {
  assert.equal(meldepflichtig('DE'), false);
  assert.equal(meldepflichtig('deutsch, türkisch'), false);   // Doppelstaater mit DE: keine Pflicht
  assert.equal(meldepflichtig('AT'), true);
  assert.equal(meldepflichtig('Österreich / Schweiz'), true);
  assert.equal(meldepflichtig(''), null);
  const voll = { ankunft: '2026-09-20', abreise: '2026-09-23', familienname: 'Novak', vornamen: 'Jan', geburtsdatum: '1980-01-01', staatsangehoerigkeit: 'CZ', anschrift: 'Praha', ausweis_nr: 'X1', unterschrift: 'data:x' };
  assert.equal(pruefeMeldeschein(voll).vollstaendig, true);
  const r = pruefeMeldeschein({ ...voll, ausweis_nr: '', unterschrift: null });
  assert.deepEqual(r.fehlt, ['Seriennummer des Passes/Ausweises', 'Unterschrift']);
  assert.ok(pruefeMeldeschein({ ...voll, mitreisende_anzahl: 2 }).fehlt.includes('Staatsangehörigkeiten der Mitreisenden'));
  assert.equal(pruefeMeldeschein({ ...voll, abreise: '2026-09-19' }).befunde[0].stufe, 'rot');
  assert.ok(pruefeMeldeschein({ ...voll, staatsangehoerigkeit: 'DE' }).befunde.some((b) => /auf Vorrat/.test(b.text)));
  assert.deepEqual(meldescheinFristen('2025-09-10', HEUTE), { aufbewahrenBis: '2026-09-10', vernichtenBis: '2026-12-10', stufe: 'gelb', text: 'jetzt vernichten (spätestens 10.12.2026)' });
  assert.equal(meldescheinFristen('2025-09-25', HEUTE).stufe, 'ok');
  assert.equal(meldescheinFristen('2025-05-01', HEUTE).stufe, 'rot');
  assert.equal(meldescheinFristen(null, HEUTE).stufe, null);
});

test('Kurtaxe: Naechte, Kinder, frei, Hoechstnaechte, fehlender Satz', () => {
  assert.equal(alterAm('2014-09-26', '2026-09-25'), 11);
  assert.equal(alterAm('2014-09-25', '2026-09-25'), 12);
  const s = { satz_erwachsen: '2,50', satz_kind: '1,20', kind_bis_alter: 15, frei_bis_alter: 5 };
  const r = kurtaxe('2026-09-20', '2026-09-24', [{ name: 'A', alter: 40 }, { name: 'B', geburtsdatum: '2014-01-01' }, { name: 'C', alter: 4 }], s);
  assert.equal(r.naechte, 4);
  assert.deepEqual(r.zeilen.map((z) => z.betragCent), [1000, 480, 0]);
  assert.equal(r.summeCent, 1480);
  assert.equal(kurtaxe('2026-09-01', '2026-09-30', [{ alter: 40 }], { ...s, max_naechte: 21 }).summeCent, 21 * 250);
  assert.equal(kurtaxe('2026-09-20', '2026-09-24', [{ alter: 40, befreit: true }], s).summeCent, 0);
  assert.equal(kurtaxe('2026-09-20', '2026-09-24', [{ alter: 40 }], { satz_erwachsen: '' }).ok, false);
  assert.equal(kurtaxe('2026-09-24', '2026-09-24', [{ alter: 40 }], s).ok, false);
  assert.equal(kurtaxe('2026-09-20', '2026-09-21', [{}], s).zeilen[0].grund, 'Erwachsene (Alter unbekannt)');
});

test('CMR: Pflichtangaben, Gefahrgut, Inland-Hinweis, Nummer', () => {
  const c = {
    ausgestellt_ort: 'Böblingen', ausgestellt_am: '2026-09-25', absender: 'A GmbH', absender_land: 'DE', frachtfuehrer: 'Spedition B', uebernahme_ort: 'Böblingen', uebernahme_datum: '2026-09-25',
    ablieferung_ort: 'Linz', empfaenger: 'C GmbH', empfaenger_land: 'AT',
    positionen: [{ zeichen: 'A1', anzahl: '2', verpackung: 'Palette', bezeichnung: 'Maschinenteile', gewicht_kg: '1.200,5' }, { anzahl: 1, verpackung: 'Kiste', bezeichnung: 'Ersatzteile', gewicht_kg: 80 }],
  };
  const r = pruefeCmr(c);
  assert.equal(r.vollstaendig, true);
  assert.equal(r.gewichtKg, 1280.5);
  assert.equal(r.packstuecke, 3);
  const f = pruefeCmr({ ...c, frachtfuehrer: '', positionen: [{ bezeichnung: 'X' }] });
  assert.ok(f.fehlt.includes('Frachtführer (c)'));
  assert.ok(f.fehlt.includes('Position 1: Rohgewicht (h)'));
  assert.equal(f.gewichtKg, null);
  assert.ok(pruefeCmr({ ...c, positionen: [] }).fehlt.some((x) => /mindestens eine/.test(x)));
  assert.ok(pruefeCmr({ ...c, empfaenger_land: 'de' }).befunde.some((b) => /§ 408 HGB/.test(b.text)));
  assert.ok(pruefeCmr({ ...c, gefahrgut: [{ un_nr: '120', bezeichnung: 'Aceton', klasse: '3' }] }).fehlt.some((x) => /UN-Nummer/.test(x)));
  assert.equal(pruefeCmr({ ...c, gefahrgut: [{ un_nr: 'UN 1090', bezeichnung: 'ACETON', klasse: '3', vg: 'II' }] }).vollstaendig, true);
  assert.equal(naechsteCmrNummer(['CMR-2026-004', 'CMR-2025-099', null, 'x'], 2026), 'CMR-2026-005');
  assert.equal(naechsteCmrNummer([], 2026), 'CMR-2026-001');
});

test('Tankkarte/Maut: CSV lesen, Schluessel, Pruefungen, Summen', () => {
  const csv = '﻿Datum;Uhrzeit;Kennzeichen;Produkt;Menge;Betrag;Tankstelle\n24.09.2026;07:10;BB-AB 123;Diesel;60,5;105,30;Sindelfingen\n26.09.2026;23:15;bb ab123;Super E10;40;70,00;Stuttgart\nkaputt;;;;;;\n25.09.2026;12:00;S-XY 9;Autowäsche;;12,00;Böblingen';
  const { zeilen, fehler } = leseKartenCsv(csv);
  assert.equal(zeilen.length, 3);
  assert.equal(fehler.length, 1);
  assert.equal(zeilen[0].liter, 60.5);
  assert.equal(zeilen[0].betrag, 105.3);
  assert.equal(zeilen[0].datum, '2026-09-24');
  assert.equal(buchungsSchluessel(zeilen[0]), buchungsSchluessel({ ...zeilen[0], kennzeichen: 'bb-ab 123' }));
  assert.equal(kraftstoffKlasse('AdBlue'), 'adblue');
  assert.equal(kraftstoffKlasse('Super E10'), 'benzin');
  assert.equal(kraftstoffKlasse('Ladestrom kWh'), 'strom');
  const fz = [{ id: '1', kennzeichen: 'BB-AB 123', bezeichnung: 'Sprinter 1', kraftstoff: 'Diesel', tank_liter: 75 }];
  const touren = [{ datum: '2026-09-24', fahrzeug: 'Sprinter 1' }];
  assert.deepEqual(pruefeTankung(zeilen[0], fz, touren, zeilen), []);
  const b2 = pruefeTankung(zeilen[1], fz, touren, zeilen);
  assert.ok(b2.some((b) => /passt nicht/.test(b.text)));
  assert.ok(b2.some((b) => /keine Tour/.test(b.text)));
  assert.ok(b2.some((b) => /Wochenende/.test(b.text)));
  assert.ok(b2.some((b) => /nachts/.test(b.text)));
  assert.ok(pruefeTankung(zeilen[2], fz, touren, zeilen).some((b) => /nicht im Fuhrpark/.test(b.text)));
  assert.ok(pruefeTankung({ ...zeilen[0], liter: 90, betrag: 150 }, fz, touren, zeilen).some((b) => /mehr als der Tank/.test(b.text)));
  const zwei = [zeilen[0], { ...zeilen[0], zeit: '15:00', liter: 30, betrag: 52 }];
  assert.ok(pruefeTankung(zwei[1], fz, touren, zwei).some((b) => /Am selben Tag zusammen/.test(b.text)));
  assert.ok(pruefeTankung({ ...zeilen[0], betrag: 20 }, fz, touren, zeilen).some((b) => /Literpreis/.test(b.text)));
  const maut = leseKartenCsv('Datum,Kennzeichen,Strecke km,Betrag\n2026-09-23,BB-AB 123,120,"41,40"').zeilen;
  assert.equal(maut[0].km, 120);
  assert.equal(maut[0].betrag, 41.4);
  assert.ok(pruefeMaut(maut[0], fz, touren).some((b) => /ohne Tour/.test(b.text)));
  assert.deepEqual(pruefeMaut({ ...maut[0], datum: '2026-09-24' }, fz, touren), []);
  const s = kartenSummen([{ ...zeilen[0], art: 'tanken' }, { ...zeilen[1], art: 'tanken' }, { ...maut[0], art: 'maut' }], '2026-09');
  assert.equal(s[0].tankenCent, 17530);
  assert.equal(s[0].mautCent, 4140);
  assert.equal(s[0].mautKm, 120);
  assert.deepEqual(leseKartenCsv('Name;Wert\na;b').fehler, ['Spalten „Datum" und „Kennzeichen" nicht gefunden.']);
});

test('GwG: Pflicht je Bereich, verbundene Zahlungen, Vollstaendigkeit, Aufbewahrung', () => {
  assert.equal(gwgPflicht({ bereich: 'kfz', bar: '9.999,99' }).pflichtig, false);
  assert.equal(gwgPflicht({ bereich: 'kfz', bar: 10000 }).pflichtig, true);
  assert.equal(gwgPflicht({ bereich: 'handel', ware: 'edelmetall', bar: 2000 }).pflichtig, true);
  assert.equal(gwgPflicht({ bereich: 'handel', ware: 'kunst', betrag: 12000 }).pflichtig, true);
  assert.equal(gwgPflicht({ bereich: 'immobilien', makler: 'kauf' }).pflichtig, true);
  assert.equal(gwgPflicht({ bereich: 'immobilien', makler: 'miete', monatsmiete: 2500 }).pflichtig, false);
  assert.equal(gwgPflicht({ bereich: 'immobilien', makler: 'miete', monatsmiete: 10000 }).pflichtig, true);
  assert.equal(gwgPflicht({ bereich: 'kanzlei', katalog: [] }).pflichtig, false);
  assert.equal(gwgPflicht({ bereich: 'kanzlei', katalog: ['gesellschaft'] }).pflichtig, true);
  const v = verbundeneBarzahlungen([{ kunde: 'Max Muster', datum: '2026-09-01', bar: 6000 }, { kunde: 'Andere', datum: '2026-09-01', bar: 9000 }], ' max muster ', HEUTE, 5000);
  assert.deepEqual(v, { summe: 11000, anzahl: 2, erreicht: true });
  assert.equal(verbundeneBarzahlungen([{ kunde: 'Max', datum: '2024-01-01', bar: 6000 }], 'Max', HEUTE, 5000).erreicht, false);
  const p = { art: 'natuerlich', nachname: 'Muster', vornamen: 'Max', geburtsdatum: '1970-01-01', geburtsort: 'Ulm', staatsangehoerigkeit: 'deutsch', anschrift: 'Böblingen', ausweis_art: 'Personalausweis', ausweis_nr: 'L01X', ausweis_behoerde: 'Stadt Böblingen', ausweis_gueltig_bis: '2030-01-01' };
  assert.equal(pruefeIdentifizierung(p, HEUTE).vollstaendig, true);
  assert.ok(pruefeIdentifizierung({ ...p, ausweis_gueltig_bis: '2026-09-24' }, HEUTE).befunde.some((b) => b.stufe === 'rot'));
  assert.deepEqual(pruefeIdentifizierung({ ...p, geburtsort: '' }, HEUTE).fehlt, ['Geburtsort']);
  const pep = pruefeIdentifizierung({ ...p, pep: true }, HEUTE);
  assert.ok(pep.fehlt.includes('Herkunft der Mittel (verstärkte Sorgfalt)'));
  assert.ok(pep.fehlt.includes('Zustimmung der Geschäftsleitung (verstärkte Sorgfalt)'));
  const j = pruefeIdentifizierung({ ...p, art: 'juristisch', anschrift: '' }, HEUTE);
  assert.ok(j.fehlt.includes('Firma/Name'));
  assert.ok(j.fehlt.includes('Transparenzregister-Auszug eingesehen'));
  assert.ok(j.fehlt.includes('Anschrift Sitz'));
  assert.equal(j.fehlt.includes('Wohnanschrift'), false);
  assert.deepEqual(gwgAufbewahrung('2021-03-01', HEUTE), { bis: '2026-12-31', spaetestens: '2031-12-31', stufe: 'ok', text: 'aufbewahren bis 31.12.2026' });
  assert.equal(gwgAufbewahrung('2020-03-01', HEUTE).stufe, 'gelb');
  assert.equal(gwgAufbewahrung('2015-03-01', HEUTE).stufe, 'rot');
});

test('Nutzungsrechte: Ablauf, Fremdrecht, Medien, Klausel', () => {
  const n = { werk: 'Kampagne Herbst', kunde: 'Kunde X', recht: 'einfach', medien: ['Website', 'Print'], von: '2026-01-01', bis: '2026-11-15' };
  assert.equal(nutzungsStand(n, HEUTE)[0].stufe, 'gelb');
  assert.equal(nutzungsStand({ ...n, bis: '2027-06-01' }, HEUTE)[0].stufe, 'ok');
  assert.equal(nutzungsStand({ ...n, bis: '2026-09-24' }, HEUTE)[0].stufe, 'rot');
  const f = nutzungsStand({ ...n, bis: '2027-12-31', recht: 'ausschliesslich', urheber: 'Foto Meier', fremd_recht: 'einfach', fremd_bis: '2027-06-30', fremd_medien: ['Website'] }, HEUTE);
  assert.equal(f.filter((b) => b.stufe === 'rot').length, 3);
  assert.ok(f.some((b) => /Print/.test(b.text)));
  assert.ok(nutzungsStand({ ...n, bis: null, urheber: 'X', fremd_bis: '2027-01-01' }, HEUTE).some((b) => /früher als/.test(b.text)));
  assert.ok(nutzungsStand({ ...n, medien: [] }, HEUTE).some((b) => /31 Abs. 5/.test(b.text)));
  const k = rechteKlausel({ ...n, urheber: 'Foto Meier' }, 'Agentur Nord');
  assert.match(k, /das einfache Recht/);
  assert.match(k, /bis zum 15\.11\.2026/);
  assert.match(k, /Website, Print/);
  assert.match(k, /© Foto Meier/);
  assert.match(rechteKlausel({ ...n, bis: null, medien: [] }, ''), /\[Nutzungsarten\]/);
});

test('Duenge-Fristen: Bedarf vorher, 2 Tage, Sperrfristen je Flaechenart, Kalender', () => {
  assert.equal(flaechenart('Dauergrünland'), 'gruenland');
  assert.equal(flaechenart('Winterweizen'), 'acker');
  assert.equal(flaechenart('Weizen', 'gruenland'), 'gruenland');
  const m = { id: '1', schlag_id: 's', datum: '2026-04-10', erstellt_am: '2026-04-11T08:00:00Z', mittel: 'KAS' };
  assert.deepEqual(pruefeDuengung(m, { kultur: 'Weizen' }, '2026-02-15'), []);
  assert.ok(pruefeDuengung(m, { kultur: 'Weizen' }, null).some((b) => /Keine Düngebedarfsermittlung/.test(b.text)));
  assert.ok(pruefeDuengung(m, { kultur: 'Weizen' }, '2026-04-12').some((b) => /nach der Düngung/.test(b.text)));
  assert.ok(pruefeDuengung({ ...m, erstellt_am: '2026-04-13' }, { kultur: 'Weizen' }, '2026-02-15').some((b) => /später als 2 Tage/.test(b.text)));
  assert.ok(pruefeDuengung({ ...m, datum: '2026-11-10', erstellt_am: null }, { kultur: 'Weizen' }, '2026-02-15').some((b) => /Ackerland nach der Ernte/.test(b.text)));
  assert.ok(pruefeDuengung({ ...m, datum: '2026-09-10', erstellt_am: null }, { kultur: 'Weizen' }, '2026-02-15').some((b) => b.stufe === 'gelb'));
  assert.deepEqual(pruefeDuengung({ ...m, datum: '2026-10-20', erstellt_am: null }, { kultur: 'Wiese' }, '2026-02-15'), []);
  assert.ok(pruefeDuengung({ ...m, datum: '2026-10-20', erstellt_am: null }, { kultur: 'Wiese', rotes_gebiet: true }, '2026-02-15').some((b) => /15\.10\./.test(b.text)));
  assert.ok(pruefeDuengung({ ...m, datum: '2027-01-10', erstellt_am: null, mittel: 'Festmist' }, { kultur: 'Wiese' }, '2027-01-02').some((b) => /Festmist/.test(b.text)));
  assert.deepEqual(pruefeDuengung({ ...m, datum: '2027-01-20', erstellt_am: null, mittel: 'Festmist' }, { kultur: 'Weizen' }, '2027-01-02').filter((b) => /Festmist/.test(b.text)), []);
  const k = duengeFristen(HEUTE);
  assert.ok(k.every((f) => f.datum >= '2026-08-26' && f.datum <= '2027-09-25'));
  assert.equal(k.find((f) => f.datum === '2026-12-01').stufe, 'ok');
  assert.ok(k.some((f) => f.datum === '2027-03-31' && /2026/.test(f.titel)));
  assert.ok(duengeFristen(HEUTE, true).some((f) => f.datum === '2026-10-15'));
  assert.equal(duengeFristen('2026-09-20').find((f) => f.datum === '2026-10-01').stufe, 'gelb'); // 11 Tage vorher
});

test('Rechte: die neuen Seiten verhalten sich exakt wie ihr Eltern-Modul', async () => {
  const { mitarbeiterDarf, NAV_LINKS } = await import('../out/rechte.js');
  const seiten = [
    ['/dashboard/gastro/meldeschein', '/dashboard/gastro', 'gastro'],
    ['/dashboard/logistik/cmr', '/dashboard/logistik', 'logistik'],
    ['/dashboard/logistik/tankkarten', '/dashboard/logistik', 'logistik'],
    ['/dashboard/kanzlei/gwg', '/dashboard/kanzlei', 'kanzlei'],
    ['/dashboard/immobilien/gwg', '/dashboard/immobilien', 'immobilien'],
    ['/dashboard/kfz/gwg', '/dashboard/kfz', 'kfz'],
    ['/dashboard/agentur/nutzungsrechte', '/dashboard/agentur', 'agentur-kreativ'],
    ['/dashboard/landwirtschaft/duengung', '/dashboard/landwirtschaft', 'landwirtschaft'],
  ];
  for (const [pfad, eltern, modul] of seiten) {
    const eintrag = NAV_LINKS.find((l) => l.href === pfad);
    assert.ok(eintrag, `${pfad} fehlt im Menue`);
    assert.equal(eintrag.modul, undefined, pfad);
    for (const rechte of [[], [modul], ['anderes']]) {
      assert.equal(mitarbeiterDarf(pfad, rechte), mitarbeiterDarf(eltern, rechte), `${pfad} mit ${JSON.stringify(rechte)}`);
    }
  }
});
