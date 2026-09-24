// Paket PF (24.09.2026) — Personal-Dokumente: NachwG, Probezeit, Befristung, Zeugnis, AGG.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  istIso, plusTage, plusMonate, fristEnde, datumDe, tageBis,
  NACHWEIS_PUNKTE, nachweisStand, warnungen, beschaeftigungsbestaetigung,
  NOTEN, pruefeZeugnis, zeugnisPrompt, aggPruefung, stellenPrompt, saeubere,
} from '../out/personalDokumente.js';

test('Datum: gueltig, Monatsende, Fristende nach BGB', () => {
  assert.equal(istIso('2026-02-29'), false);
  assert.equal(istIso('2028-02-29'), true);
  assert.equal(plusMonate('2026-01-31', 1), '2026-02-28');
  assert.equal(plusTage('2026-12-31', 1), '2027-01-01');
  assert.equal(fristEnde('2026-03-01', 6), '2026-08-31');
  assert.equal(fristEnde('2026-09-15', 6), '2027-03-14');
  assert.equal(datumDe('2026-09-24'), '24.09.2026');
  assert.equal(datumDe(null), '—');
  assert.equal(tageBis('2026-09-24', '2026-10-24'), 30);
});

test('NachwG: Schluessel eindeutig, Pflichtpunkte mit Fristen', () => {
  const keys = NACHWEIS_PUNKTE.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(NACHWEIS_PUNKTE.find((p) => p.key === 'entgelt').frist === 'tag1');
  assert.ok(NACHWEIS_PUNKTE.find((p) => p.key === 'kuendigung').frist === 'monat1');
});

test('NachwG: Befristungspunkt nur bei befristet, Ueberfaelligkeit nach Frist', () => {
  const un = nachweisStand({ beginn: '2026-09-01', befristet: false }, '2026-09-01');
  const be = nachweisStand({ beginn: '2026-09-01', befristet: true }, '2026-09-01');
  assert.equal(be.gesamt, un.gesamt + 1);
  // am ersten Tag ist noch nichts ueberfaellig
  assert.equal(un.ueberfaellig.length, 0);
  // am zweiten Tag: die drei Tag-1-Punkte
  assert.deepEqual(nachweisStand({ beginn: '2026-09-01' }, '2026-09-02').ueberfaellig.map((p) => p.key), ['parteien', 'entgelt', 'arbeitszeit']);
  // Tag 7 (07.09.) noch in Frist, am 08.09. ueberfaellig
  assert.ok(!nachweisStand({ beginn: '2026-09-01' }, '2026-09-07').ueberfaellig.some((p) => p.key === 'beginn'));
  assert.ok(nachweisStand({ beginn: '2026-09-01' }, '2026-09-08').ueberfaellig.some((p) => p.key === 'beginn'));
  // erledigte Punkte zaehlen nicht
  const teil = nachweisStand({ beginn: '2026-09-01', nachweis_punkte: ['parteien', 'entgelt', 'arbeitszeit'] }, '2026-09-02');
  assert.equal(teil.ueberfaellig.length, 0);
  assert.equal(teil.erledigt, 3);
  // ohne Beginn nie ueberfaellig
  assert.equal(nachweisStand({}, '2030-01-01').ueberfaellig.length, 0);
});

test('Warnungen: ohne Beginn nur Hinweis', () => {
  const w = warnungen({}, '2026-09-24');
  assert.equal(w.length, 1);
  assert.equal(w[0].stufe, 'gelb');
});

test('Warnungen: Probezeit ueber 6 Monate rot, Ende in 30 Tagen gelb', () => {
  assert.ok(warnungen({ beginn: '2026-01-01', probezeit_monate: 9 }, '2026-02-01').some((x) => x.stufe === 'rot' && /6 Monate/.test(x.text)));
  // Beginn 01.04. -> Ende 30.09.; am 24.09. noch 6 Tage
  const w = warnungen({ beginn: '2026-04-01', probezeit_monate: 6 }, '2026-09-24');
  assert.ok(w.some((x) => x.stufe === 'gelb' && /30\.09\.2026/.test(x.text) && /6 Tagen/.test(x.text)));
  // weit davor keine Warnung
  assert.equal(warnungen({ beginn: '2026-09-01', probezeit_monate: 6 }, '2026-09-24').length, 0);
  // danach keine Probezeitwarnung mehr
  assert.ok(!warnungen({ beginn: '2026-01-01', probezeit_monate: 6 }, '2026-09-24').some((x) => /Probezeit/.test(x.text)));
});

