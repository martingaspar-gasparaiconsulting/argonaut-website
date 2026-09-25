// Paket PS3 (25.09.2026) — Vorgaenge mit Kunden: Retouren, KFZ-Schaden, SLA, Nachkauf, Impf-Erinnerung.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  plusMonate, fristEndeWerktag, naechsteNummer, offenePlatzhalter, normName,
  widerrufsFristEnde, pruefeWiderruf, erstattungsBetrag, erstattungsStand, gewaehrleistung, retourenZahlen, retourenText,
  unterlagenFuer, fehlendeUnterlagen, schadenOffen, schadenStand, ersatzTage, schadenZahlen, schadenSchreiben,
  leseServicezeit, stundenInServicezeit, ersteReaktion, wartePhasen, ticketSla, slaBericht, vertragFuer, ticketsImMonat,
  aufgebrauchtAm, darfNachkaufWerben, nachkaufListe, nachkaufText, WIDERSPRUCH_HINWEIS,
  impfListe, impfText,
} from '../out/kundenVorgaenge.js';

const HEUTE = '2026-09-25';

test('Hilfen: Monate ohne Ueberlauf, Paragraf 193 BGB, Nummern, Platzhalter, Namen', () => {
  assert.equal(plusMonate('2026-01-31', 1), '2026-02-28');
  assert.equal(plusMonate('2027-12-31', 2), '2028-02-29');
  assert.equal(fristEndeWerktag('2026-09-26'), '2026-09-28'); // Samstag -> Montag
  assert.equal(fristEndeWerktag('2026-10-03'), '2026-10-05'); // Tag der Deutschen Einheit (Sa) -> Mo
  assert.equal(fristEndeWerktag('2026-12-25'), '2026-12-28'); // 1. + 2. Weihnachtstag, Wochenende
  assert.equal(naechsteNummer(['RT-2026-004', 'RT-2025-099', null], 'RT', 2026), 'RT-2026-005');
  assert.equal(naechsteNummer([], 'SF', 2026), 'SF-2026-001');
  assert.deepEqual(offenePlatzhalter('Hallo [Name], [Name] und [Datum].'), ['[Name]', '[Datum]']);
  assert.equal(normName('Müller GmbH & Co. KG'), normName('mueller'));
});

test('Widerruf: 14 Tage ab Erhalt, Werktag, ohne Belehrung 12 Monate + 14 Tage', () => {
  assert.equal(widerrufsFristEnde('2026-09-01'), '2026-09-15');
  assert.equal(widerrufsFristEnde('2026-09-12'), '2026-09-28'); // 26.09. ist Samstag
  assert.equal(widerrufsFristEnde('2026-09-01', false), '2027-09-15');
  assert.equal(widerrufsFristEnde(null), null);
  assert.equal(widerrufsFristEnde('2026-02-30'), null);
  assert.equal(pruefeWiderruf({ erhalten_am: '2026-09-12', widerruf_am: '2026-09-28' }).stufe, 'ok');
  assert.equal(pruefeWiderruf({ erhalten_am: '2026-09-12', widerruf_am: '2026-09-29' }).stufe, 'spaet');
  assert.equal(pruefeWiderruf({ erhalten_am: '2026-09-12' }).stufe, 'offen');
  assert.equal(pruefeWiderruf({ widerruf_am: '2026-09-12' }).stufe, 'offen');
});

