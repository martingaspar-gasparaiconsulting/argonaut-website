// ============================================================================
// tests/bewachungP353.test.mjs — Paket 353 (13.10.2026)
// A4b Fachpaket Bewachung, Teil 1: Wachbuch und Kontrollgänge.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  bewachungZusatz, BEWACHUNG_MODULE, WACHBUCH_ARTEN, istWachbuchArt, artName, eintragPruefen, nachtraegeJe,
  codeLesen, codeLesbar, qrInhalt, punktPruefen, punktZumCode, rundgangAuswerten, dauerText, uebersicht,
  berlinTag, uhrDe, zeitraumPruefen, etikettenHtml, nachweisHtml, qrSvg, esc,
} from '../out/bewachung.js';
import { brancheModule, brancheZusatz } from '../out/branchenkatalog.js';
import { qrMatrix } from '../out/qr.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentar = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const JETZT = Date.parse('2026-10-13T12:00:00Z');
const O = 'obj-1';
const PUNKTE = [
  { id: 'p1', objekt_id: O, name: 'Tor Nord', hinweis: null, code: 'A1B2C3D4E5', position: 1, aktiv: true },
  { id: 'p2', objekt_id: O, name: 'Halle 2', hinweis: 'Notausgang', code: 'FFFFF00000', position: 2, aktiv: true },
  { id: 'p3', objekt_id: O, name: 'Alt', hinweis: null, code: '0123456789', position: 3, aktiv: false },
  { id: 'p4', objekt_id: 'obj-2', name: 'Fremd', hinweis: null, code: 'ABCDEF0123', position: 1, aktiv: true },
];

test('Branchen: Bewachungsgewerbe bekommt Bewachung und Objekte — Hausnotruf, IT-Sicherheit, Schutz-Handwerk nicht', () => {
  for (const b of ['Sicherheitsdienste', 'Wachdienst & Objektschutz', 'Personen- & Objektschutz (§34a)', 'Veranstaltungssicherheit & Ordnerdienst', 'Werttransport & Geldlogistik']) {
    assert.equal(bewachungZusatz(b), true, b);
  }
  for (const b of ['Hausnotruf & Sicherheitstechnik', 'IT-Sicherheit für KMU', 'Fahrsicherheitstraining', 'Blitzschutz & Erdungsanlagen', 'Holzschutz & Bautenschutz', 'Rollladen & Sonnenschutz', 'Datenschutzberatung (ext. DSB)', null]) {
    assert.equal(bewachungZusatz(b), false, String(b));
  }
  const m = brancheModule('Dienstleistungen', 'Wachdienst & Objektschutz');
  assert.ok(m.includes('bewachung') && m.includes('objektzeiten'));
  assert.equal(new Set(m).size, m.length, 'keine Doppelten');
  const w = brancheModule('Logistik & Transport', 'Werttransport & Geldlogistik');
  assert.ok(w.includes('bewachung') && w.includes('objektzeiten'), 'Werttransport (Logistik) bekommt auch die Objekte');
  assert.ok(brancheZusatz('Dienstleistungen', 'Sicherheitsdienste').includes('bewachung'));
  assert.ok(!brancheModule('Dienstleistungen', 'Reinigungsunternehmen').includes('bewachung'));
  assert.ok(brancheModule('Dienstleistungen', 'Bestattungsunternehmen').includes('bestattung'), 'Bestatter unverändert');
  assert.deepEqual([...BEWACHUNG_MODULE], ['bewachung', 'objektzeiten']);
});

