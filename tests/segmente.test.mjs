import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GESPERRTE_MERKMALE, MERKMALE, merkmal, istErlaubt, OPERATOREN, operatorenFuer,
  trifftRegel, passt, filtere, zaehle, beschreibe, fehltZumSpeichern,
} from '../out/segmente.js';

// ============================================================================
// Diese Tests halten die eine Entscheidung fest, an der lib/segmente.ts hängt:
// segmentiert wird nach Stammdaten und erklärten Handlungen — NIE nach
// beobachtetem Verhalten. Dazu der Grundsatz „im Zweifel nein": lieber
// jemanden nicht anschreiben als den Falschen.
// ============================================================================

const HEUTE = '2026-09-13';

const KUNDE = {
  email: 'info@mustermann.de',
  branche: 'Handwerk & Bau',
  ort: 'Stuttgart',
  plz: '70173',
  quelle: 'Empfehlung',
  stufe: 'kunde',
  kunde_seit: '2024-03-01',
  letzter_kauf: '2026-01-10',
  umsatz_gesamt: 18500,
  newsletter_status: 'aktiv',
  freebie: 'Checkliste Bauabnahme',
  tag: 'A-Kunde',
};

// ---------------------------------------------------------------- Sperrliste

test('gesperrte Merkmale sind nie erlaubt — auch nicht mit Grossbuchstaben', () => {
  for (const g of GESPERRTE_MERKMALE) {
    assert.equal(istErlaubt(g), false, g + ' darf nicht erlaubt sein');
    assert.equal(istErlaubt(g.toUpperCase()), false);
  }
});

test('kein gesperrtes Merkmal steht im Katalog', () => {
  for (const m of MERKMALE) {
    assert.equal(GESPERRTE_MERKMALE.includes(m.schluessel), false, m.schluessel);
  }
});

test('eine Regel auf beobachtetes Verhalten faellt durch, auch wenn die Spalte da ist', () => {
  const zeile = { ...KUNDE, geoeffnet: 'ja', klicks: 12 };
  assert.equal(trifftRegel(zeile, { merkmal: 'geoeffnet', operator: 'ist', wert: 'ja' }, HEUTE), false);
  assert.equal(trifftRegel(zeile, { merkmal: 'klicks', operator: 'groesser', wert: 5 }, HEUTE), false);
});

test('ein Merkmal ausserhalb des Katalogs faellt durch statt still zu treffen', () => {
  assert.equal(istErlaubt('lieblingsfarbe'), false);
  assert.equal(trifftRegel({ lieblingsfarbe: 'blau' }, { merkmal: 'lieblingsfarbe', operator: 'ist', wert: 'blau' }, HEUTE), false);
});

// ------------------------------------------------------------------ Text

test('Text: ist, ist nicht, enthaelt, beginnt mit — Gross/Klein egal', () => {
  const t = (o, w) => trifftRegel(KUNDE, { merkmal: 'branche', operator: o, wert: w }, HEUTE);
  assert.equal(t('ist', 'handwerk & bau'), true);
  assert.equal(t('ist', 'Handel'), false);
  assert.equal(t('ist_nicht', 'Handel'), true);
  assert.equal(t('enthaelt', 'bau'), true);
  assert.equal(t('beginnt_mit', 'Hand'), true);
  assert.equal(t('beginnt_mit', 'bau'), false);
});

test('Postleitzahl: der Anfang genuegt fuer eine ganze Region', () => {
  assert.equal(trifftRegel(KUNDE, { merkmal: 'plz', operator: 'beginnt_mit', wert: '70' }, HEUTE), true);
  assert.equal(trifftRegel(KUNDE, { merkmal: 'plz', operator: 'beginnt_mit', wert: '80' }, HEUTE), false);
});

test('leerer Suchwert trifft nicht — sonst traefe „enthaelt nichts" jeden', () => {
  assert.equal(trifftRegel(KUNDE, { merkmal: 'ort', operator: 'enthaelt', wert: '' }, HEUTE), false);
  assert.equal(trifftRegel(KUNDE, { merkmal: 'ort', operator: 'beginnt_mit', wert: '   ' }, HEUTE), false);
});

// ------------------------------------------------------------------ Zahl

test('Zahl: groesser und kleiner, mit deutscher Schreibweise', () => {
  const t = (o, w) => trifftRegel(KUNDE, { merkmal: 'umsatz_gesamt', operator: o, wert: w }, HEUTE);
  assert.equal(t('groesser', 10000), true);
  assert.equal(t('groesser', '18.500'), false, 'gleich ist nicht groesser');
  assert.equal(t('kleiner', '20.000'), true);
  assert.equal(t('ist', '18500'), true);
});

