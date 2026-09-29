// Paket 158 (28.09.2026) — Ablauf-Baukasten Teil 3: Karten-Kette, Vorlagen je Branche, Fassungen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  listeAn, einfuegen, ersetzen, entfernen, verschieben, zerlegePfad, neueId, alleIds, neuerSchritt, standardConfig,
  plusErlaubt, aktionenFuer, bedingungDazu, bedingungAendern, bedingungWeg, verknuepfungSetzen,
  neueFassungNoetig, kopie, fehlendeFelder, anzahlSchritte,
} from '../out/ablaufEditor.js';
import { ABLAUF_VORLAGEN, GRUPPEN, vorlagenFuer } from '../out/ablaufVorlagen.js';
import { pruefeAblauf, schrittAn, fahrplan, GRENZEN } from '../out/ablauf.js';
import { aktionPlanen, ausloeserZiel, nochGueltig } from '../out/ablaufMotor.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const JETZT = new Date('2026-09-28T10:00:00Z');

const KETTE = [
  { id: 's1', typ: 'aktion', aktion: 'notiz_anhaengen', config: { text: 'a' } },
  { id: 's2', typ: 'wenn', bedingung: { verknuepfung: 'und', regeln: [{ feld: 'mahnstufe', operator: 'leer' }] },
    dann: [{ id: 's3', typ: 'warten', tage: 2 }], sonst: [] },
  { id: 's4', typ: 'stopp' },
];

test('Adressen: Liste oben und in Dann/Sonst, Pfad zerlegen', () => {
  assert.equal(listeAn(KETTE, ''), KETTE);
  assert.equal(listeAn(KETTE, '1.dann')[0].id, 's3');
  assert.deepEqual(listeAn(KETTE, '1.sonst'), []);
  assert.equal(listeAn(KETTE, '0.dann'), null, 'keine Wenn-Karte');
  assert.equal(listeAn(KETTE, '9.dann'), null);
  assert.equal(listeAn(KETTE, '1.oben'), null);
  assert.deepEqual(zerlegePfad('1.dann.0'), { listePfad: '1.dann', index: 0 });
  assert.deepEqual(zerlegePfad('2'), { listePfad: '', index: 2 });
});

test('Einfügen, ändern, entfernen, verschieben — unveränderlich, auch in Zweigen', () => {
  const vorher = JSON.stringify(KETTE);
  const neu = { id: 'x', typ: 'stopp' };
  assert.deepEqual(einfuegen(KETTE, '', 0, neu).map((s) => s.id), ['x', 's1', 's2', 's4']);
  assert.deepEqual(einfuegen(KETTE, '', 99, neu).map((s) => s.id), ['s1', 's2', 's4', 'x'], 'hinten angehängt');
  assert.deepEqual(einfuegen(KETTE, '', -1, neu).map((s) => s.id), ['x', 's1', 's2', 's4'], 'negativ -> vorne');
  const inSonst = einfuegen(KETTE, '1.sonst', 0, neu);
  assert.equal(schrittAn(inSonst, '1.sonst.0').id, 'x');
  assert.equal(schrittAn(einfuegen(KETTE, '1.dann', 1, neu), '1.dann.1').id, 'x');
  assert.deepEqual(einfuegen(KETTE, '0.dann', 0, neu), KETTE, 'ungültige Liste -> unverändert');
  assert.equal(schrittAn(ersetzen(KETTE, '1.dann.0', { id: 's3', typ: 'warten', tage: 9 }), '1.dann.0').tage, 9);
  assert.deepEqual(ersetzen(KETTE, '7', neu), KETTE);
  assert.deepEqual(entfernen(KETTE, '0').map((s) => s.id), ['s2', 's4']);
  assert.deepEqual(entfernen(KETTE, '1.dann.0')[1].dann, []);
  assert.deepEqual(entfernen(KETTE, '5'), KETTE);
  assert.deepEqual(verschieben(KETTE, '0', 1).map((s) => s.id), ['s2', 's1', 's4']);
  assert.deepEqual(verschieben(KETTE, '2', -1).map((s) => s.id), ['s1', 's4', 's2']);
  assert.deepEqual(verschieben(KETTE, '0', -1), KETTE, 'am Rand nichts');
  assert.deepEqual(verschieben(KETTE, '2', 1), KETTE);
  assert.equal(JSON.stringify(KETTE), vorher, 'Original nie verändert');
});

