// Paket PN (24.09.2026) — Kunden-Portal plus (B26).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pruefeFreigabeAntwort, istBeantwortbar, fristAbgelaufen, pruefeNeueFreigabe, freigabeStatusFuer,
  fortschrittAus, leseProzent, angezeigterFortschritt, tagInBerlin, uhrzeitInBerlin, monteurStatus, monteurSatz,
  pruefeDokument, dokPfad, pfadGehoertZu, istUuid,
} from '../out/kundenPortalPlus.js';

test('Freigabe-Antwort: Entscheidung, Name, Grund bei Ablehnung', () => {
  assert.match(pruefeFreigabeAntwort({ entscheidung: 'ja', name: 'Max' }).fehler, /Freigeben/);
  assert.match(pruefeFreigabeAntwort({ entscheidung: 'freigegeben', name: ' M ' }).fehler, /Namen/);
  assert.match(pruefeFreigabeAntwort({ entscheidung: 'abgelehnt', name: 'Max Muster', kommentar: '' }).fehler, /Grund/);
  const ok = pruefeFreigabeAntwort({ entscheidung: 'freigegeben', name: '  Max   Muster ', kommentar: 'passt\r\n' });
  assert.deepEqual(ok, { fehler: null, entscheidung: 'freigegeben', name: 'Max Muster', kommentar: 'passt' });
  assert.equal(pruefeFreigabeAntwort({ entscheidung: 'abgelehnt', name: 'Max', kommentar: 'Farbe falsch' }).fehler, null);
  assert.equal(pruefeFreigabeAntwort({ entscheidung: 'freigegeben', name: 'x'.repeat(300) }).name.length, 120);
});

test('Nur offene Freigaben sind beantwortbar; Frist sperrt nicht', () => {
  assert.equal(istBeantwortbar({ status: 'offen' }), true);
  assert.equal(istBeantwortbar({ status: 'freigegeben' }), false);
  assert.equal(istBeantwortbar({ status: 'abgelehnt' }), false);
  assert.equal(istBeantwortbar({ status: 'zurueckgezogen' }), false);
  assert.equal(freigabeStatusFuer('quatsch'), 'offen');
  assert.equal(fristAbgelaufen('2026-09-23', '2026-09-24'), true);
  assert.equal(fristAbgelaufen('2026-09-24', '2026-09-24'), false);
  assert.equal(fristAbgelaufen(null, '2026-09-24'), false);
});

test('Neue Freigabe: Titel, Text, Frist nicht in der Vergangenheit', () => {
  const h = '2026-09-24';
  assert.match(pruefeNeueFreigabe({ titel: '', text: 'lang genug text' }, h).fehler, /Titel/);
  assert.match(pruefeNeueFreigabe({ titel: 'Fliesen', text: 'kurz' }, h).fehler, /beschreiben/);
  assert.match(pruefeNeueFreigabe({ titel: 'Fliesen', text: 'Bitte Muster B freigeben', frist: '2026-09-01' }, h).fehler, /Vergangenheit/);
  const ok = pruefeNeueFreigabe({ titel: 'Fliesen', text: 'Bitte Muster B freigeben', frist: 'morgen' }, h);
  assert.equal(ok.fehler, null);
  assert.equal(ok.frist, null);
});

test('Fortschritt: aus Aufgaben, ohne Aufgaben null, Meldung hat Vorrang', () => {
  assert.deepEqual(fortschrittAus([{ erledigt: true }, { status: 'Erledigt' }, { erledigt: false }, {}]), { erledigt: 2, gesamt: 4, pct: 50 });
  assert.deepEqual(fortschrittAus([]), { erledigt: 0, gesamt: 0, pct: null });
  assert.deepEqual(fortschrittAus(null), { erledigt: 0, gesamt: 0, pct: null });
  assert.equal(leseProzent('75 %'), 75);
  assert.equal(leseProzent('33,6'), 34);
  assert.equal(leseProzent(''), null);
  assert.equal(leseProzent('120'), null);
  assert.equal(leseProzent(-1), null);
  const m = [
    { fortschritt: 40, erstellt_am: '2026-09-20T10:00:00Z' },
    { fortschritt: null, erstellt_am: '2026-09-23T10:00:00Z' },
    { fortschritt: 60, erstellt_am: '2026-09-22T10:00:00Z' },
  ];
  assert.deepEqual(angezeigterFortschritt(m, 10), { pct: 60, quelle: 'meldung' });
  assert.deepEqual(angezeigterFortschritt([], 10), { pct: 10, quelle: 'aufgaben' });
  assert.deepEqual(angezeigterFortschritt([], null), { pct: null, quelle: null });
  assert.deepEqual(angezeigterFortschritt([{ fortschritt: 0, erstellt_am: '2026-09-01' }], 90), { pct: 0, quelle: 'meldung' });
});

