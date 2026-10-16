// Paket VK6 (16.10.2026): Gespraechsergebnis nach dem Verkaufsgespraech
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ERGEBNISSE, EINWAENDE, ergebnisPruefen, neueLeadStufe, auswerten, istErgebnis, einwandLabel,
} from '../out/gespraechErgebnis.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const JETZT = new Date('2026-10-16T12:00:00Z');

test('Ergebnisse und Einwaende stimmen mit der Datenbank-Regel ueberein', () => {
  const sql = lies('supabase-sql/p414-gespraech-ergebnis.sql');
  const erg = /ergebnis in \(([^)]+)\)/.exec(sql)[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  assert.deepEqual(erg, ERGEBNISSE.map((e) => e.key));
  const ein = /einwand in \(([^)]+)\)/.exec(sql)[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  assert.deepEqual(ein, EINWAENDE.map((e) => e.key));
  assert.ok(istErgebnis('offen') && !istErgebnis('gewonnen'));
});

test('Abgeschlossen: Betrag Pflicht, deutsche Schreibweise in Cent, Anzahlung nicht hoeher', () => {
  assert.equal(ergebnisPruefen({ ergebnis: 'abgeschlossen' }, JETZT).ok, false);
  assert.equal(ergebnisPruefen({ ergebnis: 'abgeschlossen', vereinbart: '0' }, JETZT).ok, false);
  const r = ergebnisPruefen({ ergebnis: 'abgeschlossen', vereinbart: '12.500,50 €', anzahlung: '2.500' }, JETZT);
  assert.ok(r.ok);
  assert.equal(r.wert.vereinbart_cent, 1250050);
  assert.equal(r.wert.anzahlung_cent, 250000);
  const z = ergebnisPruefen({ ergebnis: 'abgeschlossen', vereinbart: '1.000', anzahlung: '1.000,01' }, JETZT);
  assert.equal(z.ok, false);
  assert.match(z.fehler.join(' '), /Anzahlung ist höher/);
  const x = ergebnisPruefen({ ergebnis: 'abgeschlossen', vereinbart: 'zwölftausend' }, JETZT);
  assert.equal(x.ok, false);
  assert.match(x.fehler.join(' '), /nicht lesbar/);
  assert.equal(ergebnisPruefen({ ergebnis: 'abgeschlossen', vereinbart: '-5' }, JETZT).ok, false);
  const neg = ergebnisPruefen({ ergebnis: 'offen', naechster_schritt: 'x', anzahlung: '-5' }, JETZT);
  assert.equal(neg.ok, false, 'negative Anzahlung');
  assert.match(neg.fehler.join(' '), /Anzahlung ist nicht lesbar/);
});

test('Kein Abschluss braucht den Haupteinwand; Sonstiges braucht Text', () => {
  assert.equal(ergebnisPruefen({ ergebnis: 'verloren' }, JETZT).ok, false);
  assert.equal(ergebnisPruefen({ ergebnis: 'verloren', einwand: 'sonstiges' }, JETZT).ok, false);
  const r = ergebnisPruefen({ ergebnis: 'verloren', einwand: 'preis', einwand_text: ' zu teuer im Vergleich ' }, JETZT);
  assert.ok(r.ok);
  assert.equal(r.wert.einwand_text, 'zu teuer im Vergleich');
  assert.equal(ergebnisPruefen({ ergebnis: 'verloren', einwand: 'quatsch' }, JETZT).ok, false);
  assert.equal(ergebnisPruefen({ ergebnis: 'offen', einwand_text: 'x', naechster_schritt: 'a' }, JETZT).wert.einwand_text, null, 'Text ohne Einwand faellt weg');
});

test('Noch offen braucht naechsten Schritt oder Folgetermin, Folgetermin nicht in der Vergangenheit', () => {
  assert.equal(ergebnisPruefen({ ergebnis: 'offen' }, JETZT).ok, false);
  assert.ok(ergebnisPruefen({ ergebnis: 'offen', naechster_schritt: 'Angebot schicken' }, JETZT).ok);
  assert.ok(ergebnisPruefen({ ergebnis: 'offen', folgetermin_am: '2026-10-20T08:00:00Z' }, JETZT).ok);
  const alt = ergebnisPruefen({ ergebnis: 'offen', folgetermin_am: '2026-10-10T08:00:00Z' }, JETZT);
  assert.equal(alt.ok, false);
  assert.match(alt.fehler.join(' '), /Vergangenheit/);
  assert.equal(ergebnisPruefen({ ergebnis: 'offen', folgetermin_am: 'morgen' }, JETZT).ok, false);
});

