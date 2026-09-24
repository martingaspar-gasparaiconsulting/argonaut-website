// Paket PK (24.09.2026) — Plaene mit Maengel-Pins und Foto-KI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIN_STATUS, naechsterStatus, klickZuLage, leseLage, naechstePinNummer, speicherPfad, istUeberfaellig, pinZahlen,
  sortierePins, pinsFuerNeueVersion, maengelListeText, fotoKiSystem, fotoKiNutzer, leseFotoVorschlag, FOTO_KI_MODELL,
} from '../out/bauPlan.js';

const HEUTE = '2026-09-24';
const CHEF = '3f2a9c1e-8b7d-4e21-9a55-0c6d1e2f3a4b';
const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

test('Status: Mitarbeiter kommen bis behoben, Abnahme nur Chef', () => {
  assert.equal(naechsterStatus('offen', true), 'in_arbeit');
  assert.equal(naechsterStatus('in_arbeit', true), 'behoben');
  assert.equal(naechsterStatus('behoben', true), null);
  assert.equal(naechsterStatus('behoben', false), 'abgenommen');
  assert.equal(naechsterStatus('abgenommen', false), null);
  assert.equal(naechsterStatus('quatsch', false), null);
  assert.equal(PIN_STATUS.length, 4);
});

test('Lage: relativ, ausserhalb null, kaputte Werte null', () => {
  const r = { left: 100, top: 50, width: 800, height: 400 };
  assert.deepEqual(klickZuLage(500, 250, r), { x: 0.5, y: 0.5 });
  assert.deepEqual(klickZuLage(100, 50, r), { x: 0, y: 0 });
  assert.equal(klickZuLage(99, 250, r), null);
  assert.equal(klickZuLage(500, 451, r), null);
  assert.equal(klickZuLage(500, 250, { ...r, width: 0 }), null);
  assert.deepEqual(klickZuLage(100 + 800 / 3, 50, r), { x: 0.33333, y: 0 });
  assert.deepEqual(leseLage('0.25', 0.75), { x: 0.25, y: 0.75 });
  assert.equal(leseLage(null, 0.5), null);
  assert.equal(leseLage(1.2, 0.5), null);
  assert.equal(leseLage('abc', 0.5), null);
});

test('Pin-Nummern: fortlaufend, Luecken bleiben', () => {
  assert.equal(naechstePinNummer([]), 1);
  assert.equal(naechstePinNummer([1, 2, 5]), 6);
  assert.equal(naechstePinNummer([null, '3', 2.5, 'x']), 4);
});

test('Speicherpfad: Betrieb zuerst, nur Bilder, nur echte IDs', () => {
  assert.equal(speicherPfad(CHEF, 'plan', ID, 'image/jpeg'), `${CHEF}/plaene/${ID}.jpg`);
  assert.equal(speicherPfad(CHEF, 'pin', ID, 'image/webp', 'nachher'), `${CHEF}/pins/${ID}-nachher.webp`);
  assert.equal(speicherPfad(CHEF, 'plan', ID, 'application/pdf'), null);
  assert.equal(speicherPfad('../x', 'plan', ID, 'image/png'), null);
  assert.equal(speicherPfad(CHEF, 'pin', ID, 'image/png', '../../x'), `${CHEF}/pins/${ID}-x.png`);
});

test('Zahlen, Ueberfaelligkeit, Sortierung', () => {
  const pins = [
    { nummer: 1, status: 'offen', gewerk: 'Maler', frist: '2026-09-20' },
    { nummer: 2, status: 'in_arbeit', gewerk: 'Maler', frist: '2026-10-01' },
    { nummer: 3, status: 'behoben', gewerk: 'Elektro', frist: '2026-09-01' },
    { nummer: 4, status: 'abgenommen' },
    { nummer: 5, status: 'offen', gewerk: '' },
  ];
  assert.equal(istUeberfaellig(pins[0], HEUTE), true);
  assert.equal(istUeberfaellig(pins[2], HEUTE), false, 'behoben ist nicht ueberfaellig');
  const z = pinZahlen(pins, HEUTE);
  assert.deepEqual({ ...z, jeGewerk: undefined }, { gesamt: 5, offen: 2, inArbeit: 1, wartetAufAbnahme: 1, abgenommen: 1, ueberfaellig: 1, jeGewerk: undefined });
  assert.deepEqual(z.jeGewerk, [{ gewerk: 'Maler', offen: 2 }, { gewerk: 'ohne Gewerk', offen: 1 }]);
  assert.deepEqual(sortierePins(pins, HEUTE).map((p) => p.nummer), [1, 5, 2, 3, 4]);
});

