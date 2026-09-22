// ARGONAUT OS · tests/verzugszinsP42.test.mjs — Punkt 42 (22.09.2026)
// Verzugszinsen: Datumstabelle statt fester Zahl, abschnittsweise ueber den
// Halbjahreswechsel, 5 Punkte fuer Verbraucher statt 9, 40-Euro-Pauschale.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASISZINS_TABELLE, AUFSCHLAG_VERBRAUCHER, AUFSCHLAG_UNTERNEHMEN, PAUSCHALE_B2B,
  basiszinsAm, tabelleGiltBis, verzugssatz, verzugszinsen, pauschale,
  verbraucherVorschlag, zinsErklaerung, forderungsAufstellung,
} from '../out/verzugszins.js';

// ---------------------------------------------------------------------------
// 1. DER WAECHTER — er wird von allein rot, wenn ein Halbjahreswert fehlt
// ---------------------------------------------------------------------------

test('WAECHTER: die Tabelle traegt bis heute — sonst fehlt ein Halbjahreswert', () => {
  const heute = new Date().toISOString().slice(0, 10);
  assert.ok(
    tabelleGiltBis() >= heute,
    `Der Basiszinssatz ist nur bis ${tabelleGiltBis()} hinterlegt, heute ist der ${heute}. `
    + 'Neuen Wert der Deutschen Bundesbank in BASISZINS_TABELLE (lib/verzugszins.ts) eintragen.',
  );
});

test('die Tabelle ist aufsteigend und luecklos halbjaehrlich sortiert', () => {
  for (let i = 1; i < BASISZINS_TABELLE.length; i++) {
    assert.ok(BASISZINS_TABELLE[i].ab > BASISZINS_TABELLE[i - 1].ab, 'Reihenfolge stimmt nicht');
  }
  for (const e of BASISZINS_TABELLE) {
    assert.match(e.ab, /^\d{4}-(01-01|07-01)$/, `${e.ab} ist kein 1.1. oder 1.7.`);
    assert.equal(typeof e.satz, 'number');
  }
});

// ---------------------------------------------------------------------------
// 2. DER RICHTIGE SATZ ZUM RICHTIGEN TAG
// ---------------------------------------------------------------------------

test('der Basiszins springt genau am Halbjahresersten', () => {
  assert.equal(basiszinsAm('2026-06-30'), 1.27);
  assert.equal(basiszinsAm('2026-07-01'), 1.52);
  assert.equal(basiszinsAm('2025-12-31'), 1.27);
  assert.equal(basiszinsAm('2025-01-01'), 2.27);
  assert.equal(basiszinsAm('2024-07-01'), 3.37);
  assert.equal(basiszinsAm('2022-12-31'), -0.88);
});

test('vor dem ersten Tabelleneintrag gibt es keinen Satz — und keine erfundene 0', () => {
  assert.equal(basiszinsAm('2016-06-30'), null);
  assert.equal(basiszinsAm('Unsinn'), null);
  assert.equal(basiszinsAm(''), null);
});

test('DER EIGENTLICHE FEHLER: Verbraucher bekommen 5 Punkte, nicht 9', () => {
  assert.equal(AUFSCHLAG_VERBRAUCHER, 5);
  assert.equal(AUFSCHLAG_UNTERNEHMEN, 9);
  assert.equal(verzugssatz(1.52, true), 6.52);
  assert.equal(verzugssatz(1.52, false), 10.52);
});

// ---------------------------------------------------------------------------
// 3. ABSCHNITTSWEISE — ein Satz ueber den ganzen Verzug waere falsch
// ---------------------------------------------------------------------------

test('ein Verzug ueber den Halbjahreswechsel wird in zwei Abschnitte geteilt', () => {
  const e = verzugszinsen({ offen: 1000, von: '2026-06-01', bis: '2026-08-01', istVerbraucher: false });
  assert.equal(e.abschnitte.length, 2);
  assert.deepEqual(
    e.abschnitte.map((a) => [a.von, a.bis, a.tage, a.satz]),
    [['2026-06-01', '2026-07-01', 30, 10.27], ['2026-07-01', '2026-08-01', 31, 10.52]],
  );
  // 1000 * 10.27% * 30/365 + 1000 * 10.52% * 31/365
  const erwartet = Math.round((1000 * 0.1027 * 30 / 365 + 1000 * 0.1052 * 31 / 365) * 100) / 100;
  assert.equal(e.betrag, erwartet);
});

