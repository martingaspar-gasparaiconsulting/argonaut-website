// ============================================================================
// tests/werbungP199.test.mjs — Paket 199 (Entscheidungsrunde Block 2, Teil D + C9)
//   D1 Bestätigungs-Mail für von Hand eingetragene Newsletter-Adressen
//   D3 WhatsApp „Danke, angemeldet" nach der Bestätigung
//   D6 Online-Widerrufe aus dem Shop im Dashboard
//   D7 Bewertungen öffentlich nur „Vorname + Initial"
//   C9 Betriebspost-Knopf auf der Kundenseite (ohne Werbe-Einwilligung)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  pruefeEinwilligungsAngabe, doiNachholenErlaubt, doiNachgeholtAm, angabeAmEintrag, doiNachholenHtml, doiNachholenBetreff,
  datumDe, DOI_MAX_MAILS, DOI_ABSTAND_TAGE, DOI_GRUND_TEXT,
} from '../out/doiNachholen.js';
import { entscheideWerbung } from '../out/werbeErlaubnis.js';
import { dankeNachBestaetigung } from '../out/whatsappBestaetigung.js';
import { oeffentlicherName } from '../out/bewertungName.js';
import { widerrufZuRetoure, widerrufZahlen, sortiereWiderrufe, tagBerlin, istErledigt } from '../out/shopWiderrufe.js';
import { ausloeserIstWerbung, betriebspostWaehlbar, pruefeAblauf, ausloeserText } from '../out/ablauf.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const JETZT = new Date('2026-10-04T12:00:00Z');
const TAG = 86400000;

// ---------------------------------------------------------------- D1
test('D1: Quelle + Datum Pflicht, Datum echt, nicht in der Zukunft', () => {
  assert.equal(pruefeEinwilligungsAngabe('', '2026-09-01', JETZT).ok, false);
  assert.equal(pruefeEinwilligungsAngabe('Mess', '2026-09-01', JETZT).ok, false);
  assert.equal(pruefeEinwilligungsAngabe('Messe Stuttgart', '', JETZT).ok, false);
  assert.equal(pruefeEinwilligungsAngabe('Messe Stuttgart', '2026-02-30', JETZT).ok, false);
  assert.equal(pruefeEinwilligungsAngabe('Messe Stuttgart', '2026-10-05', JETZT).ok, false);
  assert.equal(pruefeEinwilligungsAngabe('Messe Stuttgart', '1999-12-31', JETZT).ok, false);
  const ok = pruefeEinwilligungsAngabe('  Visitenkarte   Messe ', '2026-10-04', JETZT);
  assert.deepEqual(ok, { ok: true, quelle: 'Visitenkarte Messe', datum: '2026-10-04' });
  assert.equal(pruefeEinwilligungsAngabe('x'.repeat(500), '2026-09-01', JETZT).quelle.length, 160);
});

test('D1: wer darf die Bestätigungs-Mail bekommen', () => {
  const basis = { email: 'a@example.com', status: 'aktiv', quelle: 'manuell' };
  assert.equal(doiNachholenErlaubt(basis, true, JETZT), 'ok');
  assert.equal(doiNachholenErlaubt(basis, false, JETZT), 'angabe_fehlt');
  assert.equal(doiNachholenErlaubt({ ...basis, status: 'abgemeldet' }, true, JETZT), 'abgemeldet');
  assert.equal(doiNachholenErlaubt({ ...basis, abgemeldet_am: '2026-01-01' }, true, JETZT), 'abgemeldet');
  assert.equal(doiNachholenErlaubt({ ...basis, quelle: 'opt-in', status: 'unbestaetigt' }, true, JETZT), 'eigene_strecke');
  assert.equal(doiNachholenErlaubt({ ...basis, quelle: 'opt-in', bestaetigt_am: '2026-01-01' }, true, JETZT), 'schon_bestaetigt');
  assert.equal(doiNachholenErlaubt({ ...basis, doi_anzahl: DOI_MAX_MAILS, doi_gesendet_am: '2026-01-01' }, true, JETZT), 'zu_oft');
  const vor3 = new Date(JETZT.getTime() - 3 * TAG).toISOString();
  const vor8 = new Date(JETZT.getTime() - (DOI_ABSTAND_TAGE + 1) * TAG).toISOString();
  assert.equal(doiNachholenErlaubt({ ...basis, status: 'unbestaetigt', doi_anzahl: 1, doi_gesendet_am: vor3 }, true, JETZT), 'zu_frueh');
  assert.equal(doiNachholenErlaubt({ ...basis, status: 'unbestaetigt', doi_anzahl: 1, doi_gesendet_am: vor8 }, true, JETZT), 'ok');
  assert.ok(DOI_GRUND_TEXT.zu_oft.includes('2'));
});

