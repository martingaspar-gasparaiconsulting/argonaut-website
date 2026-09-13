import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GESPERRTE_MERKMALE, MERKMALE, merkmal, istErlaubt, OPERATOREN, operatorenFuer,
  trifftRegel, passt, filtere, zaehle, beschreibe, fehltZumSpeichern,
  merkmaleFuer, werbeStatus, darfWerbung, WERBE_STATUS_TEXT, QUELLEN,
} from '../out/segmente.js';

// ============================================================================
// Diese Tests halten die eine Entscheidung fest, an der lib/segmente.ts hängt:
// segmentiert wird nach Stammdaten und erklärten Handlungen — NIE nach
// beobachtetem Verhalten. Dazu der Grundsatz „im Zweifel nein": lieber
// jemanden nicht anschreiben als den Falschen.
// ============================================================================

const HEUTE = '2026-09-13';

// Genau die Spalten, die public.kontakte am 13.09.2026 wirklich hat.
const KUNDE = {
  email: 'info@mustermann.de',
  firma: 'Mustermann Bedachungen',
  ort: 'Stuttgart',
  plz: '70173',
  land: 'DE',
  position: 'Geschäftsführung',
  status: 'kunde',
  quelle: 'Empfehlung',
  kunde_seit: '2024-03-01',
  letzter_kontakt_am: '2026-01-10',
  betreuungs_intervall_tage: 90,
  werbe_einwilligung: true,
  werbe_widerspruch_am: null,
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
  const t = (o, w) => trifftRegel(KUNDE, { merkmal: 'firma', operator: o, wert: w }, HEUTE);
  assert.equal(t('ist', 'mustermann bedachungen'), true);
  assert.equal(t('ist', 'Andere GmbH'), false);
  assert.equal(t('ist_nicht', 'Andere GmbH'), true);
  assert.equal(t('enthaelt', 'bedach'), true);
  assert.equal(t('beginnt_mit', 'Musterm'), true);
  assert.equal(t('beginnt_mit', 'bedach'), false);
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
  const t = (o, w) => trifftRegel(KUNDE, { merkmal: 'betreuungs_intervall_tage', operator: o, wert: w }, HEUTE);
  assert.equal(t('groesser', 30), true);
  assert.equal(t('groesser', '90'), false, 'gleich ist nicht groesser');
  assert.equal(t('kleiner', '120'), true);
  assert.equal(t('ist', '90'), true);
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
  // letzter Kontakt 10.01.2026, heute 13.09.2026 = 246 Tage her
  const t = (o, w) => trifftRegel(KUNDE, { merkmal: 'letzter_kontakt_am', operator: o, wert: w }, HEUTE);
  assert.equal(t('aelter_als_tage', 90), true);
  assert.equal(t('aelter_als_tage', 300), false);
  assert.equal(t('juenger_als_tage', 300), true);
  assert.equal(t('juenger_als_tage', 90), false);
});

test('heute wird hereingereicht, nie selbst gebildet — anderes Heute, anderes Ergebnis', () => {
  const regel = { merkmal: 'letzter_kontakt_am', operator: 'aelter_als_tage', wert: 90 };
  assert.equal(trifftRegel(KUNDE, regel, '2026-09-13'), true);
  assert.equal(trifftRegel(KUNDE, regel, '2026-02-01'), false, 'im Februar war der Kontakt erst 22 Tage her');
});

test('kaputtes Datum trifft nicht, statt zu raten', () => {
  const zeile = { ...KUNDE, letzter_kontakt_am: 'neulich' };
  assert.equal(trifftRegel(zeile, { merkmal: 'letzter_kontakt_am', operator: 'aelter_als_tage', wert: 30 }, HEUTE), false);
  assert.equal(trifftRegel(KUNDE, { merkmal: 'letzter_kontakt_am', operator: 'aelter_als_tage', wert: -5 }, HEUTE), false);
});

// ------------------------------------------------------------ leer/gefuellt

