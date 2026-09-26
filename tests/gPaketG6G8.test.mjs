// Paket G, Punkte G6 bis G8 (26.09.2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { belegAusERechnung, hauptSteuersatz, istDoppelterBeleg } from '../out/belegAusERechnung.js';
import { buchungsDatumIso, offenerRest, pruefeZahlbetrag } from '../out/zahlungErfassen.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('G6 E-Rechnung wird Eingangsbeleg, kein Doppel', () => {
  const e = { rechnungsnummer: 'RE-77', rechnungsdatum: '2026-09-20', verkaeufer: { name: 'Großhandel Maier' },
    positionen: [{ netto: 100, mwst_satz: 19 }, { netto: 20, mwst_satz: 7 }], netto_summe: 120, mwst_summe: 20.4, brutto_summe: 140.4 };
  const b = belegAusERechnung(e);
  assert.deepEqual([b.lieferant, b.belegnummer, b.belegdatum, b.netto, b.ust_satz, b.ust_betrag, b.brutto], ['Großhandel Maier', 'RE-77', '2026-09-20', 120, 19, 20.4, 140.4]);
  assert.equal(hauptSteuersatz({ kleinunternehmer: true, positionen: [{ netto: 5, mwst_satz: 19 }] }), 0);
  assert.equal(istDoppelterBeleg(b, [{ lieferant: 'großhandel maier', belegnummer: 're-77' }]), true);
  assert.equal(istDoppelterBeleg(b, [{ lieferant: 'Anderer', belegnummer: 'RE-77' }]), false);
  assert.equal(istDoppelterBeleg({ lieferant: 'X', belegnummer: null }, [{ lieferant: 'X', belegnummer: null }]), false);
  const s = lies('app/dashboard/erechnung-import/page.tsx');
  assert.ok(s.includes('belegAusERechnung(rechnung)') && s.includes('from("eingangsbelege").insert('));
});

test('G7 SEPA: Rechnungen werden vermerkt und nur der Rest eingezogen', () => {
  const s = lies('app/dashboard/sepa-einzug/page.tsx');
  assert.ok(s.includes("update({ sepa_datei_am: ausfuehrung })"));
  assert.ok(s.includes('setRechnungen(alleOffen.filter((r) => !r.sepa_datei_am))'));
  assert.ok(s.includes('betrag: offenerRest(r)'));
  assert.ok(!/betrag: Number\(r\.brutto_summe\) \|\| 0,/.test(s));
  const sql = lies('supabase-sql/g7-sepa-vermerk.sql').replace(/--[^\n]*/g, '');
  assert.ok(/add column if not exists sepa_datei_am date/.test(sql) && !/drop /i.test(sql));
});

test('G8 Zahlungen: echter Betrag, echtes Datum, Teilzahlung bleibt offen', () => {
  assert.equal(buchungsDatumIso('2026-09-18', 'X'), '2026-09-18');
  assert.equal(buchungsDatumIso('18.09.2026', 'X'), '2026-09-18');
  assert.equal(buchungsDatumIso('8.9.26', 'X'), '2026-09-08');
  assert.equal(buchungsDatumIso('20260918', 'X'), '2026-09-18');
  assert.equal(buchungsDatumIso('', 'X'), 'X');
  assert.equal(offenerRest(1190, 500), 690);
  assert.equal(offenerRest(100, 150), 0);
  assert.deepEqual(pruefeZahlbetrag('500,00', 690), { betrag: 500, fehler: null });
  assert.deepEqual(pruefeZahlbetrag('1.190,00', 1190), { betrag: 1190, fehler: null });
  assert.ok(pruefeZahlbetrag('0', 690).fehler);
  assert.ok(pruefeZahlbetrag('69000', 690).fehler);
  const bank = lies('app/dashboard/banking/page.tsx');
  assert.ok(bank.includes("from('zahlungen').insert(") && bank.includes('buchungsDatumIso(m.transaktion.datum'));
  assert.ok(!bank.includes("zahlungsstatus: 'bezahlt', bezahlt_am: new Date()"));
  const z = lies('app/dashboard/zahlungen/page.tsx');
  assert.ok(z.includes("from('zahlungen').insert(") && !z.includes("bezahlter_betrag: Number(r.brutto_summe) || 0"));
});
