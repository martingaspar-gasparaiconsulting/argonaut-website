// ============================================================================
// tests/whatsappBestaetigungP183.test.mjs — Paket 183: WhatsApp-Anmeldung
// erst aktiv, wenn die Person selbst per WhatsApp bestätigt; STOP meldet ab.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  baueBestaetigungsCode, anmeldeNachricht, waMeLink, eingangAuswerten,
  bestaetigungNochGueltig, bestaetigungPasst, kontaktStatusText, manuellerNachweis,
  CODE_ZEICHEN, CODE_LAENGE,
} from '../out/whatsappBestaetigung.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const JETZT = new Date('2026-09-30T22:00:00Z');

test('Code: 6 Zeichen, nur eindeutige Zeichen (kein 0/O/1/I/L)', () => {
  for (let i = 0; i < 200; i++) {
    const c = baueBestaetigungsCode();
    assert.equal(c.length, CODE_LAENGE);
    for (const z of c) assert.ok(CODE_ZEICHEN.includes(z), z);
  }
  assert.ok(!/[01OIL]/.test(CODE_ZEICHEN));
  assert.equal(baueBestaetigungsCode(() => 0), 'AAAAAA');
  assert.equal(baueBestaetigungsCode(() => 0.99999).length, 6);
});

test('wa.me-Link: nur Ziffern, + und 00 und nationale 0 richtig, Text kodiert', () => {
  assert.equal(waMeLink('+49 170 1234567', 'ANMELDEN AB12CD'), 'https://wa.me/491701234567?text=ANMELDEN%20AB12CD');
  assert.equal(waMeLink('0049 170 1234567', 'x'), 'https://wa.me/491701234567?text=x');
  assert.equal(waMeLink('0170 1234567', 'x'), 'https://wa.me/491701234567?text=x');
  assert.equal(waMeLink('', 'x'), '');
  assert.equal(waMeLink('12', 'x'), '');
  assert.equal(anmeldeNachricht('ab12cd'), 'ANMELDEN AB12CD');
});

test('Eingang: ANMELDEN mit Code wird erkannt (Groß/Klein, Satzzeichen, ohne Leerzeichen)', () => {
  assert.deepEqual(eingangAuswerten('ANMELDEN AB23CD'), { art: 'bestaetigung', code: 'AB23CD' });
  assert.deepEqual(eingangAuswerten('  anmelden ab23cd! '), { art: 'bestaetigung', code: 'AB23CD' });
  assert.deepEqual(eingangAuswerten('Anmelden: AB23CD.'), { art: 'bestaetigung', code: 'AB23CD' });
  assert.deepEqual(eingangAuswerten('ANMELDENAB23CD'), { art: 'bestaetigung', code: 'AB23CD' });
  assert.equal(eingangAuswerten('Hallo, ich möchte mich anmelden AB23CD bitte'), null);
  assert.equal(eingangAuswerten('ANMELDEN AB2'), null);
  assert.equal(eingangAuswerten(''), null);
  assert.equal(eingangAuswerten(null), null);
});

test('Eingang: STOP nur als ganze Nachricht — nicht mitten im Satz', () => {
  for (const t of ['STOP', 'stop', 'Stop.', 'STOPP', 'Abmelden', 'abbestellen!', 'unsubscribe']) {
    assert.deepEqual(eingangAuswerten(t), { art: 'stop' }, t);
  }
  for (const t of ['Ich kann das nicht stoppen', 'stop bitte nicht', 'Bus-Stop morgen?']) {
    assert.equal(eingangAuswerten(t), null, t);
  }
});

test('Gültigkeit 7 Tage; Code muss stimmen; aktiv bleibt aktiv; abgemeldet darf sich selbst wieder anmelden', () => {
  const vor1 = new Date(JETZT.getTime() - 24 * 3600e3).toISOString();
  const vor8 = new Date(JETZT.getTime() - 8 * 24 * 3600e3).toISOString();
  assert.equal(bestaetigungNochGueltig(vor1, JETZT), true);
  assert.equal(bestaetigungNochGueltig(vor8, JETZT), false);
  assert.equal(bestaetigungNochGueltig(null, JETZT), false);
  assert.equal(bestaetigungNochGueltig('quatsch', JETZT), false);

  const k = { status: 'unbekannt', bestaetigungs_code: 'AB23CD', bestaetigung_angefragt_am: vor1 };
  assert.equal(bestaetigungPasst(k, 'AB23CD', JETZT), true);
  assert.equal(bestaetigungPasst(k, 'ab23cd', JETZT), true);
  assert.equal(bestaetigungPasst(k, 'XX23CD', JETZT), false);
  assert.equal(bestaetigungPasst({ ...k, bestaetigung_angefragt_am: vor8 }, 'AB23CD', JETZT), false);
  assert.equal(bestaetigungPasst({ ...k, bestaetigungs_code: null }, 'AB23CD', JETZT), false);
  assert.equal(bestaetigungPasst({ ...k, status: 'aktiv' }, 'AB23CD', JETZT), false);
  assert.equal(bestaetigungPasst({ ...k, status: 'abgemeldet' }, 'AB23CD', JETZT), true);
  assert.equal(bestaetigungPasst(null, 'AB23CD', JETZT), false);
});

