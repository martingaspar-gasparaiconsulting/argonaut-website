// Paket 157 (28.09.2026) — Ablauf-Baukasten Teil 2: der Motor (reine Logik) + Cron + erste Seite.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  datumTrifft, nochGueltig, neueStarts, freieStarts, laufbereit, regelUebernommen, laufWerte,
  aktionPlanen, zustandNach, planText, ausloeserZiel, MAX_JE_ABLAUF, RUECKBLICK_TAGE,
} from '../out/ablaufMotor.js';
import { fahrplan, regelZuAblauf } from '../out/ablauf.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const JETZT = new Date('2026-09-28T10:00:00Z');
const OWNER = '00000000-0000-0000-0000-00000000000a';

const UEBERFAELLIG = { art: 'datum', trigger: 'rechnung_ueberfaellig', tage: 7 };
const RECHNUNG = { id: 'r1', rechnungsnummer: 'RE-2026-0042', kunde_name: 'Müller GmbH', kunde_email: 'buchhaltung@mueller.example', brutto_summe: 1190, zahlungsstatus: 'offen', mahnstufe: 1, faelligkeitsdatum: '2026-09-10', notizen: 'alt' };
const ZIEL_R = ausloeserZiel(UEBERFAELLIG);

const MAHNLAUF = {
  name: 'Mahnlauf', aktiv: true,
  ausloeser: UEBERFAELLIG,
  schritte: [
    { id: 'a', typ: 'aktion', aktion: 'mail_senden', config: { an: 'kunde', betreff: 'Erinnerung {{nummer}}', text: 'Guten Tag {{name}}, offen: {{betrag}} seit {{tage}} Tagen.' } },
    { id: 'b', typ: 'warten', tage: 7 },
    {
      id: 'c', typ: 'wenn',
      bedingung: { verknuepfung: 'und', regeln: [{ feld: 'brutto_summe', operator: 'groesser', wert: 500 }] },
      dann: [
        { id: 'd', typ: 'aktion', aktion: 'freigabe_chef', config: {} },
        { id: 'e', typ: 'aktion', aktion: 'mahnstufe_erhoehen', config: { hoechste_stufe: 3 } },
      ],
      sonst: [{ id: 'f', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'Anrufen: {{name}}', faellig_in_tagen: 2 } }],
    },
    { id: 'g', typ: 'aktion', aktion: 'notiz_anhaengen', config: { text: 'Ablauf {{ablauf}} am {{heute}}' } },
  ],
};

test('Ziel des Auslösers: „Datum erreicht" und (seit Paket 166) „Ereignis"', () => {
  assert.deepEqual(ZIEL_R, { tabelle: 'rechnungen', zielTyp: 'rechnung', datumFeld: 'faelligkeitsdatum' });
  assert.deepEqual(ausloeserZiel({ art: 'ereignis', ereignis: 'rechnung_angelegt' }), { tabelle: 'rechnungen', zielTyp: 'rechnung', datumFeld: '' });
  assert.equal(ausloeserZiel({ art: 'ereignis', ereignis: 'gibtsnicht' }), null);
  assert.equal(ausloeserZiel({ art: 'datum', trigger: 'gibtsnicht', tage: 0 }), null);
  assert.equal(ausloeserZiel(null), null);
});

