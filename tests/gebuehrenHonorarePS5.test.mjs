// Paket PS5 (25.09.2026) — Gebuehren & Honorare: RVG/StBVV, GOT, Dozentenhonorar, Trinkgeld, Kuendigung + Check-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rvgGebuehrCent, rvgBerechnung, RVG_MINDEST_CENT, stbvvGebuehrCent, stbvvBerechnung, kostenText,
  istNotdienstZeit, gotBerechnung, gotRahmen,
  unterrichtsEinheiten, dozentenHonorar, honorarUebersicht, bescheinigungsListe,
  trinkgeldVerteilen, trinkgeldSummen,
  fruehestesEnde, kuendigungsBestaetigung, checkinPruefung, auslastung, langeNichtDa, heuteSchonDa, plusMonate,
} from '../out/gebuehrenHonorare.js';

const HEUTE = '2026-09-25';

test('RVG-Tabelle ab 01.06.2025: Kontrollwerte an jeder Stufengrenze', () => {
  const soll = { 0: 5150, 500: 5150, 501: 9300, 1000: 9300, 1500: 13450, 2000: 17600, 2001: 23550, 3000: 23550, 5000: 35450, 10000: 65200, 10001: 70700, 13000: 70700, 25000: 92700, 50000: 135700, 200000: 235200, 500000: 375200, 2000000: 900200 };
  for (const [w, c] of Object.entries(soll)) assert.equal(rvgGebuehrCent(Number(w)), c, `Wert ${w}`);
  assert.equal(rvgGebuehrCent('1.000'), 9300);
  assert.equal(rvgGebuehrCent(''), null);
  assert.equal(rvgGebuehrCent('abc'), null);
  assert.equal(rvgGebuehrCent(-5), null);
});

test('RVG-Rechnung: Anrechnung, Pauschale je Angelegenheit, USt, Mindestgebuehr, Auftraggeber', () => {
  const r = rvgBerechnung({ gegenstandswert: 10000, positionen: [{ nr: '2300' }, { nr: '3100' }, { nr: '3104' }], anrechnung: true });
  assert.equal(r.ok, true);
  assert.equal(r.zeilen.find((z) => z.nr === '2300').betragCent, 84760);          // 1,3 x 652
  assert.equal(r.zeilen.find((z) => z.nr.startsWith('Vorbem')).betragCent, -42380); // 0,65 x 652
  assert.equal(r.zeilen.filter((z) => z.nr === '7002').length, 2);                 // zwei Angelegenheiten
  assert.equal(r.nettoCent, 209380);
  assert.equal(r.ustCent, 39782);
  assert.equal(r.bruttoCent, 249162);
  // Anrechnung hoechstens 0,75
  const hoch = rvgBerechnung({ gegenstandswert: 10000, positionen: [{ nr: '2300', satz: '2,5' }, { nr: '3100' }], anrechnung: true });
  assert.equal(hoch.zeilen.find((z) => z.nr.startsWith('Vorbem')).satz, -0.75);
  assert.ok(hoch.hinweise.some((h) => /ueber 1,3|über 1,3/.test(h)));
  // Rahmen 2300
  assert.equal(rvgBerechnung({ gegenstandswert: 1000, positionen: [{ nr: '2300', satz: 2.6 }] }).ok, false);
  // Mindestgebuehr 15 EUR bei 0,3 x 51,50 = 15,45 -> bleibt; bei kleinem Satz greift Mindest
  const klein = rvgBerechnung({ gegenstandswert: 300, positionen: [{ nr: '3104', satz: 0.2 }], auslagenpauschale: false, ustSatz: 0 });
  assert.equal(klein.zeilen[0].betragCent, RVG_MINDEST_CENT);
  // Nr. 1008: 3 Auftraggeber -> +0,6 auf 3100, nicht auf 3104
  const ag = rvgBerechnung({ gegenstandswert: 5000, positionen: [{ nr: '3100' }, { nr: '3104' }], auftraggeber: 3 });
  assert.equal(ag.zeilen.find((z) => z.nr === '3100').satz, 1.9);
  assert.equal(ag.zeilen.find((z) => z.nr === '3104').satz, 1.2);
  assert.equal(rvgBerechnung({ gegenstandswert: 5000, positionen: [{ nr: '3100' }], auftraggeber: 20 }).zeilen[0].satz, 3.3); // hoechstens +2,0
  // Pauschale hoechstens 20 EUR, bei kleinen Werten 20 %
  const p = rvgBerechnung({ gegenstandswert: 500, positionen: [{ nr: '2300' }], ustSatz: 0 });
  assert.equal(p.zeilen.find((z) => z.nr === '7002').betragCent, Math.round(Math.round(5150 * 1.3) * 0.2));
  // Altes Recht, Fehlerfaelle
  assert.match(rvgBerechnung({ gegenstandswert: 1000, positionen: [{ nr: '2300' }], auftragAm: '2025-05-31' }).fehler, /§ 60/);
  assert.equal(rvgBerechnung({ gegenstandswert: 1000, positionen: [{ nr: '2300' }], auftragAm: '2025-06-01' }).ok, true);
  assert.equal(rvgBerechnung({ gegenstandswert: '', positionen: [{ nr: '2300' }] }).ok, false);
  assert.equal(rvgBerechnung({ gegenstandswert: 1000, positionen: [] }).ok, false);
  assert.equal(rvgBerechnung({ gegenstandswert: 1000, positionen: [{ nr: '9999' }] }).ok, false);
  assert.match(kostenText('Kosten', r.zeilen, r.bruttoCent), /Summe/);
});

