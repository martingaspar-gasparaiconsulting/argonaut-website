// ============================================================================
// tests/kleinkramP65c.test.mjs
//
// PUNKT 65 / R12, PAKET 3 (21.09.2026)
//   Teil 1  GAEB-Export: Qty x UP muss IT ergeben  (lib/gaeb.ts, GEAENDERT)
//   Teil 2  Adresspruefung gegen interne Adressen  (lib/adressPruefung.ts, NEU)
//   Teil 3  Einwilligungsnachweis mit IP und Text  (lib/einwilligung.ts, NEU)
//
// Teil 1 aendert eine Datei, die BENUTZT wird (app/dashboard/aufmass/page.tsx
// Zeile 281 ruft baueGaeb). Deshalb steht hier auch ein Rundlauf-Test: was
// exportiert wird, muss wieder einlesbar sein und dieselben Zahlen ergeben.
//
// Teil 2 und Teil 3 rufen noch niemanden auf — dasselbe Muster wie P55 bis
// P58: erst die reine Logik mit Tests, das Anschliessen kommt getrennt.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  baueGaeb, baueGaebMitBericht, gaebZahl, rundeAuf, dez, pruefeZeile,
  heuteIso, leseLvZahl, QTY_STELLEN, PREIS_STELLEN,
} from '../out/gaeb.js';

import {
  pruefeAusgehendeUrl, pruefeAufgeloesteIp, pruefeKonnektorAdresse,
  ipBereich, ipArt, istIpv4, istIpv6, ipv6Gruppen, normalisiereHost,
  lokalesNetzErlaubt, LOKALES_NETZ_FELDER, METADATEN_IPS,
} from '../out/adressPruefung.js';

import {
  baueEintrag, pruefeNachweis, pruefeVeraltet, nachweisKlartext,
  aufbewahrungBis, loeschreif, textFingerabdruck, ipFuerNachweis, ipGekuerzt,
  AUFBEWAHRUNG_JAHRE, VERALTET_MONATE, TEXT_MAX_ZEICHEN, GRUNDLAGEN,
} from '../out/einwilligung.js';

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

/** Die Zahlen aus einer fertigen GAEB-Datei zurueckholen. */
function felder(xml) {
  const qty = [...xml.matchAll(/<Qty>(-?[\d.]+)<\/Qty>/g)].map((m) => m[1]);
  const up = [...xml.matchAll(/<UP>(-?[\d.]+)<\/UP>/g)].map((m) => m[1]);
  const it = [...xml.matchAll(/<IT>(-?[\d.]+)<\/IT>/g)].map((m) => m[1]);
  const total = (xml.match(/<Total>(-?[\d.]+)<\/Total>/) || [])[1];
  return { qty, up, it, total };
}

const LV = {
  projekt: 'Testbau',
  waehrung: 'EUR',
  positionen: [
    { oz: '01.0010', kurztext: 'Wand streichen', menge: 12.345, einheit: 'm2', einzelpreis: 14.367 },
    { oz: '01.0020', kurztext: 'Decke streichen', menge: 1.5, einheit: 'm2', einzelpreis: 66.666 },
    { oz: '01.0030', kurztext: 'Sockelleiste', menge: 8.4, einheit: 'm', einzelpreis: 2.675 },
  ],
};

// ===========================================================================
// TEIL 1 — GAEB
// ===========================================================================

test('GAEB: Qty mal UP ergibt genau IT — in JEDER Zeile', () => {
  const { qty, up, it } = felder(baueGaeb(LV, { datumIso: '2026-09-21' }));
  assert.equal(qty.length, 3);
  for (let i = 0; i < qty.length; i++) {
    const nachgerechnet = Math.round(Number(qty[i]) * Number(up[i]) * 100) / 100;
    assert.equal(
      nachgerechnet.toFixed(2), Number(it[i]).toFixed(2),
      `Zeile ${i + 1}: ${qty[i]} x ${up[i]} = ${nachgerechnet}, in der Datei steht ${it[i]}`,
    );
  }
});

test('GAEB: das ist der GEMESSENE Fall aus dem Befund — 12,345 zu 14,367', () => {
  const { qty, up, it } = felder(baueGaeb({
    projekt: 'x', waehrung: 'EUR',
    positionen: [{ oz: '01.0010', kurztext: 'Wand', menge: 12.345, einheit: 'm2', einzelpreis: 14.367 }],
  }));
  assert.equal(qty[0], '12.345');
  assert.equal(up[0], '14.37');
  // 12.345 x 14.37 = 177.398...  -> 177.40. Frueher stand hier 177.36.
  assert.equal(it[0], '177.40');
  assert.notEqual(it[0], '177.36');
});

test('GAEB: Total ist die Summe der geschriebenen IT — nicht der ungerundeten', () => {
  const { it, total } = felder(baueGaeb(LV));
  const summe = it.reduce((s, x) => s + Number(x), 0);
  assert.equal(Number(total).toFixed(2), summe.toFixed(2));
});

test('GAEB: die Menge bekommt drei Nachkommastellen, nicht zwei', () => {
  assert.equal(QTY_STELLEN, 3);
  const { qty } = felder(baueGaeb(LV));
  assert.equal(qty[0], '12.345');           // frueher 12.35
  assert.equal(qty[1], '1.500');            // immer volle Stellenzahl
  for (const q of qty) assert.match(q, /^\d+\.\d{3}$/);
});

