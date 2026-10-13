// ============================================================================
// tests/entsorgungP355.test.mjs — Paket 355 (13.10.2026)
// A4c Fachpaket Entsorgung, Teil 1: Container-Dienst und Wiegeschein.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  entsorgungZusatz, ENTSORGUNG_MODULE, schluesselLesen, schluesselLesbar, istGefaehrlich, schluesselPruefen,
  containerPruefen, groesseLesen, groesseText, containerName, standzeitTage, braucht, auftragPruefen, erledigenPruefen, nachErledigung,
  tagesListe, kgLesen, kgText, tonnenText, nettoKg, kennzeichenNorm, wiegePruefen, uebersicht, wiegescheinHtml, tageslisteHtml,
} from '../out/entsorgung.js';
import { brancheModule, brancheZusatz } from '../out/branchenkatalog.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentar = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const C = (id, nummer, status, extra = {}) => ({ id, nummer, art: 'absetz', groesse_m3: 7, status, kontakt_id: null, kunde_name: status === 'lager' || status === 'defekt' ? null : 'Bau Meier', stellplatz: status === 'lager' || status === 'defekt' ? null : 'Hauptstr. 1', gestellt_seit: status === 'gestellt' || status === 'voll' ? '2026-10-01' : null, notiz: null, aktiv: true, ...extra });
const BESTAND = [C('c1', 'A-07', 'lager'), C('c2', 'A-10', 'gestellt'), C('c3', 'R-30', 'voll'), C('c4', 'X-1', 'defekt')];
const A = (id, art, termin, extra = {}) => ({ id, art, termin, zeitfenster: null, kontakt_id: 'k1', kunde_name: 'Kunde ' + id, stellplatz: 'Weg ' + id, telefon: null, container_id: null, container_alt_id: null, groesse_m3: null, abfall_schluessel_id: null, fahrer: null, status: 'geplant', erledigt_am: null, notiz: null, ...extra });

test('Branchen: Entsorgung, Container, Recycling, Gefahrgut ja — Autorecycling, Kompost, Abbruch, Asbest nein', () => {
  for (const b of ['Container-Dienst & Containervermietung', 'Gefahrguttransport (ADR)', 'Entsorgungslogistik & Abfalltransport', 'Abfallwirtschaft & Müllentsorgung',
    'Schrott- & Metallrecycling', 'Elektroschrott- & WEEE-Recycling', 'Sonderabfall- & Gefahrgutentsorgung', 'Recycling & Entsorgung']) {
    assert.equal(entsorgungZusatz(b), true, b);
  }
  for (const b of ['Fahrzeugverwertung & Autorecycling', 'Kompost- & Erdenwerke', 'Abbruch & Rückbau', 'Schadstoff- & Asbestsanierung', 'Altlasten- & Bodensanierung',
    'Tatort- & Extremreinigung', 'Chemische Industrie', 'Spedition', 'Sicherheitsdienste', null, '']) {
    assert.equal(entsorgungZusatz(b), false, String(b));
  }
  assert.deepEqual([...ENTSORGUNG_MODULE], ['entsorgung']);
  assert.ok(brancheModule('Energie & Umwelt', 'Schrott- & Metallrecycling').includes('entsorgung'));
  assert.ok(brancheZusatz('Logistik & Transport', 'Container-Dienst & Containervermietung').includes('entsorgung'));
  assert.ok(!brancheModule('Logistik & Transport', 'Spedition').includes('entsorgung'));
  assert.ok(brancheModule('Dienstleistungen', 'Sicherheitsdienste').includes('bewachung'), 'Bewachung unverändert');
});

test('Abfallschlüssel: Schreibweisen, Sternchen, eigene Liste, kein Katalog', () => {
  assert.equal(schluesselLesen('17 09 04'), '170904');
  assert.equal(schluesselLesen('17 06 05*'), '170605*');
  assert.equal(schluesselLesen('17.06.05 *'), '170605*');
  assert.equal(schluesselLesen('1709'), null);
  assert.equal(schluesselLesen('17 09 04 1'), null);
  assert.equal(schluesselLesen('*170904'), null);
  assert.equal(schluesselLesbar('170605*'), '17 06 05*');
  assert.equal(istGefaehrlich('170605*'), true);
  assert.equal(istGefaehrlich('170904'), false);
  assert.deepEqual(schluesselPruefen({ schluessel: '17 09 04', bezeichnung: 'Bau' }), { ok: true, schluessel: '170904' });
  const d = schluesselPruefen({ schluessel: '170904', bezeichnung: 'x' }, ['170904']);
  assert.equal(d.ok, false);
  assert.match(d.fehler.join(' '), /schon/);
  assert.equal(schluesselPruefen({ schluessel: '170904', bezeichnung: '' }).ok, false);
  const quelle = lies('lib/entsorgung.ts');
  assert.ok(!/200101|150101|'170504'/.test(quelle), 'kein mitgelieferter amtlicher Katalog');
});

