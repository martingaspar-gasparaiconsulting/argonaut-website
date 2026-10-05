// ============================================================================
// tests/absenderDomainP210.test.mjs — Paket 210 (Stufe 3 · B7 eigene Absender-Domain)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  domainPruefen, lokalteilPruefen, statusAusResend, dnsZeilen, darfNutzen, absenderAdresse,
  fromKopf, fehlerWegenDomain, eigeneDomainsAn, pruefenErlaubt, statusText, ARGONAUT_DOMAIN,
} from '../out/absenderDomain.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Domain: Eingaben werden bereinigt, Unsinn abgewiesen', () => {
  assert.deepEqual(domainPruefen('https://www.Mueller-Elektro.de/kontakt'), { ok: true, domain: 'www.mueller-elektro.de' });
  assert.deepEqual(domainPruefen('post.mueller-elektro.de.'), { ok: true, domain: 'post.mueller-elektro.de' });
  assert.deepEqual(domainPruefen('info@firma.de'), { ok: true, domain: 'firma.de' });
  assert.equal(domainPruefen('').ok, false);
  assert.equal(domainPruefen('localhost').ok, false);
  assert.equal(domainPruefen('192.168.0.1').ok, false);
  assert.equal(domainPruefen('müller.de').ok, false);
  assert.equal(domainPruefen('-firma.de').ok, false);
  assert.equal(domainPruefen('firma.d3').ok, false);
  assert.equal(domainPruefen('xn--mller-kva.de').ok, true);
});

test('Domain: ARGONAUT und Freemail nie als Betriebs-Domain', () => {
  assert.equal(domainPruefen(ARGONAUT_DOMAIN).ok, false);
  assert.equal(domainPruefen('kunde.argonaut-os.com').ok, false);
  for (const d of ['gmail.com', 'gmx.de', 'web.de', 't-online.de', 'mail.gmx.net']) assert.equal(domainPruefen(d).ok, false, d);
  assert.equal(domainPruefen('nicht-argonaut-os.com').ok, true);
});

test('Lokalteil', () => {
  assert.deepEqual(lokalteilPruefen(''), { ok: true, lokalteil: 'post' });
  assert.deepEqual(lokalteilPruefen(' Rechnung '), { ok: true, lokalteil: 'rechnung' });
  assert.equal(lokalteilPruefen('info.team').ok, true);
  for (const x of ['a..b', '.a', 'a.', 'a b', 'a@b', 'ä', 'x'.repeat(65), 'a"b']) assert.equal(lokalteilPruefen(x).ok, false, x);
});

test('Resend-Status', () => {
  assert.equal(statusAusResend('verified'), 'verifiziert');
  assert.equal(statusAusResend('pending'), 'wartet');
  assert.equal(statusAusResend('not_started'), 'wartet');
  assert.equal(statusAusResend('partially_verified'), 'wartet');
  assert.equal(statusAusResend('failed'), 'fehler');
  assert.equal(statusAusResend('partially_failed'), 'fehler');
  assert.equal(statusAusResend(undefined), 'wartet');
});

test('DNS-Zeilen: nur Versand-Einträge, DMARC-Empfehlung dazu', () => {
  const z = dnsZeilen([
    { record: 'SPF', name: 'send.post', type: 'MX', value: 'feedback-smtp.eu-west-1.amazonses.com', priority: 10, status: 'verified', ttl: 'Auto' },
    { record: 'SPF', name: 'send.post', type: 'TXT', value: 'v=spf1 include:amazonses.com ~all', status: 'pending', ttl: 'Auto' },
    { record: 'DKIM', name: 'resend._domainkey.post', type: 'TXT', value: 'p=MIGf', status: 'failed', ttl: 'Auto' },
    { record: 'Receiving', name: 'post', type: 'MX', value: 'inbound', status: 'pending' },
    { record: 'DKIM', name: '', type: 'TXT', value: 'x' },
  ], 'post.firma.de');
  assert.equal(z.length, 4);
  assert.deepEqual(z.map((x) => [x.art, x.status]), [['MX', 'ok'], ['SPF', 'wartet'], ['DKIM', 'fehler'], ['DMARC', 'empfohlen']]);
  assert.equal(z[0].prioritaet, 10);
  assert.equal(z[3].name, '_dmarc.post.firma.de');
  assert.deepEqual(dnsZeilen(null, 'x.de'), []);
});

