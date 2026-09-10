// ============================================================================
// ARGONAUT OS · tests/mailSmtp.test.mjs
//
// Hier wird im Namen eines Betriebs über SEIN Postfach verschickt. Zwei Dinge
// dürfen deshalb nie schiefgehen:
//
//   · Kein Empfänger darf sich einschmuggeln. Ein Zeilenumbruch in einer
//     Kopfzeile ist der klassische Weg dafür (Header-Injection).
//   · Kein Massenversand über ein Kundenpostfach. IONOS und Strato sperren
//     das Konto — nicht unseres, sondern das des Kunden.
//
// Dazu die Kleinigkeiten, die man erst merkt, wenn ein Kunde sich beschwert:
// „Re: Re: Re:“ im Betreff und eine Mail ganz ohne Textteil.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_EMPFAENGER,
  STANDARD_SMTP_PORT,
  TLS_PORT,
  smtpHostAusImap,
  smtpHost,
  smtpPort,
  istImplizitesTls,
  gueltigeAdresse,
  kopfSicher,
  baueVon,
  leseEmpfaenger,
  baueBetreff,
  antwortBetreff,
  textAusHtml,
  zitiere,
  baueAntwortText,
  pruefeVersand,
} from '../out/mailSmtp.js';

// --- 1) Server und Port -----------------------------------------------------

test('aus dem IMAP-Server wird der Versand-Server', () => {
  assert.equal(smtpHostAusImap('imap.ionos.de'), 'smtp.ionos.de');
  assert.equal(smtpHostAusImap('IMAP.Strato.DE'), 'smtp.strato.de');
  assert.equal(smtpHostAusImap('imap.gmail.com'), 'smtp.gmail.com');
});

test('ein Server ohne „imap.“ bleibt, wie er ist', () => {
  // mail.firma.de macht bei vielen kleinen Anbietern beides.
  assert.equal(smtpHostAusImap('mail.firma.de'), 'mail.firma.de');
  assert.equal(smtpHostAusImap('post.example.org'), 'post.example.org');
});

test('kein IMAP-Server, kein geratener Versand-Server', () => {
  assert.equal(smtpHostAusImap(''), '');
  assert.equal(smtpHostAusImap(null), '');
  assert.equal(smtpHostAusImap(undefined), '');
});

test('ein eingetragener Server schlägt den geratenen', () => {
  assert.equal(smtpHost('smtp.eigener.de', 'imap.ionos.de'), 'smtp.eigener.de');
  assert.equal(smtpHost('', 'imap.ionos.de'), 'smtp.ionos.de');
  assert.equal(smtpHost('   ', 'imap.ionos.de'), 'smtp.ionos.de');
});

test('der Port ist im Zweifel 587', () => {
  assert.equal(smtpPort(undefined), STANDARD_SMTP_PORT);
  assert.equal(smtpPort(''), STANDARD_SMTP_PORT);
  assert.equal(smtpPort('unsinn'), STANDARD_SMTP_PORT);
  assert.equal(smtpPort(0), STANDARD_SMTP_PORT);
  assert.equal(smtpPort(99999), STANDARD_SMTP_PORT);
  assert.equal(smtpPort('465'), 465);
  assert.equal(smtpPort(25), 25);
});

test('nur 465 wird von Anfang an verschlüsselt', () => {
  // Auf 587 muss `secure: false` stehen — sonst wartet der Verbindungsaufbau
  // ins Leere, bis der Zeitgeber zuschlägt. Das ist der Fehler, den man erst
  // nach zwanzig Sekunden Warten als solchen erkennt.
  assert.equal(istImplizitesTls(TLS_PORT), true);
  assert.equal(istImplizitesTls(587), false);
  assert.equal(istImplizitesTls(25), false);
  assert.equal(istImplizitesTls(undefined), false);
});

// --- 2) Kopfzeilen: hier wird nichts eingeschmuggelt ------------------------

test('Zeilenumbrüche fliegen aus jeder Kopfzeile', () => {
  assert.equal(kopfSicher('Max\r\nBcc: heimlich@example.com'), 'Max Bcc: heimlich@example.com');
  assert.equal(kopfSicher('a\nb\tc'), 'a b c');
});

test('ein untergeschobener Empfänger überlebt den Absenderbau nicht', () => {
  const von = baueVon('Max\r\nBcc: heimlich@example.com', 'max@firma.de');
  assert.ok(!von.includes('\n'), 'kein Zeilenumbruch');
  assert.ok(!von.includes('\r'), 'kein Wagenrücklauf');
  assert.ok(von.endsWith('<max@firma.de>'), 'die echte Adresse bleibt der Absender');
});