test('D1: nachgeholte Bestätigung zählt nur nach dem Versand und schlägt keinen späteren Widerspruch', () => {
  const abo = { email: 'a@example.com', status: 'aktiv', quelle: 'manuell', doi_gesendet_am: '2026-09-01T10:00:00Z', bestaetigt_am: '2026-09-01T11:00:00Z' };
  assert.equal(doiNachgeholtAm(abo), Date.parse('2026-09-01T11:00:00Z'));
  assert.equal(doiNachgeholtAm({ ...abo, bestaetigt_am: '2026-09-01T09:00:00Z' }), null);
  assert.equal(doiNachgeholtAm({ ...abo, doi_gesendet_am: null }), null);
  assert.equal(doiNachgeholtAm({ ...abo, status: 'unbestaetigt' }), null);
  // Werbe-Entscheidung: manuell ohne Bestätigung = nein, mit nachgeholter = ja
  const f = (a, sperren = []) => ({ sperren, kontakte: [], abos: [a] });
  assert.equal(entscheideWerbung('a@example.com', f({ ...abo, doi_gesendet_am: null })).erlaubt, false);
  assert.equal(entscheideWerbung('a@example.com', f(abo)).erlaubt, true);
  assert.equal(entscheideWerbung('a@example.com', f(abo, [{ email: 'a@example.com', am: '2026-09-05T00:00:00Z' }])).erlaubt, false);
  assert.equal(entscheideWerbung('a@example.com', f(abo, [{ email: 'a@example.com', am: '2026-08-01T00:00:00Z' }])).erlaubt, true);
});

test('D1: Angabe am Eintrag und Mail ohne Werbung, Eingaben maskiert', () => {
  assert.equal(angabeAmEintrag({ einwilligung_quelle: 'Messe Stuttgart', einwilligung_am: '2026-09-01' }), true);
  assert.equal(angabeAmEintrag({ einwilligung_quelle: 'Messe Stuttgart', einwilligung_am: null }), false);
  assert.equal(datumDe('2026-09-01'), '01.09.2026');
  const html = doiNachholenHtml({ firma: 'Elektro <Huber>', url: 'https://argonaut-os.com/x?t=1&a=2', quelle: 'Messe "Stuttgart"', datum: '2026-09-01', name: 'Maria' });
  assert.ok(html.includes('Elektro &lt;Huber&gt;'));
  assert.ok(html.includes('Messe &quot;Stuttgart&quot;'));
  assert.ok(html.includes('am 01.09.2026'));
  assert.ok(html.includes('https://argonaut-os.com/x?t=1&amp;a=2'));
  assert.ok(html.includes('Guten Tag Maria,'));
  assert.ok(!/rabatt|angebot|aktion|%/i.test(html.replace(/width=device-width|100%/g, '')), 'keine Werbung in der Bestätigungs-Mail');
  assert.ok(doiNachholenBetreff('Elektro Huber').includes('Elektro Huber'));
});

