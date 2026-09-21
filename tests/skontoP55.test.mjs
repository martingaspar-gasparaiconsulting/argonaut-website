// ============================================================================
// tests/skontoP55.test.mjs
//
// PUNKT 55 / R4 — SKONTO AUF DER RECHNUNG, Paket 1 (21.09.2026)
//
// ▄▄▄ DER BEFUND, AM ECHTEN CODE GEPRUEFT ▄▄▄
// Die Liste sagte: "Im Kalkulator ist Skonto bereits korrekt 'im Hundert'
// gerechnet; auf der Rechnung fehlt es." Beides bestaetigt. Gesucht wurde im
// ganzen Repo nach dem Wort "skonto": es kommt vor in lib/kalkulator.ts
// (richtig gebaut, Z.219-221) und als Spaltenueberschrift im DATEV-Export.
// Sonst nirgends. Die Rechnung kennt bis heute nur zahlungsziel_tage.
//
// ▄▄▄ WAS DABEI LEICHT UEBERSEHEN WIRD ▄▄▄
// Im Kalkulator ist Skonto ein AUFSCHLAG-Problem (der Satz muss vorher
// eingepreist werden, sonst fehlt das Geld hinterher). Auf der Rechnung ist
// es ein ABZUG-Problem. Die beiden Rechnungen haben nichts miteinander zu
// tun — wer die Kalkulator-Formel auf die Rechnung uebertraegt, rechnet
// falsch herum. Ein eigener Test haelt den Unterschied fest.
//
// ▄▄▄ DIE STEUERLICHE REGEL ▄▄▄
// § 17 Abs. 1 UStG: Skonto mindert das Entgelt ERST bei Inanspruchnahme. Die
// Rechnung weist die VOLLE Umsatzsteuer aus. Deshalb trennt diese Datei
// sauber zwischen dem, was auf der Rechnung steht, und dem, was der Kunde
// ueberweist. Wer beides vermischt, weist zu wenig Umsatzsteuer aus.
//
// NOCH RUFT DIE DATEI NIEMAND AUF — Muster wie P44 und P69 Paket 1.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  rechneSkonto, skontoFrist, skontoText, skontoZeileXRechnung,
  pruefeSkonto, skontoBerichtigung, SKONTO_MAX_PROZENT,
} from '../out/skonto.js';

// ===========================================================================
// TEIL 1 — DIE RECHNUNG BLEIBT VOLL, NUR DIE UEBERWEISUNG SCHRUMPFT
// ===========================================================================

test('2 % auf 1.190,00 EUR: Rechnungsbetrag bleibt voll, Zahlbetrag sinkt', () => {
  const e = rechneSkonto(1190, { prozent: 2, tage: 14 });
  assert.equal(e.gilt, true);
  assert.equal(e.rechnungsbetrag, 1190, 'auf der Rechnung steht der volle Betrag (§ 17 UStG)');
  assert.equal(e.abzug, 23.8);
  assert.equal(e.zahlbetrag, 1166.2);
});

test('DER UNTERSCHIED ZUM KALKULATOR: Abzug ist nicht die Umkehrung des Aufschlags', () => {
  // Kalkulator (lib/kalkulator.ts Z.220): wer 1.000 netto braucht und 3 %
  // Skonto gewaehrt, muss 1.000 / 0,97 = 1.030,93 ansetzen.
  const imHundert = Math.round((1000 / (1 - 3 / 100)) * 100) / 100;
  assert.equal(imHundert, 1030.93);

  // Rechnung: von 1.030,93 gehen 3 % ab — und man landet wieder bei 1.000,00.
  const zurueck = rechneSkonto(imHundert, { prozent: 3, tage: 14 });
  assert.equal(zurueck.zahlbetrag, 1000, 'die beiden Formeln sind zueinander invers');

  // Wer dagegen einfach 3 % AUFSCHLAEGT, landet bei 1.030,00 und verliert
  // nach dem Abzug 90 Cent — pro Rechnung.
  const falsch = rechneSkonto(1030, { prozent: 3, tage: 14 });
  assert.equal(falsch.zahlbetrag, 999.1);
});

test('deutsche Schreibweise wird gelesen, auch beim Satz', () => {
  const e = rechneSkonto('1.190,00', { prozent: '2,5', tage: '14' });
  assert.equal(e.rechnungsbetrag, 1190);
  assert.equal(e.prozent, 2.5);
  assert.equal(e.abzug, 29.75);
  assert.equal(e.zahlbetrag, 1160.25);
});