test('Zahl-Operator auf einem Textfeld faellt durch', () => {
  assert.equal(trifftRegel(KUNDE, { merkmal: 'ort', operator: 'groesser', wert: 5 }, HEUTE), false);
});

// ----------------------------------------------------------------- Datum

test('Datum: vor und nach einem festen Tag', () => {
  const t = (o, w) => trifftRegel(KUNDE, { merkmal: 'kunde_seit', operator: o, wert: w }, HEUTE);
  assert.equal(t('vor', '2025-01-01'), true);
  assert.equal(t('nach', '2025-01-01'), false);
});

test('Datum: „laenger her als" ist der Fall fuer Rueckhol-Aktionen', () => {
  // letzter Kauf 10.01.2026, heute 13.09.2026 = 246 Tage her
  const t = (o, w) => trifftRegel(KUNDE, { merkmal: 'letzter_kauf', operator: o, wert: w }, HEUTE);
  assert.equal(t('aelter_als_tage', 90), true);
  assert.equal(t('aelter_als_tage', 300), false);
  assert.equal(t('juenger_als_tage', 300), true);
  assert.equal(t('juenger_als_tage', 90), false);
});

test('heute wird hereingereicht, nie selbst gebildet — anderes Heute, anderes Ergebnis', () => {
  const regel = { merkmal: 'letzter_kauf', operator: 'aelter_als_tage', wert: 90 };
  assert.equal(trifftRegel(KUNDE, regel, '2026-09-13'), true);
  assert.equal(trifftRegel(KUNDE, regel, '2026-02-01'), false, 'im Februar war der Kauf erst 22 Tage her');
});

test('kaputtes Datum trifft nicht, statt zu raten', () => {
  const zeile = { ...KUNDE, letzter_kauf: 'neulich' };
  assert.equal(trifftRegel(zeile, { merkmal: 'letzter_kauf', operator: 'aelter_als_tage', wert: 30 }, HEUTE), false);
  assert.equal(trifftRegel(KUNDE, { merkmal: 'letzter_kauf', operator: 'aelter_als_tage', wert: -5 }, HEUTE), false);
});

// ------------------------------------------------------------ leer/gefuellt

test('leer und nicht leer', () => {
  const ohne = { ...KUNDE, tag: '   ' };
  assert.equal(trifftRegel(ohne, { merkmal: 'tag', operator: 'leer' }, HEUTE), true);
  assert.equal(trifftRegel(ohne, { merkmal: 'tag', operator: 'nicht_leer' }, HEUTE), false);
  assert.equal(trifftRegel(KUNDE, { merkmal: 'tag', operator: 'nicht_leer' }, HEUTE), true);
});

test('fehlender Wert im Feld laesst jede normale Regel durchfallen', () => {
  const ohne = { ...KUNDE, branche: null };
  assert.equal(trifftRegel(ohne, { merkmal: 'branche', operator: 'ist', wert: 'Handwerk & Bau' }, HEUTE), false);
});

// ---------------------------------------------------------------- Segment

test('ohne Regel gehoert niemand ins Segment', () => {
  assert.equal(passt(KUNDE, { name: 'Leer', regeln: [] }, HEUTE), false);
  assert.equal(passt(KUNDE, null, HEUTE), false);
  assert.equal(filtere([KUNDE], { regeln: [] }, HEUTE).length, 0);
});

test('und heisst alle, oder heisst eine', () => {
  const regeln = [
    { merkmal: 'branche', operator: 'ist', wert: 'Handwerk & Bau' },
    { merkmal: 'ort', operator: 'ist', wert: 'München' },
  ];
  assert.equal(passt(KUNDE, { verknuepfung: 'und', regeln }, HEUTE), false);
  assert.equal(passt(KUNDE, { verknuepfung: 'oder', regeln }, HEUTE), true);
});

test('ohne Angabe gilt „und" — die engere Auswahl ist die sichere', () => {
  const regeln = [
    { merkmal: 'branche', operator: 'ist', wert: 'Handwerk & Bau' },
    { merkmal: 'ort', operator: 'ist', wert: 'München' },
  ];
  assert.equal(passt(KUNDE, { regeln }, HEUTE), false);
});

test('das Beispiel aus dem Dateikopf trifft', () => {
  const segment = {
    name: 'Handwerk 70xxx, lange nichts gekauft',
    verknuepfung: 'und',
    regeln: [
      { merkmal: 'branche', operator: 'enthaelt', wert: 'Handwerk' },
      { merkmal: 'plz', operator: 'beginnt_mit', wert: '70' },
      { merkmal: 'letzter_kauf', operator: 'aelter_als_tage', wert: 90 },
    ],
  };
  assert.equal(passt(KUNDE, segment, HEUTE), true);
  assert.equal(passt({ ...KUNDE, plz: '80331' }, segment, HEUTE), false);
});