test('GEGENPROBE: ein Satz ueber den ganzen Zeitraum ergaebe etwas anderes', () => {
  const e = verzugszinsen({ offen: 1000, von: '2026-06-01', bis: '2026-08-01', istVerbraucher: false });
  const einSatz = Math.round(1000 * 0.1052 * (61 / 365) * 100) / 100;   // so rechnete der alte Code
  assert.notEqual(e.betrag, einSatz, 'Abschnitte machen keinen Unterschied — dann greift die Reparatur nicht');
});

test('bleibt der Verzug im selben Halbjahr, gibt es genau einen Abschnitt', () => {
  const e = verzugszinsen({ offen: 500, von: '2026-07-10', bis: '2026-09-10', istVerbraucher: true });
  assert.equal(e.abschnitte.length, 1);
  assert.equal(e.abschnitte[0].satz, 6.52);
  assert.equal(e.betrag, Math.round(500 * 0.0652 * (62 / 365) * 100) / 100);
});

test('derselbe Verzug kostet einen Verbraucher weniger als eine Firma', () => {
  const v = verzugszinsen({ offen: 1000, von: '2026-07-01', bis: '2026-09-01', istVerbraucher: true });
  const b = verzugszinsen({ offen: 1000, von: '2026-07-01', bis: '2026-09-01', istVerbraucher: false });
  assert.ok(v.betrag < b.betrag);
  assert.equal(v.betrag, Math.round(1000 * 0.0652 * (62 / 365) * 100) / 100);
});

test('kein Verzug, keine Zinsen — und unlesbare Daten rechnen gar nichts', () => {
  assert.equal(verzugszinsen({ offen: 1000, von: '2026-09-01', bis: '2026-09-01', istVerbraucher: false }).betrag, 0);
  assert.equal(verzugszinsen({ offen: 1000, von: '2026-09-10', bis: '2026-09-01', istVerbraucher: false }).betrag, 0);
  const u = verzugszinsen({ offen: 1000, von: '', bis: '2026-09-01', istVerbraucher: false });
  assert.equal(u.unlesbar, true);
  assert.equal(u.betrag, 0);
  assert.equal(verzugszinsen({ offen: NaN, von: '2026-01-01', bis: '2026-09-01', istVerbraucher: false }).unlesbar, true);
});

test('reicht der Verzug ueber das Tabellenende hinaus, wird das gemeldet', () => {
  const ende = tabelleGiltBis();
  const jahr = Number(ende.slice(0, 4)) + 2;
  const e = verzugszinsen({ offen: 1000, von: `${jahr}-02-01`, bis: `${jahr}-03-01`, istVerbraucher: false });
  assert.equal(e.luecke, true);
});

// ---------------------------------------------------------------------------
// 4. DIE 40-EURO-PAUSCHALE (§ 288 Abs. 5)
// ---------------------------------------------------------------------------

test('die Pauschale gibt es im B2B ab der 1. Mahnung, einmal je Rechnung', () => {
  assert.equal(PAUSCHALE_B2B, 40);
  const b2b = { istVerbraucher: false, bereitsBerechnet: false, verzicht: false };
  assert.equal(pauschale({ ...b2b, stufe: 1 }), 0, 'Zahlungserinnerung noch nicht');
  assert.equal(pauschale({ ...b2b, stufe: 2 }), 40);
  assert.equal(pauschale({ ...b2b, stufe: 4 }), 40);
  assert.equal(pauschale({ ...b2b, stufe: 3, bereitsBerechnet: true }), 0, 'nur einmal je Rechnung');
});

test('im Verbrauchergeschaeft gibt es KEINE Pauschale', () => {
  assert.equal(pauschale({ istVerbraucher: true, stufe: 3, bereitsBerechnet: false, verzicht: false }), 0);
});

test('der Betrieb darf verzichten — das ist der einzige Hebel', () => {
  assert.equal(pauschale({ istVerbraucher: false, stufe: 2, bereitsBerechnet: false, verzicht: true }), 0);
});

// ---------------------------------------------------------------------------
// 5. IM ZWEIFEL VERBRAUCHER
// ---------------------------------------------------------------------------