test('ohne Satz oder ohne Frist gilt kein Skonto — und es wird nichts abgezogen', () => {
  for (const a of [{ prozent: 0, tage: 14 }, { prozent: 2, tage: 0 }, { prozent: null, tage: null }]) {
    const e = rechneSkonto(1190, a);
    assert.equal(e.gilt, false);
    assert.equal(e.abzug, 0);
    assert.equal(e.zahlbetrag, 1190, 'der volle Betrag bleibt stehen');
  }
});

test('eine Gutschrift rundet symmetrisch um Null', () => {
  // Der Grenzfall, an dem sich die Rundungen unterscheiden: 133,75 mal 2 %
  // ergibt genau 2,675. Bei einer Gutschrift schreibt Math.round dafuer
  // -2,67 — einen Cent zu wenig abgezogen. centRunden schreibt -2,68.
  const e = rechneSkonto(-133.75, { prozent: 2, tage: 14 });
  assert.equal(e.abzug, -2.68, 'Math.round allein haette -2.67 ergeben');
  assert.equal(e.zahlbetrag, -131.07);

  // Und zur Sicherheit ein glatter Fall, damit die Richtung stimmt.
  const g = rechneSkonto(-1190.5, { prozent: 2, tage: 14 });
  assert.equal(g.abzug, -23.81);
  assert.equal(g.zahlbetrag, -1166.69);
});

// ===========================================================================
// TEIL 2 — DIE FRIST
// ===========================================================================

test('die Frist ist Rechnungsdatum plus Tage, in UTC', () => {
  const f = skontoFrist('2026-09-21', 14);
  assert.equal(f.toISOString().slice(0, 10), '2026-10-05');
});

test('die Frist haengt NICHT von der Zeitzone des Servers ab', () => {
  // Deutsche Mitternacht des 1. September, als UTC gespeichert.
  const f = skontoFrist('2026-09-01T00:00:00.000Z', 30);
  assert.equal(f.toISOString().slice(0, 10), '2026-10-01');
});

test('ein unlesbares Rechnungsdatum gibt null — nie still das heutige', () => {
  assert.equal(skontoFrist('kaputt', 14), null);
  assert.equal(skontoFrist('', 14), null);
  assert.equal(skontoFrist(null, 14), null);
  assert.equal(skontoFrist('2026-09-21', 0), null);
});

test('BEWUSST OHNE § 193 BGB: eine Frist auf einem Sonntag bleibt auf dem Sonntag', () => {
  // 21.09.2026 ist ein Montag, plus 13 Tage ist Sonntag, der 04.10.
  const f = skontoFrist('2026-09-21', 13);
  assert.equal(f.getUTCDay(), 0, 'Sonntag');
  assert.equal(f.toISOString().slice(0, 10), '2026-10-04');
  // Die Skontofrist ist eine vertragliche Zahlungsfrist, keine gesetzliche.
  // Sie verschiebt sich nicht. Wer es anders will, vereinbart es ausdruecklich.
});

// ===========================================================================
// TEIL 3 — DIE TEXTE
// ===========================================================================

test('der Satz auf der Rechnung nennt Datum, Prozent, Abzug und Zahlbetrag', () => {
  const t = skontoText(1190, { prozent: 2, tage: 14 }, '2026-09-21');
  assert.equal(t, 'Bei Zahlung bis zum 05.10.2026 gewaehren wir 2 % Skonto (23,80 EUR), Zahlbetrag dann 1.166,20 EUR.');
});

test('ohne Rechnungsdatum steht die Frist in Tagen — immer noch eindeutig', () => {
  const t = skontoText(1190, { prozent: 2.5, tage: 7 });
  assert.ok(t.includes('innerhalb von 7 Tagen'));
  assert.ok(t.includes('2,5 %'), 'deutsche Schreibweise im Anzeigetext');
});

test('kein Skonto, kein Satz — dann gehoert auch keine Zeile auf die Rechnung', () => {
  assert.equal(skontoText(1190, { prozent: 0, tage: 14 }), '');
  assert.equal(skontoZeileXRechnung(1190, { prozent: 0, tage: 14 }), '');
});

test('die E-Rechnung bekommt das maschinenlesbare Muster (BT-20)', () => {
  const z = skontoZeileXRechnung(1190, { prozent: 2, tage: 14 });
  assert.equal(z, '#SKONTO#TAGE=14#PROZENT=2.00#BASISBETRAG=1190.00#');
  assert.ok(!z.includes(','), 'englische Schreibweise — die Norm liest keinen deutschen Dezimaltrenner');
  assert.ok(!z.includes('EUR'), 'kein Waehrungszeichen im Muster');
});