test('leer und nicht leer', () => {
  const ohne = { ...KUNDE, position: '   ' };
  assert.equal(trifftRegel(ohne, { merkmal: 'position', operator: 'leer' }, HEUTE), true);
  assert.equal(trifftRegel(ohne, { merkmal: 'position', operator: 'nicht_leer' }, HEUTE), false);
  assert.equal(trifftRegel(KUNDE, { merkmal: 'position', operator: 'nicht_leer' }, HEUTE), true);
});

test('fehlender Wert im Feld laesst jede normale Regel durchfallen', () => {
  const ohne = { ...KUNDE, firma: null };
  assert.equal(trifftRegel(ohne, { merkmal: 'firma', operator: 'ist', wert: 'Mustermann Bedachungen' }, HEUTE), false);
});

// ---------------------------------------------------------------- Segment

test('ohne Regel gehoert niemand ins Segment', () => {
  assert.equal(passt(KUNDE, { name: 'Leer', regeln: [] }, HEUTE), false);
  assert.equal(passt(KUNDE, null, HEUTE), false);
  assert.equal(filtere([KUNDE], { regeln: [] }, HEUTE).length, 0);
});

test('und heisst alle, oder heisst eine', () => {
  const regeln = [
    { merkmal: 'firma', operator: 'ist', wert: 'Mustermann Bedachungen' },
    { merkmal: 'ort', operator: 'ist', wert: 'München' },
  ];
  assert.equal(passt(KUNDE, { verknuepfung: 'und', regeln }, HEUTE), false);
  assert.equal(passt(KUNDE, { verknuepfung: 'oder', regeln }, HEUTE), true);
});

test('ohne Angabe gilt „und" — die engere Auswahl ist die sichere', () => {
  const regeln = [
    { merkmal: 'firma', operator: 'ist', wert: 'Mustermann Bedachungen' },
    { merkmal: 'ort', operator: 'ist', wert: 'München' },
  ];
  assert.equal(passt(KUNDE, { regeln }, HEUTE), false);
});