test('D1: Route prüft Modulrecht, Widerspruch, Deckel und schreibt nur mit Server-Schlüssel', () => {
  const r = lies('app/api/newsletter/doi-nachholen/route.ts');
  assert.ok(r.includes("modulRechtPruefen(supabase, user?.id ?? null, 'marketing', 'aendern')"));
  assert.ok(r.includes(".eq('owner_user_id', betrieb)"));
  assert.ok(r.includes("grund === 'widersprochen'"));
  assert.ok(r.includes('DOI_TAGESDECKEL'));
  assert.ok(r.includes('doi_anzahl.is.null,doi_anzahl.eq.0'), 'Doppelklick-Schutz');
  assert.ok(r.includes('kundenPost: true'));
  const seite = lies('app/dashboard/marketing/newsletter/page.tsx');
  assert.ok(!seite.includes('>Reaktivieren<'), 'Reaktivieren ist entfallen');
  assert.ok(!seite.includes("statusSetzen(a, 'aktiv')"));
  assert.ok(seite.includes('/api/newsletter/doi-nachholen'));
  assert.ok(!/update\(\{[^}]*status:\s*neu,\s*abgemeldet_am:\s*neu === 'abgemeldet'/.test(seite));
});

// ---------------------------------------------------------------- D3
test('D3: Danke-Nachricht nach WhatsApp-Bestätigung, nur bei frischer Aktivierung', () => {
  const t = dankeNachBestaetigung('  Elektro   Huber ');
  assert.ok(t.startsWith('Danke, Sie sind jetzt angemeldet bei Elektro Huber.'));
  assert.ok(t.includes('STOP'));
  assert.ok(dankeNachBestaetigung('').startsWith('Danke, Sie sind jetzt angemeldet.'));
  const w = lies('app/api/whatsapp/webhook/route.ts');
  assert.ok(w.includes(".neq('status', 'aktiv')\n          .select('id');"));
  assert.ok(w.includes('aktiviert.length > 0'));
  assert.ok(w.includes('await dankeSenden('));
  assert.ok(w.includes("richtung: 'aus'"));
});

// ---------------------------------------------------------------- D6
test('D6: Online-Widerrufe zählen, sortieren, in Retoure übernehmen', () => {
  const liste = [
    { id: '1', name: 'A', eingang_am: '2026-10-01T10:00:00Z', erledigt_am: null },
    { id: '2', name: 'B', eingang_am: '2026-09-01T10:00:00Z', erledigt_am: null },
    { id: '3', name: 'C', eingang_am: '2026-09-15T10:00:00Z', erledigt_am: '2026-09-16T10:00:00Z' },
    { id: '4', name: 'D', eingang_am: '2026-09-20T10:00:00Z', erledigt_am: '2026-09-21T10:00:00Z' },
  ];
  assert.deepEqual(widerrufZahlen(liste), { offen: 2, erledigt: 2 });
  assert.deepEqual(sortiereWiderrufe(liste).map((w) => w.id), ['2', '1', '4', '3']);
  assert.equal(istErledigt(liste[2]), true);
  assert.equal(tagBerlin('2026-10-03T22:30:00Z'), '2026-10-04', 'kurz nach Mitternacht Berlin = neuer Tag');
  const v = widerrufZuRetoure({ id: 'x', name: ' Maria  Muster ', email: 'm@example.com', bestellung: 'B-17', eingang_am: '2026-10-03T22:30:00Z', ware: 'Stuhl', anschrift: null, datum: null, erledigt_am: null });
  assert.deepEqual(v, { art: 'widerruf', kunde_name: 'Maria Muster', email: 'm@example.com', bestellnummer: 'B-17', widerruf_am: '2026-10-04', grund_hinweis: 'Stuhl' });
  const seite = lies('app/dashboard/shop/retouren/page.tsx');
  assert.ok(seite.includes("from('shop_widerrufe')"));
  assert.ok(seite.includes('Als Retoure übernehmen'));
});

// ---------------------------------------------------------------- D7
test('D7: öffentlicher Name nur Vorname + Initial, Firmen bleiben', () => {
  assert.equal(oeffentlicherName('Maria Mustermann'), 'Maria M.');
  assert.equal(oeffentlicherName('Dr. Hans-Peter von Berg'), 'Hans-Peter B.');
  assert.equal(oeffentlicherName('Herr Jürgen Özdemir'), 'Jürgen Ö.');
  assert.equal(oeffentlicherName('Mustermann, Maria'), 'Maria M.');
  assert.equal(oeffentlicherName('Maria'), 'Maria');
  assert.equal(oeffentlicherName(''), 'Kunde');
  assert.equal(oeffentlicherName(null), 'Kunde');
  assert.equal(oeffentlicherName('Frau'), 'Kunde');
  assert.equal(oeffentlicherName('Elektro Huber GmbH'), 'Elektro Huber GmbH');
  assert.equal(oeffentlicherName('Bäckerei Maier e.K.'), 'Bäckerei Maier e.K.');
  const r = lies('app/api/oeffentlich/bewertungen/route.ts');
  assert.ok(r.includes('name: oeffentlicherName(r.kunde_name)'));
  assert.ok(!r.includes("(r.kunde_name || 'Kunde').toString()"));
});

// ---------------------------------------------------------------- C9
test('C9: Betriebspost nur beim Kunden-Knopf, sonst bleibt Werbung', () => {
  const kunde = { art: 'knopf', modul: 'kontakte' };
  assert.equal(ausloeserIstWerbung(kunde), true, 'Befund C9: ohne Häkchen blockiert');
  assert.equal(ausloeserIstWerbung({ ...kunde, betriebspost: true }), false);
  assert.equal(betriebspostWaehlbar(kunde), true);
  assert.equal(betriebspostWaehlbar({ art: 'knopf', modul: 'leads' }), false);
  assert.equal(betriebspostWaehlbar({ art: 'knopf' }), false);
  assert.equal(ausloeserIstWerbung({ art: 'knopf', betriebspost: true }), true, 'ohne Modul keine Betriebspost');
  assert.equal(ausloeserIstWerbung({ art: 'ereignis', ereignis: 'kontakt_angelegt', betriebspost: true }), true);
  assert.equal(ausloeserIstWerbung({ art: 'knopf', modul: 'unbekannt', betriebspost: true }), true);
  const schritt = [{ id: 's1', typ: 'aktion', aktion: 'mail_senden', config: { an: 'kontakt', betreff: 'Unterlagen', text: 'Anbei' } }];
  const p = pruefeAblauf({ name: 'Unterlagen', ausloeser: { ...kunde, betriebspost: true }, schritte: schritt, aktiv: true });
  assert.ok(p.hinweise.some((h) => h.includes('Betriebspost')));
  const falsch = pruefeAblauf({ name: 'X', ausloeser: { art: 'knopf', modul: 'leads', betriebspost: true }, schritte: schritt, aktiv: true });
  assert.ok(falsch.fehler.some((f) => f.includes('Betriebspost')));
  assert.ok(ausloeserText({ ...kunde, betriebspost: true }).includes('(Betriebspost)'));
  const ed = lies('app/dashboard/ablaeufe/_teile/AblaufEditor.tsx');
  assert.ok(ed.includes('betriebspostWaehlbar(e.ausloeser)'));
  assert.equal((ed.match(/x\.ausloeser\.betriebspost/g) ?? []).length >= 2, true, 'Modul- und Mitarbeiter-Wechsel behalten das Häkchen');
});

// ---------------------------------------------------------------- SQL
test('SQL p199: additiv, Nachweis fest, Server frei, werbe_fakten nur Server', () => {
  const s = lies('supabase-sql/p199-werbung-nachweis.sql');
  assert.ok(!/\bdrop\s+table\b|\bdelete\s+from\b|\btruncate\b/i.test(s));
  assert.equal((s.match(/add column if not exists/g) ?? []).length, 5);
  assert.ok(s.includes("if coalesce(auth.role(), '') = 'service_role' then\n    return new;"));
  assert.ok(s.includes('new.bestaetigt_am := old.bestaetigt_am;'));
  assert.ok(s.includes("'doi_gesendet_am', a.doi_gesendet_am"));
  assert.ok(s.includes('revoke all on function public.werbe_fakten(uuid, text[]) from authenticated;'));
  assert.ok(s.includes("darf_ich_modul_aendern('shop')"));
  assert.ok(s.includes('new.erledigt_von := auth.uid();'));
  assert.ok(s.includes('zwei_faktor_fehlt'));
});
