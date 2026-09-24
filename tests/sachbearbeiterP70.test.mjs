// Paket PA (24.09.2026) — KI-Sachbearbeiter: B01 Posteingang, B07 Behoerdenbrief, B15 Bewertungen.
// Geprueft wird, was die DATEI garantiert — nicht, was die KI schreibt.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTEN, artFuer, leseDatum, heuteIso, tageZwischen, plusTage,
  leseKiJson, leseErgebnis, aufgabeAus, vorgangZeile, saubererEntwurf,
  nutzerTextMail, MAX_MAILTEXT, systemPost, nutzerTextBewertung,
  pruefeBewertungsAntwort, HINWEIS_KEINE_BERATUNG, VORLAUF_TAGE,
} from '../out/sachbearbeiter.js';

// 24.09.2026, 10 Uhr deutscher Zeit
const JETZT = new Date('2026-09-24T08:00:00Z');
const ki = (o) => JSON.stringify(o);

// --- Katalog ----------------------------------------------------------------

test('jede Art hat einen eindeutigen Schluessel', () => {
  const s = ARTEN.map((a) => a.schluessel);
  assert.equal(new Set(s).size, s.length);
  assert.ok(s.includes('sonstiges'));
});

test('unbekannte Art wird "sonstiges", nie undefined', () => {
  assert.equal(artFuer('steuerbetrug').schluessel, 'sonstiges');
  assert.equal(artFuer(undefined).schluessel, 'sonstiges');
  assert.equal(artFuer(' Behoerde ').schluessel, 'behoerde', 'Leerzeichen und Grossschreibung stoeren nicht');
  assert.equal(artFuer('behörde').schluessel, 'sonstiges', 'mit Umlaut ist es kein Schluessel des Katalogs');
  assert.equal(artFuer('behoerde').schluessel, 'behoerde');
  assert.equal(artFuer('REKLAMATION').schluessel, 'reklamation');
});

test('Werbung, Rechnung, Mahnung, Lieferant bekommen KEINEN Antwortentwurf', () => {
  for (const k of ['werbung', 'rechnung', 'mahnung', 'lieferant', 'behoerde']) {
    assert.equal(artFuer(k).antworten, false, k);
  }
});

// --- Datum ------------------------------------------------------------------

test('Datum: ISO und deutsche Schreibweise werden gelesen', () => {
  assert.equal(leseDatum('2026-10-15'), '2026-10-15');
  assert.equal(leseDatum('15.10.2026'), '2026-10-15');
  assert.equal(leseDatum('5.1.27'), '2027-01-05');
  assert.equal(leseDatum('2026-1-5'), '2026-01-05');
});

test('Datum: Unsinn ergibt null — kein erfundenes Datum', () => {
  assert.equal(leseDatum('31.02.2026'), null);
  assert.equal(leseDatum('2026-13-01'), null);
  assert.equal(leseDatum('in vier Wochen'), null);
  assert.equal(leseDatum('10/15/2026'), null);
  assert.equal(leseDatum(''), null);
  assert.equal(leseDatum(null), null);
  assert.equal(leseDatum('01.01.1990'), null, 'eine Frist liegt nicht im letzten Jahrhundert');
});

test('heute wird in deutscher Zeit bestimmt, nicht in UTC', () => {
  // 23:30 Uhr deutscher Zeit am 24.09. ist in UTC noch 21:30 — und umgekehrt
  // 00:30 Uhr am 25.09. ist in UTC noch der 24.
  assert.equal(heuteIso(new Date('2026-09-24T22:30:00Z')), '2026-09-25');
  assert.equal(heuteIso(new Date('2026-09-24T21:30:00Z')), '2026-09-24');
});

test('Tagesrechnung ueber den Monatswechsel', () => {
  assert.equal(tageZwischen('2026-09-24', '2026-10-01'), 7);
  assert.equal(plusTage('2026-10-02', -3), '2026-09-29');
  assert.equal(plusTage('2026-03-01', -1), '2026-02-28');
});

// --- KI-Antwort lesen ------------------------------------------------------