test('GAEB: Einheitspreis und Gesamtbetrag bleiben bei zwei Stellen', () => {
  assert.equal(PREIS_STELLEN, 2);
  const { up, it, total } = felder(baueGaeb(LV));
  for (const w of [...up, ...it, total]) assert.match(w, /^-?\d+\.\d{2}$/);
});

test('GAEB: vierte Stelle in der Menge wird sauber gerundet', () => {
  const { qty } = felder(baueGaeb({
    projekt: 'x', waehrung: 'EUR',
    positionen: [{ oz: 'a', kurztext: 'k', menge: 1.23456, einheit: 'm', einzelpreis: 1 }],
  }));
  assert.equal(qty[0], '1.235');
});

test('GAEB: rundeAuf trifft den Grenzfall, den toFixed verfehlt', () => {
  // GEMESSEN: (2.675).toFixed(2) === '2.67'
  assert.equal((2.675).toFixed(2), '2.67');
  assert.equal(rundeAuf(2.675, 2), 2.68);

  assert.equal((1.005).toFixed(2), '1.00');
  assert.equal(rundeAuf(1.005, 2), 1.01);
});

test('GAEB: rundeAuf kippt negative Werte nicht nach oben', () => {
  assert.equal(rundeAuf(-2.675, 2), -2.68);
  assert.equal(rundeAuf(-0.005, 2), -0.01);
  assert.equal(rundeAuf(2.675, 2) + rundeAuf(-2.675, 2), 0);
});

test('GAEB: dez schreibt kein "-0.00"', () => {
  assert.equal(dez(-0.001, 2), '0.00');
  assert.equal(dez(-0.0001, 3), '0.000');
  assert.equal(rundeAuf(-0.001, 2), 0);
  assert.ok(!Object.is(rundeAuf(-0.001, 2), -0));
});

test('GAEB: dez faengt null, undefined und NaN mit 0 ab', () => {
  assert.equal(dez(null, 2), '0.00');
  assert.equal(dez(undefined, 2), '0.00');
  assert.equal(dez(NaN, 2), '0.00');
  assert.equal(dez(Infinity, 2), '0.00');
});

test('GAEB: eine Position ohne Einheitspreis ergibt 0,00 und nicht NaN', () => {
  const { up, it, total } = felder(baueGaeb({
    projekt: 'x', waehrung: 'EUR',
    positionen: [{ oz: 'a', kurztext: 'k', menge: 5, einheit: 'm', einzelpreis: null }],
  }));
  assert.equal(up[0], '0.00');
  assert.equal(it[0], '0.00');
  assert.equal(total, '0.00');
});

test('GAEB: der Bericht nennt die Abweichung zur Kalkulation', () => {
  const { bericht } = baueGaebMitBericht(LV, { datumIso: '2026-09-21' });
  assert.equal(bericht.summe, 299.92);
  assert.equal(bericht.summeUngerundet, 299.83);
  assert.equal(bericht.abweichung, 0.09);
  assert.ok(bericht.hinweise.some((h) => h.includes('299,92') && h.includes('299,83')));
});

test('GAEB: ohne Rundung gibt es auch keinen Hinweis', () => {
  const { bericht } = baueGaebMitBericht({
    projekt: 'x', waehrung: 'EUR',
    positionen: [{ oz: 'a', kurztext: 'k', menge: 2, einheit: 'm', einzelpreis: 10 }],
  });
  assert.equal(bericht.abweichung, 0);
  assert.deepEqual(bericht.hinweise, []);
  assert.equal(bericht.zeilen[0].mengeGerundet, false);
  assert.equal(bericht.zeilen[0].preisGerundet, false);
});

test('GAEB: der Bericht zeigt je Zeile genau das, was in der Datei steht', () => {
  const { xml, bericht } = baueGaebMitBericht(LV);
  const { qty, up, it } = felder(xml);
  for (let i = 0; i < bericht.zeilen.length; i++) {
    assert.equal(bericht.zeilen[i].menge.toFixed(3), Number(qty[i]).toFixed(3));
    assert.equal(bericht.zeilen[i].einzelpreis.toFixed(2), Number(up[i]).toFixed(2));
    assert.equal(bericht.zeilen[i].gesamt.toFixed(2), Number(it[i]).toFixed(2));
  }
});

test('GAEB: baueGaeb liefert genau das XML aus baueGaebMitBericht', () => {
  const opt = { datumIso: '2026-09-21' };
  assert.equal(baueGaeb(LV, opt), baueGaebMitBericht(LV, opt).xml);
});

test('GAEB: baueGaeb laesst sich weiterhin mit EINEM Argument aufrufen', () => {
  // app/dashboard/aufmass/page.tsx Zeile 281 ruft so auf. Muss so bleiben.
  const xml = baueGaeb(LV);
  assert.match(xml, /<GAEB /);
  assert.match(xml, /<Date>\d{4}-\d{2}-\d{2}<\/Date>/);
});

test('GAEB: das Dateidatum nimmt UTC, nicht die Zeitzone des Servers', () => {
  // 21.09. 23:30 deutscher Zeit ist in UTC noch der 21.09. — der alte Code
  // mit getDate() haette auf einem UTC-Server den Vortag geschrieben.
  assert.equal(heuteIso(new Date('2026-09-21T23:30:00+02:00')), '2026-09-21');
  assert.equal(heuteIso(new Date('2026-09-22T01:30:00+02:00')), '2026-09-21');
  assert.equal(heuteIso(new Date('2026-01-01T00:30:00+01:00')), '2025-12-31');
});