test('Nicht erschienen: Betraege, Angebot und Einwand fallen weg (wie der Datenbank-Check)', () => {
  const r = ergebnisPruefen({ ergebnis: 'nicht_erschienen', angeboten: true, vereinbart: '500', einwand: 'preis' }, JETZT);
  assert.ok(r.ok);
  assert.equal(r.wert.angeboten, false);
  assert.equal(r.wert.vereinbart_cent, null);
  assert.equal(r.wert.einwand, null);
  assert.match(lies('supabase-sql/p414-gespraech-ergebnis.sql'), /ergebnis <> 'nicht_erschienen' or \(vereinbart_cent is null and anzahlung_cent is null and not angeboten\)/);
  assert.equal(ergebnisPruefen({}, JETZT).ok, false);
});

test('Lead-Stufe: nie zurueck, Kunde bleibt Kunde, verloren kann Kunde werden', () => {
  assert.equal(neueLeadStufe('termin_gebucht', 'abgeschlossen'), 'kunde');
  assert.equal(neueLeadStufe('termin_gebucht', 'offen'), 'termin_gehalten');
  assert.equal(neueLeadStufe('termin_gehalten', 'offen'), null);
  assert.equal(neueLeadStufe('kunde', 'offen'), null);
  assert.equal(neueLeadStufe('kunde', 'verloren'), null);
  assert.equal(neueLeadStufe('eintragung', 'verloren'), 'verloren');
  assert.equal(neueLeadStufe('verloren', 'abgeschlossen'), 'kunde');
  assert.equal(neueLeadStufe('verloren', 'offen'), null);
  assert.equal(neueLeadStufe('termin_gebucht', 'nicht_erschienen'), null);
  assert.equal(neueLeadStufe(null, 'abgeschlossen'), 'kunde');
});

test('Auswertung: Quote ohne Nicht-Erschienene, Geld nur aus Abschluessen, Einwaende absteigend', () => {
  const a = auswerten([
    { ergebnis: 'abgeschlossen', vereinbart_cent: 1000000, anzahlung_cent: 200000, angeboten: true },
    { ergebnis: 'abgeschlossen', vereinbart_cent: 500000, angeboten: true },
    { ergebnis: 'verloren', einwand: 'preis', angeboten: true, vereinbart_cent: 999 },
    { ergebnis: 'verloren', einwand: 'preis' },
    { ergebnis: 'offen', einwand: 'partner' },
    { ergebnis: 'nicht_erschienen' },
    { ergebnis: 'kaputt' },
  ]);
  assert.equal(a.gespraeche, 5);
  assert.equal(a.nichtErschienen, 1);
  assert.equal(a.abgeschlossen, 2);
  assert.equal(a.quote, 40);
  assert.equal(a.angeboten, 3);
  assert.equal(a.vereinbartCent, 1500000);
  assert.equal(a.anzahlungCent, 200000);
  assert.deepEqual(a.einwaende.map((e) => [e.key, e.anzahl]), [['preis', 2], ['partner', 1]]);
  assert.equal(auswerten([]).quote, null);
  assert.equal(einwandLabel('preis'), 'Zu teuer / Preis');
});