test('Anzeige: Aktiv / Wartet / Abgemeldet / Nur Gespräch (vorher stand „Abgemeldet" auch bei Schreibenden)', () => {
  assert.equal(kontaktStatusText({ status: 'aktiv' }), 'Aktiv');
  assert.equal(kontaktStatusText({ status: 'unbekannt', wartet: true }), 'Wartet auf Bestätigung');
  assert.equal(kontaktStatusText({ status: 'abgemeldet', wartet: true }), 'Wartet auf Bestätigung');
  assert.equal(kontaktStatusText({ status: 'abgemeldet' }), 'Abgemeldet');
  assert.equal(kontaktStatusText({ status: 'unbekannt' }), 'Nur Gespräch');
});

test('Manuell: nur mit Häkchen UND Angabe, wo die Einwilligung vorliegt', () => {
  assert.equal(manuellerNachweis(false, 'Auftragsformular 12.09.').ok, false);
  assert.equal(manuellerNachweis('true', 'Auftragsformular 12.09.').ok, false);
  assert.equal(manuellerNachweis(true, '  ab ').ok, false);
  const r = manuellerNachweis(true, 'Auftragsformular vom 12.09.2026');
  assert.equal(r.ok, true);
  assert.match(r.text, /Auftragsformular vom 12\.09\.2026/);
});

test('WÄCHTER Formular: setzt nie „aktiv" und nie eine Einwilligung — nur Code + Zeitpunkt', () => {
  const s = ohneKommentare(lies('app/api/oeffentlich/whatsapp-optin/route.ts'));
  assert.ok(!/status:\s*'aktiv'/.test(s), 'Formular darf nicht aktiv setzen');
  assert.ok(!/einwilligung_am/.test(s), 'Formular darf keine Einwilligung eintragen');
  assert.match(s, /bestaetigungs_code:\s*code/);
  assert.match(s, /status:\s*'unbekannt'/);
  assert.match(s, /whatsapp_absender/);
  assert.match(s, /app_secret_verschluesselt/);
});

test('WÄCHTER Webhook: Bestätigung/STOP erst NACH der Signaturprüfung, nur mit bestaetigungPasst', () => {
  const s = ohneKommentare(lies('app/api/whatsapp/webhook/route.ts'));
  const sig = s.indexOf('signaturGueltig(roh');
  const ausw = s.indexOf('eingangAuswerten(');
  assert.ok(sig > 0 && ausw > sig, 'Auswertung muss nach der Signatur stehen');
  assert.match(s, /bestaetigungPasst\(k, absicht\.code\)/);
  assert.match(s, /status:\s*'abgemeldet'/);
  assert.match(s, /bestaetigung_nachweis:\s*n\.providerId/);
  // Aktiv setzen kommt genau einmal vor — im Bestätigungszweig.
  assert.equal((s.match(/status:\s*'aktiv'/g) || []).length, 1);
});

test('WÄCHTER Empfänger: Code geht nie an den Browser, manuell braucht Nachweis', () => {
  const s = ohneKommentare(lies('app/api/marketing/whatsapp-kontakte/route.ts'));
  assert.match(s, /delete rest\.bestaetigungs_code/);
  assert.match(s, /manuellerNachweis\(body\.einwilligungBestaetigt, body\.einwilligungNachweis\)/);
  assert.ok(!/die Einwilligung liegt dem Betrieb vor\.'/.test(s));
  const seite = lies('app/dashboard/marketing/whatsapp/empfaenger/page.tsx');
  assert.match(seite, /kontaktStatusText\(k\)/);
  assert.match(seite, /einwilligungNachweis/);
});

test('WÄCHTER Anmeldeseite: kein „Angemeldet!" mehr nach dem Formular, sondern Bestätigungsschritt', () => {
  const s = lies('app/whatsapp-anmelden/[slug]/page.tsx');
  assert.ok(!s.includes('Angemeldet!'));
  assert.match(s, /WhatsApp öffnen und senden/);
  assert.match(s, /bestaetigung\.nachricht/);
});
