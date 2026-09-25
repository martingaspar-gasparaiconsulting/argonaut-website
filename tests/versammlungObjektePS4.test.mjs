// Paket PS4 (25.09.2026) — Versammlungen & Objekte: WEG/Verein, Mieter, Foerdermittel-Nachweis, Ehrenamt.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  monatsersterNach, monatsletzterNach, plusMonate, offenePlatzhalter,
  spaetesteEinladung, pruefeEinladung, auszaehlen, anfechtungsFristen, naechsteBeschlussNummer, ordneTops,
  einladungText, protokollText, unterschriftenFuer, sammlungZeile,
  vorschlagDringlichkeit, schadenStand,
  pruefeMieterhoehung, pruefeIndexmiete, indexErklaerung, pruefeKaution, kautionsRaten, kautionsStand, kautionsAbrechnung,
  verwendungsAuswertung, sachberichtVorlage,
  pauschalenStand, stundenAuswertung, ehrenamtsNachweis, PAUSCHALEN,
} from '../out/versammlungObjekte.js';

const HEUTE = '2026-09-25';

test('Monatsgrenzen fuer Mietrecht', () => {
  assert.equal(monatsersterNach('2026-09-25', 3), '2026-12-01');
  assert.equal(monatsersterNach('2026-11-30', 2), '2027-01-01');
  assert.equal(monatsletzterNach('2026-09-25', 2), '2026-11-30');
  assert.equal(monatsletzterNach('2027-12-01', 2), '2028-02-29');
  assert.equal(plusMonate('2026-08-31', 1), '2026-09-30');
});

test('Einladung: WEG 3 Wochen, Post-Puffer, zu spaet, noch nicht verschickt', () => {
  assert.equal(spaetesteEinladung('2026-11-10', 21), '2026-10-20');
  assert.equal(spaetesteEinladung('2026-11-10', 21, 3), '2026-10-17');
  assert.equal(spaetesteEinladung('kaputt', 21), null);
  assert.equal(pruefeEinladung({ art: 'weg', termin: '2026-11-10', versandt_am: '2026-10-20' }, HEUTE).stufe, 'ok');
  assert.equal(pruefeEinladung({ art: 'weg', termin: '2026-11-10', versandt_am: '2026-10-21' }, HEUTE).stufe, 'rot');
  assert.equal(pruefeEinladung({ art: 'weg', termin: '2026-10-10' }, HEUTE).stufe, 'rot');
  assert.equal(pruefeEinladung({ art: 'verein', termin: '2026-10-12' }, HEUTE).stufe, 'gelb'); // spaetestens 28.09.
  assert.equal(pruefeEinladung({ art: 'verein', termin: '2026-10-12', frist_tage: 7 }, HEUTE).stufe, 'offen');
  assert.equal(pruefeEinladung({ art: 'weg' }, HEUTE).stufe, 'offen');
});

