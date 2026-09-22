// ARGONAUT OS · tests/werbemailP68.test.mjs — Punkt 68 (22.09.2026)
// Werbe-Mails: List-Unsubscribe-Kopfzeilen, Fuss NUR bei Werbung,
// Waechter gegen eine Werbemail ohne Fuss.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  werbeKopfzeilen, werbeFuss, werbeMailPruefen,
  abmeldeLinkGueltig, abmeldeMailGueltig,
  FUSS_WIDERSPRUCH, FUSS_ABMELDE_TEXT,
} from '../out/werbemail.js';

const LINK = 'https://www.argonaut-os.com/api/newsletter/abmelden?token=abc123';

// ---------------------------------------------------------------------------
// 1. DIE KOPFZEILEN
// ---------------------------------------------------------------------------

test('eine Werbe-Mail bekommt List-Unsubscribe', () => {
  const k = werbeKopfzeilen(LINK);
  assert.equal(k['List-Unsubscribe'], `<${LINK}>`);
});

test('die Mailadresse kommt vor den Link, wenn sie taugt', () => {
  const k = werbeKopfzeilen(LINK, { abmeldeMail: 'abmelden@betrieb.de' });
  assert.equal(k['List-Unsubscribe'], `<mailto:abmelden@betrieb.de?subject=unsubscribe>, <${LINK}>`);
});

test('DER GEFAEHRLICHE FALL: Ein-Klick nur auf ausdrueckliche Ansage', () => {
  // Ohne POST-Handler an der Abmelde-Adresse wuerde der Anbieter den
  // Empfaenger fuer sich abmelden und ARGONAUT wuesste nichts davon.
  assert.equal(werbeKopfzeilen(LINK)['List-Unsubscribe-Post'], undefined);
  assert.equal(werbeKopfzeilen(LINK, { einKlick: false })['List-Unsubscribe-Post'], undefined);
  assert.equal(
    werbeKopfzeilen(LINK, { einKlick: true })['List-Unsubscribe-Post'],
    'List-Unsubscribe=One-Click',
  );
});

test('ein untauglicher Link ergibt GAR KEINE Kopfzeile, nie eine halbe', () => {
  for (const mist of ['', '   ', 'kein-link', 'ftp://x.de/a', null, undefined, 42]) {
    assert.deepEqual(werbeKopfzeilen(mist), {}, `durchgerutscht: ${String(mist)}`);
  }
});

test('KOPFZEILEN-EINSCHLEUSUNG: ein Zeilenumbruch im Link faellt durch', () => {
  assert.equal(abmeldeLinkGueltig('https://x.de/a\r\nBcc: opfer@example.com'), false);
  assert.equal(abmeldeLinkGueltig('https://x.de/a\nX-Spam:nein'), false);
  assert.equal(abmeldeLinkGueltig('https://x.de/a\r\nX-Spam:nein'), false);
  assert.deepEqual(werbeKopfzeilen('https://x.de/a\r\nBcc: opfer@example.com'), {});
  assert.equal(abmeldeMailGueltig('a@b.de\r\nBcc: opfer@example.com'), false);
  assert.equal(abmeldeMailGueltig('a@b.de'), true);
  assert.equal(abmeldeMailGueltig('keine-mail'), false);
});

test('SPITZE KLAMMERN im Link brechen die Kopfzeile auf — auch die fallen durch', () => {
  // List-Unsubscribe klammert den Link in <...>. Ein > im Link wuerde die
  // Klammer schliessen und einen zweiten, fremden Eintrag anhaengen.
  const boese = 'https://x.de/a>,<mailto:opfer@example.com';
  assert.equal(abmeldeLinkGueltig(boese), false);
  assert.deepEqual(werbeKopfzeilen(boese), {});
  const k = werbeKopfzeilen(LINK);
  assert.equal((k['List-Unsubscribe'].match(/</g) || []).length, 1, 'genau eine oeffnende Klammer');
  assert.equal((k['List-Unsubscribe'].match(/>/g) || []).length, 1, 'genau eine schliessende Klammer');
});

// ---------------------------------------------------------------------------
// 2. DER FUSS
// ---------------------------------------------------------------------------

test('der Fuss traegt Abmeldelink, Widerspruchshinweis und Impressum', () => {
  const f = werbeFuss({
    firmaHtml: 'Muster GmbH',
    akzent: '#123456',
    abmeldeLink: LINK,
    impressumHtml: 'Musterweg 1, 71032 Boeblingen',
  });
  assert.ok(f.includes(LINK));
  assert.ok(f.includes(FUSS_ABMELDE_TEXT));
  assert.ok(f.includes(FUSS_WIDERSPRUCH));
  assert.ok(f.includes('Musterweg 1'));
  assert.ok(f.includes('Muster GmbH'));
});

test('DER WORTLAUT SELBST wird geprueft, nicht nur gegen sich verglichen', () => {
  // Gemessen am 22.09.: Ein Test, der nur f.includes(FUSS_WIDERSPRUCH) prueft,
  // bleibt gruen, wenn man FUSS_WIDERSPRUCH durch "Bitte melden Sie sich ab"
  // ersetzt — er vergleicht die Konstante mit sich selbst. Deshalb hier die
  // inhaltlichen Pflichtbestandteile des Widerspruchshinweises
  // (§ 7 Abs. 3 Nr. 4 UWG). Der endgueltige Wortlaut kommt vom Anwalt (B5);
  // bis dahin muessen wenigstens diese Bestandteile dastehen.
  assert.match(FUSS_WIDERSPRUCH, /widersprech/i, 'das Wort Widerspruch fehlt');
  assert.match(FUSS_WIDERSPRUCH, /jederzeit/i);
  assert.match(FUSS_WIDERSPRUCH, /kosten/i, 'der Hinweis auf die Uebermittlungskosten fehlt');
  assert.ok(FUSS_WIDERSPRUCH.length > 80, 'der Hinweis ist zu kurz fuer § 7 Abs. 3 Nr. 4 UWG');
  assert.match(FUSS_ABMELDE_TEXT, /e-?mail|abmeld|abbestell/i);
});

