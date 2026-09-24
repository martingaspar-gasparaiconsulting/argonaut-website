// Paket PQ (24.09.2026) — Gesundheit Stufe 1: Praxis-Paket (H01), HWG-Waechter (H02), Gesundheitsdaten-Schicht (H03).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  berlinTag, plusMonate, recallStand, recallListe, recallText, einwilligungStand, darfErinnern,
  ausfallVereinbarungAm, pruefeAusfall, ausfallSchreiben, pruefeEinwilligung, einwilligungText, pruefeNotiz,
} from '../out/praxis.js';
import { pruefeHwg, gesundheitsBezug, hwgHinweise } from '../out/hwgWaechter.js';
import { leseSchluessel, verschluessele, entschluessele, bindung, istVerschluesselt } from '../out/gesundheitsdaten.js';

const PNG = 'data:image/png;base64,' + 'A'.repeat(400);

test('Datum: Berlin-Tag und Monate ohne Ueberlauf', () => {
  assert.equal(berlinTag('2026-09-27T22:30:00Z'), '2026-09-28');
  assert.equal(plusMonate('2026-01-31', 1), '2026-02-28');
  assert.equal(plusMonate('2028-01-31', 1), '2028-02-29');
  assert.equal(plusMonate('2026-11-15', 3), '2027-02-15');
  assert.equal(plusMonate('2026-08-31', 6), '2027-02-28');
});

test('Recall: faellig, ueberfaellig, Termin steht, fester Termin, pausiert, ohne Besuch', () => {
  const h = '2026-09-24';
  assert.deepEqual(recallStand({ letzterBesuch: '2026-03-20', intervallMonate: 6, heute: h }), { status: 'ueberfaellig', faelligAm: '2026-09-20', tage: -4 });
  assert.equal(recallStand({ letzterBesuch: '2026-04-01', intervallMonate: 6, heute: h }).status, 'faellig');
  assert.equal(recallStand({ letzterBesuch: '2026-06-01', intervallMonate: 6, heute: h }).status, 'geplant');
  assert.equal(recallStand({ letzterBesuch: '2026-03-20', intervallMonate: 6, naechsterTermin: '2026-10-02', heute: h }).status, 'termin');
  assert.equal(recallStand({ letzterBesuch: '2026-03-20', intervallMonate: 6, naechsterTermin: '2026-09-01', heute: h }).status, 'ueberfaellig', 'vergangener Termin zaehlt nicht');
  assert.equal(recallStand({ letzterBesuch: '2026-03-20', intervallMonate: 6, naechsterAm: '2026-12-01', heute: h }).faelligAm, '2026-12-01');
  assert.equal(recallStand({ letzterBesuch: '2026-03-20', intervallMonate: 6, pausiert: true, heute: h }).status, 'pausiert');
  assert.equal(recallStand({ letzterBesuch: null, intervallMonate: 6, heute: h }).status, 'ohne_besuch');

  const liste = recallListe(
    [{ id: 'a', name: 'Anna', email: 'A@x.de' }, { id: 'b', name: 'Bert', email: 'b@x.de' }, { id: 'c', name: 'Cora' }, { id: 'd', name: 'Dora' }],
    [{ kunde_id: 'a', intervall_monate: 6 }, { kunde_id: 'b', intervall_monate: 6 }, { kunde_id: 'c', intervall_monate: 1 }],
    [{ kunde_id: 'a', datum: '2026-03-01' }, { kunde_id: 'a', datum: '2026-10-30' }, { kunde_id: 'b', datum: '2026-03-01' }, { kunde_id: 'c', datum: '2026-09-10' }, { kunde_id: 'd', datum: '2026-01-01' }],
    [{ kunde_email: 'a@x.de ', beginn_am: '2026-10-01T08:00:00Z', status: 'geplant' }, { kunde_email: 'b@x.de', beginn_am: '2026-10-01T08:00:00Z', status: 'abgesagt' }],
    h,
  );
  assert.deepEqual(liste.map((z) => [z.kunde.id, z.status]), [['b', 'ueberfaellig'], ['c', 'geplant'], ['a', 'termin']]);
  assert.equal(liste[2].letzterBesuch, '2026-03-01', 'Zukunfts-Behandlung zaehlt nicht als Besuch');
});