// ------------------------------------------------------------------ zaehle

test('zaehle: erreichbar sind nur die mit Adresse', () => {
  const liste = [
    KUNDE,
    { ...KUNDE, email: '' },
    { ...KUNDE, email: null },
    { ...KUNDE, branche: 'Handel' },
  ];
  const z = zaehle(liste, { regeln: [{ merkmal: 'branche', operator: 'enthaelt', wert: 'Handwerk' }] }, HEUTE);
  assert.equal(z.gesamt, 4);
  assert.equal(z.treffer, 3);
  assert.equal(z.erreichbar, 1);
});

test('zaehle: leere Liste ergibt lauter Nullen', () => {
  const z = zaehle([], { regeln: [{ merkmal: 'ort', operator: 'ist', wert: 'Stuttgart' }] }, HEUTE);
  assert.deepEqual(z, { gesamt: 0, treffer: 0, erreichbar: 0 });
});

// --------------------------------------------------------------- beschreibe

test('beschreibe: ein lesbarer deutscher Satz statt einer Regelliste', () => {
  const s = beschreibe({
    verknuepfung: 'und',
    regeln: [
      { merkmal: 'branche', operator: 'enthaelt', wert: 'Handwerk' },
      { merkmal: 'plz', operator: 'beginnt_mit', wert: '70' },
    ],
  });
  assert.match(s, /^Alle, bei denen /);
  assert.match(s, /Branche/);
  assert.match(s, / und /);
  assert.match(s, /\.$/);
});

test('beschreibe: ohne Regeln sagt es das offen', () => {
  assert.match(beschreibe({ regeln: [] }), /niemand angeschrieben/);
  assert.match(beschreibe(null), /niemand angeschrieben/);
});

// ---------------------------------------------------------- fehltZumSpeichern

test('fehltZumSpeichern: nennt Name und Regel, wenn beides fehlt', () => {
  const f = fehltZumSpeichern({ name: '', regeln: [] });
  assert.equal(f.length, 2);
});

test('fehltZumSpeichern: ein vollstaendiges Segment hat nichts zu meckern', () => {
  const f = fehltZumSpeichern({
    name: 'Handwerk Region Stuttgart',
    regeln: [{ merkmal: 'plz', operator: 'beginnt_mit', wert: '70' }],
  });
  assert.deepEqual(f, []);
});

test('fehltZumSpeichern: ein Vergleich ohne Wert faellt auf', () => {
  const f = fehltZumSpeichern({
    name: 'Ohne Wert',
    regeln: [{ merkmal: 'ort', operator: 'ist', wert: '' }],
  });
  assert.ok(f.some((x) => x.includes('Wert')));
});

test('fehltZumSpeichern: ein gesperrtes Merkmal faellt auf', () => {
  const f = fehltZumSpeichern({
    name: 'Heimlich',
    regeln: [{ merkmal: 'geoeffnet', operator: 'ist', wert: 'ja' }],
  });
  assert.ok(f.some((x) => x.includes('Merkmal')));
});

// ------------------------------------------------------------------ Katalog

test('operatorenFuer liefert nur passende Vergleiche je Typ', () => {
  const text = operatorenFuer('text').map((o) => o.schluessel);
  assert.ok(text.includes('enthaelt'));
  assert.equal(text.includes('groesser'), false);

  const datum = operatorenFuer('datum').map((o) => o.schluessel);
  assert.ok(datum.includes('aelter_als_tage'));
  assert.equal(datum.includes('enthaelt'), false);
});

test('jedes Merkmal im Katalog hat Label, Typ und Hilfe', () => {
  for (const m of MERKMALE) {
    assert.ok(m.label.length > 1, m.schluessel);
    assert.ok(m.hilfe.length > 5, m.schluessel + ' braucht eine Erklaerung');
    assert.ok(['text', 'zahl', 'datum', 'ja_nein'].includes(m.typ));
    assert.equal(merkmal(m.schluessel)?.schluessel, m.schluessel);
  }
});

test('merkmal() gibt bei Unsinn null zurueck', () => {
  assert.equal(merkmal('gibtsnicht'), null);
  assert.equal(merkmal(null), null);
});

test('jeder Operator im Katalog gilt fuer mindestens einen Typ', () => {
  for (const o of OPERATOREN) assert.ok(o.typen.length > 0, o.schluessel);
});