test('Erstattung: Hinsendekosten nur bei ganzer Bestellung, Mehrkosten Express nicht, Wertersatz nur mit Belehrung', () => {
  const pos = [{ menge: 2, einzelpreis: '19,99' }, { menge: '1', einzelpreis: 5 }];
  const ganz = erstattungsBetrag({ positionen: pos, vollstaendig: true, hinversand: '4,90' });
  assert.equal(ganz.betrag, 49.88);
  const express = erstattungsBetrag({ positionen: pos, vollstaendig: true, hinversand: 12.9, mehrkostenLieferart: 8 });
  assert.equal(express.betrag, 49.88);
  assert.ok(express.hinweise.some((h) => /357 Abs. 2/.test(h)));
  const teil = erstattungsBetrag({ positionen: [pos[0]], vollstaendig: false, hinversand: 4.9 });
  assert.equal(teil.betrag, 39.98);
  assert.ok(teil.hinweise.some((h) => /Teil-Widerruf/.test(h)));
  assert.equal(erstattungsBetrag({ positionen: pos, vollstaendig: true, wertersatz: '10' }).betrag, 34.98);
  const ohneBel = erstattungsBetrag({ positionen: pos, vollstaendig: true, wertersatz: 10, belehrungOk: false });
  assert.equal(ohneBel.betrag, 44.98);
  assert.equal(erstattungsBetrag({ positionen: pos, vollstaendig: true, wertersatz: 999 }).betrag, 0);
  assert.equal(erstattungsBetrag({ positionen: [{ menge: 1, einzelpreis: '' }], vollstaendig: true }).betrag, null);
  assert.equal(erstattungsBetrag({ positionen: [], vollstaendig: true }).betrag, null);
});

test('Erstattungsfrist: 14 Tage ab Widerruf, Zurueckbehaltung bis Ware da, Abholung angeboten', () => {
  const r = { art: 'widerruf', status: 'eingegangen', widerruf_am: '2026-09-05', ware_zurueck_am: '2026-09-10' };
  assert.equal(erstattungsStand(r, HEUTE).stufe, 'rot');
  assert.equal(erstattungsStand(r, HEUTE).bis, '2026-09-19');
  assert.equal(erstattungsStand({ ...r, widerruf_am: '2026-09-20' }, HEUTE).stufe, 'gruen');
  assert.equal(erstattungsStand({ ...r, widerruf_am: '2026-09-13' }, HEUTE).stufe, 'gelb');
  const ohneWare = { ...r, ware_zurueck_am: null, status: 'gemeldet' };
  assert.match(erstattungsStand(ohneWare, HEUTE).text, /357 Abs. 4/);
  assert.equal(erstattungsStand({ ...ohneWare, rueckversand_nachweis: true }, HEUTE).stufe, 'rot');
  assert.equal(erstattungsStand({ ...ohneWare, abholung_angeboten: true }, HEUTE).stufe, 'rot');
  assert.equal(erstattungsStand({ ...r, erstattet_am: '2026-09-15', status: 'erstattet' }, HEUTE).stufe, 'erledigt');
  assert.equal(erstattungsStand({ art: 'reklamation', status: 'gemeldet' }, HEUTE).stufe, 'offen');
});

test('Gewaehrleistung: 2 Jahre, Vermutung im ersten Jahr', () => {
  assert.match(gewaehrleistung('2026-01-10', '2026-09-25').text, /477/);
  assert.equal(gewaehrleistung('2024-09-24', '2026-09-25').stufe, 'abgelaufen');
  assert.equal(gewaehrleistung('2024-09-25', '2026-09-25').stufe, 'ok');
  assert.doesNotMatch(gewaehrleistung('2025-06-01', '2026-09-25').text, /vermutet/);
  assert.equal(gewaehrleistung(null, HEUTE).stufe, 'offen');
});

test('Retouren-Zahlen und Kundentexte', () => {
  const liste = [
    { art: 'widerruf', status: 'eingegangen', widerruf_am: '2026-09-01', ware_zurueck_am: '2026-09-03', grund: 'Passt nicht' },
    { art: 'widerruf', status: 'erstattet', widerruf_am: '2026-09-01', erstattet_am: '2026-09-05', erstattung_betrag: 20.5, grund: 'Passt nicht' },
    { art: 'reklamation', status: 'gemeldet', grund: '' },
  ];
  const z = retourenZahlen(liste, HEUTE, 30);
  assert.equal(z.offen, 2);
  assert.equal(z.ueberfaellig, 1);
  assert.equal(z.summeErstattet, 20.5);
  assert.equal(z.quote, 10);
  assert.equal(z.gruende[0].grund, 'Passt nicht');
  assert.equal(retourenZahlen([], HEUTE, 0).quote, null);
  const t = retourenText('erstattung', { name: 'Frau Berg', bestellung: 'B-17', betrag: 49.88, firma: 'Laden' });
  assert.match(t, /49,88/);
  assert.deepEqual(offenePlatzhalter(t), []);
  assert.ok(offenePlatzhalter(retourenText('eingang', {})).length >= 2);
  assert.doesNotMatch(retourenText('eingang', { name: 'A' }) + retourenText('ablehnung_frist', {}), /\bdu\b|\bdein/i);
});

