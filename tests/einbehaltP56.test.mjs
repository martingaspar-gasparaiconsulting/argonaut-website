// ============================================================================
// tests/einbehaltP56.test.mjs
//
// PUNKT 56 / R6 — SICHERHEITSEINBEHALT, Paket 1 (21.09.2026)
//
// ▄▄▄ DER BEFUND ▄▄▄
// Gesucht wurde im ganzen Repo nach "einbehalt", "buergschaft",
// "gewaehrleistung" und "VOB": KEIN EINZIGER TREFFER. Fuer einen Baubetrieb
// fehlt damit die Haelfte der Schlussrechnung.
//
// ▄▄▄ DIE ZWEI FEHLER, DIE DIESE DATEI VERHINDERN SOLL ▄▄▄
//
//  1. DEN EINBEHALT WIE EINEN RABATT BEHANDELN. Er mindert das Entgelt NICHT.
//     Die Leistung ist voll erbracht, die Rechnung weist die VOLLE
//     Umsatzsteuer aus; einbehalten wird nur die Zahlung. Wer die
//     Bemessungsgrundlage kuerzt, weist zu wenig Umsatzsteuer aus.
//
//  2. SKONTO VOM GEKUERZTEN BETRAG RECHNEN. GEMESSEN an einer Schlussrechnung
//     ueber 59.500 EUR mit 5 % Einbehalt und 2 % Skonto: richtig sind
//     1.190,00 EUR Skonto, vom gekuerzten Betrag waeren es 1.130,50 EUR —
//     der Kunde bekaeme 59,50 EUR zu wenig Nachlass, und zwar bei JEDER
//     solchen Rechnung.
//
// NOCH RUFT DIE DATEI NIEMAND AUF — wie lib/skonto.ts.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  rechneEinbehalt, rueckgabeDatum, einbehaltText, pruefeEinbehalt,
  zahlungsplan, EINBEHALT_UEBLICH_MAX,
} from '../out/sicherheitseinbehalt.js';
import { rechneSkonto } from '../out/skonto.js';

// ===========================================================================
// TEIL 1 — DIE RECHNUNG BLEIBT VOLL
// ===========================================================================

test('5 % auf 59.500 EUR: Rechnungsbetrag bleibt voll, nur die Auszahlung sinkt', () => {
  const e = rechneEinbehalt(59500, { prozent: 5 });
  assert.equal(e.gilt, true);
  assert.equal(e.rechnungsbetrag, 59500, 'volle Umsatzsteuer — der Einbehalt mindert das Entgelt nicht');
  assert.equal(e.einbehalt, 2975);
  assert.equal(e.auszahlung, 56525);
  assert.equal(e.einbehalt + e.auszahlung, e.rechnungsbetrag, 'muss aufgehen');
});

test('Basis netto rechnet vom Netto, nicht vom Brutto', () => {
  const e = rechneEinbehalt(59500, { prozent: 5, basis: 'netto' }, 50000);
  assert.equal(e.bemessung, 50000);
  assert.equal(e.einbehalt, 2500, '5 % von 50.000, nicht von 59.500');
  assert.equal(e.auszahlung, 57000, 'abgezogen wird trotzdem vom Bruttobetrag');
});

test('Basis netto OHNE Nettobetrag behaelt lieber gar nichts ein', () => {
  // Stillschweigend aufs Brutto auszuweichen hiesse 475 EUR zu viel
  // einzubehalten. Lieber nichts tun und es sagen.
  const e = rechneEinbehalt(59500, { prozent: 5, basis: 'netto' });
  assert.equal(e.gilt, false);
  assert.equal(e.einbehalt, 0);
  assert.equal(e.auszahlung, 59500);
  const h = pruefeEinbehalt({ prozent: 5, basis: 'netto' }, 4, false);
  assert.ok(h.some((x) => x.feld === 'basis'), 'und der Nutzer erfaehrt warum');
});

