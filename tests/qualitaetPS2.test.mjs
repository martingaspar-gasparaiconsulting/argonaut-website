// Paket PS2 (24.09.2026) — Qualitaet & Rueckverfolgung.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  plusTage, tageZwischen, naechsteNummer, schrittFrist, naechsterSchritt, schrittStaende, abschlussSperre, rekStatus, rekZahlen, berichtText,
  gesamtWert, klasse, bewertungsHinweise, reklamationenGegen, bewertungFaellig,
  normCharge, betroffeneChargen, abnehmerListe, mengenBilanz, abnehmerText, offenePlatzhalter, RUECKRUF_SCHRITTE,
  mhdWarnungen, leseHSaetze, istCmr, pruefeGefahrstoff, verzeichnisZeilen, SCHRITTE,
} from '../out/qualitaet.js';

const HEUTE = '2026-09-24';
const alle = (bis, datum = '2026-09-01') => Object.fromEntries(SCHRITTE.filter((s) => s.key !== 'D8' && s.key <= bis).map((s) => [s.key, { text: 'x', erledigt_am: datum }]));

test('Nummern: R-JJJJ-NNN, Luecken nicht auffuellen, anderes Jahr faengt neu an', () => {
  assert.equal(naechsteNummer([], 2026), 'R-2026-001');
  assert.equal(naechsteNummer(['R-2026-001', 'R-2026-007', 'R-2025-099', null], 2026), 'R-2026-008');
  assert.equal(naechsteNummer(['R-2025-099'], 2026), 'R-2026-001');
});

test('8D-Fristen: Richtwert ab Eingang, eigene Frist geht vor, Monatswechsel stimmt', () => {
  const r = { eingang_am: '2026-09-30', schritte: {} };
  assert.equal(schrittFrist(r, 'D3'), '2026-10-01');
  assert.equal(schrittFrist(r, 'D4'), '2026-10-10');
  assert.equal(schrittFrist({ ...r, schritte: { D4: { frist: '2026-10-05' } } }, 'D4'), '2026-10-05');
  assert.equal(schrittFrist({ schritte: {} }, 'D3'), null);
  assert.equal(plusTage('2028-02-28', 1), '2028-02-29');
  assert.equal(tageZwischen('2026-03-28', '2026-03-30'), 2); // Zeitumstellung egal
});

test('8D: naechster Schritt, Ueberfaelligkeit, Status', () => {
  const r = { eingang_am: '2026-09-20', schritte: { D1: { text: 'Team', erledigt_am: '2026-09-20' } } };
  assert.equal(naechsterSchritt(r), 'D2');
  const st = schrittStaende(r, HEUTE);
  assert.equal(st.find((s) => s.key === 'D3').ueberfaellig, true);
  assert.equal(st.find((s) => s.key === 'D1').ueberfaellig, false);
  assert.equal(rekStatus(r), 'in_arbeit');
  assert.equal(rekStatus({ schritte: {} }), 'offen');
});

test('8D: Abschluss erst mit D1-D7 erledigt, mit Text UND bestaetigter Wirksamkeit', () => {
  const r = { eingang_am: '2026-09-01', schritte: alle('D7'), wirksam: false };
  assert.ok(abschlussSperre(r).some((g) => /Wirksamkeit/.test(g)));
  assert.deepEqual(abschlussSperre({ ...r, wirksam: true }), []);
  const ohneText = { ...r, wirksam: true, schritte: { ...alle('D7'), D4: { text: '  ', erledigt_am: '2026-09-02' } } };
  assert.ok(abschlussSperre(ohneText).some((g) => /D4/.test(g)));
  const d5offen = { ...r, wirksam: true, schritte: alle('D4') };
  assert.ok(abschlussSperre(d5offen).some((g) => /D5/.test(g)));
});

test('8D: Zahlen und Bericht', () => {
  const liste = [
    { eingang_am: '2026-09-01', schritte: {}, kosten: '1.200,50' },
    { eingang_am: '2026-08-01', abgeschlossen_am: '2026-08-21', schritte: alle('D7'), kosten: 99.5 },
  ];
  const z = rekZahlen(liste, HEUTE);
  assert.equal(z.offen, 1); assert.equal(z.ueberfaellig, 1); assert.equal(z.abgeschlossen, 1);
  assert.equal(z.kosten, 1300); assert.equal(z.mittlereTage, 20);
  const b = berichtText({ nummer: 'R-2026-001', richtung: 'kunde', eingang_am: '2026-09-01', schritte: { D1: { text: 'Anna, Bernd', erledigt_am: '2026-09-01' } }, wirksam: false });
  assert.match(b, /8D-Bericht R-2026-001/);
  assert.match(b, /D1 Team \(erledigt 01\.09\.2026\)\nAnna, Bernd/);
  assert.match(b, /D2 Problem beschreiben \(offen\)/);
  assert.match(b, /Wirksamkeit bestätigt: nein/);
});