test('KFZ-Schaden: Unterlagen je Art, offene Betraege mit Selbstbeteiligung', () => {
  assert.ok(unterlagenFuer('vollkasko').some((u) => u.key === 'freigabe'));
  assert.ok(!unterlagenFuer('haftpflicht').some((u) => u.key === 'freigabe'));
  assert.ok(!unterlagenFuer('selbstzahler').some((u) => u.key === 'schadennummer'));
  assert.equal(fehlendeUnterlagen('selbstzahler', { auftrag: true, rechnung: true }).length, 0);
  const s = { art: 'vollkasko', status: 'abgerechnet', rechnung_betrag: 3000, selbstbeteiligung: 300, zahlungen: [{ am: '2026-09-10', betrag: 2700, von: 'versicherer' }] };
  const o = schadenOffen(s);
  assert.equal(o.offen, 300);
  assert.equal(o.sbKunde, 300);
  assert.equal(o.offenVersicherer, 0);
  const s2 = { ...s, zahlungen: [...s.zahlungen, { am: '2026-09-12', betrag: 300, von: 'kunde' }] };
  assert.equal(schadenOffen(s2).offen, 0);
  assert.equal(schadenOffen(s2).sbKunde, 0);
  const h = schadenOffen({ art: 'haftpflicht', status: 'abgerechnet', rechnung_betrag: 2000, selbstbeteiligung: 500, zahlungen: [] });
  assert.equal(h.sbKunde, 0); // Haftpflicht: keine Selbstbeteiligung des Geschaedigten
  assert.equal(h.offenVersicherer, 2000);
  assert.equal(schadenOffen({ art: 'haftpflicht', status: 'reparatur' }).offen, null);
  assert.equal(ersatzTage('2026-09-01', '2026-09-05'), 5);
  assert.equal(ersatzTage('2026-09-05', '2026-09-01'), null);
});

test('KFZ-Schaden: Stand, Nachfassen nach Richtwert, Kuerzung, Zahlen, Schreiben', () => {
  const alle = Object.fromEntries(unterlagenFuer('haftpflicht').map((u) => [u.key, true]));
  const basis = { art: 'haftpflicht', status: 'abgerechnet', rechnung_betrag: 2000, unterlagen: alle, zahlungen: [] };
  assert.equal(schadenStand({ ...basis, unterlagen_komplett_am: '2026-09-01' }, HEUTE).stufe, 'gelb');
  assert.equal(schadenStand({ ...basis, unterlagen_komplett_am: '2026-09-01' }, HEUTE).nachfassAm, '2026-09-29');
  assert.equal(schadenStand({ ...basis, unterlagen_komplett_am: '2026-08-20' }, HEUTE).stufe, 'rot');
  assert.match(schadenStand({ ...basis, unterlagen_komplett_am: '2026-09-20', status: 'gekuerzt', zahlungen: [{ am: '2026-09-24', betrag: 1500 }] }, HEUTE).text, /Kürzung/);
  assert.equal(schadenStand({ ...basis, zahlungen: [{ am: '2026-09-24', betrag: 2000 }] }, HEUTE).stufe, 'gruen');
  assert.match(schadenStand({ art: 'vollkasko', status: 'gemeldet', unterlagen: {} }, HEUTE).text, /Es fehlen/);
  assert.match(schadenStand({ art: 'haftpflicht', status: 'gutachten', unterlagen: alle, kva_betrag: 1200 }, HEUTE).stufe, /grau|gelb/);
  assert.equal(schadenStand({ ...basis, status: 'abgeschlossen' }, HEUTE).stufe, 'grau');
  const z = schadenZahlen([{ ...basis, unterlagen_komplett_am: '2026-08-20' }, { ...basis, status: 'abgeschlossen' }], HEUTE);
  assert.equal(z.offen, 1);
  assert.equal(z.nachfassen, 1);
  assert.equal(z.summeOffen, 2000);
  const m = schadenSchreiben('meldung', { versicherer: 'X', schadennummer: '123', kennzeichen: 'BB-A 1', schadentag: '2026-09-01', kunde: 'Herr A', firma: 'Werkstatt', unterlagen: ['Fotos'] });
  assert.deepEqual(offenePlatzhalter(m), []);
  assert.ok(offenePlatzhalter(schadenSchreiben('erinnerung', {})).includes('[Schadennummer]'));
  assert.match(schadenSchreiben('kunde_sb', { kunde: 'Herr A', sb: 300 }), /300,00/);
});