test('eine Buergschaft loest den Einbehalt ab (§ 17 Abs. 3 VOB/B)', () => {
  const e = rechneEinbehalt(59500, { prozent: 5, durchBuergschaftAbgeloest: true });
  assert.equal(e.gilt, false);
  assert.equal(e.abgeloest, true);
  assert.equal(e.prozent, 5, 'der vereinbarte Satz bleibt sichtbar');
  assert.equal(e.einbehalt, 0);
  assert.equal(e.auszahlung, 59500);
  assert.ok(einbehaltText(59500, { prozent: 5, durchBuergschaftAbgeloest: true }).includes('Buergschaft abgeloest'));
});

test('deutsche Schreibweise wird gelesen, und Gutschriften runden symmetrisch', () => {
  const e = rechneEinbehalt('59.500,00', { prozent: '5' });
  assert.equal(e.einbehalt, 2975);
  // 53,50 mal 5 % ergibt genau 2,675 — der Grenzfall.
  const g = rechneEinbehalt(-53.5, { prozent: 5 });
  assert.equal(g.einbehalt, -2.68, 'Math.round allein haette -2.67 ergeben');
});

test('ohne Satz wird nichts einbehalten', () => {
  for (const a of [{ prozent: 0 }, { prozent: null }, { prozent: 'abc' }]) {
    const e = rechneEinbehalt(59500, a);
    assert.equal(e.gilt, false);
    assert.equal(e.auszahlung, 59500);
  }
});

// ===========================================================================
// TEIL 2 — SKONTO UND EINBEHALT ZUSAMMEN
// ===========================================================================

test('DER PRAXISFEHLER: Skonto rechnet vom VOLLEN Betrag, nicht vom gekuerzten', () => {
  const p = zahlungsplan({ brutto: 59500, einbehalt: { prozent: 5 }, skontoProzent: 2 });
  assert.equal(p.rechnungsbetrag, 59500);
  assert.equal(p.einbehalt, 2975);
  assert.equal(p.skonto, 1190, '2 % von 59.500 — NICHT von 56.525');
  assert.equal(p.zahlbetrag, 55335);
  assert.equal(p.spaeterFaellig, 2975);

  // Zum Vergleich: vom gekuerzten Betrag waeren es nur 1.130,50.
  const falsch = rechneSkonto(59500 - 2975, { prozent: 2, tage: 14 }).abzug;
  assert.equal(falsch, 1130.5);
  assert.equal(Math.round((p.skonto - falsch) * 100) / 100, 59.5, 'so viel Nachlass fehlte dem Kunden');
});

test('die Skonto-Zahl stimmt mit lib/skonto.ts ueberein — keine zweite Formel', () => {
  for (const [brutto, sp] of [[59500, 2], [1190, 2.5], [133.75, 2], [-53.5, 3]]) {
    const ausPlan = zahlungsplan({ brutto, skontoProzent: sp }).skonto;
    const ausSkonto = rechneSkonto(brutto, { prozent: sp, tage: 14 }).abzug;
    assert.equal(ausPlan, ausSkonto, `abweichend bei ${brutto} / ${sp} %`);
  }
});

test('der Zahlungsplan geht auf', () => {
  const p = zahlungsplan({ brutto: 59500, einbehalt: { prozent: 5 }, skontoProzent: 2 });
  assert.equal(Math.round((p.zahlbetrag + p.einbehalt + p.skonto) * 100) / 100, p.rechnungsbetrag);
});

test('ohne Einbehalt und ohne Skonto bleibt alles stehen', () => {
  const p = zahlungsplan({ brutto: 59500 });
  assert.equal(p.zahlbetrag, 59500);
  assert.equal(p.einbehalt, 0);
  assert.equal(p.skonto, 0);
});

// ===========================================================================
// TEIL 3 — DIE FRIST
// ===========================================================================

test('das Rueckgabedatum ist Abnahme plus Gewaehrleistungsfrist, in UTC', () => {
  assert.equal(rueckgabeDatum('2026-09-21', 4).toISOString().slice(0, 10), '2030-09-21');
  assert.equal(rueckgabeDatum('2026-09-21', 5).toISOString().slice(0, 10), '2031-09-21');
  assert.equal(rueckgabeDatum('2026-09-21', 2).toISOString().slice(0, 10), '2028-09-21');
});

