import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { auftragZuRechnung, zeilenNetto } from '../out/rechnungAusAuftrag.js';

// ===========================================================================
// HW-7 (15.10.2026) — Rechnung aus Auftrag: Summen je Steuersatz neu,
// Rueckbau bei Fehler, Leistungsdatum aus dem Auftrag
// ===========================================================================

test('Steuer je Steuersatz gruppiert, nicht ueber alle Zeilen ungerundet', () => {
  // Drei Zeilen je 0,99 € zu 19 %: je Zeile ungerundet 0,1881 -> Summe 0,5643 -> 0,56
  // Gruppensumme 2,97 x 19 % = 0,5643 -> 0,56; mit 7 %-Zeile gemischt pruefen
  const { summen } = auftragZuRechnung([
    { menge: 1, einzelpreis: 0.99, mwst_satz: 19 },
    { menge: 1, einzelpreis: 0.99, mwst_satz: 19 },
    { menge: 1, einzelpreis: 10.05, mwst_satz: 7 },
  ]);
  assert.equal(summen.netto, 12.03);
  assert.equal(summen.mwst, 0.38 + 0.7);
  assert.equal(summen.brutto, 13.11);
  assert.equal(summen.gruppen.length, 2);
});

test('0 % bleibt 0 %, leerer Satz wird 19 %', () => {
  const { posten } = auftragZuRechnung([
    { menge: 1, einzelpreis: 100, mwst_satz: 0 },
    { menge: 1, einzelpreis: 100, mwst_satz: '' },
  ]);
  assert.equal(posten[0].mwst_satz, 0);
  assert.equal(posten[1].mwst_satz, 19);
});

test('Zeilen-Netto: gespeichertes gesamt_netto, sonst Menge x Preis, auf Cent', () => {
  assert.equal(zeilenNetto({ menge: 3, einzelpreis: 1.115, gesamt_netto: 3.35 }), 3.35);
  assert.equal(zeilenNetto({ menge: 3, einzelpreis: 1.115 }), 3.35);
  assert.equal(zeilenNetto({ menge: '2,5', einzelpreis: '40' }), 100);
});

test('Positionen bekommen Nummer, Bezeichnung und Einheit', () => {
  const { posten } = auftragZuRechnung([{ bezeichnung: '  ', menge: 2, einzelpreis: 5 }]);
  assert.equal(posten[0].position, 1);
  assert.equal(posten[0].bezeichnung, '(ohne Bezeichnung)');
  assert.equal(posten[0].einheit, 'Stk');
  assert.equal(posten[0].gesamt_netto, 10);
});

test('Waechter: Route rechnet Summen neu und storniert bei Positionsfehler', () => {
  const src = fs.readFileSync('app/api/rechnung-aus-auftrag/route.ts', 'utf8');
  assert.match(src, /auftragZuRechnung\(positionen\)/);
  assert.match(src, /netto_summe: summen\.netto/);
  assert.doesNotMatch(src, /auftrag\.brutto_summe/, 'Summen nicht aus dem Auftragskopf uebernehmen');
  assert.match(src, /zahlungsstatus: "storniert"/);
  assert.match(src, /lieferdatum \|\| rechnungsdatum/);
});

test('Waechter: Auftragsseite rechnet Summen ueber kopfSummen und speichert steuersatz()', () => {
  const src = fs.readFileSync('app/dashboard/auftraege/[id]/page.tsx', 'utf8');
  assert.match(src, /kopfSummen\(zeilen\.map/);
  assert.doesNotMatch(src, /mwst \+= zn \*/);
  assert.doesNotMatch(src, /mwst_satz: parseZahl\(z\.mwst_satz\)/);
});