test('SLA: Servicezeit lesen, Stunden nur in der Servicezeit, Sommerzeit, Feiertag', () => {
  assert.deepEqual(leseServicezeit('Mo–Fr 8–17'), { tage: [1, 2, 3, 4, 5], von: 8, bis: 17 });
  assert.deepEqual(leseServicezeit('Mo-Fr 08:00-17:30 Uhr'), { tage: [1, 2, 3, 4, 5], von: 8, bis: 17.5 });
  assert.equal(leseServicezeit('24/7'), 'rund');
  assert.equal(leseServicezeit('werktags tagsüber'), null);
  assert.equal(leseServicezeit('Mo-Fr 17-8'), null);
  const mofr = leseServicezeit('Mo-Fr 8-17');
  // Fr 25.09.2026 16:00 Berlin (14:00 UTC) bis Mo 28.09. 10:00 Berlin (08:00 UTC) = 1 + 2 = 3 Std
  assert.equal(stundenInServicezeit('2026-09-25T14:00:00Z', '2026-09-28T08:00:00Z', mofr), 3);
  assert.equal(stundenInServicezeit('2026-09-25T14:00:00Z', '2026-09-28T08:00:00Z', 'rund'), 66);
  assert.equal(stundenInServicezeit('2026-09-25T14:00:00Z', '2026-09-28T08:00:00Z', null), 66);
  // Winterzeit: Mo 02.11.2026 08:00 Berlin = 07:00 UTC
  assert.equal(stundenInServicezeit('2026-11-02T07:00:00Z', '2026-11-02T09:00:00Z', mofr), 2);
  // Feiertag 03.10.2025 (Fr) zaehlt nicht
  assert.equal(stundenInServicezeit('2025-10-02T13:00:00Z', '2025-10-06T07:00:00Z', mofr), 3);
  assert.equal(stundenInServicezeit('2026-09-25T14:00:00Z', '2026-09-25T13:00:00Z', mofr), 0);
  // Ueber die Zeitumstellung (25.10.2026) hinweg: Fr 23.10. 16:00 CEST bis Mo 26.10. 09:00 CET = 1 + 1 = 2 Std
  assert.equal(stundenInServicezeit('2026-10-23T14:00:00Z', '2026-10-26T08:00:00Z', mofr), 2);
  // Ein ganzes Jahr: 2026 hat 261 Werktage Mo-Fr, 7 bundesweite Feiertage darauf = 254 x 9 Std; BW zusaetzlich 06.01. + Fronleichnam
  const t0 = Date.now();
  const jahr = stundenInServicezeit('2025-12-31T23:00:00Z', '2026-12-31T23:00:00Z', mofr);
  assert.ok(Date.now() - t0 < 500);
  assert.equal(jahr, 254 * 9);
  assert.equal(stundenInServicezeit('2025-12-31T23:00:00Z', '2026-12-31T23:00:00Z', mofr, 'BW'), 252 * 9);
});