test('Auszaehlung: einfach, 3/4, WEG bauliche Veraenderung, alle Mitglieder, einstimmig', () => {
  assert.equal(auszaehlen('einfach', { ja: 10, nein: 9, enthaltung: 30 }).angenommen, true);
  assert.equal(auszaehlen('einfach', { ja: 5, nein: 5 }).angenommen, false);
  assert.match(auszaehlen('einfach', { ja: 5, nein: 5 }).text, /Stimmengleichheit/);
  assert.equal(auszaehlen('einfach', { ja: '', nein: 1 }).angenommen, null);
  assert.equal(auszaehlen('dreiviertel', { ja: 30, nein: 10 }).angenommen, true);
  assert.equal(auszaehlen('dreiviertel', { ja: 29, nein: 10 }).angenommen, false);
  assert.equal(auszaehlen('dreiviertel', { ja: 3, nein: 1, enthaltung: 20 }).angenommen, true); // Enthaltungen zaehlen nicht
  assert.equal(auszaehlen('weg_bauliche', { ja: 7, nein: 3, ja_mea: 510, mea_gesamt: 1000 }).angenommen, true);
  assert.equal(auszaehlen('weg_bauliche', { ja: 7, nein: 3, ja_mea: 500, mea_gesamt: 1000 }).angenommen, false); // genau die Haelfte reicht nicht
  assert.equal(auszaehlen('weg_bauliche', { ja: 6, nein: 3, ja_mea: 600, mea_gesamt: 1000 }).angenommen, false); // genau 2/3 reicht nicht
  assert.match(auszaehlen('weg_bauliche', { ja: 6, nein: 3, ja_mea: 600, mea_gesamt: 1000 }).text, /21 Abs. 3/);
  assert.equal(auszaehlen('weg_bauliche', { ja: 7, nein: 3 }).angenommen, null);
  assert.equal(auszaehlen('alle_mitglieder', { ja: 40, nein: 0, mitglieder_gesamt: 42 }).angenommen, false);
  assert.equal(auszaehlen('alle_mitglieder', { ja: 42, nein: 0, mitglieder_gesamt: 42 }).angenommen, true);
  assert.equal(auszaehlen('alle_mitglieder', { ja: 42, nein: 0 }).angenommen, null);
  assert.equal(auszaehlen('alle_anwesenden', { ja: 12, nein: 0, enthaltung: 1 }).angenommen, false);
});

test('Anfechtung, Nummern, TOPs, Texte', () => {
  assert.deepEqual(anfechtungsFristen('weg', '2026-01-31'), { klage: '2026-02-28', begruendung: '2026-03-31', text: 'Anfechtung bis 28.02.2026 (Klage), Begründung bis 31.03.2026 — § 45 WEG.' });
  assert.equal(anfechtungsFristen('verein', '2026-01-31'), null);
  assert.equal(naechsteBeschlussNummer([3, null, 7, 2]), 8);
  assert.equal(naechsteBeschlussNummer([]), 1);
  const tops = ordneTops([{ nr: 5, titel: ' Wirtschaftsplan ', beschluss: true }, { nr: 9, titel: '', beschluss: false }, { nr: 1, titel: 'Verschiedenes', beschluss: false }]);
  assert.deepEqual(tops.map((t) => [t.nr, t.titel]), [[1, 'Wirtschaftsplan'], [2, 'Verschiedenes']]);
  const e = einladungText({ art: 'weg', termin: '2026-11-10', uhrzeit: '18:00', ort: 'Gemeindesaal', tops, absender: 'Verwaltung Muster' });
  assert.match(e, /TOP 1: Wirtschaftsplan \(Beschluss\)/);
  assert.deepEqual(offenePlatzhalter(e), []);
  assert.ok(offenePlatzhalter(einladungText({ art: 'verein', termin: '2026-11-10', tops: [] })).includes('[Tagesordnung]'));
  const p = protokollText({ art: 'weg', termin: '2026-11-10', tops, beschluesse: [{ top_nr: 1, nummer: 4, text: 'Der Wirtschaftsplan 2027 wird genehmigt.', mehrheit: 'einfach', ja: 8, nein: 1, enthaltung: 1 }], beirat: true });
  assert.match(p, /Beschluss Nr\. 4/);
  assert.match(p, /ANGENOMMEN/);
  assert.match(p, /Vorsitz Verwaltungsbeirat/);
  assert.deepEqual(unterschriftenFuer('weg', false), ['Versammlungsleitung', 'Ein Wohnungseigentümer']);
  assert.match(sammlungZeile({ nummer: 4, text: 'X', beschlossen_am: '2026-11-10', angenommen: true, angefochten_am: '2026-11-20' }), /angefochten am 20\.11\.2026/);
  assert.doesNotMatch(e + p, /\bdu\b|\bdein/i);
});

