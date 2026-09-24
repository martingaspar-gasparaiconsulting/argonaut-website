// Paket PP (24.09.2026) — Chef-Blick (B30).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  berlinTag, isoWoche, wochenListe, auslastung, ampelFuer, projektWarnungen, morgenSatz,
  monatsListe, umsatzJeMonat, forderungen, zahlungsdauer,
} from '../out/chefPaket.js';

test('Kalenderwochen: ISO-Woche und Jahreswechsel', () => {
  assert.deepEqual(isoWoche('2026-09-24'), { jahr: 2026, kw: 39 });
  assert.deepEqual(isoWoche('2027-01-01'), { jahr: 2026, kw: 53 });
  assert.deepEqual(isoWoche('2026-01-01'), { jahr: 2026, kw: 1 });
  const w = wochenListe('2026-09-24', 3);
  assert.deepEqual(w.map((x) => [x.kw, x.montag, x.sonntag]), [[39, '2026-09-21', '2026-09-27'], [40, '2026-09-28', '2026-10-04'], [41, '2026-10-05', '2026-10-11']]);
  assert.equal(wochenListe('2026-09-21', 1)[0].montag, '2026-09-21', 'Montag bleibt Montag');
  assert.equal(wochenListe('2026-09-27', 1)[0].montag, '2026-09-21', 'Sonntag gehoert zur Woche davor');
  assert.equal(berlinTag('2026-09-27T22:30:00Z'), '2026-09-28', 'Sonntag spaet UTC = Montag in Berlin');
});

test('Auslastung: je Woche, Soll, Ampel, Abgesagte, ohne Monteur, Chef-Einsaetze', () => {
  const wochen = wochenListe('2026-09-24', 2);
  const monteure = [{ id: 'a', name: 'A', wochenstunden: 40 }, { id: 'b', name: 'B', wochenstunden: null }];
  const e = [
    { mitarbeiter_id: 'a', beginn_am: '2026-09-22T06:00:00Z', ende_am: '2026-09-22T14:00:00Z' },
    { mitarbeiter_id: 'a', beginn_am: '2026-09-23T06:00:00Z', ende_am: '2026-09-23T14:00:00Z', status: 'abgesagt' },
    { mitarbeiter_id: 'a', beginn_am: '2026-09-29T06:00:00Z', ende_am: '2026-09-29T08:00:00Z' },
    { mitarbeiter_id: 'b', beginn_am: '2026-09-25T06:00:00Z', ende_am: '2026-09-25T10:30:00Z' },
    { mitarbeiter_id: null, beginn_am: '2026-09-26T06:00:00Z', ende_am: '2026-09-26T09:00:00Z' },
    { mitarbeiter_id: null, inhaber_einsatz: true, beginn_am: '2026-09-26T06:00:00Z', ende_am: '2026-09-26T09:00:00Z' },
    { mitarbeiter_id: 'a', beginn_am: '2026-12-01T06:00:00Z', ende_am: '2026-12-01T09:00:00Z' },
  ];
  const r = auslastung(monteure, e, wochen);
  assert.deepEqual(r.zeilen[0].zellen.map((z) => [z.stunden, z.quote, z.ampel]), [[8, 20, 'gruen'], [2, 5, 'gruen']]);
  assert.deepEqual(r.zeilen[1].zellen.map((z) => [z.stunden, z.soll, z.quote]), [[4.5, null, null], [0, null, null]]);
  assert.deepEqual(r.ohne, [3, 0]);
  assert.equal(r.summe[0].stunden, 12.5);
  assert.equal(r.summe[0].soll, null, 'ein Monteur ohne Soll -> keine Gesamtquote');
  assert.equal(ampelFuer(0, 40), 'leer');
  assert.equal(ampelFuer(33, 40), 'gelb');
  assert.equal(ampelFuer(41, 40), 'rot');
});