test('Container: Prüfung, Größe mit Komma, Standzeit', () => {
  assert.equal(containerPruefen({ nummer: 'A-11', art: 'absetz', groesse_m3: '7,5' }).groesse, 7.5);
  assert.equal(containerPruefen({ nummer: 'a-07', art: 'absetz', groesse_m3: '' }, ['A-07']).ok, false, 'Nummer doppelt (Groß/klein egal)');
  assert.equal(containerPruefen({ nummer: 'B', art: 'kiste', groesse_m3: '' }).ok, false);
  assert.equal(groesseLesen('0'), undefined);
  assert.equal(groesseLesen('101'), undefined);
  assert.equal(groesseLesen('7,55'), undefined, 'eine Nachkommastelle wie die Datenbank');
  assert.equal(groesseLesen(''), null);
  assert.equal(groesseText(7.5), '7,5 m³');
  assert.equal(containerName(BESTAND[0]), 'A-07 · Absetzcontainer · 7 m³');
  assert.equal(standzeitTage('2026-10-01', '2026-10-13'), 12);
  assert.equal(standzeitTage('2026-10-13', '2026-10-13'), 0);
  assert.equal(standzeitTage('2026-10-14', '2026-10-13'), null);
  assert.equal(standzeitTage(null, '2026-10-13'), null);
});

test('Aufträge: was jede Art braucht — wie der Datenbank-Wächter', () => {
  assert.deepEqual(braucht('stellen'), { neu: true, alt: false });
  assert.deepEqual(braucht('tauschen'), { neu: true, alt: true });
  assert.deepEqual(braucht('abholen'), { neu: false, alt: true });
  assert.equal(auftragPruefen({ art: 'stellen', termin: '2026-10-14', kunde_name: 'X', stellplatz: 'Y' }).ok, true, 'Container darf beim Planen fehlen');
  assert.equal(auftragPruefen({ art: 'stellen', termin: '2026-10-14', kunde_name: 'X', stellplatz: 'Y', container_alt_id: 'c2' }).ok, false);
  assert.equal(auftragPruefen({ art: 'abholen', termin: '2026-10-14', kunde_name: 'X', stellplatz: 'Y', container_id: 'c1' }).ok, false);
  assert.equal(auftragPruefen({ art: 'tauschen', termin: '2026-10-14', kunde_name: 'X', stellplatz: 'Y', container_id: 'c1', container_alt_id: 'c1' }).ok, false);
  assert.equal(auftragPruefen({ art: 'stellen', termin: '', kunde_name: '', stellplatz: '' }).fehler.length, 3);

  assert.equal(erledigenPruefen(A('a', 'stellen', 't', { container_id: 'c1' }), BESTAND).ok, true);
  assert.match(erledigenPruefen(A('a', 'stellen', 't'), BESTAND).fehler, /Welcher Container wird gestellt/);
  assert.match(erledigenPruefen(A('a', 'stellen', 't', { container_id: 'c2' }), BESTAND).fehler, /nicht auf dem Hof/);
  assert.match(erledigenPruefen(A('a', 'stellen', 't', { container_id: 'c4' }), BESTAND).fehler, /Reparatur/);
  assert.equal(erledigenPruefen(A('a', 'abholen', 't', { container_alt_id: 'c3' }), BESTAND).ok, true, 'voll gemeldete werden abgeholt');
  assert.match(erledigenPruefen(A('a', 'abholen', 't', { container_alt_id: 'c1' }), BESTAND).fehler, /nicht beim Kunden/);
  assert.equal(erledigenPruefen(A('a', 'tauschen', 't', { container_id: 'c1', container_alt_id: 'c2' }), BESTAND).ok, true);
  assert.match(erledigenPruefen(A('a', 'tauschen', 't', { status: 'erledigt', container_id: 'c1', container_alt_id: 'c2' }), BESTAND).fehler, /schon erledigt/);
});