test('JSON wird auch mit Zaun, Vorrede und Nachklapp gefunden', () => {
  assert.deepEqual(leseKiJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(leseKiJson('Hier ist das Ergebnis: {"a":{"b":2}} Viel Erfolg! }'), { a: { b: 2 } });
  assert.equal(leseKiJson('kein json'), null);
  assert.equal(leseKiJson('[1,2]'), null);
});

test('unlesbare KI-Antwort: nichts wird uebernommen, lauter Hinweis', () => {
  const e = leseErgebnis('Entschuldigung, das kann ich nicht.', JETZT);
  assert.equal(e.art.schluessel, 'sonstiges');
  assert.equal(e.frist, null);
  assert.equal(e.betrag, null);
  assert.equal(e.antwortEntwurf, '');
  assert.ok(e.hinweise.some((h) => /fehlgeschlagen/.test(h)));
});

test('Behoerdenbrief: Frist, Betrag, Aktenzeichen, Beratungs-Hinweis', () => {
  const e = leseErgebnis(ki({
    art: 'behoerde', absender: 'Finanzamt Böblingen',
    zusammenfassung: 'Das Finanzamt will 1.234,56 Euro Umsatzsteuer nachgezahlt haben.',
    was_tun: 'Bescheid prüfen, zahlen oder Einspruch einlegen.',
    frist: '2026-10-26', frist_text: 'bis 26.10.2026', betrag: '1.234,56 €', aktenzeichen: '56001/12345',
    antwort: 'Sehr geehrte Damen und Herren …',
  }), JETZT, 'brief');
  assert.equal(e.art.schluessel, 'behoerde');
  assert.equal(e.frist, '2026-10-26');
  assert.equal(e.betrag, 1234.56);
  assert.equal(e.aktenzeichen, '56001/12345');
  assert.equal(e.antwortEntwurf, '', 'auf einen Brief wird nie schnell geantwortet');
  assert.ok(e.hinweise.includes(HINWEIS_KEINE_BERATUNG));
  assert.equal(e.dringlichkeit, 'normal', '32 Tage Luft');
});

test('relative Frist: KEIN Datum, aber Wortlaut und rote Dringlichkeit', () => {
  const e = leseErgebnis(ki({
    art: 'behoerde', zusammenfassung: 'Bescheid.', frist: null,
    frist_text: 'innerhalb eines Monats nach Bekanntgabe',
  }), JETZT, 'brief');
  assert.equal(e.frist, null);
  assert.equal(e.fristText, 'innerhalb eines Monats nach Bekanntgabe');
  assert.equal(e.dringlichkeit, 'hoch');
  assert.ok(e.hinweise.some((h) => /nicht als Datum lesbar/.test(h)));
});

test('erfundenes Datum der KI (31.02.) wird NICHT uebernommen', () => {
  const e = leseErgebnis(ki({ art: 'behoerde', zusammenfassung: 'x', frist: '2026-02-31' }), JETZT, 'brief');
  assert.equal(e.frist, null);
  assert.equal(e.dringlichkeit, 'hoch');
});

test('abgelaufene Frist: hoch und ausdruecklicher Hinweis', () => {
  const e = leseErgebnis(ki({ art: 'mahnung', zusammenfassung: 'x', frist: '2026-09-10' }), JETZT);
  assert.equal(e.dringlichkeit, 'hoch');
  assert.ok(e.hinweise.some((h) => /Vergangenheit/.test(h)));
});

test('Dringlichkeit kommt aus der Frist, nicht aus der Meinung der KI', () => {
  const nah = leseErgebnis(ki({ art: 'anfrage', zusammenfassung: 'x', frist: '2026-09-30', dringlichkeit: 'normal' }), JETZT);
  assert.equal(nah.dringlichkeit, 'hoch');
  const mittel = leseErgebnis(ki({ art: 'anfrage', zusammenfassung: 'x', frist: '2026-10-10' }), JETZT);
  assert.equal(mittel.dringlichkeit, 'mittel');
  const reklamation = leseErgebnis(ki({ art: 'reklamation', zusammenfassung: 'x' }), JETZT);
  assert.equal(reklamation.dringlichkeit, 'mittel', 'eine Reklamation ist nie "normal"');
});

test('unlesbarer Betrag wird null, NIE 0', () => {
  const e = leseErgebnis(ki({ art: 'rechnung', zusammenfassung: 'x', betrag: 'siehe Anlage' }), JETZT);
  assert.equal(e.betrag, null);
  assert.ok(e.hinweise.some((h) => /Betrag nicht sicher lesbar/.test(h)));
  const zahl = leseErgebnis(ki({ art: 'rechnung', zusammenfassung: 'x', betrag: 89.9 }), JETZT);
  assert.equal(zahl.betrag, 89.9);
  const leer = leseErgebnis(ki({ art: 'anfrage', zusammenfassung: 'x', betrag: null }), JETZT);
  assert.equal(leer.betrag, null);
  assert.equal(leer.hinweise.length, 0);
});

test('Mail-Anfrage bekommt einen sauberen Entwurf ohne Markdown und ohne Betreffzeile', () => {
  const e = leseErgebnis(ki({
    art: 'anfrage', zusammenfassung: 'Frau Maier möchte ein Angebot für ein Bad.',
    antwort: 'Betreff: Ihre Anfrage\n\n**Sehr geehrte Frau Maier,**\n\nvielen Dank …',
  }), JETZT, 'mail');
  assert.equal(e.antwortEntwurf.startsWith('Sehr geehrte Frau Maier,'), true);
  assert.ok(!e.antwortEntwurf.includes('**'));
});

test('Werbung bekommt keinen Entwurf, auch wenn die KI einen schreibt', () => {
  const e = leseErgebnis(ki({ art: 'werbung', zusammenfassung: 'Newsletter', antwort: 'Danke für den Newsletter!' }), JETZT, 'mail');
  assert.equal(e.antwortEntwurf, '');
});

test('Entwurf, der eine KI erwaehnt, bekommt einen Warnhinweis', () => {
  const e = leseErgebnis(ki({ art: 'anfrage', zusammenfassung: 'x', antwort: 'Als KI-Assistent kann ich …' }), JETZT, 'mail');
  assert.ok(e.hinweise.some((h) => /KI/.test(h)));
});

test('Bewerbung: Datenschutz-Hinweis, und die KI bewertet nicht', () => {
  const e = leseErgebnis(ki({ art: 'bewerbung', zusammenfassung: 'Bewerbung als Geselle.', antwort: 'Vielen Dank für Ihre Bewerbung …' }), JETZT, 'mail');
  assert.ok(e.hinweise.some((h) => /schützenswerte/.test(h)));
  assert.match(systemPost('mail', ''), /niemals eine Einschätzung der Person/);
});

// --- Aufgabe und Vorgang -----------------------------------------------------

test('Aufgabe wird VORLAUF_TAGE vor der Frist faellig', () => {
  const e = leseErgebnis(ki({ art: 'behoerde', zusammenfassung: 'Bescheid', frist: '2026-10-26', aktenzeichen: 'AZ 1' }), JETZT, 'brief');
  const a = aufgabeAus(e, 'Umsatzsteuerbescheid 2025', JETZT);
  assert.equal(VORLAUF_TAGE, 3);
  assert.equal(a.faellig_am, '2026-10-23');
  assert.match(a.titel, /^Behörde \/ Amt: Umsatzsteuerbescheid 2025/);
  assert.match(a.beschreibung, /Frist: 26\.10\.2026/);
  assert.match(a.beschreibung, /Aktenzeichen: AZ 1/);
  assert.equal(a.prioritaet, 'normal');
});

test('Aufgabe ist nie schon beim Anlegen ueberfaellig', () => {
  const e = leseErgebnis(ki({ art: 'mahnung', zusammenfassung: 'x', frist: '2026-09-25' }), JETZT);
  assert.equal(aufgabeAus(e, 'Mahnung', JETZT).faellig_am, '2026-09-24');
  assert.equal(aufgabeAus(e, 'Mahnung', JETZT).prioritaet, 'hoch');
});

test('ohne lesbare Frist: kein Faelligkeitsdatum, aber der Wortlaut steht drin', () => {
  const e = leseErgebnis(ki({ art: 'behoerde', zusammenfassung: 'x', frist_text: 'binnen 14 Tagen' }), JETZT, 'brief');
  const a = aufgabeAus(e, '', JETZT);
  assert.equal(a.faellig_am, null);
  assert.match(a.beschreibung, /binnen 14 Tagen \(nicht als Datum lesbar\)/);
  assert.equal(a.prioritaet, 'hoch');
});

test('Betrag erscheint in der Aufgabe in deutscher Schreibweise', () => {
  const e = leseErgebnis(ki({ art: 'behoerde', zusammenfassung: 'x', betrag: 1234.5 }), JETZT, 'brief');
  assert.match(aufgabeAus(e, 'x', JETZT).beschreibung, /Betrag: 1\.234,50 EUR/);
});

test('Vorgang-Zeile passt zur Tabelle post_vorgang', () => {
  const e = leseErgebnis(ki({ art: 'reklamation', zusammenfassung: 'Fliese gesprungen', absender: 'Herr Kurz' }), JETZT, 'mail');
  const z = vorgangZeile(e, 'mail', 'Reklamation Bad', { mailUid: 42, mailOrdner: 'INBOX' });
  assert.deepEqual(Object.keys(z).sort(), [
    'absender', 'aktenzeichen', 'art', 'betrag', 'betreff', 'dringlichkeit', 'frist', 'frist_text',
    'mail_ordner', 'mail_uid', 'quelle', 'status', 'was_tun', 'zusammenfassung',
  ]);
  assert.equal(z.art, 'reklamation');
  assert.equal(z.status, 'offen');
  assert.equal(z.mail_uid, 42);
  assert.equal(z.was_tun, null);
});

// --- Prompt-Bausteine ------------------------------------------------------

test('Mailtext wird gekuerzt und das wird der KI gesagt', () => {
  const t = nutzerTextMail({ betreff: 'Test', von: 'a@b.de', text: 'x'.repeat(MAX_MAILTEXT + 500) });
  assert.ok(t.length < MAX_MAILTEXT + 200);
  assert.match(t, /\[Nachricht gekürzt\]/);
  const kurz = nutzerTextMail({ betreff: '', von: '', text: 'Hallo' });
  assert.match(kurz, /^Betreff: \(kein Betreff\)\nVon: unbekannt\n\nHallo$/);
});

test('Brief-Prompt verbietet ausgerechnete Fristen und Antworten', () => {
  const s = systemPost('brief', 'Maler Muster');
  assert.match(s, /Niemals ein Datum selbst ausrechnen/);
  assert.match(s, /antwort: immer ein leerer String/);
  assert.match(s, /„Maler Muster"/);
});

// --- B15 Bewertungen -------------------------------------------------------

test('Bewertungs-Frage: Sterne nur 1 bis 5', () => {
  assert.match(nutzerTextBewertung({ sterne: 2, text: 'Zu spät gekommen' }), /Sterne: 2 von 5/);
  assert.match(nutzerTextBewertung({ sterne: 9, text: '' }), /Sterne: unbekannt/);
  assert.match(nutzerTextBewertung({ sterne: 5 }), /ohne Text — nur Sterne/);
});

test('Bewertungs-Antwort: Preis, Nummer und KI werden angemahnt', () => {
  const r = pruefeBewertungsAntwort('Danke! Die 450 € waren fair. Rufen Sie an: 07031 123456. Ihre künstliche Intelligenz');
  assert.equal(r.hinweise.length, 3);
  const sauber = pruefeBewertungsAntwort('Vielen Dank für Ihre freundliche Bewertung. Wir freuen uns, dass Sie seit 2019 zufrieden sind.');
  assert.deepEqual(sauber.hinweise, [], 'eine Jahreszahl ist keine Telefonnummer');
});

test('Entwurf wird von Markdown und Vorrede befreit', () => {
  assert.equal(saubererEntwurf('Hier ist Ihr Entwurf:\n## Danke\n**Vielen Dank**'), 'Danke\nVielen Dank');
  assert.equal(saubererEntwurf(null), '');
});