test('Recall-Text: keine Behandlung, Sie-Form, SMS mit STOP', () => {
  const m = recallText({ name: 'Frau Meier', firma: 'Praxis Sonne', kanal: 'email' });
  assert.match(m.betreff, /Praxis Sonne/);
  assert.match(m.text, /Guten Tag Frau Meier/);
  assert.doesNotMatch(m.text, /\bdu\b|dein/i);
  assert.match(recallText({ name: '', firma: 'X', kanal: 'sms' }).text, /STOP/);
});

test('Einwilligungen: neueste Zeile entscheidet, Widerruf als neue Zeile, Wege', () => {
  const z = [
    { kunde_id: 'a', art: 'recall', erteilt_am: '2026-01-01T10:00:00Z', daten: { kanaele: ['email'] } },
    { kunde_id: 'a', art: 'recall', erteilt_am: '2026-05-01T10:00:00Z', widerruf: true },
    { kunde_id: 'b', art: 'recall', erteilt_am: '2026-01-01T10:00:00Z', daten: { kanaele: ['email', 'sms'] } },
  ];
  assert.equal(einwilligungStand(z, 'a', 'recall').status, 'widerrufen');
  assert.equal(einwilligungStand(z, 'b', 'recall').status, 'aktiv');
  assert.equal(einwilligungStand(z, 'c', 'recall').status, 'fehlt');
  assert.equal(darfErinnern(z, 'a', 'email'), false);
  assert.equal(darfErinnern(z, 'b', 'sms'), true);
  assert.equal(darfErinnern(z, 'b', 'telefon'), false);
  assert.deepEqual(pruefeEinwilligung({ art: 'recall', name: 'Anna', unterschrift: PNG, daten: { kanaele: ['email'] } }), []);
  assert.equal(pruefeEinwilligung({ art: 'recall', name: 'Anna', unterschrift: PNG, daten: {} }).length, 1);
  assert.equal(pruefeEinwilligung({ art: 'ausfall', name: 'A', unterschrift: 'x', daten: { frist_stunden: 0, betrag: 5000 } }).length, 4);
  assert.equal(pruefeEinwilligung({ art: 'quatsch', name: 'Anna', unterschrift: PNG }).length, 1);
  assert.match(einwilligungText('ausfall', 'Praxis Sonne', { frist_stunden: 24, betrag: 45 }), /24 Stunden.*45,00 €.*anderweitig vergeben.*geringerer Schaden/s);
  assert.match(einwilligungText('datenschutz', ''), /\[Name des Betriebs\].*widerrufen/s);
});