test('Erledigen: Tausch setzt beide Container um (Vorschau wie die Datenbank)', () => {
  const n = nachErledigung(A('a', 'tauschen', 't', { container_id: 'c1', container_alt_id: 'c2', kunde_name: 'Bau Meier', stellplatz: 'Hauptstr. 1', kontakt_id: 'k1' }), BESTAND, '2026-10-13');
  const c1 = n.find((c) => c.id === 'c1');
  const c2 = n.find((c) => c.id === 'c2');
  assert.equal(c1.status, 'gestellt');
  assert.equal(c1.kunde_name, 'Bau Meier');
  assert.equal(c1.gestellt_seit, '2026-10-13');
  assert.equal(c2.status, 'lager');
  assert.equal(c2.kunde_name, null);
  assert.equal(c2.gestellt_seit, null);
  assert.equal(n.find((c) => c.id === 'c3').status, 'voll', 'Unbeteiligte bleiben');
  const ab = nachErledigung(A('a', 'abholen', 't', { container_alt_id: 'c3' }), BESTAND, '2026-10-13');
  assert.equal(ab.find((c) => c.id === 'c3').status, 'lager');
  assert.equal(ab.find((c) => c.id === 'c1').status, 'lager');
});

test('Tagesliste: nur der Tag, ohne Storno, geplante zuerst, Abholen vor Stellen', () => {
  const l = tagesListe([
    A('s', 'stellen', '2026-10-14'), A('h', 'abholen', '2026-10-14'), A('e', 'tauschen', '2026-10-14', { status: 'erledigt' }),
    A('x', 'stellen', '2026-10-14', { status: 'storniert' }), A('z', 'stellen', '2026-10-15'), A('f', 'stellen', '2026-10-14', { zeitfenster: '07-09' }),
  ], '2026-10-14');
  assert.deepEqual(l.map((a) => a.id), ['f', 'h', 's', 'e']);
});

test('Wiegeschein: Gewichte lesen, Netto, Tonnen, Kennzeichen', () => {
  assert.equal(kgLesen('12.340'), 12340);
  assert.equal(kgLesen('12 340 kg'), 12340);
  assert.equal(kgLesen(''), null);
  assert.equal(kgLesen('12,5'), undefined, 'nur ganze Kilogramm');
  assert.equal(kgLesen('200001'), undefined);
  assert.equal(kgLesen('-5'), undefined);
  assert.equal(kgText(12340), '12.340 kg');
  assert.equal(kgText(999), '999 kg');
  assert.equal(kgText(1234567), '1.234.567 kg');
  assert.equal(kgText(null), '—');
  assert.equal(tonnenText(8220), '8,220 t');
  assert.equal(tonnenText(45), '0,045 t');
  assert.equal(tonnenText(1234567), '1.234,567 t');
  assert.equal(nettoKg(12340, 4120), 8220);
  assert.equal(nettoKg(12340, null), null);
  assert.equal(nettoKg(100, 200), null);
  assert.equal(nettoKg(500, 500), 0);
  assert.equal(kennzeichenNorm(' bb-ab 123 '), 'BB-AB 123');
  assert.ok(!kgText(12340).includes(' ') && !tonnenText(12340).includes(' '), 'kein schmales Leerzeichen (jsPDF)');
});

test('Wiegeschein: Prüfung vor dem Speichern wie die Datenbank', () => {
  const ok = wiegePruefen({ kennzeichen: 'BB-X 1', brutto: '12340', tara: '4120', abfall_schluessel_id: 's1', abschliessen: true });
  assert.deepEqual(ok, { ok: true, brutto: 12340, tara: 4120, netto: 8220 });
  assert.equal(wiegePruefen({ kennzeichen: 'BB-X 1', brutto: '12340', tara: '', abfall_schluessel_id: null, abschliessen: false }).ok, true, 'Erstwägung offen');
  assert.match(wiegePruefen({ kennzeichen: 'BB', brutto: '100', tara: '200', abfall_schluessel_id: 's', abschliessen: false }).fehler.join(' '), /Tara/);
  assert.match(wiegePruefen({ kennzeichen: 'BB', brutto: '100', tara: '', abfall_schluessel_id: 's', abschliessen: true }).fehler.join(' '), /Brutto und Tara/);
  assert.match(wiegePruefen({ kennzeichen: 'BB', brutto: '100', tara: '50', abfall_schluessel_id: null, abschliessen: true }).fehler.join(' '), /Abfallschlüssel/);
  assert.match(wiegePruefen({ kennzeichen: '  ', brutto: '', tara: '', abfall_schluessel_id: null, abschliessen: false }).fehler.join(' '), /Kennzeichen/);
});