test('der Absender ohne Name ist nur die Adresse', () => {
  assert.equal(baueVon('', 'max@firma.de'), 'max@firma.de');
  assert.equal(baueVon('   ', 'max@firma.de'), 'max@firma.de');
  assert.equal(baueVon('Muster Bau', 'info@muster-bau.de'), '"Muster Bau" <info@muster-bau.de>');
});

test('ohne gültige Adresse gibt es keinen Absender', () => {
  assert.equal(baueVon('Max', 'keine-adresse'), '');
  assert.equal(baueVon('Max', ''), '');
  assert.equal(baueVon('Max', null), '');
});

test('Anführungszeichen und spitze Klammern im Namen werden entfernt', () => {
  const von = baueVon('Fir"ma <boese@example.com>', 'echt@firma.de');
  assert.equal(von, '"Firma boese@example.com" <echt@firma.de>');
});

// --- 3) Empfänger: die Grenze zum Massenversand -----------------------------

test('Empfänger werden gelesen, egal wie getrennt', () => {
  assert.deepEqual(leseEmpfaenger('a@x.de, b@x.de; c@x.de'), ['a@x.de', 'b@x.de', 'c@x.de']);
  assert.deepEqual(leseEmpfaenger(['a@x.de', 'b@x.de']), ['a@x.de', 'b@x.de']);
});

test('Ungültiges fällt weg, statt den Versand zu sprengen', () => {
  assert.deepEqual(leseEmpfaenger('a@x.de, kaputt, @x.de, b@x.de'), ['a@x.de', 'b@x.de']);
});

test('dieselbe Adresse bekommt die Mail nur einmal', () => {
  assert.deepEqual(leseEmpfaenger('a@x.de, A@X.de, a@x.de'), ['a@x.de']);
});

test('bei fünf Empfängern ist Schluss', () => {
  const viele = Array.from({ length: 40 }, (_, i) => `p${i}@x.de`).join(',');
  assert.equal(leseEmpfaenger(viele).length, MAX_EMPFAENGER);
});

test('leere Eingaben ergeben eine leere Liste, keinen Absturz', () => {
  assert.deepEqual(leseEmpfaenger(''), []);
  assert.deepEqual(leseEmpfaenger(null), []);
  assert.deepEqual(leseEmpfaenger(undefined), []);
  assert.deepEqual(leseEmpfaenger([]), []);
});

test('eine Adresse mit Komma darin ist keine Adresse', () => {
  assert.equal(gueltigeAdresse('a,b@x.de'), false);
  assert.equal(gueltigeAdresse('a@x.de'), true);
  assert.equal(gueltigeAdresse('a@x'), false);
  assert.equal(gueltigeAdresse('  a@x.de  '), true);
});

// --- 4) Betreff -------------------------------------------------------------

test('ein leerer Betreff wird benannt, nicht weggelassen', () => {
  assert.equal(baueBetreff(''), '(kein Betreff)');
  assert.equal(baueBetreff('   '), '(kein Betreff)');
});

test('der Betreff wird gekürzt statt abgeschnitten zu platzen', () => {
  assert.equal(baueBetreff('x'.repeat(500)).length, 200);
});

test('„Re:“ steht genau einmal davor', () => {
  assert.equal(antwortBetreff('Angebot'), 'Re: Angebot');
  assert.equal(antwortBetreff('Re: Angebot'), 'Re: Angebot');
  assert.equal(antwortBetreff('RE: re: Re: Angebot'), 'Re: Angebot');
});

test('auch die Formen anderer Programme werden erkannt', () => {
  assert.equal(antwortBetreff('AW: Angebot'), 'Re: Angebot');
  assert.equal(antwortBetreff('Re[2]: Angebot'), 'Re: Angebot');
  assert.equal(antwortBetreff('AW: Re: Antwort: Angebot'), 'Re: Angebot');
});

test('ein Betreff, der nur aus Re: besteht, bleibt benutzbar', () => {
  assert.equal(antwortBetreff('Re:'), 'Re: (kein Betreff)');
});

// --- 5) Der Textteil --------------------------------------------------------

test('aus HTML wird lesbarer Text', () => {
  const t = textAusHtml('<p>Guten Tag,</p><p>hier ist Ihr <b>Angebot</b>.</p>');
  assert.equal(t, 'Guten Tag,\n\nhier ist Ihr Angebot.');
});