test('GAEB: das Datum laesst sich hereinreichen', () => {
  assert.match(baueGaeb(LV, { datumIso: '2026-01-02' }), /<Date>2026-01-02<\/Date>/);
});

test('GAEB: gaebZahl liest den Dezimalpunkt der Norm', () => {
  assert.equal(gaebZahl('12.345'), 12.345);
  assert.equal(gaebZahl('0.75'), 0.75);
  assert.equal(gaebZahl('-3.5'), -3.5);
});

test('GAEB: gaebZahl liest auch deutsche Schreibweisen', () => {
  assert.equal(gaebZahl('12,345'), 12.345);
  assert.equal(gaebZahl('1.234,56'), 1234.56);
  assert.equal(gaebZahl('1,234.56'), 1234.56);
  assert.equal(gaebZahl('1.234.567'), 1234567);
});

test('GAEB: gaebZahl — der alte Leser machte aus 1.234,56 ein null', () => {
  // .replace(',', '.') ersetzte nur das ERSTE Komma: "1.234.56" -> NaN -> null.
  const alt = (s) => { const t = s.replace(/\s/g, '').replace(',', '.'); const n = Number(t); return Number.isFinite(n) ? n : null; };
  assert.equal(alt('1.234,56'), null);
  assert.equal(gaebZahl('1.234,56'), 1234.56);
});

test('GAEB: gaebZahl gibt bei Unsinn null — NIE still eine 0', () => {
  for (const s of ['', '   ', 'abc', '1,234,567', '.', ',', '-', '1.2.3,4,5']) {
    assert.equal(gaebZahl(s), null, `${JSON.stringify(s)} haette null ergeben muessen`);
  }
});

test('GAEB: pruefeZeile findet den Fehler in einer fremden Datei', () => {
  const schlecht = pruefeZeile(12.35, 14.37, 177.36);
  assert.equal(schlecht.stimmt, false);
  assert.equal(schlecht.soll, 177.47);
  assert.equal(schlecht.differenz, -0.11);

  const gut = pruefeZeile(12.35, 14.37, 177.47);
  assert.equal(gut.stimmt, true);
  assert.equal(gut.differenz, 0);
});

test('GAEB: pruefeZeile rechnet wie das Pruefprogramm — aus den GERUNDETEN Werten', () => {
  // Der Unterschied wird nur sichtbar, wenn die Eingaben mehr Stellen haben
  // als die Datei traegt. Mit schon gerundeten Werten (12.35 / 14.37) waere
  // beides gleich — deshalb hier die ungerundeten aus dem Befund.
  //   gerundet:   12.345 x 14.37  = 177.398...  -> 177.40
  //   ungerundet: 12.345 x 14.367 = 177.3607... -> 177.36
  assert.equal(pruefeZeile(12.345, 14.367, 177.40).soll, 177.40);
  assert.equal(pruefeZeile(12.345, 14.367, 177.40).stimmt, true);
  assert.equal(pruefeZeile(12.345, 14.367, 177.36).stimmt, false);
  assert.equal(pruefeZeile(12.345, 14.367, 177.36).differenz, -0.04);
});

test('GAEB: jede selbst geschriebene Zeile besteht die eigene Pruefung', () => {
  const { bericht } = baueGaebMitBericht(LV);
  for (const z of bericht.zeilen) {
    assert.equal(pruefeZeile(z.menge, z.einzelpreis, z.gesamt).stimmt, true);
  }
});

test('GAEB: Rundlauf — die eigene Datei ergibt wieder dieselben Zahlen', () => {
  const erst = baueGaeb(LV, { datumIso: '2026-09-21' });
  const f = felder(erst);
  // So wuerde parseGaeb die Datei lesen (ohne DOMParser nachgestellt).
  const gelesen = {
    projekt: 'Testbau', waehrung: 'EUR',
    positionen: f.qty.map((q, i) => ({
      oz: LV.positionen[i].oz, kurztext: 'x', menge: gaebZahl(q),
      einheit: 'm', einzelpreis: gaebZahl(f.up[i]),
    })),
  };
  const zweit = baueGaeb(gelesen, { datumIso: '2026-09-21' });
  const g = felder(zweit);
  assert.deepEqual(g.qty, f.qty);
  assert.deepEqual(g.up, f.up);
  assert.deepEqual(g.it, f.it);
  assert.equal(g.total, f.total);
});

test('GAEB: Sonderzeichen im Text werden maskiert', () => {
  const xml = baueGaeb({
    projekt: 'Bau & Co <GmbH>', waehrung: 'EUR',
    positionen: [{ oz: 'a', kurztext: 'Fenster "groß" & <alt>', einheit: 'Stk', menge: 1, einzelpreis: 1 }],
  });
  assert.ok(!xml.includes('<GmbH>'));
  assert.ok(xml.includes('&amp;'));
  assert.ok(xml.includes('&lt;alt&gt;'));
  assert.ok(xml.includes('&quot;'));
});