test('Übersicht: Container je Stand, Aufträge, gewogen heute (ohne Storno, Berliner Tag)', () => {
  const scheine = [
    { status: 'abgeschlossen', abgeschlossen_am: '2026-10-13T06:00:00Z', netto_kg: 8220 },
    { status: 'abgeschlossen', abgeschlossen_am: '2026-10-12T22:30:00Z', netto_kg: 1000 }, // 00:30 Berlin = 13.10.
    { status: 'storniert', abgeschlossen_am: '2026-10-13T07:00:00Z', netto_kg: 5000 },
    { status: 'offen', abgeschlossen_am: null, netto_kg: null },
  ];
  const u = uebersicht([...BESTAND, C('c9', 'Z', 'lager', { aktiv: false })], [A('1', 'stellen', '2026-10-13'), A('2', 'stellen', '2026-10-10'), A('3', 'stellen', '2026-10-13', { status: 'erledigt' })], scheine, '2026-10-13');
  assert.deepEqual(u, { hof: 1, kunde: 2, voll: 1, auftraegeHeute: 1, ueberfaellig: 1, scheineHeute: 2, nettoHeute: 9220 });
});

test('Druck: Wiegeschein mit Nummer, Netto, Schlüssel, Stempel; maskiert', () => {
  const w = {
    id: 'w', nummer: '2026-00001', richtung: 'eingang', kontakt_id: null, kunde_name: 'Bau <Meier>', kennzeichen: 'BB-AB 123', fahrer: 'Ali', herkunft: 'Baustelle',
    container_id: 'c1', auftrag_id: null, abfall_schluessel_id: 's', abfall_schluessel: '170605*', abfall_bezeichnung: 'asbesthaltige Baustoffe', gefaehrlich: true,
    waage: 'Fahrzeugwaage Hof', brutto_kg: 12340, brutto_am: '2026-10-13T06:00:00Z', tara_kg: 4120, tara_am: '2026-10-13T06:20:00Z', netto_kg: 8220,
    status: 'abgeschlossen', abgeschlossen_am: '2026-10-13T06:21:00Z', abgeschlossen_name: 'Max Waage', storno_grund: null, storniert_am: null, notiz: null, erstellt_am: '2026-10-13T06:00:00Z',
  };
  const h = wiegescheinHtml(w, BESTAND[0], { name: 'Entsorgung Muster', strasse: 'Hof 1', plz: '71032', ort: 'Böblingen', telefon: null, email: null });
  assert.match(h, /Wiegeschein Nr\. 2026-00001/);
  assert.match(h, /8\.220 kg/);
  assert.match(h, /8,220 t/);
  assert.match(h, /17 06 05\*/);
  assert.match(h, /gefährlicher Abfall/);
  assert.match(h, /13\.10\.2026, 08:00 Uhr/, 'Berliner Zeit');
  assert.match(h, /Bau &lt;Meier&gt;/);
  assert.ok(!/ENTWURF|STORNIERT/.test(h));
  assert.match(wiegescheinHtml({ ...w, status: 'offen' }, null, null), /ENTWURF/);
  const st = wiegescheinHtml({ ...w, status: 'storniert', storno_grund: 'falsches Fahrzeug' }, null, null);
  assert.match(st, /STORNIERT/);
  assert.match(st, /falsches Fahrzeug/);
  assert.match(wiegescheinHtml({ ...w, abfall_schluessel: null }, null, null), /Abfallschlüssel fehlt/);
  const t = tageslisteHtml('2026-10-14', [A('h', 'abholen', '2026-10-14', { container_alt_id: 'c2', kunde_name: 'K <1>' }), A('s', 'stellen', '2026-10-14', { groesse_m3: 10 })], BESTAND, null);
  assert.match(t, /14\.10\.2026/);
  assert.match(t, /ab: A-10/);
  assert.match(t, /hin: 10 m³/);
  assert.match(t, /K &lt;1&gt;/);
});