test('ohne brauchbaren Abmeldelink entsteht KEIN Fuss — kein halber', () => {
  assert.equal(werbeFuss({ firmaHtml: 'X', akzent: '#000', abmeldeLink: '' }), '');
  assert.equal(werbeFuss({ firmaHtml: 'X', akzent: '#000', abmeldeLink: 'kaputt' }), '');
});

test('der Grund, warum jemand die Mail bekommt, laesst sich setzen', () => {
  const f = werbeFuss({
    firmaHtml: 'Muster GmbH', akzent: '#000', abmeldeLink: LINK,
    grundHtml: 'Sie erhalten diese E-Mail, weil Sie Kunde bei uns sind.',
  });
  assert.ok(f.includes('weil Sie Kunde bei uns sind'));
});

// ---------------------------------------------------------------------------
// 3. DER WAECHTER — eine Werbemail ohne Fuss darf nicht durchgehen
// ---------------------------------------------------------------------------

test('WAECHTER: Werbe-Pfad ohne Fuss faellt durch', () => {
  const ohne = werbeMailPruefen('<p>Kaufen Sie unser Angebot!</p>', {});
  assert.equal(ohne.ok, false);
  assert.deepEqual(ohne.fehlt.sort(), ['Abmeldelink im Text', 'List-Unsubscribe-Kopfzeile', 'Widerspruchshinweis'].sort());
});

test('WAECHTER: mit Fuss und Kopfzeile geht sie durch', () => {
  const html = `<p>Angebot</p>${werbeFuss({ firmaHtml: 'M', akzent: '#000', abmeldeLink: LINK })}`;
  const pr = werbeMailPruefen(html, werbeKopfzeilen(LINK));
  assert.equal(pr.ok, true, 'fehlt: ' + pr.fehlt.join(', '));
});

test('WAECHTER: der Fuss allein reicht nicht — die Kopfzeile muss auch dran', () => {
  const html = `<p>Angebot</p>${werbeFuss({ firmaHtml: 'M', akzent: '#000', abmeldeLink: LINK })}`;
  const pr = werbeMailPruefen(html, undefined);
  assert.equal(pr.ok, false);
  assert.deepEqual(pr.fehlt, ['List-Unsubscribe-Kopfzeile']);
});

test('der bestehende Newsletter-Fuss wird anerkannt — kein zweiter Fuss noetig', () => {
  // newsletterMailHtml und autoresponderMailHtml tragen ihren eigenen Text.
  const newsletterArtig =
    '<a href="https://x.de/abmelden?token=1">Vom Newsletter abmelden</a>. '
    + 'Sie können der Werbung jederzeit widersprechen.';
  const pr = werbeMailPruefen(newsletterArtig, werbeKopfzeilen(LINK));
  assert.equal(pr.ok, true, 'fehlt: ' + pr.fehlt.join(', '));
});

// ---------------------------------------------------------------------------
// 4. DER ECHTE PFAD: kundenMailLayout
// ---------------------------------------------------------------------------
import { kundenMailLayout } from '../out/mail.js';

test('DER WICHTIGSTE TEST: ohne Werbung KEIN Fuss — Rechnungen bleiben wie sie sind', () => {
  const html = kundenMailLayout('Muster GmbH', '#123456', 'Ihre Rechnung', '<p>Anbei.</p>');
  assert.ok(!html.includes(FUSS_ABMELDE_TEXT), 'unter einer Rechnung darf kein Abmeldelink stehen');
  assert.ok(!html.includes(FUSS_WIDERSPRUCH));
  assert.ok(html.includes('Muster GmbH'));
  assert.ok(html.includes('Ihre Rechnung'));
});

test('mit werbung:true kommt der Fuss — mit Abmeldelink und Widerspruchshinweis', () => {
  const html = kundenMailLayout('Muster GmbH', '#123456', 'Unser Angebot', '<p>Schauen Sie mal.</p>', {
    werbung: true,
    abmeldeLink: LINK,
    impressum: 'Musterweg 1, 71032 Boeblingen',
  });
  assert.ok(html.includes(LINK));
  assert.ok(html.includes(FUSS_ABMELDE_TEXT));
  assert.ok(html.includes(FUSS_WIDERSPRUCH));
  assert.ok(html.includes('Musterweg 1'));
});

test('werbung:true OHNE Abmeldelink erzeugt keinen halben Fuss', () => {
  const html = kundenMailLayout('M', '#000', 'T', '<p>x</p>', { werbung: true });
  assert.ok(!html.includes(FUSS_ABMELDE_TEXT));
  assert.ok(!html.includes(FUSS_WIDERSPRUCH));
});

test('der Firmenname wird entschaerft — kein HTML aus fremden Daten', () => {
  const html = kundenMailLayout('<script>alert(1)</script>', '#000', 'T', '<p>x</p>');
  assert.ok(!html.includes('<script>'));
});
