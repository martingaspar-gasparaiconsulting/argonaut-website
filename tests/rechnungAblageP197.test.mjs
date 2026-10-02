// ============================================================================
// tests/rechnungAblageP197.test.mjs — Paket 197: Verschickte Rechnungen fest ablegen (GoBD).
//   Dateiprüfung (echtes PDF/XML, 10 MB), sichere Namen und Pfade je Betrieb,
//   Original = erstes PDF, Festschreiben, Server-Routen (Recht, Prüfsumme,
//   Ablage nach dem Versand), Rechnungsseite (Original statt neu gerechnet,
//   Sperre), SQL (unveränderbar, Sperre, Rückweg).
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  dateiArt, pruefeAblageDatei, sichererName, ablagePfad, pfadPasstZu, pruefsummeKurz,
  originalPdf, istFestgeschrieben, gleicheDatei, ablageFehlt, istUuid, istAnlass,
  ABLAGE_MAX_BYTES, ABLAGE_BUCKET, ABLAGE_ANLASS_TEXT,
} from '../out/rechnungAblage.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const enc = (s) => new TextEncoder().encode(s);

const BETRIEB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RECHNUNG = '11111111-2222-4333-8444-555555555555';

// ---------------------------------------------------------------------------
test('Dateiart am Inhalt: PDF, XML (auch mit BOM/Leerraum), sonst nichts', () => {
  assert.equal(dateiArt(enc('%PDF-1.7\n...')), 'application/pdf');
  assert.equal(dateiArt(enc('<?xml version="1.0"?><x/>')), 'application/xml');
  assert.equal(dateiArt(new Uint8Array([0xef, 0xbb, 0xbf, 0x3c, 0x3f, 0x78, 0x6d, 0x6c])), 'application/xml');
  assert.equal(dateiArt(enc('\n  <rsm:CrossIndustryInvoice/>')), 'application/xml');
  assert.equal(dateiArt(enc('GIF89a....')), null);
  assert.equal(dateiArt(enc('%PD')), null);
  assert.equal(dateiArt(enc('%PDFx-1.7')), null);
  assert.equal(dateiArt(new Uint8Array()), null);
});

test('Dateiprüfung: leer, zu groß, falscher Inhalt, Typ passt nicht', () => {
  assert.equal(pruefeAblageDatei(new Uint8Array(), 'application/pdf').ok, false);
  const gross = new Uint8Array(ABLAGE_MAX_BYTES + 1); gross.set(enc('%PDF-'));
  assert.equal(pruefeAblageDatei(gross, 'application/pdf').ok, false);
  const genau = new Uint8Array(ABLAGE_MAX_BYTES); genau.set(enc('%PDF-'));
  assert.equal(pruefeAblageDatei(genau, 'application/pdf').ok, true);
  assert.equal(pruefeAblageDatei(enc('<html>'), 'application/pdf').ok, false);
  assert.equal(pruefeAblageDatei(enc('MZ....'), 'application/pdf').ok, false);
  assert.deepEqual(pruefeAblageDatei(enc('<?xml?>'), 'text/xml'), { ok: true, typ: 'application/xml' });
  assert.deepEqual(pruefeAblageDatei(enc('%PDF-1.4'), ''), { ok: true, typ: 'application/pdf' });
  assert.equal(pruefeAblageDatei(enc('%PDF-1.4'), 'application/xml').ok, false);
});

test('Sichere Dateinamen: Umlaute, Sonderzeichen, Endung passend zum Typ', () => {
  assert.equal(sichererName('Rechnung_RE-2026/0012 Müller.pdf', 'application/pdf'), 'Rechnung_RE-2026_0012_Mueller.pdf');
  assert.equal(sichererName('../../etc/passwd', 'application/xml'), 'etc_passwd.xml');
  assert.equal(sichererName('', 'application/pdf'), 'Rechnung.pdf');
  assert.equal(sichererName('ZUGFeRD_R1.xml', 'application/pdf'), 'ZUGFeRD_R1.pdf');
  assert.ok(sichererName('x'.repeat(300), 'application/pdf').length <= 84);
});