test('Fruehwarnung: Aufgaben, Maengel, Nachtraege, Stillstand, Rangfolge', () => {
  const h = '2026-09-24';
  const w = projektWarnungen({
    heute: h,
    projekte: [{ id: 'p1', name: 'Bad Meier' }, { id: 'p2', name: 'Dach Huber' }, { id: 'p3', name: 'Ruhig' }],
    aufgaben: [
      { projekt_id: 'p1', faellig_am: '2026-09-20', erstellt_am: '2026-09-20' },
      { projekt_id: 'p1', faellig_am: '2026-09-20', erledigt: true, erstellt_am: '2026-09-20' },
      { projekt_id: 'p2', faellig_am: '2026-10-20', erstellt_am: '2026-08-01' },
      { projekt_id: 'p3', faellig_am: '2026-10-20', erstellt_am: '2026-09-23' },
    ],
    maengel: [{ projekt_id: 'p1', status: 'offen', frist: '2026-09-01' }, { projekt_id: 'p2', status: 'behoben', frist: '2026-09-01' }],
    nachtraege: [{ projekt_id: 'p2', status: 'angeboten', antwort_bis: '2026-09-30' }, { projekt_id: 'p1', status: 'entdeckt' }],
  });
  assert.deepEqual(w.map((x) => x.projekt.id), ['p1', 'p2']);
  assert.deepEqual(w[0].signale.map((s) => s.schwere), [3, 2, 2]);
  assert.match(w[0].signale.map((s) => s.text).join('|'), /1 Aufgabe überfällig/);
  assert.match(w[1].signale.map((s) => s.text).join('|'), /warten auf Beauftragung/);
  assert.match(w[1].signale.map((s) => s.text).join('|'), /keine Bewegung/);
  const frist = projektWarnungen({ heute: h, projekte: [{ id: 'p', name: 'X' }], aufgaben: [], maengel: [], nachtraege: [{ projekt_id: 'p', status: 'angeboten', antwort_bis: '2026-09-10' }] });
  assert.equal(frist[0].signale[0].schwere, 3);
  assert.deepEqual(projektWarnungen({ heute: h, projekte: [], aufgaben: [], maengel: [], nachtraege: [] }), []);
});

test('Morgen-Satz: nur was anliegt, Einzahl/Mehrzahl', () => {
  const s = morgenSatz({ name: 'Martin', einsaetzeHeute: 3, ohneMonteurHeute: 1, rechnungenUeberfaellig: 2, ueberfaelligSumme: 4200.4, warnProjekte: ['Bad Meier'], wocheQuote: 85 });
  assert.equal(s, 'Guten Morgen, Martin. Heute sind 3 Einsätze geplant. Einer davon hat noch keinen Monteur. 2 Rechnungen sind überfällig, zusammen 4.200 Euro. Achtung bei Projekt Bad Meier. Die Woche ist zu 85 Prozent verplant.');
  assert.equal(morgenSatz({ einsaetzeHeute: 0, ohneMonteurHeute: 0, rechnungenUeberfaellig: 0, ueberfaelligSumme: 0, warnProjekte: [], wocheQuote: null }),
    'Guten Morgen. Heute sind keine Einsätze geplant. Sonst liegt nichts Dringendes an.');
  assert.match(morgenSatz({ einsaetzeHeute: 1, ohneMonteurHeute: 0, rechnungenUeberfaellig: 1, ueberfaelligSumme: 10, warnProjekte: ['a', 'b', 'c', 'd'], wocheQuote: null }), /ein Einsatz geplant\. Eine Rechnung ist überfällig.*den Projekten a, b, c und weiteren/);
});

test('Bank-Mappe: Monate, Umsatz ohne Storno, Forderungen, Zahlungsdauer', () => {
  assert.deepEqual(monatsListe('2026-02-10', 3), ['2025-12', '2026-01', '2026-02']);
  const r = [
    { rechnungsdatum: '2026-09-01', brutto_summe: '1.190,00', zahlungsstatus: 'offen', faelligkeitsdatum: '2026-09-15' },
    { rechnungsdatum: '2026-09-10', brutto_summe: 500, zahlungsstatus: 'bezahlt', bezahlt_am: '2026-09-20' },
    { rechnungsdatum: '2026-08-05', brutto_summe: 300, zahlungsstatus: 'storniert' },
    { rechnungsdatum: '2026-05-01', brutto_summe: 1000, zahlungsstatus: 'offen', faelligkeitsdatum: '2026-05-15' },
    { rechnungsdatum: '2026-08-01', brutto_summe: 200, bezahlt_am: '2026-08-31' },
    { rechnungsdatum: '2024-01-01', brutto_summe: 999, bezahlt_am: '2024-06-01' },
  ];
  const u = umsatzJeMonat(r, '2026-09-24', 12);
  assert.equal(u.length, 12);
  assert.deepEqual(u.at(-1), { monat: '2026-09', summe: 1690, anzahl: 2 });
  assert.deepEqual(u.find((x) => x.monat === '2026-08'), { monat: '2026-08', summe: 200, anzahl: 1 });
  assert.deepEqual(forderungen(r, '2026-09-24'), { offen: 2190, anzahlOffen: 2, ueberfaellig: 2190, anzahlUeberfaellig: 2, aelter90: 1000 });
  assert.equal(zahlungsdauer(r, '2026-09-24'), 20, '(10 + 30) / 2, alte Rechnung von 2024 zaehlt nicht');
  assert.equal(zahlungsdauer([], '2026-09-24'), null);
});