test('SQL p355: Nummer mit Sperre, Netto und Zeiten von der Datenbank, Abschluss fest, Container umsetzen gesperrt, additiv', () => {
  const sql = lies('supabase-sql/p355-entsorgung-container-wiegeschein.sql');
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\('p355_wiege_'/);
  assert.match(sql, /lpad\(v_n::text, greatest\(5, length\(v_n::text\)\), '0'\)/, 'Nummer wird ab 100.000 nicht abgeschnitten');
  assert.match(sql, /new\.netto_kg := new\.brutto_kg - new\.tara_kg;/);
  assert.match(sql, /new\.brutto_am := now\(\)/);
  assert.match(sql, /new := old;/, 'abgeschlossen: alles bleibt');
  assert.match(sql, /Stornieren darf nur die Geschäftsleitung/);
  assert.match(sql, /where c\.id = new\.container_id for update/);
  assert.match(sql, /where c\.id = new\.container_alt_id for update/);
  assert.match(sql, /gefaehrlich\s+boolean generated always as \(right\(schluessel, 1\) = '\*'\) stored/);
  assert.match(sql, /schluessel ~ '\^\[0-9\]\{6\}\\\*\?\$'/);
  assert.match(sql, /create trigger p355_loeschwaechter before delete on public\.wiegeschein/);
  assert.match(sql, /create trigger p355_loeschwaechter before delete on public\.container_auftrag/);
  assert.match(sql, /darf_ich_modul_aendern\(''entsorgung''\)/);
  assert.match(sql, /revoke all on public\.%I from anon/);
  assert.ok(!/p355_ma_delete/.test(sql), 'Mitarbeiter löschen nicht');
  assert.match(sql, /tabellen = 4 \| regeln = 16 \| ausloeser = 11 \| rls_an = 4/);
  assert.ok(!/\bdrop table\b|\btruncate\b|\bdelete from\b/i.test(sql), 'additiv');
  assert.ok(!/create table if not exists public\.container \(/.test(sql), 'eigener Tabellenname container_bestand');
});

test('Quelltext: Seite, Navigation, Guide, Sicherung, DSGVO, Verzeichnis, Anrede', () => {
  assert.match(lies('lib/rechte.ts'), /label: '♻️ Entsorgung', href: '\/dashboard\/entsorgung', modul: 'entsorgung'/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/entsorgung': \{/);
  assert.match(lies('lib/sicherungTabellen.ts'), /'abfall_schluessel', 'container_auftrag', 'container_bestand', 'wiegeschein'/);
  assert.match(lies('lib/dsgvoDaten.ts'), /tabelle: 'wiegeschein'/);
  assert.match(lies('lib/verarbeitungsverzeichnis.ts'), /wenn: 'entsorgung'/);
  const seite = lies('app/dashboard/entsorgung/page.tsx');
  assert.match(seite, /So geht&apos;s/);
  assert.match(seite, /<Leerzustand/);
  assert.match(seite, /export default function EntsorgungPage/);
  assert.ok(!/^export (const|function|type)/m.test(seite), 'page.tsx exportiert nur die Seite');
  for (const f of ['page.tsx', 'Auftraege.tsx', 'ContainerBestand.tsx', 'Wiegescheine.tsx', 'Schluessel.tsx', 'entsorgungUi.tsx']) {
    const q = ohneKommentar(lies('app/dashboard/entsorgung/' + f));
    assert.ok(!/\b(du|dein|deine|dich|dir)\b/i.test(q.replace(/[a-z]+\.[a-z]+/g, '')), f + ' duzt nicht');
    assert.ok(!/KI-Agent|KI-Crew/.test(q));
  }
  const wiege = ohneKommentar(lies('app/dashboard/entsorgung/Wiegescheine.tsx'));
  assert.ok(!/netto_kg\s*:|brutto_am\s*:|tara_am\s*:|nummer\s*:|abgeschlossen_am\s*:/.test(wiege), 'Netto, Zeiten, Nummer setzt die Datenbank');
  const auf = ohneKommentar(lies('app/dashboard/entsorgung/Auftraege.tsx'));
  assert.ok(!/from\('container_bestand'\)\.update/.test(auf), 'Umsetzen der Container macht die Datenbank');
  assert.match(lies('app/dashboard/entsorgung/entsorgungUi.tsx'), /nichtsGeschrieben/);
});