test('das Beispiel aus dem Dateikopf trifft', () => {
  const segment = {
    name: 'Bedachungen 70xxx, lange nichts gehoert',
    verknuepfung: 'und',
    regeln: [
      { merkmal: 'firma', operator: 'enthaelt', wert: 'Bedach' },
      { merkmal: 'plz', operator: 'beginnt_mit', wert: '70' },
      { merkmal: 'letzter_kontakt_am', operator: 'aelter_als_tage', wert: 90 },
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
    { ...KUNDE, firma: 'Andere GmbH' },
  ];
  const z = zaehle(liste, { regeln: [{ merkmal: 'firma', operator: 'enthaelt', wert: 'Bedach' }] }, HEUTE);
  assert.equal(z.gesamt, 4);
  assert.equal(z.treffer, 3);
  assert.equal(z.erreichbar, 1);
  assert.equal(z.ohneAdresse, 2);
});

test('zaehle: leere Liste ergibt lauter Nullen', () => {
  const z = zaehle([], { regeln: [{ merkmal: 'ort', operator: 'ist', wert: 'Stuttgart' }] }, HEUTE);
  assert.deepEqual(z, { gesamt: 0, treffer: 0, erreichbar: 0, gesperrt: 0, ohneEinwilligung: 0, ohneAdresse: 0 });
});

// --------------------------------------------------- Darf der ueberhaupt Post?

test('ein Widerspruch schlaegt alles — auch eine gesetzte Einwilligung', () => {
  const z = { ...KUNDE, werbe_einwilligung: true, werbe_widerspruch_am: '2026-05-02T10:00:00Z' };
  assert.equal(werbeStatus(z), 'widersprochen');
  assert.equal(darfWerbung(z), false);
});

test('ohne Einwilligung ist kein klares Nein, aber auch kein Ja', () => {
  const z = { ...KUNDE, werbe_einwilligung: false };
  assert.equal(werbeStatus(z), 'ohne_einwilligung');
  assert.equal(darfWerbung(z), false, 'in den Versand kommt nur „erlaubt"');
});

test('fehlende Einwilligung wird nicht als true gelesen', () => {
  assert.equal(werbeStatus({ email: 'a@b.de' }), 'ohne_einwilligung');
  assert.equal(werbeStatus({ email: 'a@b.de', werbe_einwilligung: 'ja' }), 'ohne_einwilligung',
    'nur echtes true zaehlt, kein Text');
});

test('Newsletter: ohne Bestaetigung geht nichts raus', () => {
  const a = { email: 'a@b.de', bestaetigt_am: null, status: 'unbestaetigt' };
  assert.equal(werbeStatus(a, 'newsletter'), 'nicht_bestaetigt');
  const b = { email: 'a@b.de', bestaetigt_am: '2026-03-01T09:00:00Z', status: 'aktiv' };
  assert.equal(werbeStatus(b, 'newsletter'), 'erlaubt');
});

test('Newsletter: abgemeldet bleibt abgemeldet, auch mit Bestaetigung', () => {
  const z = { email: 'a@b.de', bestaetigt_am: '2026-03-01T09:00:00Z', abgemeldet_am: '2026-06-01T09:00:00Z' };
  assert.equal(werbeStatus(z, 'newsletter'), 'abgemeldet');
  assert.equal(darfWerbung(z, 'newsletter'), false);
});

test('jeder Werbe-Status hat einen deutschen Satz', () => {
  for (const s of ['erlaubt', 'widersprochen', 'abgemeldet', 'nicht_bestaetigt', 'ohne_einwilligung']) {
    assert.ok(WERBE_STATUS_TEXT[s].length > 5, s);
  }
});

test('zaehle trennt erreichbar, gesperrt, ohne Einwilligung und ohne Adresse', () => {
  const liste = [
    KUNDE,                                                            // erreichbar
    { ...KUNDE, werbe_widerspruch_am: '2026-05-02T10:00:00Z' },       // gesperrt
    { ...KUNDE, werbe_einwilligung: false },                          // ohne Einwilligung
    { ...KUNDE, email: '' },                                          // ohne Adresse
    { ...KUNDE, firma: 'Andere GmbH' },                               // trifft nicht
  ];
  const z = zaehle(liste, { regeln: [{ merkmal: 'firma', operator: 'enthaelt', wert: 'Bedach' }] }, HEUTE);
  assert.equal(z.gesamt, 5);
  assert.equal(z.treffer, 4);
  assert.equal(z.erreichbar, 1);
  assert.equal(z.gesperrt, 1);
  assert.equal(z.ohneEinwilligung, 1);
  assert.equal(z.ohneAdresse, 1);
});

// ----------------------------------------------------------------- Quellen

test('merkmaleFuer: jede Quelle zeigt nur ihre eigenen Spalten', () => {
  const k = merkmaleFuer('kontakte').map((m) => m.schluessel);
  const n = merkmaleFuer('newsletter').map((m) => m.schluessel);
  assert.ok(k.includes('plz'));
  assert.equal(k.includes('variante'), false, 'variante gibt es nur beim Newsletter');
  assert.ok(n.includes('bestaetigt_am'));
  assert.equal(n.includes('plz'), false, 'newsletter_abonnenten hat keine Anschrift');
});

test('jedes Merkmal gehoert zu mindestens einer echten Quelle', () => {
  const bekannt = QUELLEN.map((q) => q.schluessel);
  for (const m of MERKMALE) {
    assert.ok(m.quellen.length > 0, m.schluessel);
    for (const q of m.quellen) assert.ok(bekannt.includes(q), m.schluessel + ' -> ' + q);
  }
});

// --------------------------------------------------------------- beschreibe

test('beschreibe: ein lesbarer deutscher Satz statt einer Regelliste', () => {
  const s = beschreibe({
    verknuepfung: 'und',
    regeln: [
      { merkmal: 'firma', operator: 'enthaelt', wert: 'Bedach' },
      { merkmal: 'plz', operator: 'beginnt_mit', wert: '70' },
    ],
  });
  assert.match(s, /^Alle, bei denen /);
  assert.match(s, /Firma/);
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