test('Ausfallhonorar: Vereinbarung vorher, Frist, neu vergeben, Nichterscheinen', () => {
  const z = [
    { kunde_id: 'a', art: 'ausfall', erteilt_am: '2026-09-01T10:00:00Z', daten: { frist_stunden: 24, betrag: 45 } },
    { kunde_id: 'b', art: 'ausfall', erteilt_am: '2026-09-23T10:00:00Z', daten: { frist_stunden: 24, betrag: 45 } },
    { kunde_id: 'c', art: 'ausfall', erteilt_am: '2026-09-01T10:00:00Z', daten: { frist_stunden: 24, betrag: 45 } },
    { kunde_id: 'c', art: 'ausfall', erteilt_am: '2026-09-10T10:00:00Z', widerruf: true },
    { kunde_id: 'd', art: 'ausfall', erteilt_am: '2026-09-01T10:00:00Z', daten: { frist_stunden: 24, betrag: 45 } },
    { kunde_id: 'd', art: 'ausfall', erteilt_am: '2026-09-10T10:00:00Z', widerruf: true, daten: { frist_stunden: 24, betrag: 45 } },
  ];
  const termin = '2026-09-22T08:00:00Z';
  const jetzt = '2026-09-24T08:00:00Z';
  const va = ausfallVereinbarungAm(z, 'a', termin);
  assert.deepEqual(va, { erteilt_am: '2026-09-01T10:00:00Z', frist_stunden: 24, betrag: 45 });
  assert.equal(ausfallVereinbarungAm(z, 'b', termin), null, 'erst nach dem Termin unterschrieben');
  assert.equal(ausfallVereinbarungAm(z, 'c', termin), null, 'vor dem Termin widerrufen');
  assert.equal(ausfallVereinbarungAm(z, 'd', termin), null, 'Widerruf zaehlt auch, wenn er Daten mitfuehrt');

  assert.equal(pruefeAusfall({ terminAm: termin, vereinbarung: va, jetzt }).ergebnis, 'faellig');
  assert.equal(pruefeAusfall({ terminAm: termin, vereinbarung: va, jetzt }).betrag, 45);
  assert.equal(pruefeAusfall({ terminAm: termin, abgesagtAm: '2026-09-21T07:00:00Z', vereinbarung: va, jetzt }).ergebnis, 'rechtzeitig');
  const spaet = pruefeAusfall({ terminAm: termin, abgesagtAm: '2026-09-21T20:00:00Z', vereinbarung: va, jetzt });
  assert.equal(spaet.ergebnis, 'faellig');
  assert.match(spaet.text, /nur 12 Stunden/);
  const nach = pruefeAusfall({ terminAm: termin, abgesagtAm: '2026-09-22T09:00:00Z', vereinbarung: va, jetzt });
  assert.equal(nach.ergebnis, 'faellig', 'Absage nach Beginn = nicht erschienen');
  assert.match(nach.text, /Nicht erschienen/);
  assert.equal(pruefeAusfall({ terminAm: termin, neuVergeben: true, vereinbarung: va, jetzt }).ergebnis, 'neu_vergeben');
  assert.equal(pruefeAusfall({ terminAm: termin, vereinbarung: null, jetzt }).ergebnis, 'keine_vereinbarung');
  assert.equal(pruefeAusfall({ terminAm: '2026-09-30T08:00:00Z', vereinbarung: va, jetzt }).ergebnis, 'zu_frueh');
  const brief = ausfallSchreiben({ name: 'Herr Kurz', firma: 'Praxis Sonne', terminAm: termin, betrag: 45, fristStunden: 24, vereinbartAm: va.erteilt_am });
  assert.match(brief, /22\.09\.2026 um 10:00 Uhr/);
  assert.match(brief, /\[Bankverbindung\]/);
});

test('Notiz-Pruefung', () => {
  assert.equal(pruefeNotiz({ art: 'allergie', text: 'Latex' }), null);
  assert.ok(pruefeNotiz({ art: 'befund', text: 'x y' }));
  assert.ok(pruefeNotiz({ art: 'hinweis', text: ' ' }));
  assert.ok(pruefeNotiz({ art: 'hinweis', text: 'x'.repeat(4001) }));
});

test('HWG: ohne Gesundheitsbezug keine Meldung', () => {
  const r = pruefeHwg('Neuer Haarschnitt? Jetzt 20 % Rabatt mit Gutschein über 10 Euro, gratis Kaffee!');
  assert.equal(r.betroffen, false);
  assert.equal(r.ampel, 'gruen');
  assert.deepEqual(hwgHinweise(''), []);
});