test('Berliner Tag und Uhrzeit (Sommerzeit, Mitternacht)', () => {
  assert.equal(tagInBerlin('2026-09-23T22:30:00Z'), '2026-09-24', 'kurz nach Mitternacht in Berlin');
  assert.equal(uhrzeitInBerlin('2026-09-24T05:15:00Z'), '07:15');
  assert.equal(tagInBerlin('kaputt'), null);
  assert.equal(uhrzeitInBerlin(null), null);
});

test('Monteur-Status: Vorrang, nur heute, abgesagt zaehlt nicht', () => {
  const h = '2026-09-24';
  const liste = [
    { titel: 'Wartung', status: 'geplant', beginn_am: '2026-09-24T12:00:00Z', ende_am: '2026-09-24T14:00:00Z' },
    { titel: 'Heizung', status: 'unterwegs', beginn_am: '2026-09-24T08:00:00Z', unterwegs_am: '2026-09-24T07:40:00Z' },
  ];
  assert.deepEqual(monteurStatus(liste, h), { art: 'unterwegs', seit: '09:40', titel: 'Heizung' });
  assert.deepEqual(monteurStatus([liste[0]], h), { art: 'heute', beginn: '14:00', ende: '16:00', titel: 'Wartung' });
  assert.equal(monteurStatus([{ ...liste[1], unterwegs_am: '2026-09-22T07:00:00Z', beginn_am: '2026-09-22T08:00:00Z' }], h), null, 'alter Status von vorgestern');
  assert.equal(monteurStatus([{ ...liste[0], status: 'abgesagt' }], h), null);
  assert.deepEqual(monteurStatus([{ titel: 'X', status: 'vor_ort', beginn_am: '2026-09-24T08:00:00Z', vor_ort_am: '2026-09-24T08:05:00Z' }], h).art, 'vor_ort');
  assert.deepEqual(monteurStatus([{ titel: 'X', status: 'erledigt', beginn_am: '2026-09-24T08:00:00Z', erledigt_am: '2026-09-24T11:00:00Z' }], h), { art: 'erledigt', am: '13:00', titel: 'X' });
  assert.equal(monteurStatus([], h), null);
  assert.match(monteurSatz({ art: 'unterwegs', seit: '09:40', titel: 'H' }), /unterwegs zu Ihnen \(losgefahren um 09:40 Uhr\)/);
  assert.equal(monteurSatz(null), null);
});

test('Dokumente: Typ, Groesse, Pfad gehoert zum Kunden', () => {
  assert.equal(pruefeDokument('Plan.PDF', 1000), null);
  assert.match(pruefeDokument('virus.exe', 1000), /Erlaubt/);
  assert.match(pruefeDokument('a.pdf', 0), /leer/);
  assert.match(pruefeDokument('a.pdf', 21 * 1024 * 1024), /20 MB/);
  const b = '11111111-1111-1111-1111-111111111111';
  const k = '22222222-2222-2222-2222-222222222222';
  const p = dokPfad(b, k, '33333333-3333-3333-3333-333333333333', 'Übergabe Protokoll.Pdf');
  assert.equal(p, `${b}/${k}/33333333-3333-3333-3333-333333333333.pdf`);
  assert.equal(pfadGehoertZu(p, b, k), true);
  assert.equal(pfadGehoertZu(p, b, '99999999-2222-2222-2222-222222222222'), false);
  assert.equal(pfadGehoertZu(`${b}/${k}/../x.pdf`, b, k), false);
  assert.equal(dokPfad('../a', 'b/c', 'd', 'x.pdf'), 'a/bc/d.pdf');
  assert.equal(istUuid(b), true);
  assert.equal(istUuid('1; drop'), false);
});
