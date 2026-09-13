import test from 'node:test';
import assert from 'node:assert/strict';
import { istGelesen, mailZeile, absenderAnzeige } from '../out/posteingang.js';

// ============================================================================
// Punkt 3.4 — lib/posteingang.ts: die Aufbereitung einer IMAP-Nachricht.
//
// Die Datei steht seit Mai als „pure, node-testbar" im Kopf und hatte bis
// heute keinen einzigen Test. Sie ist die Stelle, an der FREMDE Daten zum
// ersten Mal zu etwas werden, das wir anzeigen: Absendername, Betreff und
// Datum kommen von aussen und können fehlen, leer sein oder Unsinn enthalten.
// Ein Absturz hier heisst: der ganze Posteingang bleibt leer.
//
// Die Tests halten deshalb vor allem EINES fest: nichts wirft. Jeder Aufruf
// gibt eine vollständige Zeile zurück, auch wenn die Nachricht kaputt ist.
// ============================================================================

// -------------------------------------------------------------- istGelesen

test('ein Set mit \\Seen gilt als gelesen', () => {
  assert.equal(istGelesen(new Set(['\\Seen'])), true);
  assert.equal(istGelesen(new Set(['\\Seen', '\\Answered'])), true);
});

test('ein Set ohne \\Seen gilt als ungelesen', () => {
  assert.equal(istGelesen(new Set(['\\Answered'])), false);
  assert.equal(istGelesen(new Set()), false);
});

test('imapflow liefert je nach Abruf ein Array statt eines Sets', () => {
  assert.equal(istGelesen(['\\Seen']), true);
  assert.equal(istGelesen(['\\Flagged']), false);
  assert.equal(istGelesen([]), false);
});

test('fehlende oder unbrauchbare Flags gelten als UNGELESEN', () => {
  // Im Zweifel ungelesen: eine faelschlich als gelesen angezeigte Mail
  // uebersieht man, eine faelschlich fette nicht.
  assert.equal(istGelesen(null), false);
  assert.equal(istGelesen(undefined), false);
  assert.equal(istGelesen('\\Seen'), false, 'eine Zeichenkette ist keine Flag-Liste');
  assert.equal(istGelesen(42), false);
  assert.equal(istGelesen({ Seen: true }), false);
});

test('Gross-/Kleinschreibung der Flags wird NICHT geraten', () => {
  // IMAP schreibt \Seen so. Wer anders schreibt, meint etwas anderes.
  assert.equal(istGelesen(new Set(['\\seen'])), false);
});

// --------------------------------------------------------------- mailZeile

test('eine vollstaendige Nachricht wird sauber uebernommen', () => {
  const z = mailZeile({
    uid: 4711,
    flags: new Set(['\\Seen']),
    internalDate: new Date('2026-09-13T08:30:00.000Z'),
    envelope: {
      subject: 'Angebot 2026-118',
      date: new Date('2026-09-12T22:00:00.000Z'),
      from: [{ name: 'Sabine Weber', address: 'weber@beispiel.de' }],
    },
  });
  assert.equal(z.uid, 4711);
  assert.equal(z.vonName, 'Sabine Weber');
  assert.equal(z.vonAdresse, 'weber@beispiel.de');
  assert.equal(z.betreff, 'Angebot 2026-118');
  assert.equal(z.datumIso, '2026-09-13T08:30:00.000Z');
  assert.equal(z.gelesen, true);
});

test('internalDate schlaegt das Datum aus dem Umschlag', () => {
  // Das Umschlag-Datum schreibt der Absender, internalDate der Server.
  // Wer ein falsches Datum setzt, soll seine Mail nicht nach oben schieben.
  const z = mailZeile({
    uid: 1,
    internalDate: new Date('2026-09-13T08:00:00.000Z'),
    envelope: { subject: 'x', date: new Date('2099-01-01T00:00:00.000Z'), from: [] },
  });
  assert.equal(z.datumIso, '2026-09-13T08:00:00.000Z');
});

test('ohne internalDate wird auf das Umschlag-Datum zurueckgefallen', () => {
  const z = mailZeile({
    uid: 1,
    envelope: { subject: 'x', date: '2026-09-10T12:00:00.000Z', from: [] },
  });
  assert.equal(z.datumIso, '2026-09-10T12:00:00.000Z');
});

test('ein kaputtes Datum wird leer, nicht "Invalid Date"', () => {
  assert.equal(mailZeile({ uid: 1, internalDate: 'gestern' }).datumIso, '');
  assert.equal(mailZeile({ uid: 1, internalDate: new Date('quatsch') }).datumIso, '');
  assert.equal(mailZeile({ uid: 1 }).datumIso, '');
});