test('HWG: typische Verstoesse werden erkannt', () => {
  const r = pruefeHwg('Unsere Therapie heilt Ihre Rückenschmerzen endgültig — ganz ohne Nebenwirkungen. Nie wieder Schmerzen! Patienten berichten: hat mir sofort geholfen.');
  assert.equal(r.ampel, 'rot');
  const ids = r.treffer.map((t) => t.id);
  for (const id of ['heilversprechen', 'nebenwirkungsfrei', 'erfahrungsberichte']) assert.ok(ids.includes(id), id);
  assert.equal(r.treffer[0].schwere, 'rot', 'rote Treffer zuerst');
  assert.match(r.treffer.find((t) => t.id === 'heilversprechen').stelle, /heilt/);

  const op = pruefeHwg('Faltenbehandlung mit Hyaluron: sehen Sie unsere Vorher-Nachher-Bilder!');
  assert.ok(op.treffer.some((t) => t.id === 'vorher_nachher_eingriff' && t.schwere === 'rot'));
  assert.ok(!op.treffer.some((t) => t.id === 'vorher_nachher'));
  const mass = pruefeHwg('Massage bei Verspannungen und Rückenschmerzen — vorher und nachher fühlen Sie den Unterschied.');
  assert.ok(mass.treffer.some((t) => t.id === 'vorher_nachher' && t.schwere === 'gelb'));

  assert.ok(pruefeHwg('Begleitende Behandlung bei Krebs und Tumorerkrankungen').treffer.some((t) => t.id === 'anlage_krankheiten'));
  assert.ok(!pruefeHwg('Rauchentwöhnung: Nikotinsucht besiegen mit Hypnose-Therapie').treffer.some((t) => t.id === 'anlage_krankheiten'), 'Nikotin ist ausgenommen');
  assert.ok(pruefeHwg('Hypnose-Therapie gegen Nikotinsucht und Alkoholsucht').treffer.some((t) => t.id === 'anlage_krankheiten' && /Alkoholsucht/.test(t.stelle)), 'Ausnahme gilt nur fuer die Nikotin-Stelle');
  assert.ok(!pruefeHwg('Wir haben gesucht und gefunden: Therapie mit Sehnsucht').treffer.some((t) => t.id === 'anlage_krankheiten'), 'gesucht/Sehnsucht sind keine Sucht');
  assert.ok(pruefeHwg('Migräne? Diagnose per WhatsApp-Foto, Online-Behandlung inklusive.').treffer.some((t) => t.id === 'fernbehandlung'));
  assert.ok(pruefeHwg('Physiotherapie bei Arthrose: erste Behandlung gratis, Gewinnspiel läuft!').treffer.some((t) => t.id === 'werbegaben'));
  const sauber = pruefeHwg('Physiotherapie bei Rückenschmerzen: Wir nehmen uns Zeit, beraten Sie ausführlich und stimmen die Behandlung mit Ihnen ab.');
  assert.equal(sauber.betroffen, true);
  assert.equal(sauber.ampel, 'gruen');
  assert.ok(gesundheitsBezug('Botox gegen Falten'));
  assert.match(hwgHinweise('Diese Kur heilt Migräne.')[0], /⛔ Heilmittelwerbegesetz \(§ 3/);
});

test('Gesundheitsdaten: verschluesseln, Bindung, Manipulation, falscher Schluessel', () => {
  const k = leseSchluessel(Buffer.alloc(32, 7).toString('base64'));
  assert.ok(k);
  assert.equal(leseSchluessel('zu-kurz'), null);
  assert.equal(leseSchluessel(Buffer.alloc(16).toString('base64')), null);
  assert.equal(leseSchluessel(undefined), null);
  const b = bindung('owner-1', 'kunde-1');
  const p = verschluessele('Latex-Allergie, Pflaster vermeiden', k, b);
  assert.ok(istVerschluesselt(p));
  assert.doesNotMatch(p, /Latex/);
  assert.notEqual(verschluessele('Latex-Allergie, Pflaster vermeiden', k, b), p, 'jedes Mal neue IV');
  assert.equal(entschluessele(p, k, b), 'Latex-Allergie, Pflaster vermeiden');
  assert.equal(entschluessele(p, k, bindung('owner-1', 'kunde-2')), null, 'umgehaengt auf anderen Kunden');
  assert.equal(entschluessele(p, leseSchluessel(Buffer.alloc(32, 8).toString('base64')), b), null, 'falscher Schluessel');
  const teile = p.split(':');
  const kaputt = [teile[0], teile[1], teile[2], Buffer.from('XXXX' + Buffer.from(teile[3], 'base64').toString('latin1').slice(4), 'latin1').toString('base64')].join(':');
  assert.equal(entschluessele(kaputt, k, b), null, 'veraenderte Daten');
  assert.equal(entschluessele('Klartext', k, b), null);
  assert.equal(istVerschluesselt('v1:abc'), false);
  assert.equal(entschluessele(verschluessele('Ä ö ü ß 😊', k, b), k, b), 'Ä ö ü ß 😊');
});