test('Neue Schritte: eindeutige Kennung, Standardwerte aus dem Katalog', () => {
  assert.deepEqual(alleIds(KETTE), ['s1', 's2', 's3', 's4']);
  assert.equal(neueId(KETTE), 's5');
  assert.equal(neueId([{ id: 's2', typ: 'stopp' }]), 's3');
  assert.equal(neueId([]), 's1');
  assert.deepEqual(neuerSchritt(KETTE, 'warten'), { id: 's5', typ: 'warten', tage: 3 });
  assert.deepEqual(neuerSchritt(KETTE, 'stopp'), { id: 's5', typ: 'stopp' });
  const wenn = neuerSchritt(KETTE, 'wenn', undefined, 'brutto_summe');
  assert.deepEqual([wenn.typ, wenn.bedingung.regeln[0].feld, wenn.dann, wenn.sonst], ['wenn', 'brutto_summe', [], []]);
  const auf = neuerSchritt(KETTE, 'aktion', 'aufgabe_anlegen');
  assert.equal(auf.config.titel, 'Nachfassen: {{name}}');
  assert.equal(auf.config.faellig_in_tagen, 3);
  assert.deepEqual(standardConfig('freigabe_chef'), {});
  assert.equal(standardConfig('mail_senden').an, 'kunde');
});

test('Grenzen beim „+": 50 Schritte, Wenn höchstens 5 Ebenen tief', () => {
  const voll = Array.from({ length: GRENZEN.schritte }, (_, i) => ({ id: `n${i}`, typ: 'stopp' }));
  assert.equal(plusErlaubt(voll, '', 'aktion'), false);
  assert.equal(plusErlaubt(KETTE, '', 'aktion'), true);
  assert.equal(plusErlaubt(KETTE, '1.dann', 'wenn'), true);
  // Liste in Ebene 5 (4 Wenn darüber): Wenn nicht mehr, Aktion schon
  const tief = '0.dann.0.dann.0.dann.0.dann';
  assert.equal(plusErlaubt(KETTE, tief, 'wenn'), false);
  assert.equal(plusErlaubt(KETTE, tief, 'aktion'), true);
  assert.equal(plusErlaubt(KETTE, '0.dann.0.dann.0.dann', 'wenn'), true);
  assert.equal(anzahlSchritte(KETTE), 4);
});

test('Das „+" zeigt nur passende Aktionen; noch nicht im Motor = gekennzeichnet', () => {
  const r = aktionenFuer({ art: 'datum', trigger: 'rechnung_ueberfaellig', tage: 0 }).map((a) => a.key);
  assert.ok(r.includes('mahnstufe_erhoehen'));
  assert.ok(!aktionenFuer({ art: 'datum', trigger: 'angebot_ohne_antwort', tage: 0 }).some((a) => a.key === 'mahnstufe_erhoehen'), 'Mahnstufe nur bei Rechnungen');
  assert.equal(aktionenFuer({ art: 'datum', trigger: 'rechnung_ueberfaellig', tage: 0 }).find((a) => a.key === 'freigabe_chef').imMotor, true);
  assert.equal(aktionenFuer({ art: 'datum', trigger: 'rechnung_ueberfaellig', tage: 0 }).find((a) => a.key === 'glocke').imMotor, true, 'seit Paket 167 im Motor');
});

