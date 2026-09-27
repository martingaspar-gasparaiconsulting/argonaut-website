// Schritt 0 Umzug-Plan (27.09.2026): Fortschrittsbalken, Stoppuhr, Hochrechnung.
// Prueft die reine Logik (lib/importFortschritt.ts) UND dass die Import-Seite
// sie wirklich benutzt (Pakete, seitenweiser Abgleich, Browser-Lesen, Protokoll).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PHASEN, PAKET_GROESSE, LESE_SEITE, GRENZEN_UMZUG, formatDauer, uhrzeitBerlin, formatBytes, zahlDe,
  tempoProMs, restMs, restText, dateiProzent, pakete, gesamtFortschritt, verschluckt,
  hochrechnung, spannenText, dateiWeg, dekodiere, umzugSumme, abschlussText,
} from '../out/importFortschritt.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Dauer und Uhrzeit lesen sich wie gesprochen', () => {
  assert.equal(formatDauer(400), 'unter 1 s');
  assert.equal(formatDauer(12000), '12 s');
  assert.equal(formatDauer(80000), '1 Min 20 s');
  assert.equal(formatDauer(120000), '2 Min');
  assert.equal(formatDauer((60 + 47) * 60000), '1 Std 47 Min');
  assert.equal(formatDauer(27 * 3600000), '1 Tag 3 Std');
  assert.equal(formatDauer(null), '—');
  assert.equal(formatDauer(-5), '—');
  // 08:42 UTC = 10:42 in Berlin (Sommerzeit), 09:42 UTC im Winter = 10:42
  assert.equal(uhrzeitBerlin(Date.UTC(2026, 8, 27, 8, 42)), '10:42 Uhr');
  assert.equal(uhrzeitBerlin(Date.UTC(2026, 11, 3, 9, 42)), '10:42 Uhr');
  assert.equal(zahlDe(12480), '12.480');
  assert.equal(zahlDe(1500000), '1.500.000');
  assert.equal(formatBytes(3.4 * 1024 * 1024), '3,4 MB');
  assert.equal(formatBytes(512), '512 Bytes');
});

test('Tempo aus Messpunkten, Restzeit ehrlich (null statt Raten)', () => {
  assert.equal(tempoProMs([]), null);
  assert.equal(tempoProMs([{ t: 0, n: 0 }]), null);
  assert.equal(tempoProMs([{ t: 0, n: 0 }, { t: 200, n: 50 }]), null, 'unter 0,5 s wird nicht hochgerechnet');
  assert.equal(tempoProMs([{ t: 0, n: 0 }, { t: 1000, n: 500 }]), 0.5);
  // Gleitendes Fenster: nur die letzten 15 s zaehlen — erst langsam, dann schnell
  const punkte = [{ t: 0, n: 0 }, { t: 60000, n: 100 }, { t: 70000, n: 1100 }];
  assert.equal(tempoProMs(punkte), 0.1);
  assert.equal(restMs(500, 1000, 0.5), 1000);
  assert.equal(restMs(1000, 1000, null), 0);
  assert.equal(restMs(10, 1000, null), null);
  assert.equal(restText(null), 'Tempo wird gemessen …');
  assert.equal(restText(80000), 'noch ca. 1 Min 20 s');
});

test('Balken je Datei: vier Phasen, gewichtet, nie 100 % vor dem Ende', () => {
  assert.deepEqual(PHASEN.map((p) => p.key), ['laden', 'lesen', 'pruefen', 'einspielen']);
  assert.equal(PHASEN.reduce((s, p) => s + p.gewicht, 0), 100);
  assert.equal(dateiProzent({ phase: 'laden', anteil: 0 }), 0);
  assert.equal(dateiProzent({ phase: 'laden', anteil: 1 }), 10);
  assert.equal(dateiProzent({ phase: 'pruefen', anteil: 0 }), 20);
  assert.equal(dateiProzent({ phase: 'einspielen', anteil: 0.5 }), 65);
  assert.equal(dateiProzent({ phase: 'einspielen', anteil: 1 }), 99);
  assert.equal(dateiProzent({ phase: 'fertig', anteil: 0 }), 100);
  assert.equal(dateiProzent({ phase: 'lesen', anteil: NaN }), 10);
});

test('Pakete zu 500 Zeilen — lueckenlos, keine Zeile doppelt', () => {
  assert.equal(PAKET_GROESSE, 500);
  assert.deepEqual(pakete(0), []);
  assert.deepEqual(pakete(1200), [{ von: 0, bis: 500 }, { von: 500, bis: 1000 }, { von: 1000, bis: 1200 }]);
  const p = pakete(12480);
  assert.equal(p.length, 25);
  assert.equal(p.reduce((s, x) => s + (x.bis - x.von), 0), 12480);
  for (let i = 1; i < p.length; i++) assert.equal(p[i].von, p[i - 1].bis);
  assert.deepEqual(pakete(25, 10).map((x) => x.bis), [10, 20, 25]);
});

