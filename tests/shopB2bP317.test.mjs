// Paket 317 (11.10.2026): S3a Geschäftskunden-Shop — Schaufenster, Bestellung und Rechnung
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  offenAusRechnungen, offenAusBestellungen, endkundenPreis, besuchMerken, leseWunschMenge,
  rechnungsPosten, baueB2bBestellung, euro,
} from '../out/shopB2b.js';
import { steuerGruppen, cent } from '../out/steuerLogik.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Kreditrahmen: offene Rechnungen minus bezahlt, offene Bestellungen ohne Rechnung', () => {
  assert.equal(offenAusRechnungen([
    { brutto_summe: 1190, bezahlter_betrag: 0, zahlungsstatus: 'offen' },
    { brutto_summe: '500,00', bezahlter_betrag: 200, zahlungsstatus: 'teilbezahlt' },
    { brutto_summe: 100, bezahlter_betrag: 0, zahlungsstatus: 'ueberfaellig' },
    { brutto_summe: 999, bezahlter_betrag: 0, zahlungsstatus: 'bezahlt' },
    { brutto_summe: 999, zahlungsstatus: 'storniert' },
    { brutto_summe: 50, bezahlter_betrag: 80, zahlungsstatus: 'teilbezahlt' },
  ]), 119000 + 30000 + 10000, 'nie negativ, bezahlt/storniert zählen nicht');
  assert.equal(offenAusBestellungen([
    { brutto_summe: 100, status: 'neu', rechnung_id: null },
    { brutto_summe: 50.5, status: 'in_bearbeitung' },
    { brutto_summe: 70, status: 'storniert' },
    { brutto_summe: 70, status: 'abgeschlossen' },
    { brutto_summe: 70, status: 'neu', rechnung_id: 'r1' },
  ]), 15050);
  assert.equal(offenAusRechnungen(null), 0);
});

test('Endkunden-Preis folgt der Preis-Basis', () => {
  assert.equal(endkundenPreis(11.9, 19, 'brutto'), 11.9);
  assert.equal(endkundenPreis(10, 19, 'netto'), 11.9);
  assert.equal(endkundenPreis(10, 7, 'netto'), 10.7);
  assert.equal(endkundenPreis(10, 0, 'netto'), 10);
  assert.equal(endkundenPreis(null, 19, 'netto'), 0);
});

test('Besuch höchstens stündlich merken', () => {
  const jetzt = Date.parse('2026-10-11T12:00:00Z');
  assert.equal(besuchMerken(null, jetzt), true);
  assert.equal(besuchMerken('2026-10-11T11:30:00Z', jetzt), false);
  assert.equal(besuchMerken('2026-10-11T10:59:00Z', jetzt), true);
  assert.equal(besuchMerken('kaputt', jetzt), true);
});

test('Wunschmenge: bis 100.000 lesen, Bruchteile nicht runden', () => {
  assert.equal(leseWunschMenge(24), 24);
  assert.equal(leseWunschMenge('1.200'), 1200);
  assert.equal(leseWunschMenge(2.5), 2.5, 'mengePruefen lehnt das danach ab');
  assert.equal(leseWunschMenge(0), 0);
  assert.equal(leseWunschMenge(100001), 0);
  assert.equal(leseWunschMenge('x'), 0);
});

test('Rechnung: Netto der Geschäftskunden unverändert, 0 % bleibt 0 %, Endkunde wie bisher', () => {
  assert.deepEqual(rechnungsPosten({ einzelpreis: 9.52, einzelpreis_netto: 8, mwst: 19 }, false, cent), { satz: 19, nettoEinzel: 8 });
  assert.deepEqual(rechnungsPosten({ einzelpreis: 99, einzelpreis_netto: 8, mwst: 19 }, false, cent), { satz: 19, nettoEinzel: 8 }, 'Netto-Vorgabe gewinnt, keine Rückrechnung');
  assert.deepEqual(rechnungsPosten({ einzelpreis: 11.9, mwst: 19 }, false, cent), { satz: 19, nettoEinzel: 10 });
  assert.deepEqual(rechnungsPosten({ einzelpreis: 10.7, mwst: 7 }, false, cent), { satz: 7, nettoEinzel: 10 });
  assert.deepEqual(rechnungsPosten({ einzelpreis: 10, mwst: 0 }, false, cent), { satz: 0, nettoEinzel: 10 }, 'Befund: lief mit 19 %');
  assert.deepEqual(rechnungsPosten({ einzelpreis: 11.9 }, false, cent), { satz: 19, nettoEinzel: 10 }, 'alte CSV ohne Satz');
  assert.deepEqual(rechnungsPosten({ einzelpreis: 11.9, mwst: 19 }, true, cent), { satz: 0, nettoEinzel: 11.9 }, 'Kleinunternehmer');
});