test('Wachbuch: Arten, Prüfung wie die Datenbank (Text, Nachtrag nur mit Bezug, keine Zukunft)', () => {
  assert.deepEqual(WACHBUCH_ARTEN.map((a) => a.key), ['meldung', 'vorkommnis', 'uebergabe', 'schaden', 'polizei', 'nachtrag']);
  assert.ok(Object.isFrozen(WACHBUCH_ARTEN));
  assert.ok(istWachbuchArt('vorkommnis') && !istWachbuchArt('sonstwas'));
  assert.equal(artName('polizei'), 'Polizei / Feuerwehr / Rettung');
  assert.deepEqual(eintragPruefen({ art: 'meldung', text: 'Alles ruhig' }, JETZT), { ok: true });
  assert.equal(eintragPruefen({ art: 'meldung', text: '  ' }, JETZT).ok, false);
  assert.equal(eintragPruefen({ art: 'mond', text: 'x' }, JETZT).ok, false);
  assert.match(eintragPruefen({ art: 'meldung', text: 'x'.repeat(4001) }, JETZT).fehler.join(' '), /4000/);
  assert.equal(eintragPruefen({ art: 'meldung', text: 'x'.repeat(4000) }, JETZT).ok, true);
  assert.match(eintragPruefen({ art: 'nachtrag', text: 'Korrektur' }, JETZT).fehler.join(' '), /bezieht sich/);
  assert.deepEqual(eintragPruefen({ art: 'nachtrag', text: 'Korrektur', bezug_id: 'e1' }, JETZT), { ok: true });
  assert.equal(eintragPruefen({ art: 'meldung', text: 'x', bezug_id: 'e1' }, JETZT).ok, false);
  assert.match(eintragPruefen({ art: 'meldung', text: 'x', ereignis_am: '2026-10-14T12:00:00Z' }, JETZT).fehler.join(' '), /Zukunft/);
  assert.deepEqual(eintragPruefen({ art: 'meldung', text: 'x', ereignis_am: '2026-10-13T12:04:00Z' }, JETZT), { ok: true }, '5 Minuten Uhren-Spielraum wie die Datenbank');
  assert.equal(eintragPruefen({ art: 'meldung', text: 'x', ereignis_am: 'gestern' }, JETZT).ok, false);
});

test('Nachträge: hängen am Original, sortiert nach Erfassung', () => {
  const e = [
    { id: 'e1', objekt_id: O, art: 'vorkommnis', text: 'Tor offen', ereignis_am: null, bezug_id: null, erfasst_am: '2026-10-13T10:00:00Z', erfasst_name: 'A' },
    { id: 'n2', objekt_id: O, art: 'nachtrag', text: 'zweiter', ereignis_am: null, bezug_id: 'e1', erfasst_am: '2026-10-13T12:00:00Z', erfasst_name: 'B' },
    { id: 'n1', objekt_id: O, art: 'nachtrag', text: 'erster', ereignis_am: null, bezug_id: 'e1', erfasst_am: '2026-10-13T11:00:00Z', erfasst_name: 'B' },
  ];
  const m = nachtraegeJe(e);
  assert.deepEqual(m.get('e1').map((x) => x.id), ['n1', 'n2']);
  assert.equal(m.size, 1);
});

test('Code: lesen mit und ohne Präfix, egal wie getippt; fremde QR-Codes = null', () => {
  assert.equal(codeLesen('ARGW-A1B2C3D4E5'), 'A1B2C3D4E5');
  assert.equal(codeLesen('a1b2c-3d4e5'), 'A1B2C3D4E5');
  assert.equal(codeLesen(' argw a1b2c 3d4e5 '), 'A1B2C3D4E5');
  assert.equal(codeLesen('https://example.com'), null);
  assert.equal(codeLesen('4006381333931'), null, 'EAN ist kein Kontrollpunkt');
  assert.equal(codeLesen('A1B2C3D4E'), null);
  assert.equal(codeLesen('G1B2C3D4E5'), null, 'nur 0-9 und A-F');
  assert.equal(codeLesen(''), null);
  assert.equal(codeLesbar('A1B2C3D4E5'), 'A1B2C-3D4E5');
  assert.equal(codeLesen(codeLesbar('A1B2C3D4E5')), 'A1B2C3D4E5', 'lesbare Form ist wieder lesbar');
  assert.equal(codeLesen(qrInhalt('A1B2C3D4E5')), 'A1B2C3D4E5');
});

test('Kontrollpunkt zum Code: nur aktive, nur im gewählten Objekt', () => {
  assert.equal(punktZumCode(PUNKTE, 'A1B2C3D4E5', O).punkt.id, 'p1');
  assert.match(punktZumCode(PUNKTE, null, O).fehler, /kein ARGONAUT-Kontrollpunkt/);
  assert.match(punktZumCode(PUNKTE, '9999999999', O).fehler, /kennt Ihr Betrieb nicht/);
  assert.match(punktZumCode(PUNKTE, 'ABCDEF0123', O).fehler, /anderen Objekt/);
  assert.match(punktZumCode(PUNKTE, '0123456789', O).fehler, /ausgeblendet/);
  assert.deepEqual(punktPruefen({ name: 'Tor' }), { ok: true });
  assert.equal(punktPruefen({ name: ' ' }).ok, false);
  assert.equal(punktPruefen({ name: 'x'.repeat(121) }).ok, false);
  assert.equal(punktPruefen({ name: 'x', hinweis: 'x'.repeat(301) }).ok, false);
});