test('Gesamtbalken: "7 von 13 Dateien", Uhrzeit erst ab 5 %', () => {
  const start = Date.UTC(2026, 8, 27, 7, 0);
  const g = gesamtFortschritt({ geplant: 13, fertigeDateien: 7, laufendProzent: 60, startMs: start, jetztMs: start + 60 * 60000 });
  assert.equal(g.fertig, 7);
  assert.equal(g.gesamt, 13);
  assert.equal(g.prozent, 58);
  // 58,5 % in 60 Min -> gesamt ca. 102,6 Min
  assert.equal(uhrzeitBerlin(g.fertigUm), '10:42 Uhr');
  const frueh = gesamtFortschritt({ geplant: 13, fertigeDateien: 0, laufendProzent: 30, startMs: start, jetztMs: start + 60000 });
  assert.equal(frueh.fertigUm, null, 'unter 5 % keine Hochrechnung');
  const ohnePlan = gesamtFortschritt({ geplant: 0, fertigeDateien: 2, laufendProzent: null, startMs: start, jetztMs: start + 1000 });
  assert.equal(ohnePlan.gesamt, 2);
  assert.equal(ohnePlan.prozent, 100);
  assert.equal(ohnePlan.fertigUm, null);
});

test('Zeilen-Bilanz: jede Zeile ist irgendwo verbucht, sonst "verschluckt"', () => {
  const b = { gelesen: 1000, angelegt: 900, aktualisiert: 20, uebersprungen: 30, abgelehnt: 25, doppelt: 15, gescheitert: 10 };
  assert.equal(verschluckt(b), 0);
  assert.equal(verschluckt({ ...b, angelegt: 899 }), 1);
  assert.equal(verschluckt({ ...b, angelegt: 400, offen: 500 }), 0, 'angehalten: offene Zeilen sind nicht verschluckt');
});

test('Hochrechnung: Richtwert ohne Messung, eigene Messung mit Spanne', () => {
  const r = hochrechnung(12480, 'Zeilen', []);
  assert.equal(r.quelle, 'richtwert');
  assert.equal(r.zeilenVon, 12480);
  assert.ok(r.dauerVonMs < r.dauerBisMs);
  assert.match(r.hinweise[0], /Richtwert/);
  // eine eigene Messung: 1.000 Zeilen in 4 s = 250 Z/s, +/- 40 %
  const e = hochrechnung(10000, 'Zeilen', [{ bytes: 120000, zeilen: 1000, dauerMs: 4000 }]);
  assert.equal(e.quelle, 'eigen');
  assert.equal(e.messungen, 1);
  assert.equal(Math.round(e.dauerVonMs / 1000), Math.round(10000 / 350));
  assert.equal(Math.round(e.dauerBisMs / 1000), Math.round(10000 / 150));
  // zu kleine Messungen verzerren und zaehlen nicht
  assert.equal(hochrechnung(100, 'Zeilen', [{ bytes: 100, zeilen: 5, dauerMs: 200 }]).quelle, 'richtwert');
  assert.equal(hochrechnung(0, 'MB', []), null);
  assert.equal(spannenText(60000, 60000), 'ca. 1 Min');
  assert.equal(spannenText(60000, 180000), 'ca. 1 Min bis 3 Min');
});

test('Hochrechnung: Grenzen werden ehrlich genannt (1 TB geht nicht im Browser)', () => {
  const klein = hochrechnung(5, 'MB', []);
  assert.equal(klein.weg, 'browser');
  const gross = hochrechnung(10, 'GB', []);
  assert.equal(gross.weg, 'teile');
  assert.ok(gross.hinweise.some((h) => /noch nicht gebaut/.test(h)), 'nie so tun, als ginge es');
  const tb = hochrechnung(1, 'TB', []);
  assert.equal(tb.weg, 'projekt');
  assert.ok(tb.hinweise.some((h) => /im Browser geht das nicht/.test(h)));
  const lang = hochrechnung(20000000, 'Zeilen', []);
  assert.ok(lang.hinweise.some((h) => /Vormittag/.test(h)));
});

test('Datei-Weg: CSV im Browser, Excel am Server bis 4 MB', () => {
  assert.equal(dateiWeg('kunden.csv', 30 * 1024 * 1024).weg, 'browser');
  assert.equal(dateiWeg('KUNDEN.TXT', 1000).weg, 'browser');
  assert.equal(dateiWeg('kunden.csv', 300 * 1024 * 1024).weg, 'zu_gross');
  assert.equal(dateiWeg('artikel.xlsx', 2 * 1024 * 1024).weg, 'server');
  const x = dateiWeg('artikel.xlsx', 6 * 1024 * 1024);
  assert.equal(x.weg, 'zu_gross');
  assert.match(x.hinweis, /CSV/);
  assert.ok(GRENZEN_UMZUG.serverDateiBytes <= 4.5 * 1024 * 1024, 'unter der Vercel-Grenze je Anfrage');
});