test('Warnungen: KSchG-Wartezeit kurz vorher als Info', () => {
  const w = warnungen({ beginn: '2026-04-01' }, '2026-09-24');
  assert.ok(w.some((x) => x.stufe === 'info' && /01\.10\.2026/.test(x.text)));
});

test('Befristung: abgelaufen rot, laeuft aus gelb, ohne Enddatum rot, Schriftform-Info', () => {
  assert.ok(warnungen({ beginn: '2025-10-01', befristet: true, befristet_bis: '2026-09-20' }, '2026-09-24').some((x) => x.stufe === 'rot' && /unbefristet/.test(x.text)));
  assert.ok(warnungen({ beginn: '2025-10-01', befristet: true, befristet_bis: '2026-10-10' }, '2026-09-24').some((x) => x.stufe === 'gelb' && /10\.10\.2026/.test(x.text)));
  // Grenze: gestern abgelaufen = rot, heute letzter Tag = noch gelb
  assert.ok(warnungen({ beginn: '2025-10-01', befristet: true, befristet_bis: '2026-09-23' }, '2026-09-24').some((x) => /unbefristet/.test(x.text)));
  assert.ok(!warnungen({ beginn: '2025-10-01', befristet: true, befristet_bis: '2026-09-24' }, '2026-09-24').some((x) => /unbefristet/.test(x.text)));
  assert.ok(warnungen({ beginn: '2025-10-01', befristet: true }, '2026-09-24').some((x) => x.stufe === 'rot' && /Enddatum/.test(x.text)));
  assert.ok(warnungen({ beginn: '2025-10-01', befristet: true, befristet_bis: '2027-06-30' }, '2026-09-24').some((x) => x.stufe === 'info' && /Schriftform/.test(x.text)));
});

test('Befristung ohne Sachgrund: 2 Jahre ab Erstbefristung, hoechstens 3 Verlaengerungen', () => {
  // genau 2 Jahre: ok
  assert.ok(!warnungen({ beginn: '2025-10-01', befristet: true, befristet_bis: '2027-09-30' }, '2026-09-24').some((x) => /2 Jahre/.test(x.text)));
  // einen Tag drueber: rot
  assert.ok(warnungen({ beginn: '2025-10-01', befristet: true, befristet_bis: '2027-10-01' }, '2026-09-24').some((x) => x.stufe === 'rot' && /2 Jahre/.test(x.text)));
  // Erstbefristung zaehlt, nicht der Beginn der Verlaengerung
  assert.ok(warnungen({ beginn: '2026-04-01', erstbefristung_beginn: '2025-01-01', befristet: true, befristet_bis: '2027-03-31' }, '2026-09-24').some((x) => /2 Jahre/.test(x.text)));
  assert.ok(warnungen({ beginn: '2025-10-01', befristet: true, befristet_bis: '2026-12-31', verlaengerungen: 4 }, '2026-09-24').some((x) => /Verlängerungen/.test(x.text)));
  assert.ok(!warnungen({ beginn: '2025-10-01', befristet: true, befristet_bis: '2026-12-31', verlaengerungen: 3 }, '2026-09-24').some((x) => /Verlängerungen/.test(x.text)));
  // mit Sachgrund keine 2-Jahres-Pruefung
  assert.ok(!warnungen({ beginn: '2020-01-01', befristet: true, befristet_bis: '2027-12-31', sachgrund: 'Elternzeitvertretung', verlaengerungen: 5 }, '2026-09-24').some((x) => /2 Jahre|Verlängerungen/.test(x.text)));
});

test('Beschaeftigungsbestaetigung: Stammdaten, keine doppelten Leerzeilen', () => {
  const t = beschaeftigungsbestaetigung({ firma: 'Muster Bau GmbH', ort: 'Böblingen', heute: '2026-09-24', name: 'Anna Beispiel', beginn: '2024-03-01', position: 'Bauleiterin', wochenstunden: 38.5, gekuendigt: false });
  assert.match(t, /seit dem 01\.03\.2024 bei Muster Bau GmbH/);
  assert.match(t, /38,5 Stunden/);
  assert.match(t, /unbefristet/);
  assert.match(t, /ungekündigt/);
  assert.ok(!/\n\n\n/.test(t));
  const b = beschaeftigungsbestaetigung({ firma: '', ort: '', heute: '2026-09-24', name: 'X', beginn: '2024-03-01', befristet: true, befristet_bis: '2027-02-28' });
  assert.match(b, /befristet bis zum 28\.02\.2027/);
  assert.match(b, /\[Firmenname\]/);
  assert.ok(!/ungekündigt/.test(b));
});