test('SLA: erste Reaktion ohne interne Notiz, Wartezeit wird abgezogen', () => {
  const t = { id: 't1', status: 'geloest', prioritaet: 'hoch', kunde_name: 'Acme GmbH', created_at: '2026-09-01T08:00:00Z', geloest_am: '2026-09-02T08:00:00Z' };
  const v = [
    { ticket_id: 't1', typ: 'notiz', created_at: '2026-09-01T08:10:00Z' },
    { ticket_id: 't1', typ: 'statuswechsel', alt_status: 'offen', neu_status: 'in_bearbeitung', created_at: '2026-09-01T09:00:00Z' },
    { ticket_id: 't1', typ: 'statuswechsel', alt_status: 'in_bearbeitung', neu_status: 'wartet', created_at: '2026-09-01T10:00:00Z' },
    { ticket_id: 't1', typ: 'statuswechsel', alt_status: 'wartet', neu_status: 'in_bearbeitung', created_at: '2026-09-01T16:00:00Z' },
    { ticket_id: 'anders', typ: 'kommentar', created_at: '2026-09-01T08:01:00Z' },
  ];
  assert.equal(ersteReaktion(t, v), '2026-09-01T09:00:00Z');
  assert.equal(wartePhasen(t, v, t.geloest_am).length, 1);
  const vertrag = { kunde: 'ACME', bezeichnung: 'Gold', reaktion_std: 2, wiederherstell_std: 20, servicezeit: '24/7' };
  const s = ticketSla(t, v, vertrag, '2026-09-25T08:00:00Z');
  assert.equal(s.reaktionStd, 1);
  assert.equal(s.reaktionOk, true);
  assert.equal(s.wartenStd, 6);
  assert.equal(s.loesungStd, 18);
  assert.equal(s.loesungOk, true);
  assert.equal(s.quelleZiel, 'vertrag');
  const ohneAbzug = ticketSla(t, v, vertrag, '2026-09-25T08:00:00Z', { warteAbziehen: false });
  assert.equal(ohneAbzug.loesungOk, false); // 24 Std > 20
  // offen und ueber dem Ziel = verletzt, offen innerhalb = laeuft (null)
  const offen = { ...t, id: 't2', status: 'offen', geloest_am: null, prioritaet: 'dringend', created_at: '2026-09-25T02:00:00Z' };
  assert.equal(ticketSla(offen, [], null, '2026-09-25T08:00:00Z').loesungOk, false);
  assert.equal(ticketSla(offen, [], null, '2026-09-25T04:00:00Z').loesungOk, null);
  assert.equal(ticketSla(offen, [], null, '2026-09-25T04:00:00Z').loesungZiel, 4);
});

test('SLA-Bericht je Kunde und Monat (Ortszeit Berlin), Vertrag gueltig, Hinweise', () => {
  const tickets = [
    { id: 'a', status: 'geloest', prioritaet: 'mittel', kunde_name: 'Acme GmbH', created_at: '2026-09-01T08:00:00Z', geloest_am: '2026-09-01T10:00:00Z' },
    { id: 'b', status: 'geloest', prioritaet: 'mittel', kunde_name: 'acme', created_at: '2026-09-10T08:00:00Z', geloest_am: '2026-09-20T08:00:00Z' },
    { id: 'c', status: 'offen', prioritaet: 'niedrig', kunde_name: 'Beta', created_at: '2026-09-30T22:30:00Z' }, // 01.10. in Berlin
    { id: 'd', status: 'offen', prioritaet: 'niedrig', kunde_name: '', created_at: '2026-08-31T22:30:00Z' }, // 01.09. in Berlin
  ];
  assert.equal(ticketsImMonat(tickets, '2026-09').length, 3);
  const vertraege = [{ kunde: 'Acme', bezeichnung: 'Silber', wiederherstell_std: 48, servicezeit: 'nach Absprache', verfuegbarkeit: 99.5 }];
  assert.equal(vertragFuer('ACME GmbH', vertraege, '2026-09-01')?.bezeichnung, 'Silber');
  assert.equal(vertragFuer('Acme', [{ ...vertraege[0], gueltig_bis: '2026-08-31' }], '2026-09-01'), null);
  const b = slaBericht(tickets, [], vertraege, '2026-09', '2026-09-25T08:00:00Z');
  const acme = b.find((k) => normName(k.kunde) === 'acme');
  assert.equal(acme.tickets, 2);
  assert.equal(acme.loesungOk, 1);
  assert.equal(acme.loesungVerletzt, 1);
  assert.equal(acme.loesungQuote, 50);
  assert.equal(acme.verstoesse.length, 1);
  assert.ok(acme.hinweise.some((h) => /nicht lesbar/.test(h)));
  assert.ok(acme.hinweise.some((h) => /Monitoring/.test(h)));
  const ohne = b.find((k) => k.kunde === 'ohne Kunde');
  assert.equal(ohne.tickets, 1);
  assert.ok(ohne.hinweise.some((h) => /Standardzielen/.test(h)));
});

