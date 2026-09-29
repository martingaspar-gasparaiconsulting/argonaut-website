// Paket 167 (29.09.2026) — Ablauf-Bausteine im Motor: Glocke, Termin, PDF,
// KI-Entwurf, Webhook NUR nach außen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { pruefeAblauf, ablaufAktion, aktionFelder, MAX_KI_SCHRITTE } from '../out/ablauf.js';
import { aktionPlanen, OHNE_VORGANG, vorgangsblattZeilen, planText } from '../out/ablaufMotor.js';
import { berlinZeitpunkt } from '../out/ablaufZeit.js';
import { standardConfig, enthaeltAktion, AUSWAHL_TEXT } from '../out/ablaufEditor.js';
import { pruefeWebhookUrl, gesperrtesFeld, felderListe, istEigenerHost } from '../out/ablaufWebhookPruefung.js';
import { baueNutzlast, webhookSchluessel, signiere, webhookKoepfe } from '../out/ablaufWebhook.js';
import { ablaufPdfHtml, ablaufPdfPfad } from '../out/ablaufPdf.js';
import { gepruefterLookup, sendeWebhook } from '../out/ablaufWebhookSenden.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const JETZT = new Date('2026-09-28T10:00:00Z'); // Montag, Sommerzeit
const RECHNUNG = { art: 'ereignis', ereignis: 'rechnung_bezahlt', filter: null };
const ZIEL_R = { tabelle: 'rechnungen', zielTyp: 'rechnung', datumFeld: '' };
const SATZ = { id: 'r1', rechnungsnummer: 'RE-2026-7', kunde_name: 'Müller GmbH', brutto_summe: 1234.5, zahlungsstatus: 'bezahlt', kontakt_id: 'k1', positionen: [{ x: 1 }], iban: 'DE00' };
const ablauf = (schritte, ausloeser = RECHNUNG) => ({ name: 'Test', ausloeser, schritte, aktiv: true });
const akt = (aktion, config, id = 's1') => ({ id, typ: 'aktion', aktion, config });
const plan = (s, satz = SATZ, ziel = ZIEL_R, ausloeser = RECHNUNG) => aktionPlanen(s, { name: 'Test', ausloeser, id: 'a1' }, ziel, 'chef1', satz, JETZT);

test('Katalog: alle fünf neuen Bausteine im Motor, mit Feldern und Standardwerten', () => {
  for (const k of ['glocke', 'termin_anlegen', 'pdf_erstellen', 'ki_schritt', 'webhook_senden']) {
    assert.equal(ablaufAktion(k).imMotor, true, k);
    assert.ok(aktionFelder(k).length > 0, k);
  }
  assert.equal(ablaufAktion('webhook_senden').extern, true);
  assert.deepEqual(standardConfig('glocke'), { an: 'chef', titel: 'Ablauf: {{ablauf}}', text: '{{name}} {{nummer}}' });
  assert.equal(standardConfig('termin_anlegen').dauer_min, 60);
  assert.equal(standardConfig('pdf_erstellen').vorlage, 'schreiben');
  assert.ok(aktionFelder('aufgabe_anlegen').some((f) => f.key === 'titel'), 'alte Aktionen aus lib/automation');
  assert.equal(AUSWAHL_TEXT.team, 'an das ganze Team');
  assert.equal(enthaeltAktion([{ id: 'w', typ: 'wenn', bedingung: { verknuepfung: 'und', regeln: [] }, dann: [], sonst: [akt('webhook_senden', {})] }], 'webhook_senden'), true);
  assert.equal(enthaeltAktion([akt('glocke', {})], 'webhook_senden'), false);
});

test('Prüfung Glocke und Termin: Empfänger, Team-Hinweis, Schleifen-Sperre, Uhrzeit, Dauer', () => {
  assert.equal(pruefeAblauf(ablauf([akt('glocke', { an: 'chef', text: 'x' })])).aktivierbar, true);
  assert.ok(pruefeAblauf(ablauf([akt('glocke', { an: 'alle', text: 'x' })])).fehler.some((f) => /Empfänger/.test(f)));
  assert.ok(pruefeAblauf(ablauf([akt('glocke', { an: 'team', text: 'x' })])).hinweise.some((h) => /alle Mitarbeiter/.test(h)));
  assert.equal(pruefeAblauf(ablauf([akt('termin_anlegen', { titel: 'T', in_tagen: 2, uhrzeit: '14:30', dauer_min: 30 })])).aktivierbar, true);
  const schleife = pruefeAblauf(ablauf([akt('termin_anlegen', { titel: 'T' })], { art: 'ereignis', ereignis: 'termin_angelegt', filter: null }));
  assert.ok(schleife.fehler.some((f) => /endlos/.test(f)), 'Termin angelegt -> Termin anlegen gesperrt');
  assert.ok(pruefeAblauf(ablauf([akt('termin_anlegen', { titel: 'T', uhrzeit: '25:00' })])).fehler.some((f) => /HH:MM/.test(f)));
  assert.ok(pruefeAblauf(ablauf([akt('termin_anlegen', { titel: 'T', dauer_min: 2 })])).fehler.some((f) => /Dauer/.test(f)));
  assert.ok(pruefeAblauf(ablauf([akt('termin_anlegen', { titel: 'T', in_tagen: 400 })])).fehler.some((f) => /Tagen/.test(f)));
});