test('Zeugnis: fuenf Noten, Pflichtfelder, Note im Prompt, einfaches Zeugnis ohne Beurteilung', () => {
  assert.equal(NOTEN.length, 5);
  assert.equal(pruefeZeugnis({ name: '', position: 'x', beginn: '2020-01-01' }).ok, false);
  assert.equal(pruefeZeugnis({ art: 'end', name: 'A', position: 'B', beginn: '2020-01-01', qualifiziert: false }).ok, false);
  assert.equal(pruefeZeugnis({ art: 'zwischen', name: 'A', position: 'B', beginn: '2020-01-01', qualifiziert: true, note: 7, aufgaben: 'Baustellen leiten' }).ok, false);
  assert.equal(pruefeZeugnis({ art: 'zwischen', name: 'A', position: 'B', beginn: '2020-01-01', qualifiziert: true, note: 2, aufgaben: 'Baustellen leiten' }).ok, true);
  const p = zeugnisPrompt({ art: 'end', qualifiziert: true, note: 2, name: 'Anna B', geschlecht: 'w', position: 'Polierin', beginn: '2020-01-01', ende: '2026-09-30', aufgaben: 'Kolonne führen', firma: 'Muster', austrittsgrund: 'eigener_wunsch' });
  assert.match(p.system, /stets zu unserer vollen Zufriedenheit/);
  assert.match(p.system, /109 GewO/);
  assert.match(p.nutzer, /Frau Anna B/);
  assert.match(p.nutzer, /auf eigenen Wunsch/);
  const e = zeugnisPrompt({ art: 'end', qualifiziert: false, note: 1, name: 'A', geschlecht: 'd', position: 'B', beginn: '2020-01-01', ende: '2026-09-30', aufgaben: 'x', firma: '' });
  assert.match(e.system, /KEINE Beurteilung/);
  // Kuendigung durch Arbeitgeber wird im Zeugnis nicht genannt
  const k = zeugnisPrompt({ art: 'end', qualifiziert: true, note: 3, name: 'A', geschlecht: 'm', position: 'B', beginn: '2020-01-01', ende: '2026-09-30', aufgaben: 'xxxxxxxxxxxx', firma: '', austrittsgrund: 'arbeitgeber' });
  assert.match(k.nutzer, /keine Angabe/);
  assert.ok(!/gekündigt/i.test(k.nutzer));
});

test('AGG: saubere Anzeige ohne Funde, riskante Worte werden erkannt', () => {
  assert.deepEqual(aggPruefung('Maurer (m/w/d) gesucht. Sehr gute Deutschkenntnisse.'), []);
  assert.deepEqual(aggPruefung('Maurer (w/m/d)'), []);
  const f = aggPruefung('Junges dynamisches Team sucht Maurer. Deutsch als Muttersprache, belastbar.');
  assert.ok(f.some((x) => /Alter/.test(x)));
  assert.ok(f.some((x) => /Muttersprache/.test(x)));
  assert.ok(f.some((x) => /Belastbar/.test(x)));
  assert.ok(f.some((x) => /m\/w\/d/.test(x)));
  assert.ok(aggPruefung('Elektriker (m/w/d), maximal 35 Jahre alt').some((x) => /Altersgrenze/.test(x)));
  assert.ok(aggPruefung('Buchhalter (m/w/d), ledig').some((x) => /Familienstand/.test(x)));
});

test('Stellenprompt und Saeubern', () => {
  const p = stellenPrompt({ titel: 'Maurer', firma: 'Muster', ort: 'Böblingen', aufgaben: 'Mauern', anforderungen: 'Ausbildung', angebot: '', umfang: 'Vollzeit' });
  assert.match(p.system, /\(m\/w\/d\)/);
  assert.match(p.system, /Muttersprache/);
  assert.match(p.nutzer, /Vollzeit/);
  assert.ok(!/Was wir bieten/.test(p.nutzer));
  assert.equal(saeubere('```markdown\nHier ist der Entwurf:\n\nText\n```'), 'Text');
  assert.equal(saeubere(null), '');
});