test('Lieferanten-Bewertung: Gewichte, ohne Qualitaet kein Wert, Klassen', () => {
  assert.equal(gesamtWert({ qualitaet: 5, liefertreue: 5, preis: 5, service: 5 }), 100);
  assert.equal(gesamtWert({ qualitaet: 1, liefertreue: 1, preis: 1, service: 1 }), 0);
  assert.equal(gesamtWert({ qualitaet: 5, liefertreue: 1 }), Math.round((100 * 40) / 70));
  assert.equal(gesamtWert({ liefertreue: 5, preis: 5, service: 5 }), null);
  assert.equal(gesamtWert({ qualitaet: 7 }), null);
  assert.equal(klasse(80), 'A'); assert.equal(klasse(79), 'B'); assert.equal(klasse(59), 'C'); assert.equal(klasse(null), null);
});

test('Lieferanten: Reklamationen im Zeitraum, Hinweise, Faelligkeit', () => {
  const rek = [
    { richtung: 'lieferant', lieferant_id: 'L1', eingang_am: '2026-05-01' },
    { richtung: 'lieferant', lieferant_id: 'L1', eingang_am: '2025-01-01' },
    { richtung: 'kunde', lieferant_id: 'L1', eingang_am: '2026-06-01' },
  ];
  assert.equal(reklamationenGegen('L1', rek, HEUTE), 1);
  assert.ok(bewertungsHinweise({ qualitaet: 5 }, 1).some((h) => /obwohl 1 Reklamation/.test(h)));
  assert.deepEqual(bewertungsHinweise({ qualitaet: 3 }, 1), []);
  assert.equal(bewertungFaellig(null, HEUTE).faellig, true);
  assert.equal(bewertungFaellig({ datum: '2026-01-01', klasse: 'A' }, HEUTE).faellig, false);
  assert.equal(bewertungFaellig({ datum: '2026-01-01', klasse: 'C' }, HEUTE).faellig, true);
});

test('Rueckruf: Rohstoff-Charge zieht Folgechargen ueber mehrere Stufen mit, Kreise enden', () => {
  const lose = [
    { id: 'r', charge_nr: 'MEHL-7' }, { id: 't', charge_nr: 'TEIG-1' }, { id: 'b', charge_nr: 'BROT-3' }, { id: 'x', charge_nr: 'ANDERE' },
  ];
  const vw = [
    { los_id: 't', richtung: 'eingang', referenz: 'Charge mehl 7' },
    { los_id: 'b', richtung: 'eingang', referenz: 'TEIG-1' },
    { los_id: 'r', richtung: 'eingang', referenz: 'BROT-3' }, // Kreis in den Daten
    { los_id: 'x', richtung: 'eingang', referenz: 'MEHL-8' },
    { los_id: 'x', richtung: 'ausgang', referenz: 'Mehl-7' }, // ein AUSGANG mit gleicher Nummer zieht nichts mit
    { los_id: 'b', richtung: 'ausgang', referenz: 'Kunde Meier', menge: '40', datum: '2026-09-10' },
    { los_id: 't', richtung: 'ausgang', referenz: 'Kunde Schulz', menge: 5, datum: '2026-09-09' },
    { los_id: 'x', richtung: 'ausgang', referenz: 'Kunde Fremd', menge: 1 },
  ];
  const betr = betroffeneChargen('r', lose, vw).map((l) => l.id);
  assert.deepEqual(betr, ['r', 't', 'b']);
  const ab = abnehmerListe(betroffeneChargen('r', lose, vw), vw);
  assert.deepEqual(ab.map((a) => a.referenz), ['Kunde Schulz', 'Kunde Meier']);
  assert.equal(normCharge('Ch. MEHL-7'), 'mehl7');
  assert.deepEqual(betroffeneChargen('gibtsnicht', lose, vw), []);
});