test('Datum erreicht: Grundfilter, Datum, Tage, Rückblick, Bedingungen', () => {
  assert.equal(datumTrifft(UEBERFAELLIG, RECHNUNG, JETZT).trifft, true);                                 // 18 Tage ueberfaellig, 7 verlangt
  assert.equal(datumTrifft(UEBERFAELLIG, { ...RECHNUNG, zahlungsstatus: 'bezahlt' }, JETZT).trifft, false);
  assert.equal(datumTrifft(UEBERFAELLIG, { ...RECHNUNG, faelligkeitsdatum: null }, JETZT).trifft, false);
  assert.equal(datumTrifft(UEBERFAELLIG, { ...RECHNUNG, faelligkeitsdatum: '2026-09-25' }, JETZT).trifft, false);   // erst 3 Tage
  assert.equal(datumTrifft(UEBERFAELLIG, { ...RECHNUNG, faelligkeitsdatum: '2026-09-21' }, JETZT).trifft, true);    // genau 7
  // Rueckblick zaehlt AB der Wartezeit: 120 + 7 Tage geht noch, einen Tag mehr nicht
  const grenze = new Date(JETZT.getTime() - (RUECKBLICK_TAGE + 7) * 86400000).toISOString().slice(0, 10);
  const drueber = new Date(JETZT.getTime() - (RUECKBLICK_TAGE + 8) * 86400000).toISOString().slice(0, 10);
  assert.equal(datumTrifft(UEBERFAELLIG, { ...RECHNUNG, faelligkeitsdatum: grenze }, JETZT).trifft, true);
  assert.equal(datumTrifft(UEBERFAELLIG, { ...RECHNUNG, faelligkeitsdatum: drueber }, JETZT).trifft, false);
  // Claude-Befund: „Lange nichts gehört" mit 180 Tagen lief bei den alten Regeln nie (Fenster 120 Tage) — hier schon
  const still = { art: 'datum', trigger: 'kontakt_lange_still', tage: 180 };
  assert.equal(datumTrifft(still, { id: 'k', letzter_kontakt_am: '2026-03-01' }, JETZT).trifft, true);
  const filter = { ...UEBERFAELLIG, filter: { verknuepfung: 'oder', regeln: [{ feld: 'brutto_summe', operator: 'groesser', wert: 5000 }, { feld: 'mahnstufe', operator: 'gleich', wert: 1 }] } };
  assert.equal(datumTrifft(filter, RECHNUNG, JETZT).trifft, true);
  assert.equal(datumTrifft(filter, { ...RECHNUNG, mahnstufe: 2 }, JETZT).trifft, false);
  assert.equal(datumTrifft({ art: 'knopf' }, RECHNUNG, JETZT).trifft, false);
});

test('Nach dem Warten: bezahlte Rechnung beendet den Lauf; Start-Bedingungen gelten nur beim Start (Paket 158)', () => {
  assert.equal(nochGueltig(UEBERFAELLIG, RECHNUNG), true);
  assert.equal(nochGueltig(UEBERFAELLIG, { ...RECHNUNG, zahlungsstatus: 'bezahlt' }), false);
  // Mahnlauf „nur Mahnstufe 0": nach dem Hochzaehlen laeuft er weiter
  assert.equal(nochGueltig({ ...UEBERFAELLIG, filter: { verknuepfung: 'und', regeln: [{ feld: 'mahnstufe', operator: 'gleich', wert: 0 }] } }, { ...RECHNUNG, mahnstufe: 1 }), true);
  assert.equal(nochGueltig({ art: 'datum', trigger: 'gibtsnicht', tage: 0 }, RECHNUNG), false);
  assert.equal(nochGueltig({ art: 'datum', trigger: 'angebot_ohne_antwort', tage: 5 }, { status: 'angenommen' }), false);
  assert.equal(nochGueltig({ art: 'knopf' }, RECHNUNG), true);
});

test('Neue Starts: EINMALIG, nichts doppelt nach der Übernahme, Deckel je 24 Stunden', () => {
  const k = Array.from({ length: 30 }, (_, i) => ({ ...RECHNUNG, id: `r${i}` }));
  const n = neueStarts(UEBERFAELLIG, k, new Set(['r0', 'r1']), new Set(['r2']), 10, JETZT);
  assert.equal(n.faellig, 27);
  assert.equal(n.starten.length, 10);
  assert.equal(n.zurueckgestellt, 17);
  assert.ok(!n.starten.some((s) => ['r0', 'r1', 'r2'].includes(s.id)));
  assert.equal(neueStarts(UEBERFAELLIG, [{ ...RECHNUNG, id: '' }], new Set(), new Set(), 5, JETZT).faellig, 0);
  assert.equal(neueStarts(UEBERFAELLIG, [{ ...RECHNUNG, zahlungsstatus: 'bezahlt' }], new Set(), new Set(), 5, JETZT).faellig, 0);
  assert.equal(MAX_JE_ABLAUF, 25);
  assert.equal(freieStarts(0), 25);
  assert.equal(freieStarts(10), 15);
  assert.equal(freieStarts(40), 0);
  assert.equal(freieStarts(-3), 25);
});