test('Prüfung PDF und KI: Vorgangsblatt nur mit Vorgang, Schreiben braucht Text, KI = Entwurf + AVV, höchstens 3', () => {
  const zeitplan = { art: 'zeitplan', rhythmus: 'taeglich', uhrzeit: '07:00' };
  assert.ok(pruefeAblauf(ablauf([akt('pdf_erstellen', { vorlage: 'vorgangsblatt' })], zeitplan)).fehler.some((f) => /Vorgang/.test(f)));
  assert.equal(pruefeAblauf(ablauf([akt('pdf_erstellen', { vorlage: 'vorgangsblatt' })])).aktivierbar, true);
  assert.ok(pruefeAblauf(ablauf([akt('pdf_erstellen', { vorlage: 'schreiben', text: ' ' })])).fehler.some((f) => /Text/.test(f)));
  assert.ok(pruefeAblauf(ablauf([akt('pdf_erstellen', { vorlage: 'brief' })])).fehler.some((f) => /Vorlage/.test(f)));
  const ki = pruefeAblauf(ablauf([akt('ki_schritt', { auftrag: 'Text an {{name}}' })]));
  assert.equal(ki.aktivierbar, true);
  assert.ok(ki.hinweise.some((h) => /Entwurf/.test(h) && /AVV/.test(h)));
  const viele = Array.from({ length: MAX_KI_SCHRITTE + 1 }, (_, i) => akt('ki_schritt', { auftrag: 'x' }, 'k' + i));
  assert.ok(pruefeAblauf(ablauf(viele)).fehler.some((f) => /KI-Bausteine/.test(f)));
});