test('Nachkauf: Reichweite x Menge, Paragraf 7 Abs. 3 UWG, Widerspruch sticht, neuester Kauf zaehlt', () => {
  assert.equal(aufgebrauchtAm({ verkauft_am: '2026-08-01', reichweite_tage: 30, menge: 2 }), '2026-09-30');
  assert.equal(aufgebrauchtAm({ verkauft_am: '2026-08-01', reichweite_tage: 0 }), null);
  assert.equal(darfNachkaufWerben({ email: 'a@b.de', hinweis_widerspruch: true }).ok, true);
  assert.equal(darfNachkaufWerben({ email: 'a@b.de', einwilligung_werbung: true }).ok, true);
  assert.equal(darfNachkaufWerben({ email: 'a@b.de' }).ok, false);
  assert.equal(darfNachkaufWerben({ email: 'kaputt', einwilligung_werbung: true }).ok, false);
  assert.equal(darfNachkaufWerben({ email: 'a@b.de', einwilligung_werbung: true, widerspruch_am: '2026-09-01' }).ok, false);
  assert.equal(darfNachkaufWerben({ email: 'a@b.de', einwilligung_werbung: true }, true).ok, false);
  const v = [
    { id: '1', kunde_id: 'k1', produkt: 'Serum 30 ml', reichweite_tage: 45, verkauft_am: '2026-07-01', email: 'a@b.de', hinweis_widerspruch: true },
    { id: '2', kunde_id: 'k1', produkt: 'serum 30 ML', reichweite_tage: 45, verkauft_am: '2026-08-20', email: 'a@b.de', hinweis_widerspruch: true },
    { id: '3', kunde_id: 'k2', produkt: 'Creme', reichweite_tage: 20, verkauft_am: '2026-09-01', email: 'c@d.de' },
    { id: '4', kunde_id: 'k3', produkt: 'Creme', reichweite_tage: 20, verkauft_am: '2026-09-01', email: 'e@f.de', einwilligung_werbung: true, erinnert_am: '2026-09-15' },
  ];
  const l = nachkaufListe(v, HEUTE, new Set(['k2']));
  assert.deepEqual(l.map((z) => z.verkauf.id), ['3', '2']);
  assert.equal(l[0].faellig, true); // 21.09. aufgebraucht, ab 14.09. erinnern
  assert.equal(l[0].darf.ok, false); // k2 hat widersprochen
  assert.equal(l[1].aufgebraucht, '2026-10-04');
  assert.equal(l[1].erinnernAb, '2026-09-27');
  assert.equal(l[1].faellig, false);
  const t = nachkaufText({ produkt: 'Serum', verkauftAm: '2026-08-20' });
  assert.ok(t.text.includes(WIDERSPRUCH_HINWEIS));
  assert.doesNotMatch(t.text, /\bdu\b|\bdein|heilt|garantiert|wirkt/i);
});