test('Laufbereit nur eingeschaltet UND einschaltbar; alte Regel ruht, sobald ihr Ablauf läuft', () => {
  assert.equal(laufbereit(MAHNLAUF), true);
  assert.equal(laufbereit({ ...MAHNLAUF, aktiv: false }), false);
  assert.equal(laufbereit({ ...MAHNLAUF, schritte: [{ id: 'x', typ: 'aktion', aktion: 'glocke', config: { text: 'x' } }] }), false);
  assert.equal(laufbereit({ ...MAHNLAUF, schritte: [{ id: 'e', typ: 'aktion', aktion: 'mahnstufe_erhoehen', config: {} }] }), false, 'Geld ohne Freigabe');
  assert.equal(regelUebernommen('r1', [{ alt_regel_id: 'r1', aktiv: true }]), true);
  assert.equal(regelUebernommen('r1', [{ alt_regel_id: 'r1', aktiv: false }]), false);
  assert.equal(regelUebernommen('r1', [{ alt_regel_id: 'r2', aktiv: true }, { alt_regel_id: null, aktiv: true }]), false);
});

test('Platzhalter: neue und übernommene Texte ({{regel}}, {{tage}}, {{datum}}) funktionieren', () => {
  const w = laufWerte(MAHNLAUF, RECHNUNG, JETZT);
  assert.equal(w.name, 'Müller GmbH');
  assert.equal(w.tage, '18');
  assert.equal(w.datum, '10.09.2026');
  assert.equal(w.regel, 'Mahnlauf');
  assert.equal(w.ablauf, 'Mahnlauf');
  assert.equal(laufWerte({ name: 'K', ausloeser: { art: 'knopf' } }, RECHNUNG, JETZT).regel, 'K');
});

test('Aktionen planen: Aufgabe, Status, Mahnstufe, Notiz — immer mit Besitzer, nie „bezahlt"', () => {
  const plan = (schritt, satz = RECHNUNG, ziel = ZIEL_R, ablauf = MAHNLAUF) => aktionPlanen(schritt, ablauf, ziel, OWNER, satz, JETZT);
  const auf = plan(MAHNLAUF.schritte[2].sonst[0]);
  assert.equal(auf.art, 'anlegen');
  assert.equal(auf.tabelle, 'aufgaben');
  assert.equal(auf.daten.owner_user_id, OWNER);
  assert.equal(auf.daten.titel, 'Anrufen: Müller GmbH');
  assert.equal(auf.daten.faellig_am, '2026-09-30');
  assert.equal(auf.daten.status, 'todo');
  assert.equal(plan({ id: 'x', typ: 'aktion', aktion: 'aufgabe_anlegen', config: {} }).daten.titel, 'Ablauf: Mahnlauf');
  const st = plan({ id: 's', typ: 'aktion', aktion: 'status_aendern', config: { neuer_status: 'ueberfaellig' } });
  assert.deepEqual([st.art, st.tabelle, st.id, st.daten], ['aendern', 'rechnungen', 'r1', { zahlungsstatus: 'ueberfaellig' }]);
  assert.equal(plan({ id: 's', typ: 'aktion', aktion: 'status_aendern', config: { neuer_status: 'Bezahlt' } }).art, 'fehler');
  assert.equal(plan({ id: 's', typ: 'aktion', aktion: 'status_aendern', config: {} }).art, 'uebersprungen');
  const m = plan(MAHNLAUF.schritte[2].dann[1]);
  assert.deepEqual([m.art, m.daten], ['aendern', { mahnstufe: 2, letzte_mahnung_am: '2026-09-28' }]);
  assert.equal(plan(MAHNLAUF.schritte[2].dann[1], { ...RECHNUNG, mahnstufe: 3 }).art, 'uebersprungen');
  const zielA = ausloeserZiel({ art: 'datum', trigger: 'angebot_ohne_antwort', tage: 7 });
  assert.equal(plan(MAHNLAUF.schritte[2].dann[1], { id: 'a1' }, zielA).art, 'uebersprungen', 'Mahnstufe nur bei Rechnungen');
  const n = plan(MAHNLAUF.schritte[3]);
  assert.deepEqual(n.daten, { notizen: 'alt\nAblauf Mahnlauf am 28.09.2026' });
  assert.equal(plan(MAHNLAUF.schritte[3], { id: 'a1', notiz: null }, zielA).daten.notiz, 'Ablauf Mahnlauf am 28.09.2026');
  const glocke = plan({ id: 'g', typ: 'aktion', aktion: 'glocke', config: { text: 'x' } });
  assert.equal(glocke.art, 'fehler', 'noch nicht im Motor');
  assert.match(glocke.meldung, /führt der Motor noch nicht aus/, 'klarer Grund im Protokoll');
  assert.equal(plan({ id: 'g', typ: 'aktion', aktion: 'raketenstart', config: {} }).art, 'fehler');
});