test('Skript und Stil landen nicht im Textteil', () => {
  const t = textAusHtml('<p>Hallo</p><script>alert(1)</script><style>p{color:red}</style>');
  assert.equal(t, 'Hallo');
});

test('Zeilenumbrüche und Listen überleben die Umwandlung', () => {
  const t = textAusHtml('Zeile1<br>Zeile2<ul><li>eins</li><li>zwei</li></ul>');
  assert.ok(t.includes('Zeile1\nZeile2'));
  assert.ok(t.includes('· eins'));
  assert.ok(t.includes('· zwei'));
});

test('Sonderzeichen kommen zurück, nicht als &amp;', () => {
  assert.equal(textAusHtml('Meier &amp; Söhne &lt;GmbH&gt;'), 'Meier & Söhne <GmbH>');
});

// --- 6) Das Zitat in der Antwort -------------------------------------------

test('das Zitat trägt vor jeder Zeile ein „>“', () => {
  const z = zitiere('Erste Zeile\nZweite Zeile', 'Kunde Müller', '2026-09-09T14:30:00Z');
  const zeilen = z.split('\n');
  assert.ok(zeilen[0].includes('Kunde Müller'));
  assert.ok(zeilen[1].startsWith('> '));
  assert.ok(zeilen[2].startsWith('> '));
});

test('eine Leerzeile im Zitat bleibt eine Leerzeile mit „>“', () => {
  const z = zitiere('oben\n\nunten', 'Wer', null);
  assert.ok(z.includes('\n>\n'), 'die leere Zeile trägt nur das Zeichen');
});

test('ohne Datum steht trotzdem eine saubere Kopfzeile', () => {
  const z = zitiere('Text', 'Kunde Müller', 'unsinn');
  assert.ok(z.startsWith('Kunde Müller schrieb:'));
});

test('ohne Text gibt es kein Zitat', () => {
  assert.equal(zitiere('', 'Wer', null), '');
  assert.equal(zitiere(null, 'Wer', null), '');
});

test('der eigene Text steht oben, das Zitat darunter', () => {
  const fertig = baueAntwortText('Gerne, passt bei uns.', '> Frage?');
  assert.ok(fertig.startsWith('Gerne, passt bei uns.'));
  assert.ok(fertig.endsWith('> Frage?'));
  assert.ok(fertig.includes('\n\n'), 'dazwischen eine Leerzeile');
});

test('ohne Zitat bleibt nur der eigene Text', () => {
  assert.equal(baueAntwortText('Nur das hier.', ''), 'Nur das hier.');
});

// --- 7) Die Prüfung vor dem Versand -----------------------------------------

const OK = {
  von: '"Muster Bau" <info@muster-bau.de>',
  an: ['kunde@x.de'],
  betreff: 'Ihr Angebot',
  text: 'Guten Tag …',
  host: 'smtp.ionos.de',
  port: 587,
  sicher: false,
};

test('eine vollständige Nachricht darf raus', () => {
  assert.deepEqual(pruefeVersand(OK), []);
});

test('alle Fehler kommen auf einmal, nicht einer nach dem anderen', () => {
  const fehler = pruefeVersand({ von: '', an: [], betreff: '', text: '', host: '' });
  assert.ok(fehler.length >= 4, `erwartet mindestens 4 Meldungen, bekommen: ${fehler.length}`);
});

test('ohne Versand-Server geht nichts raus', () => {
  const fehler = pruefeVersand({ ...OK, host: '' });
  assert.equal(fehler.length, 1);
  assert.ok(fehler[0].includes('Versand-Server'));
});

test('zu viele Empfänger werden abgewiesen', () => {
  const fehler = pruefeVersand({ ...OK, an: Array.from({ length: 9 }, (_, i) => `p${i}@x.de`) });
  assert.equal(fehler.length, 1);
  assert.ok(fehler[0].includes('Newsletter'), 'der Hinweis nennt den richtigen Weg');
});

test('eine leere Nachricht geht nicht raus', () => {
  const fehler = pruefeVersand({ ...OK, text: '   ' });
  assert.equal(fehler.length, 1);
  assert.ok(fehler[0].includes('leer'));
});

test('null und undefined werfen nicht', () => {
  assert.ok(pruefeVersand(null).length > 0);
  assert.ok(pruefeVersand(undefined).length > 0);
});