test('Dekodieren: UTF-8, sonst Windows-1252 (Umlaute und Euro aus Excel)', () => {
  assert.equal(dekodiere(new TextEncoder().encode('Müller;5 €')), 'Müller;5 €');
  // "Müller;5 €" in Windows-1252: ü = 0xFC, € = 0x80
  const w = new Uint8Array([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72, 0x3b, 0x35, 0x20, 0x80]);
  assert.equal(dekodiere(w), 'Müller;5 €');
});

test('Umzug-Summe und Abschluss-Karte', () => {
  const start = 0;
  const jobs = [
    { zeilen_gelesen: 1000, zeilen_ok: 990, zeilen_uebersprungen: 0, zeilen_abgelehnt: 7, zeilen_doppelt: 3, zeilen_gescheitert: 0, zeilen_offen: 0, warnungen: 2, status: 'fertig' },
    { zeilen_gelesen: 500, zeilen_ok: 480, zeilen_uebersprungen: 20, zeilen_abgelehnt: 0, zeilen_doppelt: 0, zeilen_gescheitert: 0, zeilen_offen: 0, warnungen: 1, status: 'fertig' },
    { zeilen_gelesen: 50, zeilen_ok: 50, status: 'rueckgaengig' },
    // altes Protokoll ohne Bilanz: zaehlt mit, aber nicht als verschluckt
    { zeilen_gelesen: null, zeilen_gesamt: 10, zeilen_ok: 8, status: 'fertig' },
  ];
  const s = umzugSumme(jobs, start, (60 + 47) * 60000);
  assert.equal(s.dateien, 3);
  assert.equal(s.datensaetze, 1478);
  assert.equal(s.warnungen, 3);
  assert.equal(s.abgelehnt, 7);
  assert.equal(s.verschluckt, 0);
  assert.equal(abschlussText(s), 'Umzug fertig in 1 Std 47 Min · 3 Dateien · 1.478 Datensätze · 3 Warnungen · 0 verschluckt');
  const fehlt = umzugSumme([{ zeilen_gelesen: 100, zeilen_ok: 90, status: 'fertig' }], 0, 1000);
  assert.equal(fehlt.verschluckt, 10, 'fehlende Zeilen werden gezeigt, nicht versteckt');
});

test('Import-Seite benutzt Pakete, seitenweisen Abgleich und Browser-Lesen', () => {
  const s = lies('app/dashboard/import/page.tsx');
  assert.ok(s.includes('pakete(neu.length, PAKET_GROESSE)'), 'Einspielen in Paketen');
  assert.ok(!/const BATCH = 100/.test(s), 'alter 100er-Stapel ist weg');
  assert.ok(!s.includes('.limit(20000)'), 'kein Abgleich mehr mit stiller 1.000er-Kappung');
  assert.ok(/\.range\(von, von \+ LESE_SEITE - 1\)/.test(s), 'Abgleich seitenweise');
  assert.equal(LESE_SEITE, 1000);
  assert.ok(s.includes('ladeImBrowser(') && s.includes('leseCsv(dekodiere('), 'CSV im Browser lesen');
  assert.ok(s.includes('xhr.upload.onprogress'), 'Excel-Upload mit Fortschritt');
  assert.ok(s.includes("status: 'laeuft'"), 'Protokoll vor dem ersten Paket');
  assert.equal((s.match(/await fortschreiben\('laeuft'\)/g) ?? []).length, 2, 'Protokoll nach jedem Paket (Anlegen und Aendern)');
  assert.ok(s.includes("fortschreiben('abgebrochen', true)"), 'bei Abbruch steht im Protokoll, was drin ist');
  assert.ok(s.includes('anhaltenRef.current'), 'Anhalten zwischen den Paketen');
  assert.ok(s.includes("from('import_umzug')"), 'Umzug-Leiste');
  assert.ok(s.includes('erstellt_von: uid'), 'Protokoll sagt, wer es war');
});

test('SQL p123: additiv, idempotent, Mitarbeiter ohne Loeschrecht', () => {
  const q = lies('supabase-sql/p123-import-fortschritt.sql');
  const code = q.split('\n').filter((z) => !z.trim().startsWith('--')).join('\n').toLowerCase();
  assert.ok(!/\bdrop\s+table\b/.test(code));
  assert.ok(!/\bdrop\s+column\b/.test(code));
  assert.ok(!/\bdelete\s+from\b/.test(code));
  assert.ok(!/\btruncate\b/.test(code));
  assert.ok(code.includes('create table if not exists public.import_umzug'));
  assert.ok((code.match(/add column if not exists/g) ?? []).length >= 14);
  assert.ok(!/for delete[^;]*mein_chef_id/.test(code), 'Mitarbeiter loeschen nichts');
  assert.ok(code.includes('enable row level security'));
});