test('GAEB: ohne Ordnungszahl wird eine vergeben', () => {
  const xml = baueGaeb({
    projekt: 'x', waehrung: 'EUR',
    positionen: [{ oz: '', kurztext: 'a', einheit: 'm', menge: 1, einzelpreis: 1 },
                 { oz: '  ', kurztext: 'b', einheit: 'm', menge: 1, einzelpreis: 1 }],
  });
  assert.ok(xml.includes('RNoPart="0010"'));
  assert.ok(xml.includes('RNoPart="0020"'));
});

test('GAEB: leeres LV ergibt trotzdem eine gueltige Datei mit Summe 0,00', () => {
  const { xml, bericht } = baueGaebMitBericht({ projekt: 'Leer', waehrung: '', positionen: [] });
  assert.match(xml, /<Total>0\.00<\/Total>/);
  assert.match(xml, /<Cur>EUR<\/Cur>/);
  assert.equal(bericht.summe, 0);
});

test('GAEB: leseLvZahl liest die Eingabe des Betriebs deutsch', () => {
  assert.equal(leseLvZahl('1.234,56'), 1234.56);
  assert.equal(leseLvZahl('12,5'), 12.5);
  assert.equal(leseLvZahl('kaputt'), null);   // nie still 0
});

// ===========================================================================
// TEIL 2 — ADRESSPRUEFUNG
// ===========================================================================

test('Adresse: eine normale https-Adresse ist erlaubt', () => {
  const r = pruefeAusgehendeUrl('https://shop.example.de/api/v1');
  assert.equal(r.erlaubt, true);
  assert.equal(r.grund, null);
  assert.equal(r.host, 'shop.example.de');
  assert.equal(r.bereich, 'oeffentlich');
  assert.equal(r.port, 443);
});

test('Adresse: der Metadaten-Dienst ist IMMER gesperrt — auch mit Ausnahme', () => {
  for (const ip of METADATEN_IPS) {
    const klammer = ip.includes(':') ? `[${ip}]` : ip;
    for (const opt of [{}, { erlaubeLokalesNetz: true, erlaubeHttp: true }]) {
      const r = pruefeAusgehendeUrl(`http://${klammer}/latest/meta-data/`, opt);
      assert.equal(r.erlaubt, false, `${ip} war erlaubt`);
      assert.equal(r.grund, 'metadaten');
    }
  }
});

test('Adresse: metadata.google.internal ist gesperrt, auch als Unterdomain', () => {
  for (const h of ['http://metadata.google.internal/', 'http://x.metadata.google.internal/', 'http://metadata/']) {
    const r = pruefeAusgehendeUrl(h, { erlaubeLokalesNetz: true, erlaubeHttp: true });
    assert.equal(r.erlaubt, false, h);
    assert.equal(r.grund, 'metadaten');
  }
});

test('Adresse: localhost und Loopback sind ohne Ausnahme gesperrt', () => {
  for (const u of ['http://127.0.0.1:54321/', 'http://localhost/', 'http://[::1]/', 'https://127.0.0.1/']) {
    const r = pruefeAusgehendeUrl(u);
    assert.equal(r.erlaubt, false, u);
    assert.equal(r.grund, 'internes_netz');
  }
});

test('Adresse: die Zahlenschreibweisen fuer 127.0.0.1 werden erkannt', () => {
  // GEMESSEN: new URL() rechnet diese Formen selbst in die Punktschreibweise um.
  for (const u of ['http://2130706433/', 'http://0177.0.0.1/', 'http://0x7f.0.0.1/', 'http://127.1/']) {
    const r = pruefeAusgehendeUrl(u);
    assert.equal(r.erlaubt, false, u);
    assert.equal(r.host, '127.0.0.1');
    assert.equal(r.bereich, 'loopback');
  }
});

test('Adresse: 0.0.0.0 ist gesperrt — das ist der alte Weg zu localhost', () => {
  const r = pruefeAusgehendeUrl('http://0.0.0.0:8080/');
  assert.equal(r.erlaubt, false);
  assert.equal(r.bereich, 'reserviert');
});

test('Adresse: IPv4 in IPv6 verpackt wird durchschaut', () => {
  const r = pruefeAusgehendeUrl('http://[::ffff:127.0.0.1]/');
  assert.equal(r.erlaubt, false);
  assert.equal(r.bereich, 'loopback');
  assert.equal(ipBereich('::ffff:10.0.0.1'), 'privat');
  assert.equal(ipBereich('::ffff:8.8.8.8'), 'oeffentlich');
});

test('Adresse: Zugangsdaten in der Adresse werden abgelehnt', () => {
  for (const u of ['https://user:geheim@shop.example.de/', 'https://user@shop.example.de/']) {
    const r = pruefeAusgehendeUrl(u);
    assert.equal(r.erlaubt, false, u);
    assert.equal(r.grund, 'zugangsdaten');
  }
});

test('Adresse: nur http und https, sonst nichts', () => {
  for (const u of ['file:///etc/passwd', 'gopher://example.de/', 'ftp://example.de/', 'data:text/plain,hallo']) {
    const r = pruefeAusgehendeUrl(u);
    assert.equal(r.erlaubt, false, u);
    assert.equal(r.grund, 'schema');
  }
});

test('Adresse: http ohne Verschluesselung ist im Internet gesperrt', () => {
  const r = pruefeAusgehendeUrl('http://shop.example.de/');
  assert.equal(r.erlaubt, false);
  assert.equal(r.grund, 'kein_tls');
  assert.equal(pruefeAusgehendeUrl('http://shop.example.de/', { erlaubeHttp: true }).erlaubt, true);
});