test('ein leerer Betreff wird zu "(kein Betreff)"', () => {
  assert.equal(mailZeile({ uid: 1, envelope: { subject: '' } }).betreff, '(kein Betreff)');
  assert.equal(mailZeile({ uid: 1, envelope: { subject: '   ' } }).betreff, '(kein Betreff)');
  assert.equal(mailZeile({ uid: 1, envelope: {} }).betreff, '(kein Betreff)');
  assert.equal(mailZeile({ uid: 1 }).betreff, '(kein Betreff)');
});

test('Leerraum um Betreff, Name und Adresse wird abgeschnitten', () => {
  const z = mailZeile({
    uid: 1,
    envelope: { subject: '  Rechnung  ', from: [{ name: ' Max ', address: ' max@beispiel.de ' }] },
  });
  assert.equal(z.betreff, 'Rechnung');
  assert.equal(z.vonName, 'Max');
  assert.equal(z.vonAdresse, 'max@beispiel.de');
});

test('eine Nachricht ohne Absender stuerzt nicht ab', () => {
  for (const envelope of [{ from: [] }, { from: null }, { from: undefined }, {}]) {
    const z = mailZeile({ uid: 1, envelope });
    assert.equal(z.vonName, '');
    assert.equal(z.vonAdresse, '');
  }
});

test('nur der ERSTE Absender zaehlt', () => {
  const z = mailZeile({
    uid: 1,
    envelope: { from: [{ name: 'Erster', address: 'a@b.de' }, { name: 'Zweiter', address: 'c@d.de' }] },
  });
  assert.equal(z.vonName, 'Erster');
});

test('eine voellig leere Nachricht gibt trotzdem eine vollstaendige Zeile', () => {
  const z = mailZeile({});
  assert.deepEqual(z, {
    uid: 0, vonName: '', vonAdresse: '', betreff: '(kein Betreff)', datumIso: '', gelesen: false,
  });
});

test('eine fehlende oder unsinnige UID wird 0 und nie NaN', () => {
  // NaN in der uid hiesse: der Link zur Nachricht fuehrt ins Leere.
  assert.equal(mailZeile({ uid: undefined }).uid, 0);
  assert.equal(mailZeile({ uid: 'abc' }).uid, 0);
  assert.equal(mailZeile({ uid: null }).uid, 0);
  assert.equal(Number.isNaN(mailZeile({ uid: 'abc' }).uid), false);
  assert.equal(mailZeile({ uid: '4711' }).uid, 4711, 'eine Zahl als Text ist brauchbar');
});

test('Zahlen und Objekte im Betreff werden zu Text, nicht zu [object Object]-Absturz', () => {
  assert.equal(mailZeile({ uid: 1, envelope: { subject: 12345 } }).betreff, '12345');
});

// -------------------------------------------------------- absenderAnzeige

test('der Name hat Vorrang vor der Adresse', () => {
  assert.equal(absenderAnzeige({ vonName: 'Sabine Weber', vonAdresse: 'weber@beispiel.de' }), 'Sabine Weber');
});

test('ohne Namen wird die Adresse angezeigt', () => {
  assert.equal(absenderAnzeige({ vonName: '', vonAdresse: 'weber@beispiel.de' }), 'weber@beispiel.de');
});

test('ohne beides steht "Unbekannt" — nie eine leere Zeile', () => {
  assert.equal(absenderAnzeige({ vonName: '', vonAdresse: '' }), 'Unbekannt');
});

test('absenderAnzeige vertraegt eine unvollstaendige Zeile', () => {
  assert.equal(absenderAnzeige({}), 'Unbekannt');
});

// ------------------------------------------------ Zusammenspiel mit der Route

test('die Route kann eine Liste sortieren, ohne auf ein Datum zu warten', () => {
  // Die Route dreht die Liste nur um (mails.reverse()). Zeilen ohne Datum
  // duerfen dabei nicht stoeren — deshalb ist datumIso immer eine Zeichenkette.
  const zeilen = [
    mailZeile({ uid: 1, internalDate: new Date('2026-09-01T10:00:00.000Z') }),
    mailZeile({ uid: 2, internalDate: 'kaputt' }),
    mailZeile({ uid: 3, internalDate: new Date('2026-09-13T10:00:00.000Z') }),
  ];
  assert.equal(zeilen.every((z) => typeof z.datumIso === 'string'), true);
  assert.equal(zeilen.every((z) => typeof z.betreff === 'string' && z.betreff.length > 0), true);
});