test('Rueckruf: Mengenbilanz kappt nicht still, Text mit Platzhaltern, Checklisten mit Rechtsgrundlage', () => {
  const ab = [{ menge: 40 }, { menge: 5 }];
  const b = mengenBilanz('100', ab, { a: '30', b: 10 });
  assert.deepEqual([b.hergestellt, b.ausgeliefert, b.zurueck, b.imHaus, b.draussen, b.vollstaendig], [100, 45, 40, 55, 5, false]);
  const zuviel = mengenBilanz(100, ab, { a: 50 });
  assert.equal(zuviel.draussen, -5);
  assert.equal(zuviel.vollstaendig, true);
  const unbekannt = mengenBilanz(10, [{ menge: 5 }, { menge: null }], { a: 5 });
  assert.equal(unbekannt.ohneMenge, 1);
  assert.equal(unbekannt.vollstaendig, false);
  const t = abnehmerText('lebensmittel', 'Roggenbrot', ['BROT-3'], 'Fremdkörper');
  assert.match(t, /Roggenbrot, Charge\(n\) BROT-3/);
  assert.ok(offenePlatzhalter(t).includes('[Firma]'));
  assert.ok(RUECKRUF_SCHRITTE.lebensmittel.some((s) => /178\/2002/.test(s.grundlage ?? '')));
  assert.ok(RUECKRUF_SCHRITTE.produkt.some((s) => /2023\/988/.test(s.grundlage ?? '')));
});

test('MHD-Warnung: beide Quellen, abgelaufene zuerst, gesperrte/verbrauchte raus', () => {
  const w = mhdWarnungen([
    { id: '1', quelle: 'lm_chargen', bezeichnung: 'Joghurt', mhd: '2026-09-30', status: 'aktiv' },
    { id: '2', quelle: 'charge_los', bezeichnung: 'Kleber', mhd: '2026-09-20', status: 'freigegeben' },
    { id: '3', quelle: 'lm_chargen', bezeichnung: 'Milch', mhd: '2026-09-24' },
    { id: '4', quelle: 'lm_chargen', bezeichnung: 'Alt', mhd: '2026-09-01', status: 'gesperrt' },
    { id: '5', quelle: 'charge_los', bezeichnung: 'Leer', mhd: '2026-09-02', status: 'verbraucht' },
    { id: '6', quelle: 'lm_chargen', bezeichnung: 'Spaeter', mhd: '2026-12-01' },
    { id: '7', quelle: 'lm_chargen', bezeichnung: 'Ohne', mhd: null },
  ], HEUTE, 14);
  assert.deepEqual(w.map((x) => x.id), ['2', '3', '1']);
  assert.deepEqual(w.map((x) => x.stufe), ['abgelaufen', 'heute', 'bald']);
});

test('Gefahrstoffe: H-Saetze lesen, CMR erkennen, Pflichtangaben rot, Verzeichnis', () => {
  assert.deepEqual(leseHSaetze('H225, h319 / EUH066; H360FD und H350i'), ['H225', 'H319', 'EUH066', 'H360FD', 'H350I']);
  assert.equal(istCmr(['H225', 'H319']), false);
  assert.equal(istCmr(['H350I']), true);
  assert.equal(istCmr(['H361']), false); // Kategorie 2 ist nicht 1A/1B
  const leer = pruefeGefahrstoff({ bezeichnung: 'Aceton' }, HEUTE);
  assert.equal(leer.stufe, 'rot');
  assert.ok(leer.fehler.some((f) => /Einstufung/.test(f)));
  assert.ok(leer.fehler.some((f) => /Betriebsanweisung/.test(f)));
  const gut = { bezeichnung: 'Aceton', h_saetze: 'H225 H319 H336 EUH066', piktogramme: ['GHS02', 'GHS07'], mengenbereich: '10–100 kg/l', arbeitsbereiche: 'Lackiererei', sdb_datum: '2025-03-01', betriebsanweisung_am: '2025-04-01' };
  assert.equal(pruefeGefahrstoff(gut, HEUTE).stufe, 'gruen');
  assert.equal(pruefeGefahrstoff({ ...gut, sdb_datum: '2021-01-01' }, HEUTE).stufe, 'gelb');
  const cmr = pruefeGefahrstoff({ ...gut, h_saetze: 'H350' }, HEUTE);
  assert.equal(cmr.cmr, true); assert.equal(cmr.stufe, 'rot');
  assert.equal(pruefeGefahrstoff({ ...gut, h_saetze: 'H350', ersatz_geprueft_am: '2026-01-01' }, HEUTE).stufe, 'gelb');
  const v = verzeichnisZeilen([{ ...gut, bezeichnung: 'Zement' }, gut]);
  assert.equal(v[0][0], 'Bezeichnung'); assert.equal(v[1][0], 'Aceton'); assert.equal(v[2][0], 'Zement');
  assert.equal(v[1][7], '01.03.2025');
});