test('auch ein krummer Satz kommt mit zwei Nachkommastellen ins Muster', () => {
  assert.equal(
    skontoZeileXRechnung('1.234,56', { prozent: '2,5', tage: 7 }),
    '#SKONTO#TAGE=7#PROZENT=2.50#BASISBETRAG=1234.56#',
  );
});

// ===========================================================================
// TEIL 4 — WAS AUFFAELLT, WIRD GESAGT (BLOCKIERT ABER NICHTS)
// ===========================================================================

test('ein verrutschter Satz wird benannt', () => {
  const h = pruefeSkonto({ prozent: 20, tage: 14 });
  assert.equal(h.length, 1);
  assert.equal(h[0].feld, 'prozent');
  assert.ok(h[0].text.includes('ungewoehnlich hoch'));
  assert.equal(SKONTO_MAX_PROZENT, 10);
});

test('Satz ohne Frist und Frist ohne Satz werden beide benannt', () => {
  assert.equal(pruefeSkonto({ prozent: 2, tage: 0 })[0].feld, 'tage');
  assert.equal(pruefeSkonto({ prozent: 0, tage: 14 })[0].feld, 'prozent');
});

test('eine Skontofrist, die nicht kuerzer ist als das Zahlungsziel, ist kein Skonto', () => {
  const h = pruefeSkonto({ prozent: 2, tage: 14 }, 14);
  assert.ok(h.some((x) => x.feld === 'frist'), 'dann bekommt den Abzug jeder, der fristgerecht zahlt');
  assert.equal(pruefeSkonto({ prozent: 2, tage: 10 }, 30).length, 0, 'kuerzer ist in Ordnung');
});

test('unsinnige Saetze werden benannt, nicht stillschweigend gekappt', () => {
  assert.ok(pruefeSkonto({ prozent: -2, tage: 14 }).some((h) => h.text.includes('negativer')));
  assert.ok(pruefeSkonto({ prozent: 100, tage: 14 }).some((h) => h.text.includes('100 %')));
  // Gerechnet wird trotzdem etwas Sinnvolles: kein Skonto statt Unsinn.
  assert.equal(rechneSkonto(1190, { prozent: 100, tage: 14 }).gilt, false);
  assert.equal(rechneSkonto(1190, { prozent: -2, tage: 14 }).zahlbetrag, 1190);
});

test('ein ueblicher Satz gibt keine Hinweise', () => {
  assert.deepEqual(pruefeSkonto({ prozent: 2, tage: 14 }, 30), []);
  assert.deepEqual(pruefeSkonto({ prozent: 3, tage: 10 }, 21), []);
});

// ===========================================================================
// TEIL 5 — § 17 UStG: DIE BERICHTIGUNG, WENN DER KUNDE DAS SKONTO ZIEHT
// ===========================================================================

test('der Abzug teilt sich im Verhaeltnis des Steuersatzes auf', () => {
  const b = skontoBerichtigung(1190, { prozent: 2, tage: 14 }, 19);
  assert.equal(b.abzugBrutto, 23.8);
  assert.equal(b.abzugNetto, 20, '23,80 / 1,19');
  assert.equal(b.abzugSteuer, 3.8);
  assert.equal(b.abzugNetto + b.abzugSteuer, b.abzugBrutto, 'muss aufgehen');
});

test('bei 7 % und bei steuerfrei stimmt die Aufteilung auch', () => {
  const sieben = skontoBerichtigung(107, { prozent: 3, tage: 7 }, 7);
  assert.equal(sieben.abzugBrutto, 3.21);
  assert.equal(sieben.abzugNetto + sieben.abzugSteuer, sieben.abzugBrutto);

  const frei = skontoBerichtigung(1000, { prozent: 2, tage: 14 }, 0);
  assert.equal(frei.abzugNetto, 20, 'ohne Steuer ist netto gleich brutto');
  assert.equal(frei.abzugSteuer, 0);
});

test('ohne gueltiges Skonto gibt es nichts zu berichtigen', () => {
  const b = skontoBerichtigung(1190, { prozent: 0, tage: 14 }, 19);
  assert.equal(b.gilt, false);
  assert.equal(b.abzugBrutto, 0);
});