test('Ablagepfad: Betrieb zuerst, Jahr aus dem Rechnungsdatum, nur gültige Kennungen', () => {
  const p = ablagePfad(BETRIEB, RECHNUNG, '2025-12-31', 1790000000000, 'Rechnung.pdf');
  assert.equal(p, `${BETRIEB}/ausgang/2025/${RECHNUNG}/1790000000000_Rechnung.pdf`);
  assert.ok(ablagePfad(BETRIEB, RECHNUNG, null, Date.UTC(2026, 5, 1), 'a.pdf').includes('/ausgang/2026/'));
  assert.throws(() => ablagePfad('../x', RECHNUNG, null, 1, 'a.pdf'));
  assert.throws(() => ablagePfad(BETRIEB, 'kein-uuid', null, 1, 'a.pdf'));
  assert.equal(pfadPasstZu(p, BETRIEB, RECHNUNG), true);
  assert.equal(pfadPasstZu(p, '99999999-9999-4999-8999-999999999999', RECHNUNG), false);
  assert.equal(pfadPasstZu(p, BETRIEB, '99999999-9999-4999-8999-999999999999'), false);
  assert.equal(pfadPasstZu(`${BETRIEB}/ausgang/2025/${RECHNUNG}/../x.pdf`, BETRIEB, RECHNUNG), false);
  assert.equal(pfadPasstZu(`/${BETRIEB}/ausgang/2025/${RECHNUNG}/a.pdf`, BETRIEB, RECHNUNG), false);
  assert.equal(pfadPasstZu(`${BETRIEB}/ausgang/2025/${RECHNUNG}/..`, BETRIEB, RECHNUNG), false);
  assert.equal(istUuid(BETRIEB), true);
  assert.equal(istUuid('x'), false);
});

test('Prüfsumme kurz, Anlässe, Speicherordner', () => {
  assert.equal(pruefsummeKurz('3f2a9c1b77d0' + '0'.repeat(52)), '3f2a 9c1b 77d0 …');
  assert.equal(pruefsummeKurz('zu-kurz'), '');
  assert.equal(istAnlass('versand_mail'), true);
  assert.equal(istAnlass('loeschen'), false);
  assert.equal(ABLAGE_ANLASS_TEXT.festgeschrieben, 'Festgeschrieben (PDF)');
  assert.equal(ABLAGE_BUCKET, 'rechnung-ablage');
});

test('Original = erstes abgelegtes PDF; XML zählt nicht als PDF', () => {
  const ab = [
    { id: '3', anlass: 'versand_mail', datei_typ: 'application/pdf', datei_hash: 'c', erstellt_am: '2026-10-03T10:00:00Z' },
    { id: '1', anlass: 'versand_mail', datei_typ: 'application/xml', datei_hash: 'a', erstellt_am: '2026-10-01T10:00:00Z' },
    { id: '2', anlass: 'festgeschrieben', datei_typ: 'application/pdf', datei_hash: 'b', erstellt_am: '2026-10-02T10:00:00Z' },
  ];
  assert.equal(originalPdf(ab).id, '2');
  assert.equal(originalPdf([ab[1]]), null);
  assert.equal(originalPdf(null), null);
});

test('Festgeschrieben: Spalte gesetzt ODER schon etwas abgelegt', () => {
  assert.equal(istFestgeschrieben({ festgeschrieben_am: null }, []), false);
  assert.equal(istFestgeschrieben({ festgeschrieben_am: '2026-10-02T10:00:00Z' }, []), true);
  assert.equal(istFestgeschrieben({ festgeschrieben_am: null }, [{}]), true);
  assert.equal(istFestgeschrieben(null, null), false);
});

test('Gleiche Datei wird wiederverwendet, fehlende Ablage wird erkannt', () => {
  assert.equal(gleicheDatei([{ datei_hash: 'a', datei_pfad: 'p' }], 'a').datei_pfad, 'p');
  assert.equal(gleicheDatei([{ datei_hash: 'a', datei_pfad: '' }], 'a'), null);
  assert.equal(gleicheDatei([], 'a'), null);
  assert.equal(ablageFehlt('relation "public.rechnung_ablage" does not exist'), true);
  assert.equal(ablageFehlt('Could not find the table in the schema cache'), true);
  assert.equal(ablageFehlt('permission denied'), false);
});

// ---------------------------------------------------------------------------
test('Server-Ablage: Rechnung mit Sitzung lesen, Betrieb prüfen, kein upsert, festschreiben nur wenn leer', () => {
  const s = lies('lib/rechnungAblageServer.ts');
  assert.match(s, /\(opts\.sitzung as Lesbar\)\.from\('rechnungen'\)/);
  assert.match(s, /owner_user_id\) !== betrieb/);
  assert.match(s, /upsert: false/);
  assert.match(s, /createHash\('sha256'\)/);
  assert.match(s, /\.is\('festgeschrieben_am', null\)/);
  assert.match(s, /pruefeAblageDatei\(bytes, opts\.typ\)/);
});