test('Schadensmeldung: Dringlichkeit, Reaktionsziel als Richtwert', () => {
  assert.equal(vorschlagDringlichkeit('heizung', 1), 'notfall');
  assert.equal(vorschlagDringlichkeit('heizung', 7), 'dringend');
  assert.equal(vorschlagDringlichkeit('gas', 7), 'notfall');
  assert.equal(vorschlagDringlichkeit('fenster_tuer', 7), 'normal');
  assert.equal(schadenStand({ gemeldet_am: '2026-09-24T08:00:00Z', dringlichkeit: 'notfall', status: 'gemeldet' }, '2026-09-25T09:00:00Z').stufe, 'rot');
  assert.equal(schadenStand({ gemeldet_am: '2026-09-25T08:00:00Z', dringlichkeit: 'notfall', status: 'gemeldet' }, '2026-09-25T21:00:00Z').stufe, 'gelb');
  assert.equal(schadenStand({ gemeldet_am: '2026-09-20', dringlichkeit: 'normal', status: 'beauftragt' }, '2026-09-25T09:00:00Z').stufe, 'gruen');
  assert.equal(schadenStand({ gemeldet_am: '2026-09-01', dringlichkeit: 'normal', status: 'erledigt', erledigt_am: '2026-09-03' }, '2026-09-25T09:00:00Z').stufe, 'grau');
});

test('Mieterhoehung Paragraf 558: Kappung, Vergleichsmiete, Sperrfristen, Zustimmung und Wirkung', () => {
  const r = pruefeMieterhoehung({ mieteAktuell: 800, mieteNeu: 900, mieteVor3Jahren: 780, kappung: 15, letzteAenderungWirksam: '2025-01-01', zugang: '2026-09-25' });
  assert.equal(r.ok, false);
  assert.equal(r.maxMiete, 897); // 780 * 1,15
  assert.ok(r.fehler.some((f) => /Kappungsgrenze 15 %/.test(f)));
  const ok = pruefeMieterhoehung({ mieteAktuell: 800, mieteNeu: 890, mieteVor3Jahren: 780, kappung: 15, letzteAenderungWirksam: '2025-01-01', zugang: '2026-09-25' });
  assert.equal(ok.ok, true);
  assert.equal(ok.zustimmungBis, '2026-11-30');
  assert.equal(ok.wirksamAb, '2026-12-01');
  assert.equal(ok.prozent, 11.3);
  const verg = pruefeMieterhoehung({ mieteAktuell: 800, mieteNeu: 890, kappung: 20, vergleichsmiete: '11,00', flaeche: 78, letzteAenderungWirksam: '2025-01-01', zugang: '2026-09-25' });
  assert.equal(verg.maxMiete, 858);
  assert.equal(verg.ok, false);
  const sperre = pruefeMieterhoehung({ mieteAktuell: 800, mieteNeu: 850, kappung: 20, letzteAenderungWirksam: '2025-10-01', zugang: '2026-09-25' });
  assert.ok(sperre.fehler.some((f) => /15 Monaten/.test(f))); // 01.10.2025 + 15 Monate = 01.01.2027 > 01.12.2026
  assert.ok(sperre.fehler.some((f) => /ein Jahr/.test(f)));   // Zugang vor 01.10.2026
  assert.equal(pruefeMieterhoehung({ mieteAktuell: 800, mieteNeu: 850, kappung: 20, zugang: '' }).ok, false);
  assert.equal(pruefeMieterhoehung({ mieteAktuell: '800', mieteNeu: '', kappung: 20, zugang: '2026-09-25' }).ok, false);
});