test('Impf-Erinnerung: neueste Behandlung, Fenster, Einwilligung, bereits erinnert', () => {
  const tiere = [
    { id: 'h', name: 'Bello', erinnerung_ok: true },
    { id: 'k', name: 'Mieze', erinnerung_ok: false },
    { id: 'p', name: 'Fury', erinnerung_ok: true, erinnerung_widerruf_am: '2026-09-01' },
  ];
  const beh = [
    { id: 'b1', tier_id: 'h', datum: '2025-09-01', art: 'impfung', bezeichnung: 'Tollwut', naechste_faellig: '2026-09-01' },
    { id: 'b2', tier_id: 'h', datum: '2026-09-10', art: 'impfung', bezeichnung: 'tollwut', naechste_faellig: '2029-09-10' },
    { id: 'b3', tier_id: 'h', datum: '2025-10-01', art: 'impfung', bezeichnung: 'SHP', naechste_faellig: '2026-10-01' },
    { id: 'b4', tier_id: 'k', datum: '2025-09-20', art: 'impfung', bezeichnung: 'Katzenschnupfen', naechste_faellig: '2026-09-20' },
    { id: 'b5', tier_id: 'p', datum: '2025-09-30', art: 'impfung', bezeichnung: 'Influenza', naechste_faellig: '2026-09-30' },
    { id: 'b6', tier_id: 'h', datum: '2025-01-01', art: 'untersuchung', bezeichnung: 'Check', naechste_faellig: '2026-12-01' },
    { id: 'b7', tier_id: 'h', datum: '2024-01-01', art: 'impfung', bezeichnung: 'Leptospirose', naechste_faellig: '2025-01-01' },
  ];
  const l = impfListe(tiere, beh, [{ behandlung_id: 'b3', erinnert_am: '2026-09-20' }], HEUTE);
  assert.deepEqual(l.map((z) => z.behandlung.id), ['b4', 'b5', 'b3']);
  assert.equal(l[0].stufe, 'ueberfaellig');
  assert.equal(l[0].darf, false);
  assert.match(l[1].grund, /widerrufen/);
  assert.equal(l[2].darf, true);
  assert.equal(l[2].erinnert, '2026-09-20');
  assert.equal(l[2].stufe, 'bald'); // in 6 Tagen
  const t = impfText({ tier: 'Bello', bezeichnung: 'Tollwut-Impfung', faellig: '2026-10-01' });
  assert.match(t.text, /01\.10\.2026/);
  assert.doesNotMatch(t.text, /\bdu\b|\bdein/i);
});

test('Rechte: die fuenf neuen Seiten verhalten sich exakt wie ihr Eltern-Modul (kein eigener Schluessel, keine Sonderfreigabe)', async () => {
  const { mitarbeiterDarf, NAV_LINKS } = await import('../out/rechte.js');
  const seiten = [
    ['/dashboard/shop/retouren', '/dashboard/shop', 'shop'],
    ['/dashboard/kfz/schaden', '/dashboard/kfz', 'kfz'],
    ['/dashboard/itassets/sla', '/dashboard/itassets', 'itassets'],
    ['/dashboard/wellness/nachkauf', '/dashboard/wellness', 'wellness'],
    ['/dashboard/tier/erinnerung', '/dashboard/tier', 'tier'],
  ];
  for (const [pfad, eltern, modul] of seiten) {
    const eintrag = NAV_LINKS.find((l) => l.href === pfad);
    assert.ok(eintrag, `${pfad} fehlt im Menue`);
    assert.equal(eintrag.modul, undefined, `${pfad} braucht keinen eigenen Modul-Schluessel`);
    assert.ok(!eintrag.immer && !eintrag.nurMitarbeiter, pfad);
    for (const rechte of [[], [modul], ['anderes']]) {
      assert.equal(mitarbeiterDarf(pfad, rechte), mitarbeiterDarf(eltern, rechte), `${pfad} mit ${JSON.stringify(rechte)}`);
    }
  }
});