test('Mail: Betriebspost geht immer, Werbung nur mit Einwilligung und ohne Widerspruch', () => {
  const mail = aktionPlanen(MAHNLAUF.schritte[0], MAHNLAUF, ZIEL_R, OWNER, RECHNUNG, JETZT);
  assert.deepEqual([mail.art, mail.an, mail.betreff], ['mail', 'buchhaltung@mueller.example', 'Erinnerung RE-2026-0042']);
  assert.match(mail.text, /Guten Tag Müller GmbH, offen: 1\.190,00.* seit 18 Tagen\./);
  assert.equal(aktionPlanen(MAHNLAUF.schritte[0], MAHNLAUF, ZIEL_R, OWNER, { ...RECHNUNG, kunde_email: '' }, JETZT).art, 'uebersprungen');
  const still = { name: 'Rückholung', ausloeser: { art: 'datum', trigger: 'kontakt_lange_still', tage: 180 } };
  const zielK = ausloeserZiel(still.ausloeser);
  const schritt = { id: 'm', typ: 'aktion', aktion: 'mail_senden', config: { an: 'kunde', betreff: 'Lange nicht gesehen', text: 'Hallo {{name}}' } };
  const kunde = { id: 'k1', vorname: 'Eva', nachname: 'Berg', email: 'eva@example.de' };
  assert.equal(aktionPlanen(schritt, still, zielK, OWNER, kunde, JETZT).art, 'uebersprungen', 'ohne Einwilligung keine Werbung');
  assert.equal(aktionPlanen(schritt, still, zielK, OWNER, { ...kunde, werbe_einwilligung: true }, JETZT).art, 'mail');
  assert.equal(aktionPlanen(schritt, still, zielK, OWNER, { ...kunde, werbe_einwilligung: true, werbe_widerspruch_am: '2026-05-01' }, JETZT).art, 'uebersprungen');
  const intern = { ...schritt, config: { ...schritt.config, an: 'feste_adresse', adresse: 'chef@betrieb.example' } };
  assert.equal(aktionPlanen(intern, still, zielK, OWNER, kunde, JETZT).an, 'chef@betrieb.example', 'Post an die eigene Adresse ist keine Werbung');
  assert.match(planText(aktionPlanen(schritt, still, zielK, OWNER, kunde, JETZT)), /^übersprungen: kein Werbeversand/);
});