test('Adresse: leer und unlesbar sagen, WAS fehlt', () => {
  assert.equal(pruefeAusgehendeUrl('').grund, 'leer');
  assert.equal(pruefeAusgehendeUrl('   ').grund, 'leer');
  assert.equal(pruefeAusgehendeUrl(null).grund, 'leer');
  assert.equal(pruefeAusgehendeUrl('nicht mal eine adresse').grund, 'unlesbar');
  assert.equal(pruefeAusgehendeUrl('shop.example.de').grund, 'unlesbar');  // Schema fehlt
});

test('Adresse: jede Ablehnung traegt einen Klartext-Hinweis', () => {
  for (const u of ['', 'quatsch', 'file:///x', 'http://127.0.0.1/', 'https://user:p@x.de/', 'http://shop.example.de/']) {
    const r = pruefeAusgehendeUrl(u);
    assert.equal(r.erlaubt, false, u);
    assert.ok(typeof r.hinweis === 'string' && r.hinweis.length > 20, `kein Hinweis bei ${u}`);
  }
});

test('Adresse: DIE AUSNAHME — die Epson-TSE im eigenen Netz kommt durch', () => {
  const ohne = pruefeAusgehendeUrl('http://192.168.1.50/tse');
  assert.equal(ohne.erlaubt, false);
  assert.equal(ohne.grund, 'internes_netz');

  const mit = pruefeAusgehendeUrl('http://192.168.1.50/tse', { erlaubeLokalesNetz: true, erlaubeHttp: true });
  assert.equal(mit.erlaubt, true);
  assert.equal(mit.bereich, 'privat');
});

test('Adresse: die Ausnahme haengt am FELDNAMEN, nicht am Zufall', () => {
  assert.deepEqual([...LOKALES_NETZ_FELDER], ['device_url']);
  assert.equal(lokalesNetzErlaubt('device_url'), true);
  assert.equal(lokalesNetzErlaubt('shop_url'), false);
  assert.equal(lokalesNetzErlaubt('base_url'), false);

  assert.equal(pruefeKonnektorAdresse('device_url', 'http://192.168.1.50/tse').erlaubt, true);
  assert.equal(pruefeKonnektorAdresse('shop_url', 'http://192.168.1.50/tse').erlaubt, false);
  assert.equal(pruefeKonnektorAdresse('base_url', 'http://10.0.0.5/').erlaubt, false);
});

test('Adresse: auch device_url kommt nicht an den Metadaten-Dienst', () => {
  const r = pruefeKonnektorAdresse('device_url', 'http://169.254.169.254/latest/meta-data/');
  assert.equal(r.erlaubt, false);
  assert.equal(r.grund, 'metadaten');
});

test('Adresse: device_url darf https im Internet weiterhin', () => {
  assert.equal(pruefeKonnektorAdresse('device_url', 'https://tse.example.de/').erlaubt, true);
});

test('Adresse: lokale Namen brauchen dieselbe Ausnahme', () => {
  for (const u of ['http://kasse.local/tse', 'http://nas/', 'http://tse.lan/', 'http://x.internal/']) {
    assert.equal(pruefeAusgehendeUrl(u).erlaubt, false, u);
    assert.equal(pruefeAusgehendeUrl(u, { erlaubeLokalesNetz: true, erlaubeHttp: true }).erlaubt, true, u);
  }
});

test('Adresse: Providernetz, Multicast und reservierte Bereiche bleiben immer zu', () => {
  for (const u of ['https://100.64.0.1/', 'https://224.0.0.1/', 'https://255.255.255.255/', 'https://[ff02::1]/', 'https://[2001:db8::1]/']) {
    for (const opt of [{}, { erlaubeLokalesNetz: true, erlaubeHttp: true }]) {
      const r = pruefeAusgehendeUrl(u, opt);
      assert.equal(r.erlaubt, false, u);
      assert.equal(r.grund, 'unerreichbar');
    }
  }
});

test('Adresse: der Port laesst sich einschraenken', () => {
  const opt = { erlaubtePorts: [443] };
  assert.equal(pruefeAusgehendeUrl('https://shop.example.de/', opt).erlaubt, true);
  const r = pruefeAusgehendeUrl('https://shop.example.de:8443/', opt);
  assert.equal(r.erlaubt, false);
  assert.equal(r.grund, 'port');
  // Ohne Angabe wird nicht geprueft.
  assert.equal(pruefeAusgehendeUrl('https://shop.example.de:8443/').erlaubt, true);
});

test('Adresse: die Adressbereiche stimmen an den Raendern', () => {
  const erwartet = {
    '9.255.255.255': 'oeffentlich', '10.0.0.0': 'privat', '10.255.255.255': 'privat', '11.0.0.0': 'oeffentlich',
    '172.15.255.255': 'oeffentlich', '172.16.0.0': 'privat', '172.31.255.255': 'privat', '172.32.0.0': 'oeffentlich',
    '192.167.255.255': 'oeffentlich', '192.168.0.0': 'privat', '192.169.0.0': 'oeffentlich',
    '126.255.255.255': 'oeffentlich', '127.0.0.0': 'loopback', '128.0.0.0': 'oeffentlich',
    '169.253.255.255': 'oeffentlich', '169.254.0.0': 'linklokal', '169.254.169.254': 'metadaten',
    '100.63.255.255': 'oeffentlich', '100.64.0.0': 'cgnat', '100.128.0.0': 'oeffentlich',
    '223.255.255.255': 'oeffentlich', '224.0.0.0': 'multicast', '239.255.255.255': 'multicast', '240.0.0.0': 'reserviert',
  };
  for (const [ip, soll] of Object.entries(erwartet)) {
    assert.equal(ipBereich(ip), soll, `${ip} sollte ${soll} sein`);
  }
});