test('Rundgang auswerten: Soll = aktive Punkte des Objekts, fehlende, doppelte, Dauer, Standort', () => {
  const r = { objekt_id: O, gestartet_am: '2026-10-13T20:00:00Z', beendet_am: '2026-10-13T20:47:00Z' };
  const a = rundgangAuswerten(r, PUNKTE, [
    { kontrollpunkt_id: 'p1', gescannt_am: '2026-10-13T20:05:00Z', lat: 48.6, lon: 9.0 },
    { kontrollpunkt_id: 'p1', gescannt_am: '2026-10-13T20:30:00Z' },
  ]);
  assert.deepEqual(a, { soll: 2, erreicht: 1, fehlend: ['Halle 2'], doppelt: 1, scans: 2, dauerMin: 47, vollstaendig: false, mitStandort: 1 });
  const b = rundgangAuswerten(r, PUNKTE, [{ kontrollpunkt_id: 'p1', gescannt_am: 'x' }, { kontrollpunkt_id: 'p2', gescannt_am: 'x' }]);
  assert.equal(b.vollstaendig, true);
  assert.deepEqual(b.fehlend, []);
  assert.equal(rundgangAuswerten({ ...r, objekt_id: 'leer' }, PUNKTE, []).vollstaendig, false, 'ohne Punkte nie vollständig');
  assert.equal(rundgangAuswerten({ ...r, beendet_am: null }, PUNKTE, [], Date.parse('2026-10-13T21:30:00Z')).dauerMin, 90, 'laufend: bis jetzt');
  assert.equal(rundgangAuswerten({ ...r, beendet_am: null }, PUNKTE, []).dauerMin, null);
  assert.equal(dauerText(47), '47 Min.');
  assert.equal(dauerText(120), '2 Std.');
  assert.equal(dauerText(135), '2 Std. 15 Min.');
  assert.equal(dauerText(null), '—');
});

test('Zeit: Berliner Tag und Uhrzeit (Sommer/Winter), Übersicht, Zeitraum', () => {
  assert.equal(berlinTag('2026-10-13T22:30:00Z'), '2026-10-14', 'nach Mitternacht Berliner Zeit');
  assert.equal(uhrDe('2026-10-13T22:30:00Z'), '00:30');
  assert.equal(uhrDe('2026-12-01T22:30:00Z'), '23:30', 'Winterzeit');
  const u = uebersicht(
    [{ id: 'r1', objekt_id: O, mitarbeiter_name: 'A', gestartet_am: '2026-10-13T08:00:00Z', beendet_am: null, status: 'laeuft' },
     { id: 'r2', objekt_id: O, mitarbeiter_name: 'A', gestartet_am: '2026-10-12T08:00:00Z', beendet_am: '2026-10-12T09:00:00Z', status: 'beendet' }],
    [{ id: 'e1', objekt_id: O, art: 'vorkommnis', text: 'x', ereignis_am: null, bezug_id: null, erfasst_am: '2026-10-13T09:00:00Z', erfasst_name: 'A' },
     { id: 'e2', objekt_id: O, art: 'schaden', text: 'x', ereignis_am: null, bezug_id: null, erfasst_am: '2026-10-07T09:00:00Z', erfasst_name: 'A' },
     { id: 'e3', objekt_id: O, art: 'polizei', text: 'x', ereignis_am: null, bezug_id: null, erfasst_am: '2026-10-06T09:00:00Z', erfasst_name: 'A' },
     { id: 'e4', objekt_id: O, art: 'meldung', text: 'x', ereignis_am: null, bezug_id: null, erfasst_am: '2026-10-13T10:00:00Z', erfasst_name: 'A' }],
    '2026-10-13');
  assert.deepEqual(u, { laufend: 1, heuteRundgaenge: 1, heuteEintraege: 2, vorkommnisse7: 2 });
  assert.deepEqual(zeitraumPruefen('2026-10-01', '2026-10-13'), { ok: true });
  assert.equal(zeitraumPruefen('2026-10-13', '2026-10-01').ok, false);
  assert.equal(zeitraumPruefen('2026-01-01', '2026-10-01').ok, false);
  assert.equal(zeitraumPruefen('', '2026-10-01').ok, false);
});