test('Neue Plan-Version: offene Pins mit Nummer und Lage, abgenommene nicht', () => {
  const r = pinsFuerNeueVersion([
    { nummer: 1, status: 'offen', x: 0.2, y: 0.3, titel: 'Riss' },
    { nummer: 2, status: 'abgenommen', x: 0.5, y: 0.5 },
    { nummer: 3, status: 'behoben', x: '0.7', y: '0.1' },
    { nummer: 4, status: 'offen', x: null, y: 0.1 },
  ]);
  assert.deepEqual(r.pins.map((p) => [p.nummer, p.x, p.y]), [[1, 0.2, 0.3], [3, 0.7, 0.1]]);
  assert.match(r.hinweis, /2 offene Pins/);
  assert.equal(pinsFuerNeueVersion([]).hinweis, null);
});

test('Maengelliste: offene zuerst, Frist und ueberfaellig im Text', () => {
  const t = maengelListeText([
    { nummer: 2, titel: 'Fuge offen', status: 'offen', gewerk: 'Fliesen', frist: '2026-09-20', zustaendig: 'Franz', beschreibung: 'Bad OG' },
    { nummer: 1, titel: 'Kratzer', status: 'abgenommen' },
  ], HEUTE);
  assert.match(t, /Stand 24\.09\.2026 · 1 offen/);
  assert.match(t, /## Nr\. 2 — Fuge offen/);
  assert.match(t, /Frist 20\.09\.2026 \(überfällig\)/);
  assert.match(t, /zuständig: Franz/);
  assert.doesNotMatch(t, /Kratzer/);
  assert.match(maengelListeText([{ nummer: 1, titel: 'Kratzer', status: 'abgenommen' }], HEUTE, false), /Kratzer/);
  assert.equal(maengelListeText([], HEUTE), 'Keine offenen Punkte.');
});

test('Foto-KI: Prompt verbietet Masse, Preise und Schuld; Sie-Form', () => {
  const s = fotoKiSystem();
  assert.match(s, /Keine Maße, Mengen, Flächen oder Preise/);
  assert.match(s, /Keine Schuldzuweisung/);
  assert.match(s, /NUR mit JSON/);
  assert.doesNotMatch(s, /\b(du|dein|dich)\b/i);
  assert.equal(FOTO_KI_MODELL, 'claude-haiku-4-5');
  assert.match(fotoKiNutzer({ projekt: 'Kita Nord', notiz: 'Wand Flur' }), /Baustelle: Kita Nord[\s\S]*Notiz vom Monteur: Wand Flur/);
});

test('Foto-KI: Antwort streng lesen', () => {
  const gut = leseFotoVorschlag('Hier:\n```json\n{"art":"mangel","titel":"Haarriss im Putz","beschreibung":"Senkrechter Haarriss neben der Tür.","gewerk":"putz","schwere":"gering","massnahme":"Beobachten, später überarbeiten.","aufmass":{"kurztext":"Putzriss schließen","einheit":"m"},"hinweise":[]}\n```');
  assert.equal(gut.art, 'mangel');
  assert.equal(gut.gewerk, 'Putz');
  assert.equal(gut.schwere, 'gering');
  assert.deepEqual(gut.aufmass, { kurztext: 'Putzriss schließen', einheit: 'm' });
  assert.deepEqual(gut.hinweise, []);

  const wild = leseFotoVorschlag('{"art":"explosion","titel":"","beschreibung":"Riss ca. 40 cm lang","gewerk":"Raumfahrt","schwere":"extrem","aufmass":{"kurztext":"x","einheit":"Fass"},"hinweise":"kein array"}');
  assert.equal(wild.art, 'hinweis');
  assert.equal(wild.titel, 'Riss ca. 40 cm lang');
  assert.equal(wild.gewerk, null);
  assert.equal(wild.schwere, null);
  assert.equal(wild.aufmass, null);
  assert.match(wild.hinweise[0], /Maße oder Beträge/);

  assert.equal(leseFotoVorschlag('keine Ahnung'), null);
  assert.equal(leseFotoVorschlag('{kaputt'), null);
  assert.equal(leseFotoVorschlag('{"titel":"","beschreibung":""}'), null);
});