test('Route und Datenbank: Anmeldung zuerst, nur Nutzer-Client, Waechter hart', () => {
  const r = lies('app/api/gespraech-ergebnis/route.ts');
  assert.ok(r.indexOf('nurAngemeldet()') < r.indexOf('createClient()'));
  assert.doesNotMatch(r, /supabase-admin|SERVICE_ROLE/);
  assert.match(r, /ergebnisPruefen\(/);
  assert.match(r, /neueLeadStufe\(lead\.stufe/);
  const sql = lies('supabase-sql/p414-gespraech-ergebnis.sql');
  assert.match(sql, /new\.owner_user_id := old\.owner_user_id; new\.lead_id := old\.lead_id;/);
  assert.match(sql, /anzahlung_cent <= vereinbart_cent/);
  assert.match(sql, /for delete to authenticated using \(auth\.uid\(\) = owner_user_id\)/);
  assert.match(lies('lib/gespraechErgebnis.ts'), /from '\.\/zahlen'/, 'Geld nur ueber lib/zahlen');
});

test('Teil 2: Uebergabe nur aus Abschluss, jedes Ziel nur einmal', async () => {
  const { uebergabePruefen, istUebergabeZiel } = await import('../out/gespraechErgebnis.js');
  assert.match(uebergabePruefen({ ergebnis: 'offen' }, 'auftrag'), /abgeschlossenes/);
  assert.equal(uebergabePruefen({ ergebnis: 'abgeschlossen' }, 'auftrag'), null);
  assert.match(uebergabePruefen({ ergebnis: 'abgeschlossen', auftrag_id: 'x' }, 'auftrag'), /schon angelegt/);
  assert.equal(uebergabePruefen({ ergebnis: 'abgeschlossen', auftrag_id: 'x' }, 'projekt'), null);
  assert.match(uebergabePruefen({ ergebnis: 'abgeschlossen', projekt_id: 'x' }, 'projekt'), /schon angelegt/);
  assert.match(uebergabePruefen({ ergebnis: 'abgeschlossen', portal_mail_am: '2026-10-16' }, 'portal'), /schon verschickt/);
  assert.ok(istUebergabeZiel('portal') && !istUebergabeZiel('rechnung'));
});

test('Teil 2: Titel, Notiz und Willkommens-Text', async () => {
  const { umsetzungTitel, uebergabeNotiz, willkommensText } = await import('../out/gespraechErgebnis.js');
  assert.equal(umsetzungTitel('Auftrag', 'Familie Huber', 'Badsanierung'), 'Auftrag Familie Huber – Badsanierung');
  assert.equal(umsetzungTitel('Projekt', '', ''), 'Projekt aus Verkaufsgespräch');
  assert.equal(umsetzungTitel('Auftrag', 'x'.repeat(300), '').length <= 160, true);
  const n = uebergabeNotiz({ gespraech_am: '2026-10-16T22:30:00Z', vereinbart_cent: 1250050, anzahlung_cent: 250000 });
  assert.equal(n, 'Verkaufsgespräch vom 17.10.2026 · vereinbart 12.500,50 € · angezahlt 2.500,00 €', 'Berliner Tag (00:30 am 17.)');
  assert.equal(uebergabeNotiz({}), '');
  const w = willkommensText('Müller Bad GmbH', true);
  assert.equal(w.betreff, 'Willkommen bei Müller Bad GmbH');
  const alles = w.absaetze.join(' ');
  assert.match(alles, /Ihre/);
  assert.doesNotMatch(alles, /\b(du|dein|dich|dir)\b/i);
  assert.match(alles, /nicht weiter/, 'Hinweis: Link nicht weitergeben');
});

test('Teil 2: Auswertung je Closer sortiert nach Abschluessen', async () => {
  const { jeCloser } = await import('../out/gespraechErgebnis.js');
  const r = jeCloser([
    { ergebnis: 'verloren', einwand: 'preis', closer_user_id: 'a' },
    { ergebnis: 'abgeschlossen', vereinbart_cent: 100, closer_user_id: 'b' },
    { ergebnis: 'abgeschlossen', vereinbart_cent: 200, closer_user_id: 'b' },
    { ergebnis: 'offen', closer_user_id: null },
  ]);
  assert.deepEqual(r.map((x) => x.closer), ['b', 'a', 'ohne']);
  assert.equal(r[0].auswertung.vereinbartCent, 300);
  assert.equal(r[0].auswertung.quote, 100);
});

test('Teil 2: Route — Anmeldung zuerst, Rechte-Probe vor dem Anlegen, Mail erst nach Markierung, Dienst-Rolle nur fuers Branding', () => {
  const r = lies('app/api/gespraech-weiter/route.ts');
  assert.ok(r.indexOf('nurAngemeldet()') < r.indexOf('createClient()'));
  assert.ok(r.indexOf('uebergabePruefen(g, ziel)') < r.indexOf(".from('auftraege')"));
  assert.ok(r.indexOf('const { data: darf }') < r.indexOf(".from('auftraege')"));
  const markiert = r.indexOf(".is('portal_mail_am', null)");
  assert.ok(markiert > 0 && markiert < r.indexOf('sendeMail({'), 'erst markieren, dann senden');
  assert.equal((r.match(/createAdminClient\(\)/g) || []).length, 1);
  assert.match(r, /absenderBranding\(createAdminClient\(\), g\.owner_user_id\)/);
  assert.match(r, /portal_mail_am: null/, 'bei Mailfehler zuruecknehmen');
  assert.doesNotMatch(r, /auftrag_positionen|rechnungen/, 'keine Preise/Rechnungen anlegen');
  const box = lies('app/dashboard/leads/[id]/GespraechBox.tsx');
  assert.match(box, /window\.confirm\(/);
  assert.match(box, /!ohneGeld \|\| e\.key !== 'abgeschlossen'/);
});