test('Indexmiete Paragraf 557b: neue Miete, uebernaechster Monat, Jahresfrist, Sinken', () => {
  const r = pruefeIndexmiete({ mieteAktuell: 900, indexAlt: '117,4', indexNeu: '121,1', letzteAnpassungWirksam: '2025-10-01', zugang: '2026-09-25' });
  assert.equal(r.neueMiete, 928.36);
  assert.equal(r.prozent, 3.15);
  assert.equal(r.wirksamAb, '2026-11-01');
  assert.equal(r.ok, true);
  const zuFrueh = pruefeIndexmiete({ mieteAktuell: 900, indexAlt: 117.4, indexNeu: 121.1, letzteAnpassungWirksam: '2026-01-01', zugang: '2026-09-25' });
  assert.equal(zuFrueh.ok, false);
  assert.ok(zuFrueh.hinweise.length > 0);
  const sinkt = pruefeIndexmiete({ mieteAktuell: 900, indexAlt: 121, indexNeu: 120, mietbeginn: '2024-01-01', zugang: '2026-09-25' });
  assert.ok(sinkt.neueMiete < 900 && sinkt.hinweise.some((h) => /gesunken/.test(h)));
  assert.equal(pruefeIndexmiete({ mieteAktuell: 900, indexAlt: 0, indexNeu: 120, zugang: '2026-09-25' }).neueMiete, null);
  const t = indexErklaerung({ mieter: 'Frau Kern', objekt: 'Hauptstr. 1, 2. OG', mieteAlt: 900, mieteNeu: 928.36, indexAlt: 117.4, indexNeu: 121.1, stichtagAlt: 'Juli 2025', stichtagNeu: 'August 2026', wirksamAb: '2026-11-01', vermieter: 'Muster' });
  assert.deepEqual(offenePlatzhalter(t), []);
  assert.match(t, /28,36/);
});