test('StBVV Tabelle A und Zehntel-Rahmen', () => {
  assert.equal(stbvvGebuehrCent(300), 3100);
  assert.equal(stbvvGebuehrCent(301), 5600);
  assert.equal(stbvvGebuehrCent(25000), 85400);
  assert.equal(stbvvGebuehrCent(600000), 340400);
  assert.equal(stbvvGebuehrCent(600001), 355300);
  assert.equal(stbvvGebuehrCent(5000000), 1651600);
  assert.equal(stbvvGebuehrCent(5000001), 1662800);
  assert.equal(stbvvGebuehrCent(null), null);
  const r = stbvvBerechnung({ gegenstandswert: 5000, zehntelVon: 1, zehntelBis: 6, mindestwert: 8000 });
  assert.equal(r.wert, 8000);          // Mindestwert
  assert.equal(r.vollCent, 51400);
  assert.equal(r.zehntel, 3.5);        // Mittelgebuehr
  assert.equal(r.gebuehrCent, 17990);  // 514 x 3,5/10
  assert.equal(r.pauschaleCent, 2000);
  assert.equal(r.bruttoCent, Math.round((17990 + 2000) * 1.19));
  assert.equal(stbvvBerechnung({ gegenstandswert: 5000, zehntelVon: 1, zehntelBis: 6, zehntel: 7 }).ok, false);
  assert.ok(stbvvBerechnung({ gegenstandswert: 5000, zehntelVon: 1, zehntelBis: 6, zehntel: 5 }).hinweise.some((h) => /Mittelgebühr/.test(h)));
  assert.equal(stbvvBerechnung({ gegenstandswert: 5000, zehntelVon: 6, zehntelBis: 1 }).ok, false);
});