test('Bedingungen bearbeiten: UND/ODER, verschachtelte Gruppe', () => {
  let g = { verknuepfung: 'und', regeln: [] };
  g = bedingungDazu(g, '', { feld: 'mahnstufe', operator: 'gleich', wert: 0 });
  g = bedingungDazu(g, '', { verknuepfung: 'oder', regeln: [{ feld: 'brutto_summe', operator: 'groesser', wert: 500 }] });
  g = bedingungDazu(g, '1', { feld: 'titel', operator: 'enthaelt', wert: 'Wartung' });
  assert.equal(g.regeln[1].regeln.length, 2);
  g = bedingungAendern(g, '1', 0, { feld: 'brutto_summe', operator: 'groesser', wert: 1000 });
  assert.equal(g.regeln[1].regeln[0].wert, 1000);
  g = verknuepfungSetzen(g, '1', 'und');
  assert.equal(g.regeln[1].verknuepfung, 'und');
  g = verknuepfungSetzen(g, '', 'oder');
  assert.equal(g.verknuepfung, 'oder');
  g = bedingungWeg(g, '1', 1);
  assert.equal(g.regeln[1].regeln.length, 1);
  g = bedingungWeg(g, '', 0);
  assert.equal(g.regeln.length, 1);
});

test('Fassungen: neue Fassung nur bei inhaltlicher Änderung; Kopie statt Original', () => {
  const a = { name: 'X', beschreibung: 'eins', ausloeser: { art: 'datum', trigger: 'rechnung_ueberfaellig', tage: 3 }, schritte: KETTE };
  assert.equal(neueFassungNoetig(a, { ...a, beschreibung: 'zwei' }), false);
  assert.equal(neueFassungNoetig(a, { ...a, name: ' X ' }), false);
  assert.equal(neueFassungNoetig(a, { ...a, name: 'Y' }), true);
  assert.equal(neueFassungNoetig(a, { ...a, ausloeser: { ...a.ausloeser, tage: 4 } }), true);
  assert.equal(neueFassungNoetig(a, { ...a, schritte: entfernen(KETTE, '0') }), true);
  const k = kopie(a);
  k.schritte[0].config.text = 'geändert';
  assert.equal(KETTE[0].config.text, 'a');
  assert.deepEqual(fehlendeFelder({ id: 'm', typ: 'aktion', aktion: 'mail_senden', config: { betreff: 'x' } }), ['text']);
});

test('Prüfung neu: feste Adresse muss da sein; Aktion muss zum Auslöser passen', () => {
  const basis = { name: 'T', ausloeser: { art: 'datum', trigger: 'angebot_ohne_antwort', tage: 5 } };
  const f = (schritte, a = basis) => pruefeAblauf({ ...a, schritte }).fehler.join(' | ');
  assert.match(f([{ id: 'm', typ: 'aktion', aktion: 'mail_senden', config: { an: 'feste_adresse', betreff: 'b', text: 't' } }]), /feste Adresse fehlt/);
  assert.equal(f([{ id: 'm', typ: 'aktion', aktion: 'mail_senden', config: { an: 'feste_adresse', adresse: 'chef@betrieb.example', betreff: 'b', text: 't' } }]), '');
  assert.equal(f([{ id: 'm', typ: 'aktion', aktion: 'mail_senden', config: { an: 'kunde', betreff: 'b', text: 't' } }]), '');
  assert.match(f([{ id: 'f', typ: 'aktion', aktion: 'freigabe_chef', config: {} }, { id: 'e', typ: 'aktion', aktion: 'mahnstufe_erhoehen', config: {} }]), /passt nicht zu diesem Auslöser/);
  assert.equal(f([{ id: 'f', typ: 'aktion', aktion: 'freigabe_chef', config: {} }, { id: 'e', typ: 'aktion', aktion: 'mahnstufe_erhoehen', config: {} }], { ...basis, ausloeser: { art: 'datum', trigger: 'rechnung_ueberfaellig', tage: 1 } }), '');
});