test('Route rechnung-ablage: Abrechnungsrecht, Prüfsumme beim Ausliefern, Pfad-Prüfung', () => {
  const s = lies('app/api/rechnung-ablage/route.ts');
  assert.match(s, /abrechnungPruefen\(supabase, user\.id/);
  assert.match(s, /anlass: 'festgeschrieben'/);
  assert.match(s, /sha256Hex\(bytes\) !== zeile\.datei_hash/);
  assert.match(s, /status: 409/);
  assert.match(s, /pfadPasstZu\(zeile\.datei_pfad, zeile\.owner_user_id, zeile\.rechnung_id\)/);
  assert.match(s, /supabase\.from\('rechnung_ablage'\)/);   // Lesen mit der Sitzung (RLS)
  assert.match(s, /Cache-Control': 'private, no-store'/);
});

test('rechnung-senden: Inhalt geprüft, Ablage NACH erfolgreichem Versand, Mail bleibt gültig', () => {
  const s = lies('app/api/rechnung-senden/route.ts');
  assert.match(s, /pruefeAblageDatei\(new Uint8Array\(anhangBuffer\), typ\)/);
  const versand = s.indexOf('await sendeMail(');
  const ablage = s.indexOf('legeRechnungAb(');
  assert.ok(versand > 0 && ablage > versand, 'Ablage muss nach dem Versand kommen');
  assert.match(s, /anlass: 'versand_mail', empfaenger: an/);
  assert.match(s, /abgelegt: false, ablage_fehler/);
  const d = lies('app/dashboard/_components/ERechnungDialog.tsx');
  assert.match(d, /rechnung_id: rechnung\?\.id/);
  assert.match(d, /bitte NICHT erneut senden/);
});

test('Rechnungsseite: Original statt neu gerechnet, Festschreiben nach Rückfrage, Sperre', () => {
  const s = lies('app/dashboard/rechnungen/[id]/page.tsx');
  assert.match(s, /const gesperrt = status === "bezahlt" \|\| status === "storniert" \|\| festgeschrieben;/);
  assert.match(s, /if \(original\) \{[\s\S]{0,200}ablageOeffnen\(original\.id/);
  assert.match(s, /if \(darfAbrechnen && !dirty && status !== "storniert" && !festgeschrieben\)/);
  assert.match(s, /window\.confirm\([\s\S]{0,80}Schicken Sie dieses PDF jetzt an Ihren Kunden/);
  assert.match(s, /if \(festgeschrieben\) \{\s*const \{ error: nErr \} = await supabase\.from\("rechnungen"\)\.update\(\{ notizen: notizen \|\| null \}\)/);
  assert.match(s, /onAbgelegt=\{laden\}/);
  assert.match(s, /value=\{rechnungsdatum\} disabled=\{festgeschrieben\}/);
});

test('Musterbetrieb räumt die Ablage auf (nur eigener Ordner)', () => {
  const s = lies('app/api/admin/musterbetrieb-xxl/route.ts');
  assert.match(s, /from\('rechnung_ablage'\)\.delete\(\)\.eq\('owner_user_id', uid\)/);
  assert.match(s, /p\.startsWith\(uid \+ '\/'\)/);
});

test('SQL p197: additiv, unveränderbar, Sperre mit Ausnahmen, Rückweg, Kontrolle', () => {
  const s = lies('supabase-sql/p197-rechnung-ablage.sql');
  assert.match(s, /create table if not exists public\.rechnung_ablage/);
  assert.match(s, /add column if not exists festgeschrieben_am/);
  assert.match(s, /raise exception 'Abgelegte Rechnungen sind unveränderbar/);
  assert.match(s, /before update or delete on public\.rechnung_ablage/);
  assert.match(s, /before update or delete on public\.rechnungen/);
  assert.match(s, /before insert or update or delete on public\.rechnung_positionen/);
  assert.match(s, /'service_role'/);
  assert.match(s, /RÜCKWEG/);
  assert.match(s, /festgeschrieben 0/);
  // Zahlstatus/Mahnung/Notizen dürfen NICHT gesperrt sein
  const liste = s.slice(s.indexOf("foreach c in array array['rechnungsnummer'"), s.indexOf('] loop', s.indexOf("foreach c in array array['rechnungsnummer'")));
  for (const frei of ['zahlungsstatus', 'mahnstufe', 'notizen', 'sepa_datei_am', 'bezahlt_am']) assert.ok(!liste.includes(`'${frei}'`), frei);
  for (const fest of ['brutto_summe', 'rechnungsnummer', 'rechnungsdatum', 'kontakt_id']) assert.ok(liste.includes(`'${fest}'`), fest);
  assert.doesNotMatch(s, /\bdrop table\b|\btruncate\b|delete from/i);
  // Keine Speicherregeln für Nutzer auf dem Ablage-Ordner
  assert.doesNotMatch(s, /on storage\.objects/);
});