test('GOT: Notdienst-Zeiten, Rahmen, Notdienstgebuehr, Wegegeld', () => {
  assert.equal(istNotdienstZeit('2026-09-24', '10:00').notdienst, false);  // Donnerstag
  assert.equal(istNotdienstZeit('2026-09-24', '18:00').notdienst, true);
  assert.equal(istNotdienstZeit('2026-09-24', '07:59').notdienst, true);
  assert.equal(istNotdienstZeit('2026-09-24', '08:00').notdienst, false);
  assert.match(istNotdienstZeit('2026-09-25', '19:00').grund, /Freitag/);
  assert.equal(istNotdienstZeit('2026-09-26', '11:00').notdienst, true);   // Samstag
  assert.match(istNotdienstZeit('2026-10-03', '11:00').grund, /Einheit/);   // Feiertag (auch Samstag -> Feiertag zuerst)
  assert.equal(istNotdienstZeit('2026-01-06', '11:00').notdienst, false);  // ohne Bundesland
  assert.equal(istNotdienstZeit('2026-01-06', '11:00', 'BW').notdienst, true);
  assert.deepEqual(gotRahmen(false), [1, 3]);
  assert.deepEqual(gotRahmen(true), [2, 4]);
  const r = gotBerechnung({ notdienst: true, positionen: [{ bezeichnung: 'Allgemeine Untersuchung', einfachSatz: '23,62', faktor: 2 }, { bezeichnung: 'Injektion', einfachSatz: 5.77, faktor: 2, anzahl: 2 }], doppelKm: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.zeilen[0].betragCent, 4724);
  assert.equal(r.zeilen[1].betragCent, 2308);
  assert.equal(r.zeilen.find((z) => z.nr === '§ 4').betragCent, 5000);
  assert.equal(r.zeilen.find((z) => z.nr === '§ 10').betragCent, 1300); // 2 x 3,50 = 7 -> mindestens 13
  assert.equal(r.nettoCent, 4724 + 2308 + 5000 + 1300);
  assert.equal(gotBerechnung({ notdienst: false, positionen: [{ bezeichnung: 'X', einfachSatz: 10, faktor: 3.5 }] }).ok, false);
  assert.equal(gotBerechnung({ notdienst: true, positionen: [{ bezeichnung: 'X', einfachSatz: 10, faktor: 1 }] }).ok, false);
  const v = gotBerechnung({ notdienst: false, vereinbartTextform: true, positionen: [{ bezeichnung: 'X', einfachSatz: 10, faktor: 3.5 }] });
  assert.equal(v.ok, true);
  assert.equal(v.warnungen.length, 1);
  assert.equal(gotBerechnung({ notdienst: false, positionen: [{ bezeichnung: 'X', einfachSatz: '', faktor: 1 }] }).ok, false);
  assert.equal(gotBerechnung({ notdienst: false, positionen: [{ bezeichnung: 'X', einfachSatz: 10, faktor: 1, anzahl: 1.5 }] }).ok, false);
  assert.equal(gotBerechnung({ notdienst: false, positionen: [{ bezeichnung: 'X', einfachSatz: 10, faktor: 1 }], doppelKm: 10 }).zeilen[1].betragCent, 3500);
});

test('Dozentenhonorar: UE, Honorar, Uebersicht je Monat', () => {
  assert.equal(unterrichtsEinheiten('09:00', '12:00'), 4);
  assert.equal(unterrichtsEinheiten('09:00', '12:15', 15), 4);
  assert.equal(unterrichtsEinheiten('09:00', '10:00'), 1.25);
  assert.equal(unterrichtsEinheiten('12:00', '09:00'), null);
  assert.equal(unterrichtsEinheiten(null, '09:00'), null);
  const h = dozentenHonorar({ ue: 4, satzJeUe: '35,50', fahrtKm: 42, kmSatz: '0,30' });
  assert.equal(h.honorarCent, 14200);
  assert.equal(h.fahrtCent, 1260);
  assert.equal(h.bruttoCent, 15460);
  assert.equal(dozentenHonorar({ ue: 4, satzJeUe: 40, ustSatz: 19 }).bruttoCent, 19040);
  assert.equal(dozentenHonorar({ ue: '', satzJeUe: 40 }).ok, false);
  assert.equal(dozentenHonorar({ ue: 2, satzJeUe: 40, fahrtKm: -1 }).ok, false);
  const u = honorarUebersicht([
    { dozent: 'Frau Berg', datum: '2026-09-02', ue: 4, satz: 40, status: 'offen' },
    { dozent: 'Frau Berg', datum: '2026-09-09', ue: 4, satz: 40, status: 'bezahlt' },
    { dozent: 'Herr Alt', datum: '2026-08-30', ue: 2, satz: 30, status: 'abgerechnet' },
    { dozent: '', datum: '2026-09-01', ue: 2, satz: 30, status: 'offen' },
  ]);
  assert.equal(u.length, 2);
  assert.equal(u[0].monat, '2026-09');
  assert.equal(u[0].offenCent, 16000);
  assert.equal(u[0].bezahltCent, 16000);
  assert.equal(u[0].ue, 8);
  assert.equal(u[1].abgerechnetCent, 6000);
});

test('Teilnahmebescheinigungen: 80-Prozent-Schwelle, Storno, ohne Termine', () => {
  const anm = [
    { id: 'a', name: 'Anna', status: 'bestaetigt' },
    { id: 'b', name: 'Ben', status: 'bestaetigt', zertifikat_am: '2026-09-20' },
    { id: 'c', name: 'Cem', status: 'storniert' },
  ];
  const w = [];
  for (const t of ['t1', 't2', 't3', 't4', 't5']) { w.push({ termin_id: t, anmeldung_id: 'b', anwesend: true }); }
  for (const t of ['t1', 't2', 't3']) w.push({ termin_id: t, anmeldung_id: 'a', anwesend: true });
  w.push({ termin_id: 't4', anmeldung_id: 'a', anwesend: false });
  const l = bescheinigungsListe(anm, ['t1', 't2', 't3', 't4', 't5'], w);
  assert.equal(l.length, 2);
  assert.equal(l[0].name, 'Ben');
  assert.equal(l[0].berechtigt, true);
  assert.equal(l[0].ausgestellt, '2026-09-20');
  assert.equal(l[1].berechtigt, false);
  assert.match(l[1].grund, /nur 3 von 5/);
  w.push({ termin_id: 't4', anmeldung_id: 'a', anwesend: true });
  assert.equal(bescheinigungsListe(anm, ['t1', 't2', 't3', 't4', 't5'], w.filter((x) => !(x.anmeldung_id === 'a' && x.termin_id === 't4' && !x.anwesend)))[0].berechtigt, true); // 4 von 5 = 80 %
  assert.equal(bescheinigungsListe([{ id: 'x', name: 'X', status: 'teilgenommen' }], [], [])[0].berechtigt, true);
  assert.equal(bescheinigungsListe([{ id: 'x', name: 'X', status: 'angemeldet' }], [], [])[0].berechtigt, false);
});

test('Trinkgeld: centgenau, Summe gleich Topf, Methoden, Warnungen', () => {
  const r = trinkgeldVerteilen({ bar: '100,00', karte: 0.01 }, [{ name: 'A', stunden: 8 }, { name: 'B', stunden: 8 }, { name: 'C', stunden: 8 }], 'stunden');
  assert.equal(r.topfCent, 10001);
  assert.equal(r.anteile.reduce((s, a) => s + a.anteilCent, 0), 10001);
  assert.deepEqual(r.anteile.map((a) => a.anteilCent), [3334, 3334, 3333]);
  const p = trinkgeldVerteilen({ bar: 90 }, [{ name: 'Kueche', punkte: 1 }, { name: 'Service', punkte: 2 }], 'punkte');
  assert.deepEqual(p.anteile.map((a) => a.anteilCent), [3000, 6000]);
  const g = trinkgeldVerteilen({ bar: 10 }, [{ name: 'A' }, { name: 'B' }, { name: 'C', inhaber: true }], 'gleich');
  assert.equal(g.anteile.reduce((s, a) => s + a.anteilCent, 0), 1000);
  assert.ok(g.warnungen.some((w) => /Inhaber/.test(w)));
  const n = trinkgeldVerteilen({ bar: 10 }, [{ name: 'A', stunden: 5 }, { name: 'B', stunden: '' }], 'stunden');
  assert.deepEqual(n.anteile.map((a) => a.anteilCent), [1000, 0]);
  assert.ok(n.warnungen.some((w) => /B: ohne Stunden/.test(w)));
  assert.equal(trinkgeldVerteilen({ bar: 0 }, [{ name: 'A', stunden: 1 }], 'stunden').ok, false);
  assert.equal(trinkgeldVerteilen({ bar: 10 }, [{ name: 'A', stunden: 0 }], 'stunden').ok, false);
  assert.equal(trinkgeldVerteilen({ bar: -1 }, [{ name: 'A', stunden: 1 }], 'stunden').ok, false);
  const s = trinkgeldSummen([
    { datum: '2026-09-01', anteile: [{ name: 'A', anteilCent: 500 }, { name: 'B', anteilCent: 300 }] },
    { datum: '2026-09-02', anteile: [{ name: 'A', anteilCent: 700 }] },
    { datum: '2026-08-31', anteile: [{ name: 'A', anteilCent: 9999 }] },
  ], '2026-09');
  assert.deepEqual(s, [{ name: 'A', summeCent: 1200, tage: 2 }, { name: 'B', summeCent: 300, tage: 1 }]);
});

test('Kuendigung Studio (ab 01.03.2022), Altvertrag, Verein', () => {
  assert.equal(plusMonate('2026-01-31', 1), '2026-02-28');
  const v = { art: 'studio', beginn: '2025-10-01', erstlaufzeitMonate: 12, kuendigungsfristMonate: 1 };
  assert.equal(fruehestesEnde(v, '2026-08-31').endeAm, '2026-09-30');           // rechtzeitig
  assert.equal(fruehestesEnde(v, '2026-09-01').endeAm, '2026-10-01');           // Frist verpasst -> 1 Monat nach Zugang
  assert.match(fruehestesEnde(v, '2026-09-01').begruendung, /unbefristet/);
  assert.equal(fruehestesEnde(v, '2026-11-15').endeAm, '2026-12-15');
  const lang = fruehestesEnde({ ...v, erstlaufzeitMonate: 36, kuendigungsfristMonate: 3 }, '2026-01-10');
  assert.equal(lang.warnungen.length, 2);
  assert.equal(lang.endeAm, '2027-09-30');                                      // 24 Monate, Frist 1 Monat
  const alt = { art: 'studio', beginn: '2021-01-01', erstlaufzeitMonate: 12, kuendigungsfristMonate: 3, verlaengerungMonate: 12 };
  assert.equal(fruehestesEnde(alt, '2026-09-30').endeAm, '2026-12-31');
  assert.equal(fruehestesEnde(alt, '2026-10-01').endeAm, '2027-12-31');
  assert.equal(fruehestesEnde({ ...alt, verlaengerungMonate: 24 }, '2026-10-01').warnungen.length, 1);
  assert.equal(fruehestesEnde({ art: 'studio', beginn: null }, HEUTE).ok, false);
  assert.equal(fruehestesEnde(v, 'kaputt').ok, false);
  assert.equal(fruehestesEnde({ art: 'verein', beginn: null, satzungFristMonate: 3, satzungZum: 'jahresende' }, '2026-09-30').endeAm, '2026-12-31');
  assert.equal(fruehestesEnde({ art: 'verein', beginn: null, satzungFristMonate: 3, satzungZum: 'jahresende' }, '2026-10-01').endeAm, '2027-12-31');
  assert.equal(fruehestesEnde({ art: 'verein', beginn: null, satzungFristMonate: 1, satzungZum: 'quartalsende' }, '2026-08-20').endeAm, '2026-09-30');
  assert.equal(fruehestesEnde({ art: 'verein', beginn: null, satzungFristMonate: 30, satzungZum: 'jahresende' }, '2026-01-10').warnungen.length, 1);
  assert.equal(fruehestesEnde({ art: 'verein', beginn: null, satzungFristMonate: 30, satzungZum: 'monatsende' }, '2026-01-10').endeAm, '2028-01-31'); // hoechstens 2 Jahre
  const t = kuendigungsBestaetigung({ betrieb: 'Studio Nord', name: 'Frau Kaya', eingang: '2026-09-01', endeAm: '2026-10-01' });
  assert.match(t, /01\.10\.2026/);
  assert.match(t, /Ihre Mitgliedschaft/);
});

test('Check-in: Pruefung, doppelt, Auslastung, lange nicht da', () => {
  assert.equal(checkinPruefung({ id: '1', name: 'A', status: 'aktiv' }, HEUTE).stufe, 'ok');
  assert.equal(checkinPruefung({ id: '1', name: 'A', status: 'pausiert' }, HEUTE).stufe, 'gelb');
  assert.equal(checkinPruefung({ id: '1', name: 'A', status: 'gekuendigt', kuendigung_zum: '2026-09-24' }, HEUTE).stufe, 'rot');
  assert.equal(checkinPruefung({ id: '1', name: 'A', status: 'gekuendigt', kuendigung_zum: '2026-09-25' }, HEUTE).stufe, 'ok');
  assert.equal(checkinPruefung({ id: '1', name: 'A', status: 'aktiv', beginn_am: '2026-10-01' }, HEUTE).stufe, 'gelb');
  const ci = [
    { mitglied_id: '1', zeit: '2026-09-25T05:30:00Z' },   // 07:30 Berlin
    { mitglied_id: '2', zeit: '2026-09-24T22:30:00Z' },   // 00:30 Berlin am 25.09.
    { mitglied_id: '1', zeit: '2026-08-01T16:00:00Z' },
  ];
  assert.equal(heuteSchonDa('1', ci, HEUTE), true);
  assert.equal(heuteSchonDa('2', ci, HEUTE), true);
  assert.equal(heuteSchonDa('3', ci, HEUTE), false);
  const a = auslastung(ci, '2026-09-25', '2026-09-25');
  assert.equal(a.gesamt, 2);
  assert.equal(a.jeStunde[7], 1);
  assert.equal(a.jeStunde[0], 1);
  assert.equal(a.jeWochentag[5], 2);
  const m = [
    { id: '1', name: 'A', status: 'aktiv' },
    { id: '3', name: 'C', status: 'aktiv' },
    { id: '4', name: 'D', status: 'aktiv', kuendigung_zum: '2026-12-31' },
    { id: '5', name: 'E', status: 'pausiert' },
  ];
  const l = langeNichtDa(m, [...ci, { mitglied_id: '3', zeit: '2026-08-01T10:00:00Z' }], HEUTE, 30);
  assert.deepEqual(l.map((x) => x.name), ['C']);
  assert.equal(l[0].tageWeg, 55);
  assert.deepEqual(langeNichtDa([{ id: '9', name: 'Neu', status: 'aktiv' }], [], HEUTE).map((x) => x.tageWeg), [null]);
});

test('Rechte: die neuen Seiten verhalten sich exakt wie ihr Eltern-Modul', async () => {
  const { mitarbeiterDarf, NAV_LINKS } = await import('../out/rechte.js');
  const seiten = [
    ['/dashboard/kanzlei/gebuehren', '/dashboard/kanzlei', 'kanzlei'],
    ['/dashboard/tier/got', '/dashboard/tier', 'tier'],
    ['/dashboard/bildung/honorare', '/dashboard/bildung', 'bildung'],
    ['/dashboard/gastro/trinkgeld', '/dashboard/gastro', 'gastro'],
    ['/dashboard/mitglieder/vertraege', '/dashboard/mitglieder', 'mitglieder'],
    ['/dashboard/mitglieder/checkin', '/dashboard/mitglieder', 'mitglieder'],
  ];
  for (const [pfad, eltern, modul] of seiten) {
    const eintrag = NAV_LINKS.find((l) => l.href === pfad);
    assert.ok(eintrag, `${pfad} fehlt im Menue`);
    assert.equal(eintrag.modul, undefined, pfad);
    for (const rechte of [[], [modul], ['anderes']]) {
      assert.equal(mitarbeiterDarf(pfad, rechte), mitarbeiterDarf(eltern, rechte), `${pfad} mit ${JSON.stringify(rechte)}`);
    }
  }
  assert.equal(mitarbeiterDarf('/dashboard/mitglieder/vertraege', []), false);
});