test('der 29. Februar rutscht auf den 28., nicht auf den 1. Maerz', () => {
  // Sonst waere die Frist einen Tag zu lang — und die Rueckgabe faellig, wenn
  // der Auftraggeber sie schon verweigern koennte.
  assert.equal(rueckgabeDatum('2028-02-29', 1).toISOString().slice(0, 10), '2029-02-28');
  assert.equal(rueckgabeDatum('2028-02-29', 4).toISOString().slice(0, 10), '2032-02-29', 'Schaltjahr bleibt der 29.');
});

test('ohne lesbares Datum oder ohne Frist gibt es kein Rueckgabedatum — nie ein erfundenes', () => {
  assert.equal(rueckgabeDatum('kaputt', 4), null);
  assert.equal(rueckgabeDatum('', 4), null);
  assert.equal(rueckgabeDatum(null, 4), null);
  assert.equal(rueckgabeDatum('2026-09-21', 0), null);
  assert.equal(rueckgabeDatum('2026-09-21', null), null);
});

test('die Frist haengt nicht von der Zeitzone ab', () => {
  assert.equal(rueckgabeDatum('2026-09-01T00:00:00.000Z', 4).toISOString().slice(0, 10), '2030-09-01');
});

// ===========================================================================
// TEIL 4 — DER TEXT UND DIE HINWEISE
// ===========================================================================

test('der Rechnungssatz nennt Betrag, Zahlbetrag, Frist und die Umsatzsteuer', () => {
  const t = einbehaltText(59500, { prozent: 5 }, '2026-09-21', 4);
  assert.ok(t.includes('5 %'));
  assert.ok(t.includes('2.975,00 EUR'));
  assert.ok(t.includes('56.525,00 EUR'));
  assert.ok(t.includes('21.09.2030'));
  assert.ok(t.includes('Umsatzsteuer bleibt davon unberuehrt'), 'sonst kuerzt mancher Kunde selbst noch einmal');
});

test('ohne Frist steht kein erfundenes Datum im Text', () => {
  const t = einbehaltText(59500, { prozent: 5 });
  assert.ok(t.includes('2.975,00 EUR'));
  assert.ok(!t.includes('Gewaehrleistungsfrist am'));
});

test('kein Einbehalt, kein Satz auf der Rechnung', () => {
  assert.equal(einbehaltText(59500, { prozent: 0 }), '');
});

test('ein ungewoehnlich hoher Satz wird benannt, nicht gekappt', () => {
  assert.equal(EINBEHALT_UEBLICH_MAX, 10);
  const h = pruefeEinbehalt({ prozent: 30 }, 4);
  assert.ok(h.some((x) => x.feld === 'prozent' && x.text.includes('ungewoehnlich hoch')));
  assert.equal(rechneEinbehalt(59500, { prozent: 30 }).einbehalt, 17850, 'gerechnet wird trotzdem');
});

test('die fehlende Gewaehrleistungsfrist wird angemahnt', () => {
  const h = pruefeEinbehalt({ prozent: 5 });
  const f = h.find((x) => x.feld === 'frist');
  assert.ok(f, 'ohne Frist kein Rueckgabedatum auf der Rechnung');
  assert.ok(f.text.includes('VOB/B') && f.text.includes('BGB'), 'beide Moeglichkeiten genannt, keine geraten');
});

test('der Sperrkonto-Hinweis kommt bei jedem Bareinbehalt — und nicht bei Buergschaft', () => {
  assert.ok(pruefeEinbehalt({ prozent: 5 }, 4).some((x) => x.feld === 'sperrkonto'));
  assert.ok(!pruefeEinbehalt({ prozent: 5, durchBuergschaftAbgeloest: true }, 4).some((x) => x.feld === 'sperrkonto'));
});

test('ein ueblicher Einbehalt mit Frist und Buergschaft gibt keine Beanstandung', () => {
  assert.deepEqual(pruefeEinbehalt({ prozent: 5, durchBuergschaftAbgeloest: true }, 4), []);
});