test('ohne Anhaltspunkt gilt jemand als Verbraucher (der niedrigere Satz)', () => {
  assert.equal(verbraucherVorschlag({}), true);
  assert.equal(verbraucherVorschlag({ firmenname: '' }), true);
  assert.equal(verbraucherVorschlag({ firmenname: '   ' }), true);
});

test('ein Firmenname oder eine Firmenzuordnung spricht dagegen', () => {
  assert.equal(verbraucherVorschlag({ firmenname: 'Muster GmbH' }), false);
  assert.equal(verbraucherVorschlag({ firma_id: 'abc' }), false);
});

test('was am Kontakt steht, sticht den Vorschlag — in beide Richtungen', () => {
  assert.equal(verbraucherVorschlag({ ist_verbraucher: true, firmenname: 'Muster GmbH' }), true);
  assert.equal(verbraucherVorschlag({ ist_verbraucher: false }), false);
});

// ---------------------------------------------------------------------------
// 6. DER TEXT SAGT NUR, WAS STIMMT
// ---------------------------------------------------------------------------

test('die Erklaerung nennt den richtigen Absatz und bei zwei Abschnitten beide', () => {
  const v = verzugszinsen({ offen: 1000, von: '2026-07-01', bis: '2026-09-01', istVerbraucher: true });
  const tv = zinsErklaerung(v, true);
  assert.match(tv, /Abs\. 1/);
  assert.match(tv, /5 Prozentpunkte/);

  const b = verzugszinsen({ offen: 1000, von: '2026-06-01', bis: '2026-08-01', istVerbraucher: false });
  const tb = zinsErklaerung(b, false);
  assert.match(tb, /Abs\. 2/);
  assert.match(tb, /Halbjahreswechsel/);
  assert.match(tb, /30 Tage/);
  assert.match(tb, /31 Tage/);
});

test('ohne Zinsen gibt es keinen Erklaertext', () => {
  const leer = verzugszinsen({ offen: 1000, von: '2026-09-01', bis: '2026-09-01', istVerbraucher: false });
  assert.equal(zinsErklaerung(leer, false), '');
});

// ---------------------------------------------------------------------------
// 7. DIE AUFSTELLUNG: DIE SUMME IST DIE SUMME DER GEZEIGTEN ZEILEN
// ---------------------------------------------------------------------------

test('die Gesamtforderung ist die Summe genau der Zeilen, die dastehen', () => {
  const f = forderungsAufstellung({ offen: 1000, gebuehr: 0, pauschale: 40, zinsen: 17.86, zinsLabel: 'Verzugszinsen (62 Tage)' });
  assert.deepEqual(f.posten.map((p) => p.label), [
    'Offene Hauptforderung', 'Pauschale nach § 288 Abs. 5 BGB', 'Verzugszinsen (62 Tage)',
  ]);
  assert.equal(f.gesamt, 1057.86);
  assert.equal(f.gesamt, f.posten.reduce((s, p) => s + p.betrag, 0));
});

test('DER WICHTIGSTE TEST: kein Betrag steckt in der Summe, ohne als Zeile dazustehen', () => {
  for (const fall of [
    { offen: 500, gebuehr: 5, pauschale: 0, zinsen: 3.21 },
    { offen: 0.015, gebuehr: 0, pauschale: 40, zinsen: 0 },
    { offen: 1234.56, gebuehr: 10, pauschale: 40, zinsen: 99.99 },
    { offen: 100, gebuehr: 0, pauschale: 0, zinsen: 0 },
  ]) {
    const f = forderungsAufstellung(fall);
    const ausZeilen = Math.round(f.posten.reduce((s, p) => s + Math.round(p.betrag * 100), 0)) / 100;
    assert.equal(f.gesamt, ausZeilen, `Summe weicht ab bei ${JSON.stringify(fall)}`);
  }
});

test('ohne Zuschlaege wird keine Aufstellung gezeigt', () => {
  const f = forderungsAufstellung({ offen: 100 });
  assert.equal(f.hatZuschlaege, false);
  assert.equal(f.posten.length, 1);
  assert.equal(f.gesamt, 100);
});

test('unbrauchbare Zuschlaege werden zu 0, nicht zu NaN auf dem Kundendokument', () => {
  const f = forderungsAufstellung({ offen: 100, gebuehr: NaN, pauschale: undefined, zinsen: Infinity });
  assert.equal(f.gesamt, 100);
  assert.equal(f.posten.length, 1);
});