test('Webhook: nur https ins Internet — nie intern, nie eigene Systeme, nie gesperrte Felder', () => {
  assert.equal(pruefeWebhookUrl('https://hooks.n8n-kunde.de/webhook/abc').erlaubt, true);
  for (const u of ['http://hooks.n8n-kunde.de/x', 'https://127.0.0.1/x', 'https://localhost/x', 'https://169.254.169.254/latest', 'https://10.0.0.5/x',
    'https://[::1]/x', 'https://nas/x', 'https://kasse.local/x', 'ftp://a.de/x', 'https://user:pw@a.de/x', 'https://argonaut-os.com/api/x',
    'https://znrjnndfzzydnhbyntwa.supabase.co/rest/v1/x', 'https://irgendwas.vercel.app/x', 'https://srv1133627.hstgr.cloud/forms', '']) {
    assert.equal(pruefeWebhookUrl(u).erlaubt, false, u);
  }
  assert.equal(istEigenerHost('API.Argonaut-OS.com.'), true);
  assert.equal(istEigenerHost('argonaut-os.com.betrug.de'), false);
  assert.ok(pruefeAblauf(ablauf([akt('webhook_senden', { url: 'https://127.0.0.1/x' })])).fehler.some((f) => /internes Netz/.test(f)));
  assert.ok(pruefeAblauf(ablauf([akt('webhook_senden', { url: 'https://a.de/x', felder: 'email, iban' })])).fehler.some((f) => /„iban"/.test(f)));
  assert.ok(pruefeAblauf(ablauf([akt('webhook_senden', { url: 'https://a.de/x', felder: 'e mail' })])).fehler.some((f) => /ungültig/.test(f)));
  const gut = pruefeAblauf(ablauf([akt('webhook_senden', { url: 'https://a.de/x', felder: 'kunde_name' })]));
  assert.equal(gut.aktivierbar, true);
  assert.ok(gut.hinweise.some((h) => /AVV/.test(h)));
  for (const f of ['iban', 'kv_nummer', 'Diagnose', 'steuer_id', 'owner_user_id', 'erstellt_von_name', 'passwort', 'zugang_token']) assert.equal(gesperrtesFeld(f), true, f);
  assert.equal(gesperrtesFeld('email'), false);
  assert.deepEqual(felderListe('a, b;a\n c'), ['a', 'b', 'c']);
});

test('Planen Glocke: Platzhalter eingesetzt, leer = übersprungen, Team', () => {
  const g = plan(akt('glocke', { an: 'team', titel: 'Bezahlt: {{nummer}}', text: '{{name}} hat {{betrag}} bezahlt' }));
  assert.equal(g.art, 'glocke');
  assert.equal(g.an, 'team');
  assert.equal(g.titel, 'Bezahlt: RE-2026-7');
  assert.match(g.text, /^Müller GmbH hat 1\.234,50/);
  assert.equal(plan(akt('glocke', { text: '  ' })).art, 'uebersprungen');
  assert.equal(plan(akt('glocke', { an: 'hacker', text: 'x' })).an, 'chef', 'Unbekannt -> nur Geschäftsleitung');
  assert.match(planText(g), /Glocke an das Team/);
});

test('Planen Termin: Berliner Zeit, Dauer, Kunde verknüpft, keine Kunden-Mails, Besitzer = Betrieb', () => {
  const t = plan(akt('termin_anlegen', { titel: 'Nachgespräch {{name}}', in_tagen: 1, uhrzeit: '09:00', dauer_min: 45, ort: 'Büro' }));
  assert.equal(t.art, 'anlegen');
  assert.equal(t.tabelle, 'termine');
  assert.equal(t.daten.beginn_am, '2026-09-29T07:00:00.000Z', '09:00 Sommerzeit = 07:00 UTC');
  assert.equal(t.daten.ende_am, '2026-09-29T07:45:00.000Z');
  assert.equal(t.daten.titel, 'Nachgespräch Müller GmbH');
  assert.equal(t.daten.kontakt_id, 'k1');
  assert.equal(t.daten.owner_user_id, 'chef1');
  assert.equal(t.daten.quelle, 'ablauf');
  assert.ok(t.daten.bestaetigung_gesendet_am && t.daten.erinnerung_gesendet_am, 'keine Bestätigungs-/Erinnerungs-Mail');
  const k = plan(akt('termin_anlegen', { titel: 'x' }), { id: 'k9', vorname: 'A' }, { tabelle: 'kontakte', zielTyp: 'kontakt', datumFeld: '' });
  assert.equal(k.daten.kontakt_id, 'k9');
  assert.equal(k.daten.ende_am, new Date(new Date(k.daten.beginn_am).getTime() + 3600000).toISOString(), 'Standard 60 Minuten');
  const ohne = aktionPlanen(akt('termin_anlegen', { titel: 'x', dauer_min: 99999 }), { name: 'Z', ausloeser: { art: 'zeitplan', rhythmus: 'taeglich' } }, OHNE_VORGANG, 'chef1', {}, JETZT);
  assert.equal(ohne.daten.kontakt_id, null);
  assert.equal(new Date(ohne.daten.ende_am) - new Date(ohne.daten.beginn_am), 1440 * 60000, 'Dauer gedeckelt');
});

test('Berliner Zeit: Winterzeit und Umstellungstag', () => {
  assert.equal(berlinZeitpunkt(new Date('2026-12-01T10:00:00Z'), 0, '09:00').toISOString(), '2026-12-01T08:00:00.000Z');
  // 25.10.2026 endet die Sommerzeit: Samstag Sommerzeit, Sonntag 09:00 schon Winterzeit
  assert.equal(berlinZeitpunkt(new Date('2026-10-24T10:00:00Z'), 1, '09:00').toISOString(), '2026-10-25T08:00:00.000Z');
  assert.equal(berlinZeitpunkt(new Date('2026-03-28T10:00:00Z'), 1, '09:00').toISOString(), '2026-03-29T07:00:00.000Z');
  // 01:30 am Umstellungstag (noch Winterzeit) — braucht das zweite Nachrechnen
  assert.equal(berlinZeitpunkt(new Date('2026-03-28T10:00:00Z'), 1, '01:30').toISOString(), '2026-03-29T00:30:00.000Z');
  // spät abends UTC = schon nächster Tag in Berlin
  assert.equal(berlinZeitpunkt(new Date('2026-09-28T22:30:00Z'), 0, '08:00').toISOString(), '2026-09-29T06:00:00.000Z');
  assert.equal(berlinZeitpunkt(new Date('2026-09-28T10:00:00Z'), 0, 'quatsch').toISOString(), '2026-09-28T07:00:00.000Z', 'ungültig -> 09:00');
});

test('Planen PDF und KI: Vorgangsblatt nur einfache Werte, KI bekommt nur den Auftrag', () => {
  const v = plan(akt('pdf_erstellen', { vorlage: 'vorgangsblatt', titel: 'Blatt {{nummer}}' }));
  assert.equal(v.art, 'pdf');
  assert.equal(v.titel, 'Blatt RE-2026-7');
  const labels = v.zeilen.map((z) => z[0]);
  assert.ok(labels.includes('Rechnungsnummer') && labels.includes('Betrag'));
  assert.ok(!v.zeilen.some((z) => /DE00|\[object/.test(z[1])), 'keine IBAN, keine Objekte');
  assert.equal(vorgangsblattZeilen({ positionen: [1] }, {}).length, 0);
  assert.equal(vorgangsblattZeilen({ titel: { a: 1 }, status: ['x'] }, {}).length, 0, 'verschachtelte Werte nie aufs Blatt');
  const ohne = aktionPlanen(akt('pdf_erstellen', { vorlage: 'vorgangsblatt' }), { name: 'Z', ausloeser: { art: 'zeitplan', rhythmus: 'taeglich' } }, OHNE_VORGANG, 'chef1', {}, JETZT);
  assert.equal(ohne.art, 'fehler');
  const s = plan(akt('pdf_erstellen', { vorlage: 'schreiben', text: 'Sehr geehrte Damen und Herren,\n\n{{name}}' }));
  assert.equal(s.text, 'Sehr geehrte Damen und Herren,\n\nMüller GmbH');
  assert.equal(plan(akt('pdf_erstellen', { vorlage: 'schreiben', text: '' })).art, 'uebersprungen');
  const k = plan(akt('ki_schritt', { auftrag: 'Dankestext an {{name}} für {{betrag}}' }));
  assert.equal(k.art, 'ki');
  assert.match(k.auftrag, /^Dankestext an Müller GmbH für 1\.234,50/);
  assert.ok(!/DE00|r1/.test(k.auftrag), 'nur der Auftrag, nicht der Datensatz');
  assert.match(k.meldung, /nichts wird verschickt/);
  assert.equal(plan(akt('ki_schritt', { auftrag: ' {{gibtsnicht}} ' })).art, 'uebersprungen', 'leerer Auftrag kostet nichts');
});

test('Planen Webhook: Adresse auch zur Laufzeit geprüft', () => {
  assert.equal(plan(akt('webhook_senden', { url: 'https://127.0.0.1/x' })).art, 'fehler');
  const w = plan(akt('webhook_senden', { url: 'https://Hooks.Beispiel.de/w', felder: 'kunde_name' }));
  assert.equal(w.art, 'webhook');
  assert.equal(w.url, 'https://hooks.beispiel.de/w');
  assert.equal(w.werte.nummer, 'RE-2026-7');
});

test('Nutzlast datensparsam, Unterschrift prüfbar, Schlüssel je Ablauf', () => {
  const n = baueNutzlast({ ablaufId: 'a1', ablaufName: 'T', zielTyp: 'rechnung', zielId: 'r1', satz: SATZ, werte: { nummer: 'RE-2026-7', name: 'Müller GmbH', betrag: '1.234,50 €' }, felder: 'kunde_name, iban, positionen, fehlt', jetzt: JETZT });
  assert.deepEqual(n.felder, { kunde_name: 'Müller GmbH', fehlt: null }, 'iban gesperrt, Objekte nie');
  assert.equal(n.vorgang.nummer, 'RE-2026-7');
  assert.ok(!JSON.stringify(n).includes('DE00'));
  const ohne = baueNutzlast({ ablaufName: 'T', zielTyp: 'ohne', zielId: null, satz: {}, werte: {}, felder: '', jetzt: JETZT });
  assert.equal(ohne.vorgang, null);
  const k1 = webhookSchluessel('a1', 'geheim'), k2 = webhookSchluessel('a2', 'geheim');
  assert.equal(k1.length, 48);
  assert.notEqual(k1, k2);
  assert.notEqual(webhookSchluessel('a1', 'anderes'), k1);
  assert.equal(webhookSchluessel('a1', ''), '', 'ohne Server-Geheimnis kein Schlüssel');
  const inhalt = '{"a":1}';
  assert.equal(signiere(k1, '1759053600', inhalt), createHmac('sha256', k1).update('1759053600.' + inhalt).digest('hex'));
  const kopf = webhookKoepfe(k1, '1759053600', inhalt);
  assert.match(kopf['x-argonaut-signatur'], /^sha256=[0-9a-f]{64}$/);
  assert.equal(kopf['x-argonaut-zeit'], '1759053600');
});

test('PDF-HTML maskiert alles, Pfad bleibt im Betriebs-Ordner', () => {
  const h = ablaufPdfHtml({ vorlage: 'schreiben', titel: '<script>alert(1)</script>', text: 'a<b>\n\nc', zeilen: [], firma: 'X & Y', farbe: 'red;}body{', datum: '28.09.2026' });
  assert.ok(!h.includes('<script>alert'));
  assert.ok(h.includes('&lt;script&gt;'));
  assert.ok(h.includes('X &amp; Y'));
  assert.ok(!h.includes('red;}'), 'ungültige Farbe -> Standard');
  const t = ablaufPdfHtml({ vorlage: 'vorgangsblatt', titel: 'T', text: '', zeilen: [['Kunde', '<i>M</i>']], firma: '', datum: '' });
  assert.ok(t.includes('<th>Kunde</th><td>&lt;i&gt;M&lt;/i&gt;</td>'));
  assert.equal(ablaufPdfPfad('../chef1', 'x/../y', JETZT), 'chef1/2026-09/xy.pdf');
});

test('Senden: aufgelöste Adresse wird geprüft — localhost verbindet nie', async () => {
  const fehler = await new Promise((r) => gepruefterLookup('localhost', {}, (e) => r(e)));
  assert.ok(fehler, 'localhost -> abgewiesen');
  assert.equal(fehler.code, 'EGESPERRT');
  const r = await sendeWebhook('https://localhost:9/x', { 'content-type': 'application/json' }, '{}', 2000);
  assert.equal(r.ok, false);
  assert.match(r.meldung, /interne Netz|nicht auflösbar/);
  assert.equal((await sendeWebhook('http://beispiel.de/x', {}, '{}')).meldung, 'Nur https');
});

test('Code-Wächter: KI nur Entwurf, Webhook nur geprüft, Routen nur Chef, Editor ohne node-Module', () => {
  const aus = lies('lib/ablaufAusfuehren.ts');
  const ki = aus.slice(aus.indexOf('async function kiSchritt'), aus.indexOf('async function webhook'));
  assert.ok(ki.length > 0);
  assert.ok(!/sendeMail|webhook\(|fetch\(/.test(ki), 'KI-Schritt verschickt nichts');
  assert.match(ki, /art: 'entwurf'/);
  const wh = aus.slice(aus.indexOf('async function webhook'));
  assert.match(wh, /sendeWebhook\(plan\.url/);
  assert.match(aus, /if \(plan\.art === 'webhook'\) return webhook\(plan, u\);/);
  const sender = lies('lib/ablaufWebhookSenden.ts');
  assert.match(sender, /lookup: gepruefterLookup/);
  assert.match(sender, /pruefeAufgeloesteIp/);
  assert.match(lies('lib/ablaufKi.ts'), /\}, ownerId\);/, 'Kosten beim Betrieb (Firmen-Topf)');
  assert.match(lies('lib/ki.ts'), /const userId = fuerNutzer \|\| await ermittleUserId\(\)/);
  for (const r of ['app/api/ablaeufe/ergebnis/route.ts', 'app/api/ablaeufe/webhook-schluessel/route.ts']) {
    const c = lies(r);
    assert.match(c, /auth\.getUser\(\)/, r);
    assert.match(c, /owner_user_id !== user\.id/, r);
    assert.ok(!/createAdminClient|SERVICE_ROLE/.test(c), r + ' ohne Service-Schlüssel');
  }
  for (const f of ['lib/ablauf.ts', 'lib/ablaufEditor.ts', 'lib/ablaufWebhookPruefung.ts', 'app/dashboard/ablaeufe/_teile/AblaufEditor.tsx', 'app/dashboard/ablaeufe/page.tsx']) {
    const c = lies(f);
    assert.ok(!/from ['"]node:|from ['"]\.\/ablaufWebhook['"]|ablaufWebhookSenden|ablaufAusfuehren/.test(c), f + ' bleibt browsertauglich');
  }
  const sql = lies('supabase-sql/p167-ablauf-ergebnisse.sql');
  assert.ok(!/drop table|delete from|truncate/i.test(sql), 'additiv');
  assert.match(sql, /'ablauf-dateien', 'ablauf-dateien', false/, 'privater Speicher');
  assert.ok(!/able_ma_|for delete to authenticated using \(owner_user_id/.test(sql), 'Mitarbeiter kein Zugriff, kein Löschen der Ergebnisse');
});