test('Vorlagen-Galerie: jede Vorlage sofort einschaltbar, eindeutig, Sie-Form, jede Gruppe hat Vorlagen', () => {
  const keys = new Set();
  for (const v of ABLAUF_VORLAGEN) {
    assert.ok(!keys.has(v.key), v.key); keys.add(v.key);
    const p = pruefeAblauf(v.ablauf);
    assert.deepEqual(p.fehler, [], v.key);
    assert.equal(p.aktivierbar, true, v.key);
    assert.ok(v.gruppen.length > 0 && v.gruppen.every((g) => GRUPPEN.some((x) => x.key === g)), v.key);
    const texte = JSON.stringify(v);
    assert.doesNotMatch(texte, /\b(du|dein|deine|dich|dir)\b/i, v.key);
    assert.doesNotMatch(texte, /Agent/i, v.key);
  }
  for (const g of GRUPPEN) assert.ok(vorlagenFuer(g.key).length >= 2, `${g.key} hat zu wenige Vorlagen`);
  assert.equal(vorlagenFuer('alle').length, ABLAUF_VORLAGEN.length);
  // Gesundheit/Tier: keine Rueckhol-Werbung (HWG, Anwalt-Liste)
  for (const g of ['gesundheit', 'tier']) assert.ok(!vorlagenFuer(g).some((v) => v.key === 'rueckholung'), g);
});

test('Mahnlauf-Vorlage über die Zeit: nach Mahnstufe 1 läuft er weiter bis zur Anruf-Aufgabe', () => {
  const v = ABLAUF_VORLAGEN.find((x) => x.key === 'mahnlauf').ablauf;
  const ziel = ausloeserZiel(v.ausloeser);
  const r = { id: 'r1', rechnungsnummer: 'RE-7', kunde_name: 'Müller GmbH', kunde_email: 'm@example.de', brutto_summe: 700, zahlungsstatus: 'offen', mahnstufe: 0, faelligkeitsdatum: '2026-09-20' };
  const f1 = fahrplan(v, null, r, JETZT);
  assert.equal(f1.danach.art, 'warten');
  const f2 = fahrplan(v, f1.danach.weiter, r, JETZT);
  assert.equal(f2.danach.art, 'freigabe');
  const f3 = fahrplan(v, f2.danach.weiter, r, JETZT);
  assert.deepEqual(f3.jetzt.map((e) => aktionPlanen(e.schritt, v, ziel, 'o', r, JETZT).art), ['aendern', 'mail']);
  const nachMahnung = { ...r, mahnstufe: 1 };
  assert.equal(nochGueltig(v.ausloeser, nachMahnung), true, 'Start-Bedingung Mahnstufe 0 beendet den Lauf nicht');
  const f4 = fahrplan(v, f3.danach.weiter, nachMahnung, JETZT);
  assert.deepEqual(f4.jetzt.map((e) => e.schritt.aktion), ['aufgabe_anlegen']);
  assert.equal(nochGueltig(v.ausloeser, { ...nachMahnung, zahlungsstatus: 'bezahlt' }), false);
});

test('Seite: Baukasten, Galerie, Fassungen mit Schutz gegen gleichzeitiges Speichern', () => {
  const seite = lies('app/dashboard/ablaeufe/page.tsx');
  assert.match(seite, /\.eq\('id', alt\.id\)\.eq\('version', alt\.version\)\.select\('id'\)/);
  assert.match(seite, /aktiv: false, version: 1, vorlage_key/);
  assert.match(seite, /if \(alt\.aktiv && !p\.aktivierbar\) throw/);
  assert.match(seite, /<AblaufEditor /);
  // Fassung erst NACH der Aenderung anlegen (sonst verwaiste Fassung bei Konflikt)
  const teil = seite.slice(seite.indexOf('const neu = Number(alt.version) + 1;'));
  assert.ok(teil.indexOf("from('ablaeufe').update(") < teil.indexOf("from('ablauf_versionen').insert("));
  const editor = lies('app/dashboard/ablaeufe/_teile/AblaufEditor.tsx');
  assert.match(editor, /disabled=\{busy \|\| pruefung\.fehler\.length > 0\}/);
});