test('Zustand nach dem Fahrplan', () => {
  assert.deepEqual(zustandNach({ art: 'fertig' }).status, 'fertig');
  assert.deepEqual(zustandNach({ art: 'warten', bis: '2026-10-05T10:00:00.000Z', weiter: '2' }), { status: 'wartet', pfad: '2', weiter_am: '2026-10-05T10:00:00.000Z', meldung: 'Wartet' });
  assert.equal(zustandNach({ art: 'warten', bis: 'x', weiter: null }).status, 'fertig');
  assert.deepEqual(zustandNach({ art: 'freigabe', pfad: '2.dann.0', weiter: '2.dann.1' }).pfad, '2.dann.1');
  assert.equal(zustandNach({ art: 'freigabe', pfad: '2.dann.0', weiter: '2.dann.1' }).status, 'freigabe');
  assert.equal(zustandNach({ art: 'freigabe', pfad: '3', weiter: null }).status, 'fertig');
  assert.equal(zustandNach({ art: 'stopp', pfad: '0' }).status, 'gestoppt');
});

test('Ganzer Mahnlauf über die Zeit: Mail -> warten -> Freigabe -> Mahnstufe + Notiz', () => {
  // Tag 0: Start
  const f1 = fahrplan(MAHNLAUF, null, RECHNUNG, JETZT);
  const z1 = zustandNach(f1.danach);
  assert.deepEqual(f1.jetzt.map((e) => aktionPlanen(e.schritt, MAHNLAUF, ZIEL_R, OWNER, RECHNUNG, JETZT).art), ['mail']);
  assert.equal(z1.status, 'wartet');
  // Tag 7: noch offen -> Wenn ja -> haelt vor der Mahnstufe
  const tag7 = new Date(z1.weiter_am);
  assert.equal(nochGueltig(MAHNLAUF.ausloeser, RECHNUNG), true);
  const f2 = fahrplan(MAHNLAUF, z1.pfad, RECHNUNG, tag7);
  const z2 = zustandNach(f2.danach);
  assert.equal(z2.status, 'freigabe');
  assert.equal(f2.jetzt.filter((e) => e.art === 'aktion').length, 0, 'vor der Freigabe passiert nichts mit Geld');
  // Chef gibt frei -> ab z2.pfad weiter
  const f3 = fahrplan(MAHNLAUF, z2.pfad, RECHNUNG, tag7);
  assert.deepEqual(f3.jetzt.map((e) => aktionPlanen(e.schritt, MAHNLAUF, ZIEL_R, OWNER, RECHNUNG, tag7).meldung), ['Mahnstufe 1 → 2', 'Notiz angehängt']);
  assert.equal(zustandNach(f3.danach).status, 'fertig');
  // Kleine Rechnung: Sonst-Zweig, keine Freigabe noetig
  const klein = { ...RECHNUNG, brutto_summe: 80 };
  const f4 = fahrplan(MAHNLAUF, z1.pfad, klein, tag7);
  assert.equal(zustandNach(f4.danach).status, 'fertig');
  assert.deepEqual(f4.jetzt.filter((e) => e.art === 'aktion').map((e) => e.schritt.aktion), ['aufgabe_anlegen', 'notiz_anhaengen']);
});

test('Übernommene alte Regel verhält sich wie vorher', () => {
  const alt = { id: 'r9', name: 'Dank', beschreibung: null, trigger_typ: 'rechnung_bezahlt', bedingung: [], aktion_typ: 'mail_senden', aktion_config: { an: 'kunde', betreff: 'Danke {{name}}', text: 'Zahlung vom {{datum}} erhalten ({{regel}})' }, wartezeit_tage: 1 };
  const { ablauf } = regelZuAblauf(alt);
  const a = { ...ablauf, aktiv: true };
  assert.equal(laufbereit(a), true);
  const bezahlt = { id: 'b1', kunde_name: 'Müller GmbH', kunde_email: 'm@example.de', zahlungsstatus: 'bezahlt', bezahlt_am: '2026-09-26' };
  assert.equal(datumTrifft(a.ausloeser, bezahlt, JETZT).trifft, true);
  const f = fahrplan(a, null, bezahlt, JETZT);
  const m = aktionPlanen(f.jetzt[0].schritt, a, ausloeserZiel(a.ausloeser), OWNER, bezahlt, JETZT);
  assert.deepEqual([m.art, m.betreff, m.text], ['mail', 'Danke Müller GmbH', 'Zahlung vom 26.09.2026 erhalten (Dank)']);
});