test('Ende-zu-Ende: Bestell-Summe des Geschäftskunden = Rechnungs-Summe (keine Cent-Drift)', () => {
  const artikel = [
    { id: 'a', bezeichnung: 'A', verkaufspreis: 1.19, shop_mwst: 19 },
    { id: 'b', bezeichnung: 'B', verkaufspreis: 3.33, shop_mwst: 7 },
    { id: 'c', bezeichnung: 'C', verkaufspreis: 0.99, shop_mwst: 19 },
  ];
  const liste = { rabatt_prozent: 3, preise: [{ artikel_id: 'a', ab_menge: 7, netto_cent: 87 }] };
  for (const mengen of [[7, 3, 13], [1, 1, 1], [999, 77, 3], [12, 0, 501]]) {
    const w = new Map([['a', mengen[0]], ['b', mengen[1]], ['c', mengen[2]]].filter(([, m]) => m > 0));
    const e = baueB2bBestellung(artikel, w, liste, 'brutto');
    const posten = e.positionen.map((p) => {
      const r = rechnungsPosten(p, false, cent);
      return { netto: cent(p.menge * r.nettoEinzel), satz: r.satz };
    });
    const s = steuerGruppen(posten);
    assert.equal(s.netto, euro(e.netto_cent), `netto ${mengen}`);
    assert.equal(s.steuer, euro(e.steuer_cent), `steuer ${mengen}`);
    assert.equal(s.brutto, euro(e.brutto_cent), `brutto ${mengen}`);
  }
});

test('Server-Teile: Link nur als Prüfsumme, Konto nur beim Betrieb der Seite, Rahmen geprüft', () => {
  const srv = lies('lib/shopB2bServer.ts');
  assert.match(srv, /\.eq\('owner_user_id', betrieb\)\.eq\('token_hash', tokenHash\(token\)\)/);
  assert.match(srv, /!k\.aktiv\) return null/);
  const best = lies('app/api/oeffentlich/shop-bestellung/route.ts');
  assert.match(best, /startSperrGrund\('shop', freigabe\)/, 'Shop bleibt bis zur Freigabe zu');
  assert.match(best, /kundeAusToken\(db, ownerId/);
  assert.match(best, /zahlartPruefen\(b\.zahlart, kunde\.auf_rechnung\)/);
  assert.match(best, /rahmenPruefen\(kunde\.kreditrahmen_cent/);
  assert.match(best, /shop_kunde_id: kunde\.id, kontakt_id: kunde\.kontakt_id/);
  assert.doesNotMatch(best, /b\.preis|einzelpreis: *b\./, 'Preise nie vom Browser');
  const prod = lies('app/api/oeffentlich/shop-produkte/route.ts');
  assert.match(prod, /kundeAusToken\(db, betrieb, token/);
  assert.match(prod, /konto_ungueltig/);
  const rg = lies('app/api/rechnung-aus-shop/route.ts');
  assert.match(rg, /positionRechnen\(p \?\? \{\}, kleinunternehmer, cent\)/);
  assert.match(rg, /kontakt_id: b\.kontakt_id \?\? null/);
  assert.match(rg, /zahlungsziel_tage: zielTage/);
});

test('Schaufenster: Token nur aus dem #-Teil, danach aus der Adresszeile entfernt, als Kopfzeile gesendet', () => {
  const js = lies('public/shop.js');
  assert.match(js, /if \(!c\.querySelector\('\.ao-wk-bar'\)\) return;/, 'geschlossener Shop: Hinweis bleibt stehen');
  assert.match(js, /location\.hash/);
  assert.match(js, /history\.replaceState/);
  assert.match(js, /'x-shop-konto'/);
  assert.doesNotMatch(js, /location\.search[^)]*konto/, 'nie aus der Query (Server-Protokolle)');
  assert.match(js, /netto zzgl\. MwSt/);
  assert.match(js, /value="rechnung"/);
  assert.match(js, /\(konto\.auf_rechnung \? '<label><input type="radio" name="zahlart" value="rechnung"/, 'Auf Rechnung nur wenn freigegeben');
  const css = lies('lib/webBloecke.ts');
  assert.match(css, /\.ao-konto\{/);
  assert.match(css, /\.ao-prod-staffel\{/);
});