test('Kaution Paragraf 551: Hoechstbetrag, drei Raten ohne Rundungsverlust, Stand, Abrechnung', () => {
  assert.equal(pruefeKaution({ kaltmiete: 750, kaution: 2250 }).ok, true);
  assert.equal(pruefeKaution({ kaltmiete: 750, kaution: 2400 }).ok, false);
  assert.equal(pruefeKaution({ kaltmiete: '', kaution: 100 }).ok, null);
  const raten = kautionsRaten(1000, '2026-01-31');
  assert.deepEqual(raten.map((r) => r.faellig), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.equal(raten.reduce((a, r) => a + r.betrag, 0).toFixed(2), '1000.00');
  assert.equal(raten[0].betrag, 333.34);
  const st = kautionsStand(1000, [{ am: '2026-01-31', betrag: 333.34 }], '2026-01-31', '2026-03-01');
  assert.equal(st.ueberfaellig, 333.33);
  assert.equal(st.offen, 666.66);
  assert.equal(kautionsStand(1000, [{ am: '2026-01-31', betrag: 1000 }], '2026-01-31', HEUTE).text, 'Vollständig eingezahlt.');
  assert.equal(kautionsAbrechnung({ kaution: 2250, zinsen: '12,40', einbehalte: [{ grund: 'Schluessel', betrag: '85' }] }).auszahlung, 2177.4);
  const minus = kautionsAbrechnung({ kaution: 500, einbehalte: [{ grund: 'Schaden', betrag: 800 }] });
  assert.equal(minus.auszahlung, 0);
  assert.equal(minus.nachforderung, 300);
});

test('Verwendungsnachweis: 20-Prozent-Regel, Ausgleich, ohne Position, Zeitraum, Belegnummer', () => {
  const plan = [{ position: 'Personal', plan: 10000 }, { position: 'Sachkosten', plan: 2000 }];
  const gut = verwendungsAuswertung(plan, [{ position: 'Personal', betrag: 9500, beleg_nr: '1' }, { position: 'sachkosten', betrag: 2300, beleg_nr: '2', datum: '2026-05-01' }], { von: '2026-01-01', bis: '2026-12-31' }, 12000);
  assert.equal(gut.zeilen[1].stufe, 'gelb'); // +15 %
  assert.equal(gut.istGesamt, 11800);
  assert.ok(!gut.hinweise.some((h) => /nicht durch Einsparungen/.test(h)));
  const rot = verwendungsAuswertung(plan, [{ position: 'Personal', betrag: 10000, beleg_nr: '1' }, { position: 'Sachkosten', betrag: 2500, beleg_nr: '2' }, { position: 'Reise', betrag: 100, datum: '2025-12-20' }], { von: '2026-01-01' });
  assert.equal(rot.zeilen[1].stufe, 'rot'); // +25 %
  assert.ok(rot.hinweise.some((h) => /nicht durch Einsparungen/.test(h)));
  assert.equal(rot.ohnePosition, 100);
  assert.equal(rot.ausserhalb.length, 1);
  assert.equal(rot.fehlend.length, 1);
  assert.ok(offenePlatzhalter(sachberichtVorlage({ programm: 'X' })).length >= 4);
});

test('Ehrenamt: Pauschalen 2026, Stand je Person und Jahr, Stundenauswertung, Bescheinigung', () => {
  assert.deepEqual(PAUSCHALEN.map((p) => p.betrag), [3300, 960]);
  const z = [
    { person: 'Anna', jahr: 2026, art: 'ehrenamt', betrag: 500 },
    { person: 'Anna', jahr: 2026, art: 'ehrenamt', betrag: 500 },
    { person: 'Anna', jahr: 2025, art: 'ehrenamt', betrag: 900 },
    { person: 'Anna', jahr: 2026, art: 'uebungsleiter', betrag: 3000 },
  ];
  const s = pauschalenStand(z, 'Anna', 2026);
  assert.equal(s.find((x) => x.art === 'ehrenamt').rest, -40);
  assert.equal(s.find((x) => x.art === 'ehrenamt').stufe, 'rot');
  assert.equal(s.find((x) => x.art === 'uebungsleiter').stufe, 'gelb');
  const a = stundenAuswertung([
    { person: 'Anna', datum: '2026-03-02', stunden: 3.5 },
    { person: 'Ben', datum: '2026-03-05', stunden: 2 },
    { person: 'Anna', datum: '2026-07-01', stunden: 1 },
    { person: 'Anna', datum: '2025-12-31', stunden: 9 },
    { person: 'Ben', datum: 'kaputt', stunden: 9 },
  ], 2026);
  assert.equal(a.gesamt, 6.5);
  assert.equal(a.personen[0].person, 'Anna');
  assert.equal(a.personen[0].stunden, 4.5);
  assert.equal(a.jeMonat[2], 5.5);
  const b = ehrenamtsNachweis({ verein: 'TSV', person: 'Anna', jahr: 2026, stunden: 4.5, taetigkeiten: ['Kasse', 'Kasse', 'Fest'] });
  assert.match(b, /4,5 Stunden/);
  assert.match(b, /Kasse, Fest/);
});

test('Rechte: die neuen Seiten verhalten sich exakt wie ihr Eltern-Modul, der Verwendungsnachweis bleibt gesperrt', async () => {
  const { mitarbeiterDarf, NAV_LINKS } = await import('../out/rechte.js');
  const seiten = [
    ['/dashboard/immobilien/mieter', '/dashboard/immobilien', 'immobilien'],
    ['/dashboard/immobilien/versammlungen', '/dashboard/immobilien', 'immobilien'],
    ['/dashboard/verein/versammlungen', '/dashboard/verein', 'verein'],
    ['/dashboard/verein/ehrenamt', '/dashboard/verein', 'verein'],
    ['/dashboard/foerdermittel/nachweis', '/dashboard/foerdermittel', 'foerdermittel'],
  ];
  for (const [pfad, eltern, modul] of seiten) {
    const eintrag = NAV_LINKS.find((l) => l.href === pfad);
    assert.ok(eintrag, `${pfad} fehlt im Menue`);
    assert.equal(eintrag.modul, undefined, pfad);
    for (const rechte of [[], [modul], ['anderes']]) {
      assert.equal(mitarbeiterDarf(pfad, rechte), mitarbeiterDarf(eltern, rechte), `${pfad} mit ${JSON.stringify(rechte)}`);
    }
  }
  assert.equal(mitarbeiterDarf('/dashboard/foerdermittel/nachweis', []), false);
  assert.equal(mitarbeiterDarf('/dashboard/foerdermittel/nachweis', ['foerdermittel']), true);
});