test('Druck: QR-Aufkleber mit lesbarem Code, nur aktive Punkte; QR ist echt', () => {
  const html = etikettenHtml({ bezeichnung: 'Lager <Müller>', adresse: null }, PUNKTE.filter((p) => p.objekt_id === O));
  assert.ok(html.includes('A1B2C-3D4E5') && html.includes('FFFFF-00000'));
  assert.ok(!html.includes('01234-56789'), 'ausgeblendeter Punkt nicht auf dem Bogen');
  assert.ok(html.includes('Lager &lt;Müller&gt;') && !html.includes('<Müller>'), 'maskiert');
  assert.equal((html.match(/<svg/g) ?? []).length, 2);
  const m = qrMatrix(qrInhalt('A1B2C3D4E5'));
  const svg = qrSvg(qrInhalt('A1B2C3D4E5'));
  assert.ok(svg.includes(`viewBox="0 0 ${m.length + 8} ${m.length + 8}"`));
  assert.equal((svg.match(/h1v1h-1z/g) ?? []).length, m.flat().filter(Boolean).length, 'jedes dunkle Modul gezeichnet');
  assert.match(etikettenHtml({ bezeichnung: 'X', adresse: null }, []), /noch keine aktiven Kontrollpunkte/);
  assert.equal(esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
});

test('Druck: Nachweis — Rundgänge mit Uhrzeiten und fehlenden Punkten, Wachbuch mit Nachträgen, KEIN Standort', () => {
  const d = {
    objekt: { bezeichnung: 'Lager Müller', adresse: 'Weg 1, Sindelfingen' }, von: '2026-10-13', bis: '2026-10-13', erstellt: '2026-10-14T08:00:00Z',
    rundgaenge: [
      { id: 'r1', objekt_id: O, mitarbeiter_name: 'Willi <Wache>', gestartet_am: '2026-10-13T20:00:00Z', beendet_am: '2026-10-13T20:47:00Z', status: 'beendet' },
      { id: 'r0', objekt_id: O, mitarbeiter_name: 'Vortag', gestartet_am: '2026-10-12T20:00:00Z', beendet_am: '2026-10-12T21:00:00Z', status: 'beendet' },
    ],
    punkte: PUNKTE,
    scans: [{ rundgang_id: 'r1', kontrollpunkt_id: 'p1', gescannt_am: '2026-10-13T20:05:00Z', lat: 48.123456, lon: 9.654321 }],
    eintraege: [
      { id: 'e1', objekt_id: O, art: 'vorkommnis', text: 'Tor offen', ereignis_am: null, bezug_id: null, erfasst_am: '2026-10-13T20:10:00Z', erfasst_name: 'Willi' },
      { id: 'n1', objekt_id: O, art: 'nachtrag', text: 'Korrektur: Tor Süd', ereignis_am: null, bezug_id: 'e1', erfasst_am: '2026-10-15T08:00:00Z', erfasst_name: 'Chef' },
    ],
    mitWachbuch: true,
  };
  const html = nachweisHtml(d, { name: 'Wache GmbH', strasse: null, plz: null, ort: null, telefon: null, email: null });
  assert.ok(html.includes('Willi &lt;Wache&gt;'));
  assert.ok(!html.includes('Vortag'), 'nur Zeitraum');
  assert.ok(html.includes('22:05 Tor Nord'), 'Scan in Berliner Zeit');
  assert.ok(html.includes('<td>1/2</td>'));
  assert.match(html, /class="rot">Halle 2</);
  assert.ok(!/48[.,]12|9[.,]65/.test(html), 'kein Standort im Nachweis');
  assert.ok(html.includes('Tor offen') && html.includes('Korrektur: Tor Süd'), 'Nachtrag auch nach dem Zeitraum unter dem Original');
  assert.ok(html.indexOf('Tor offen') < html.indexOf('Korrektur: Tor Süd'));
  assert.ok(!nachweisHtml({ ...d, mitWachbuch: false }, null).includes('Tor offen'));
  assert.match(nachweisHtml({ ...d, mitWachbuch: false }, null), /Firmendaten fehlen/);
});

test('SQL p353: nur anhängen, Serverzeit, Rechte Modul bewachung, Kontrolle', () => {
  const sql = lies('supabase-sql/p353-bewachung-wachbuch.sql');
  for (const t of ['wach_kontrollpunkt', 'wach_rundgang', 'wach_scan', 'wachbuch_eintrag']) assert.match(sql, new RegExp(`create table if not exists public\\.${t} \\(`));
  assert.match(sql, /new\.gescannt_am := now\(\);/);
  assert.match(sql, /new\.erfasst_am := now\(\);/);
  assert.match(sql, /new\.gestartet_am := now\(\);/);
  assert.match(sql, /new\.code := upper\(substr\(replace\(gen_random_uuid\(\)::text, '-', ''\), 1, 10\)\);/, 'Code vergibt die Datenbank');
  assert.match(sql, /new\.code := old\.code;/);
  assert.match(sql, /create trigger p353_fest before update or delete on public\.wach_scan/);
  assert.match(sql, /create trigger p353_fest before update or delete on public\.wachbuch_eintrag/);
  assert.match(sql, /if tg_op = 'UPDATE' then\s+raise exception/);
  assert.ok(!/policy p353_\w+ on public\.%I for (update|delete|all)[^;]*wach_scan/.test(sql));
  assert.ok(!/for all to authenticated/.test(sql), 'keine Alles-Regel: Wachbuch nicht änderbar für den Chef');
  assert.match(sql, /if t in \('wach_kontrollpunkt', 'wach_rundgang'\) then[\s\S]*?for update/);
  assert.match(sql, /p353_owner_delete on public\.wach_kontrollpunkt for delete/);
  assert.match(sql, /on delete restrict/);
  assert.ok(!/on delete cascade/.test(sql), 'nichts verschwindet mit');
  assert.match(sql, /darf_ich_modul_aendern\(''bewachung''\)/);
  assert.match(sql, /revoke all on public\.%I from anon/);
  assert.match(sql, /wach_rundgang_einer_laeuft/);
  assert.match(sql, /tabellen = 4 \| regeln = 21 \| ausloeser = 10 \| rls_an = 4/);
  assert.ok(!/\bdrop table\b|\btruncate\b|\bdelete from\b/i.test(sql), 'additiv');
});

test('Quelltext: Seite, Navigation, Guide, Sicherung, Verzeichnis, Anrede', () => {
  const nav = lies('lib/rechte.ts');
  assert.match(nav, /label: '🛡️ Bewachung', href: '\/dashboard\/bewachung', modul: 'bewachung'/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/bewachung': \{/);
  assert.match(lies('lib/sicherungTabellen.ts'), /'wach_kontrollpunkt', 'wach_rundgang', 'wach_scan', 'wachbuch_eintrag'/);
  assert.match(lies('lib/verarbeitungsverzeichnis.ts'), /wenn: 'bewachung'/);
  const seite = lies('app/dashboard/bewachung/page.tsx');
  assert.match(seite, /So geht&apos;s/);
  assert.match(seite, /<Leerzustand/);
  assert.match(seite, /export default function BewachungPage/);
  for (const f of ['page.tsx', 'Kontrollgang.tsx', 'Wachbuch.tsx', 'Kontrollpunkte.tsx', 'Nachweis.tsx']) {
    const q = ohneKommentar(lies('app/dashboard/bewachung/' + f));
    assert.ok(!/\b(du|dein|deine|dich|dir)\b/i.test(q.replace(/[a-z]+\.[a-z]+/g, '')), f + ' duzt nicht');
    assert.ok(!/KI-Agent|KI-Crew/.test(q));
  }
  const gang = ohneKommentar(lies('app/dashboard/bewachung/Kontrollgang.tsx'));
  assert.ok(!/gescannt_am\s*:/.test(gang), 'Scan-Zeit schreibt nie der Browser');
  assert.match(gang, /gpsGemerkt\(\)/);
  assert.match(gang, /const ort = gps \? await standort\(\) : null;/, 'Standort nur, wenn eingeschaltet');
  const buch = ohneKommentar(lies('app/dashboard/bewachung/Wachbuch.tsx'));
  assert.ok(!/erfasst_am\s*:|erfasst_name\s*:/.test(buch), 'Zeit und Name setzt die Datenbank');
  assert.ok(!/\.update\(|\.delete\(/.test(buch), 'Wachbuch: kein Ändern, kein Löschen');
  const ui = lies('app/dashboard/bewachung/bewachungUi.tsx');
  assert.match(ui, /nichtsGeschrieben/);
});