test('Nutzen nur, wenn bestätigt UND eingeschaltet', () => {
  const z = { domain: 'post.firma.de', lokalteil: 'rechnung', status: 'verifiziert', aktiv: true };
  assert.equal(darfNutzen(z), true);
  assert.equal(absenderAdresse(z), 'rechnung@post.firma.de');
  assert.equal(absenderAdresse({ ...z, aktiv: false }), null);
  assert.equal(absenderAdresse({ ...z, status: 'wartet' }), null);
  assert.equal(absenderAdresse({ ...z, status: 'entfernt' }), null);
  assert.equal(absenderAdresse({ ...z, domain: 'argonaut-os.com' }), null);
  assert.equal(absenderAdresse({ ...z, lokalteil: 'a b' }), null);
  assert.equal(absenderAdresse(null), null);
});

test('From-Kopf ohne Kopfzeilen-Tricks', () => {
  assert.equal(fromKopf('Müller <Elektro>\r\nBcc: x', 'post@firma.de', 'ARGONAUT OS'), 'Müller ElektroBcc: x <post@firma.de>');
  assert.equal(fromKopf('', 'noreply@argonaut-os.com', 'ARGONAUT OS'), 'ARGONAUT OS <noreply@argonaut-os.com>');
});

test('Rückfall nur bei Domain-Fehlern', () => {
  assert.equal(fehlerWegenDomain('The post.firma.de domain is not verified. Please, add and verify your domain'), true);
  assert.equal(fehlerWegenDomain('Domain not found'), true);
  assert.equal(fehlerWegenDomain('Invalid `to` field.'), false);
  assert.equal(fehlerWegenDomain('You have reached your daily email sending quota'), false);
  assert.equal(fehlerWegenDomain(''), false);
});

test('Schalter, Prüf-Abstand, Status-Text', () => {
  assert.equal(eigeneDomainsAn({ RESEND_EIGENE_DOMAINS: 'an' }), true);
  assert.equal(eigeneDomainsAn({ RESEND_EIGENE_DOMAINS: 'AN ' }), true);
  assert.equal(eigeneDomainsAn({ RESEND_EIGENE_DOMAINS: 'ja' }), false);
  assert.equal(eigeneDomainsAn({}), false);
  const jetzt = new Date('2026-10-05T12:00:00Z');
  assert.equal(pruefenErlaubt(null, jetzt), true);
  assert.equal(pruefenErlaubt('2026-10-05T11:59:30Z', jetzt), false);
  assert.equal(pruefenErlaubt('2026-10-05T11:59:00Z', jetzt), true);
  assert.match(statusText(null), /noreply@argonaut-os\.com/);
  assert.match(statusText({ domain: 'a.de', lokalteil: 'post', status: 'verifiziert', aktiv: true }), /Aktiv: post@a\.de/);
  assert.match(statusText({ domain: 'a.de', status: 'wartet' }), /DNS/);
});

test('Verdrahtung: sendeMail nutzt die Domain mit Rückfall, Aufrufer geben den Betrieb mit', () => {
  const mail = lies('lib/mail.ts');
  assert.match(mail, /absenderFuerBetrieb\(eingang\.betriebId\)/);
  assert.match(mail, /fehlerWegenDomain\(error\.message\)/);
  assert.match(mail, /await sende\(null\)/);
  assert.match(mail, /betriebId: userId/);
  const aufrufer = [
    'app/api/rechnung-senden/route.ts', 'app/api/termin-bestaetigung/route.ts', 'app/api/termin-erinnerung/route.ts',
    'app/api/newsletter-versand/route.ts', 'app/api/newsletter-ab-test/route.ts', 'app/api/bewertung-senden/route.ts',
    'app/api/cron/automationen/route.ts', 'app/api/cron/webinar/route.ts', 'lib/ablaufAusfuehren.ts', 'lib/autoresponderVersand.ts',
    'app/api/oeffentlich/buchung/route.ts', 'app/api/oeffentlich/freebie/route.ts', 'app/api/leads/angebot-senden/route.ts',
  ];
  for (const f of aufrufer) assert.match(lies(f), /betriebId:/, f);
  const admin = lies('app/api/admin/absender-domain/route.ts');
  assert.match(admin, /betreiberPruefung\(\)/);
  assert.match(admin, /eigeneDomainsAn\(process\.env\)/);
  assert.match(admin, /alt\.status !== 'verifiziert'/);
  const kunde = lies('app/api/absender-domain/route.ts');
  assert.match(kunde, /'mitarbeiter'/);
  assert.doesNotMatch(kunde, /resendDomainAnlegen|aktiv: true/);
  const sql = lies('supabase-sql/p210-absender-domain.sql');
  assert.match(sql, /check \(not aktiv or status = 'verifiziert'\)/);
  assert.match(sql, /revoke all on public\.absender_domain from anon, authenticated/);
  assert.match(sql, /p164s3_aal/);
});