test('Adresse: die IPv6-Bereiche stimmen', () => {
  const erwartet = {
    '::1': 'loopback', '::': 'reserviert',
    'fc00::1': 'privat', 'fd00::1': 'privat', 'fdff:ffff::1': 'privat',
    'fe80::1': 'linklokal', 'febf::1': 'linklokal', 'fec0::1': 'oeffentlich',
    'ff02::1': 'multicast', '2001:db8::1': 'reserviert',
    '2a00:1450:4001:80f::200e': 'oeffentlich', 'fd00:ec2::254': 'metadaten',
  };
  for (const [ip, soll] of Object.entries(erwartet)) {
    assert.equal(ipBereich(ip), soll, `${ip} sollte ${soll} sein`);
  }
});

test('Adresse: IPv4 mit fuehrender Null gilt nicht als gueltige Adresse', () => {
  // "0177.0.0.1" ist oktal geschrieben. Wer so schreibt, will etwas verbergen.
  assert.equal(istIpv4('0177.0.0.1'), false);
  assert.equal(istIpv4('01.2.3.4'), false);
  assert.equal(istIpv4('1.2.3.4'), true);
  assert.equal(istIpv4('0.0.0.0'), true);      // eine einzelne 0 ist in Ordnung
  assert.equal(istIpv4('256.1.1.1'), false);
  assert.equal(istIpv4('1.2.3'), false);
  assert.equal(istIpv4('1.2.3.4.5'), false);
});