test('Code: Cron nur mit Zeitplan-Geheimnis, streng je Betrieb, stündlich; alte Regel ruht; Seite und Menü', () => {
  const cron = lies('app/api/cron/ablaeufe/route.ts');
  assert.match(cron, /const absage = await cronGuard\(req\);/);
  assert.doesNotMatch(cron, /betreiberErlaubt/);
  // jede Abfrage/Aenderung ueber den Service-Client ist auf den Betrieb gefiltert
  const aufrufe = cron.split('admin.from(').slice(1);
  for (const a of aufrufe) {
    const stueck = a.slice(0, 420);
    if (/^'ablaeufe'\)\.select\('\*'\)\.eq\('aktiv', true\)/.test(stueck)) continue;            // Liste aller aktiven Ablaeufe
    if (/^'ablauf_laeufe'\)\.select\('\*'\)\s*\.eq\('status', 'wartet'\)/.test(stueck)) continue; // Warteliste, danach Besitzer-Abgleich
    if (/^'ablauf_ereignisse'\)\.select\('\*'\)\s*\.is\('verarbeitet_am', null\)/.test(stueck)) continue; // Paket 166: Ereignis-Warteschlange, danach passendeAblaeufe je Betrieb
    if (/^plan\.tabelle\)\.insert\(\{ \.\.\.plan\.daten, owner_user_id: ownerId \}\)/.test(stueck)) continue;
    if (/^'ablauf_protokoll'\)\.insert\(\{\s*owner_user_id: lauf\.owner_user_id/.test(stueck)) continue;
    if (/^'ablauf_laeufe'\)\.insert\(\{\s*owner_user_id: ablauf\.owner_user_id/.test(stueck)) continue;
    assert.match(stueck, /owner_user_id/, `ohne Betriebs-Filter: admin.from(${stueck.slice(0, 80)}`);
  }
  assert.match(cron, /ablauf\.owner_user_id !== lauf\.owner_user_id/);
  assert.match(cron, /\.eq\('status', 'wartet'\)\.select\('id'\)/, 'Anspruch: nur ein Durchgang setzt fort');
  assert.match(cron, /nochGueltig\(ablauf\.ausloeser, satz\)/);
  const vercel = JSON.parse(lies('vercel.json'));
  assert.ok(vercel.crons.some((c) => c.path === '/api/cron/ablaeufe' && c.schedule === '20 * * * *'));
  const alt = lies('app/api/cron/automationen/route.ts');
  assert.match(alt, /if \(regelUebernommen\(regel\.id, uebernommen\)\)/);
  assert.match(lies('app/api/automationen/probe/route.ts'), /regelUebernommen\(regel\.id, uebernommen\)/);
  assert.match(lies('lib/rechte.ts'), /href: '\/dashboard\/ablaeufe', nurChef: true/);
  const seite = lies('app/dashboard/ablaeufe/page.tsx');
  // nie beide aktiv: erst alte Regel aus, dann Ablauf an
  assert.ok(seite.indexOf("from('automation_regeln').update({ aktiv: false })") < seite.indexOf("from('ablaeufe').update({ aktiv: true"));
  assert.match(seite, /\.eq\('status', 'freigabe'\)\.select\('id'\)/);
  const probe = lies('app/api/ablaeufe/probe/route.ts');
  assert.match(probe, /ablauf\.owner_user_id !== user\.id/);
  assert.doesNotMatch(probe, /\.(insert|update|delete)\(/, 'Probelauf schreibt nichts');
});