test('Adresse: ipv6Gruppen loest :: und eingebettete IPv4 auf', () => {
  assert.deepEqual(ipv6Gruppen('::1'), [0, 0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(ipv6Gruppen('2001:db8::1'), [0x2001, 0x0db8, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(ipv6Gruppen('::ffff:127.0.0.1'), [0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
  assert.equal(ipv6Gruppen('1::2::3'), null);        // zweimal :: geht nicht
  assert.equal(ipv6Gruppen('12345::1'), null);       // Gruppe zu lang
  assert.equal(ipv6Gruppen('1:2:3:4:5:6:7'), null);  // zu wenige ohne ::
  assert.equal(istIpv6('fe80::1%eth0'), true);       // Zonen-Index wird abgeschnitten
});

test('Adresse: normalisiereHost raeumt Klammern, Punkt am Ende und Grossschrift weg', () => {
  assert.equal(normalisiereHost('[::1]'), '::1');
  assert.equal(normalisiereHost('LOCALHOST.'), 'localhost');
  assert.equal(normalisiereHost('  Shop.Example.DE  '), 'shop.example.de');
  assert.equal(ipArt('[::1]'), 'ipv6');
  assert.equal(ipArt('shop.example.de'), 'unbekannt');
});

test('Adresse: nach der DNS-Aufloesung greifen dieselben Regeln', () => {
  // Ein harmlos aussehender Name, der auf 127.0.0.1 zeigt ("DNS-Rebinding").
  const r = pruefeAufgeloesteIp('127.0.0.1');
  assert.equal(r.erlaubt, false);
  assert.equal(r.grund, 'internes_netz');

  assert.equal(pruefeAufgeloesteIp('169.254.169.254', { erlaubeLokalesNetz: true }).grund, 'metadaten');
  assert.equal(pruefeAufgeloesteIp('192.168.1.50', { erlaubeLokalesNetz: true }).erlaubt, true);
  assert.equal(pruefeAufgeloesteIp('93.184.216.34').erlaubt, true);
  assert.equal(pruefeAufgeloesteIp('kein.ip').grund, 'unlesbar');
});

// ===========================================================================
// TEIL 3 — EINWILLIGUNGSNACHWEIS
// ===========================================================================

const TEXT = 'Ja, ich möchte den Newsletter der Muster Bau GmbH erhalten. Die Einwilligung kann ich jederzeit widerrufen.';

function anmeldung(ueber = {}) {
  return baueEintrag({
    schritt: 'anmeldung', zeitpunktIso: '2026-09-21T10:00:00Z',
    ip: '93.184.216.34', browser: 'Mozilla/5.0', sprache: 'de-DE',
    text: TEXT, textFassung: 'optin-2026-09', quelle: 'website',
    formularUrl: 'https://musterbau.de/newsletter', haekchenGesetzt: true, ...ueber,
  });
}
function bestaetigung(ueber = {}) {
  return baueEintrag({
    schritt: 'bestaetigung', zeitpunktIso: '2026-09-21T10:04:00Z',
    ip: '93.184.216.34', browser: 'Mozilla/5.0',
    text: TEXT, textFassung: 'optin-2026-09', quelle: 'website', ...ueber,
  });
}

test('Einwilligung: ein vollstaendiger Vorgang ist nachweisbar', () => {
  const p = pruefeNachweis(anmeldung(), bestaetigung());
  assert.equal(p.nachweisbar, true);
  assert.deepEqual(p.maengel, []);
  assert.equal(p.textGleich, true);
  assert.equal(p.minutenBisBestaetigung, 4);
  assert.equal(p.hinweis, null);
});

test('Einwilligung: DER HEUTIGE STAND — nur bestaetigt_am reicht nicht', () => {
  const nurZeit = baueEintrag({ schritt: 'bestaetigung', zeitpunktIso: '2026-09-21T10:04:00Z' });
  const p = pruefeNachweis(null, nurZeit);
  assert.equal(p.nachweisbar, false);
  assert.ok(p.maengel.some((m) => m.includes('Anmeldung ist nicht protokolliert')));
  assert.ok(p.maengel.some((m) => m.includes('fehlt die IP-Adresse')));
  assert.ok(p.maengel.some((m) => m.includes('Wortlaut')));
});

test('Einwilligung: ohne Bestaetigung ist das Double-Opt-In nicht abgeschlossen', () => {
  const p = pruefeNachweis(anmeldung(), null);
  assert.equal(p.nachweisbar, false);
  assert.ok(p.maengel.some((m) => m.includes('Bestätigung ist nicht protokolliert')));
});

test('Einwilligung: ein geaenderter Einwilligungstext faellt auf', () => {
  const p = pruefeNachweis(anmeldung(), bestaetigung({ text: TEXT + ' Und Werbung von Partnern.' }));
  assert.equal(p.textGleich, false);
  assert.equal(p.nachweisbar, false);
  assert.ok(p.maengel.some((m) => m.includes('nicht derselbe')));
});

test('Einwilligung: der Fingerabdruck ist stabil und aendert sich bei einem Zeichen', () => {
  assert.equal(textFingerabdruck(TEXT), textFingerabdruck(TEXT));
  assert.notEqual(textFingerabdruck(TEXT), textFingerabdruck(TEXT + '.'));
  assert.equal(textFingerabdruck(TEXT).length, 64);
  assert.equal(textFingerabdruck(''), '');
  assert.equal(textFingerabdruck(null), '');
  assert.equal(textFingerabdruck('  ' + TEXT + '  '), textFingerabdruck(TEXT));
});

test('Einwilligung: eine Bestaetigung VOR der Anmeldung wird gemeldet', () => {
  const p = pruefeNachweis(anmeldung(), bestaetigung({ zeitpunktIso: '2026-09-21T09:00:00Z' }));
  assert.equal(p.nachweisbar, false);
  assert.equal(p.minutenBisBestaetigung, null);
  assert.ok(p.maengel.some((m) => m.includes('VOR der Anmeldung')));
});

test('Einwilligung: eine interne IP ist die des Vorschalt-Dienstes, nicht die des Besuchers', () => {
  const p = pruefeNachweis(anmeldung({ ip: '10.0.0.7' }), bestaetigung());
  assert.equal(p.nachweisbar, false);
  assert.ok(p.maengel.some((m) => m.includes('nicht im öffentlichen Internet')));
});

test('Einwilligung: die IP wird NICHT gekuerzt — gekuerzt belegt sie nichts', () => {
  const a = anmeldung();
  assert.equal(a.ip, '93.184.216.34');
  assert.equal(a.ipArt, 'ipv4');
  assert.equal(a.ipOeffentlich, true);
  // Kuerzen gibt es nur fuer die Reichweitenmessung, ausdruecklich getrennt.
  assert.equal(ipGekuerzt('93.184.216.34'), '93.184.216.0');
  assert.equal(ipGekuerzt('2a00:1450:4001:80f::200e'), '2a00:1450:4001::');
  assert.equal(ipGekuerzt('quatsch'), '');
});

test('Einwilligung: eine unlesbare IP wird leer, nicht erfunden', () => {
  const a = anmeldung({ ip: 'nicht-eine-ip' });
  assert.equal(a.ip, '');
  assert.equal(a.vollstaendig, false);
  assert.ok(a.fehlend.includes('die IP-Adresse'));
  assert.deepEqual(ipFuerNachweis('quatsch'), { ip: '', art: 'unbekannt', oeffentlich: false });
});

test('Einwilligung: IPv6 wird genauso getragen', () => {
  const a = anmeldung({ ip: '2a00:1450:4001:80f::200e' });
  assert.equal(a.ipArt, 'ipv6');
  assert.equal(a.ipOeffentlich, true);
  assert.equal(a.vollstaendig, true);
});

test('Einwilligung: ein unlesbarer Zeitpunkt wird nicht zu 1970', () => {
  const a = anmeldung({ zeitpunktIso: 'irgendwann' });
  assert.equal(a.zeitpunktIso, '');
  assert.equal(a.zeitpunktMs, 0);
  assert.ok(a.fehlend.includes('der Zeitpunkt'));
});

test('Einwilligung: das Haekchen wird festgehalten — auch wenn es fehlte', () => {
  assert.equal(anmeldung().haekchenGesetzt, true);
  assert.equal(anmeldung({ haekchenGesetzt: false }).haekchenGesetzt, false);
  // Nicht erhoben ist NICHT dasselbe wie "nicht gesetzt".
  assert.equal(anmeldung({ haekchenGesetzt: undefined }).haekchenGesetzt, null);
  assert.equal(anmeldung({ haekchenGesetzt: 'ja' }).haekchenGesetzt, null);
});

test('Einwilligung: ein masslos langer Text wird gekappt, nicht verweigert', () => {
  const lang = 'x'.repeat(TEXT_MAX_ZEICHEN + 500);
  const a = anmeldung({ text: lang });
  assert.equal(a.text.length, TEXT_MAX_ZEICHEN);
  assert.equal(a.vollstaendig, true);
});

test('Einwilligung: Aufbewahrung drei Jahre ab dem Schluss des Jahres', () => {
  assert.equal(AUFBEWAHRUNG_JAHRE, 3);
  assert.equal(aufbewahrungBis('2026-04-03T12:00:00Z'), '2029-12-31');
  assert.equal(aufbewahrungBis('2026-12-31T23:00:00Z'), '2029-12-31');
  assert.equal(aufbewahrungBis('2027-01-01T00:00:00Z'), '2030-12-31');
  assert.equal(aufbewahrungBis('kaputt'), '');
});

test('Einwilligung: loeschreif erst NACH dem Ende des Aufbewahrungsjahres', () => {
  assert.equal(loeschreif('2026-04-03T12:00:00Z', '2029-12-31T12:00:00Z'), false);
  assert.equal(loeschreif('2026-04-03T12:00:00Z', '2029-12-31T23:59:59Z'), false);
  assert.equal(loeschreif('2026-04-03T12:00:00Z', '2030-01-01T00:00:01Z'), true);
  assert.equal(loeschreif('kaputt', '2030-01-01T00:00:01Z'), false);
});

test('Einwilligung: eine lange ungenutzte Einwilligung wird gemeldet, nicht gesperrt', () => {
  assert.equal(VERALTET_MONATE, 18);
  const alt = pruefeVeraltet('2025-01-01T00:00:00Z', null, '2026-09-21T00:00:00Z');
  assert.equal(alt.veraltet, true);
  assert.equal(alt.monateOhneNutzung, 20);
  assert.ok(alt.hinweis.includes('keine feste Frist') || alt.hinweis.includes('feste Frist'));

  // Wurde sie genutzt, zaehlt die Nutzung.
  const genutzt = pruefeVeraltet('2025-01-01T00:00:00Z', '2026-09-01T00:00:00Z', '2026-09-21T00:00:00Z');
  assert.equal(genutzt.veraltet, false);
  assert.equal(genutzt.monateOhneNutzung, 0);
});

test('Einwilligung: die Monatsrechnung zaehlt erst am Stichtag voll', () => {
  assert.equal(pruefeVeraltet('2025-01-15T00:00:00Z', null, '2026-07-14T00:00:00Z').monateOhneNutzung, 17);
  assert.equal(pruefeVeraltet('2025-01-15T00:00:00Z', null, '2026-07-15T00:00:00Z').monateOhneNutzung, 18);
  assert.equal(pruefeVeraltet('2025-01-15T00:00:00Z', null, '2026-07-15T00:00:00Z').veraltet, true);
});

test('Einwilligung: der Klartext benennt auch, was FEHLT', () => {
  const gut = nachweisKlartext('kunde@example.de', anmeldung(), bestaetigung());
  assert.ok(gut.includes('kunde@example.de'));
  assert.ok(gut.includes('93.184.216.34'));
  assert.ok(gut.includes('21.09.2026'));
  assert.ok(gut.includes(TEXT));
  assert.ok(gut.includes('vollständig protokolliert'));

  const schlecht = nachweisKlartext('kunde@example.de', null, bestaetigung({ ip: null, text: null }));
  assert.ok(schlecht.includes('NICHT vollständig belegbar'));
  assert.ok(schlecht.includes('Nicht protokolliert.'));
  assert.ok(schlecht.includes('nicht festgehalten'));
});

test('Einwilligung: jede Rechtsgrundlage traegt eine Belegstufe', () => {
  assert.ok(GRUNDLAGEN.length >= 5);
  for (const g of GRUNDLAGEN) {
    assert.ok(['belegt', 'pruefen'].includes(g.stufe), g.norm);
    assert.ok(g.norm.length > 5 && g.kern.length > 20, g.norm);
  }
  assert.ok(GRUNDLAGEN.some((g) => g.norm.includes('Art. 7 Abs. 1 DSGVO') && g.stufe === 'belegt'));
  assert.ok(GRUNDLAGEN.some((g) => g.norm.includes('I ZR 164/09') && g.stufe === 'belegt'));
  // Was nicht einheitlich entschieden ist, steht auch so da — und zwar JEDER
  // dieser Punkte einzeln. "Irgendwo steht pruefen" reicht nicht: dann koennte
  // ein einzelner still auf 'belegt' hochgestuft werden.
  const aufbewahrung = GRUNDLAGEN.find((g) => g.norm.includes('Aufbewahrung des Nachweises'));
  assert.ok(aufbewahrung, 'die Aufbewahrungsdauer fehlt in den Grundlagen');
  assert.equal(aufbewahrung.stufe, 'pruefen');

  const veralten = GRUNDLAGEN.find((g) => g.norm.includes('Veralten einer nicht genutzten'));
  assert.ok(veralten, 'das Veralten fehlt in den Grundlagen');
  assert.equal(veralten.stufe, 'pruefen');
});
