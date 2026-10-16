// Paket C1 Teil 2 (16.10.2026): Auswertung wiederkehrender Besucher (nur mit Einwilligung)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { auswerten, kanalText, MINDEST_BESUCHER } from '../out/wiedererkennung.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const B = 'bbbbbbbb-2222-4222-8222-222222222222';
const C = 'cccccccc-3333-4333-8333-333333333333';

test('leer = alles null, keine Teilung durch 0', () => {
  const w = auswerten([]);
  assert.deepEqual([w.besucher, w.wiederkehrend, w.quote, w.besuchstageSchnitt], [0, 0, 0, 0]);
  assert.deepEqual(w.erstKanal, []);
  assert.deepEqual(auswerten(null).besucher, 0);
});

test('wiederkehrend = an mindestens zwei VERSCHIEDENEN Tagen', () => {
  const w = auswerten([
    { besucher_id: A, tag: '2026-10-10', kanal: 'bezahlt', utm_kampagne: 'herbst' },
    { besucher_id: A, tag: '2026-10-10', kanal: 'direkt' },   // gleicher Tag zaehlt nicht doppelt
    { besucher_id: A, tag: '2026-10-13', kanal: 'direkt' },
    { besucher_id: B, tag: '2026-10-11', kanal: 'organisch' },
    { besucher_id: C, tag: '2026-10-12', kanal: 'bezahlt', utm_quelle: 'google' },
    { besucher_id: C, tag: '2026-10-12', kanal: 'bezahlt' },
  ]);
  assert.equal(w.besucher, 3);
  assert.equal(w.wiederkehrend, 1);
  assert.equal(w.quote, 33);
  assert.equal(w.besuchstageSchnitt, 1.3);
});

test('Erst-Kanal und Tage bis zur Rueckkehr (Reihenfolge der Eingabe egal)', () => {
  const w = auswerten([
    { besucher_id: A, tag: '2026-10-13', kanal: 'direkt' },
    { besucher_id: A, tag: '2026-10-10', kanal: 'bezahlt', utm_kampagne: 'herbst' },
    { besucher_id: B, tag: '2026-10-11', kanal: 'bezahlt', utm_kampagne: 'herbst' },
    { besucher_id: B, tag: '2026-10-12', kanal: 'bezahlt' },
    { besucher_id: C, tag: '2026-10-12', kanal: 'organisch' },
  ]);
  const anzeige = w.erstKanal.find((k) => k.label === 'Anzeige');
  assert.deepEqual(anzeige, { label: 'Anzeige', besucher: 2, wiedergekommen: 2, quote: 100, tageBisRueckkehr: 2 });
  assert.deepEqual(w.erstKanal.find((k) => k.label === 'Suchmaschine'), { label: 'Suchmaschine', besucher: 1, wiedergekommen: 0, quote: 0, tageBisRueckkehr: null });
  assert.deepEqual(w.erstKampagne, [{ label: 'herbst', besucher: 2, wiedergekommen: 2, quote: 100, tageBisRueckkehr: 2 }]);
  assert.equal(w.erstKanal[0].label, 'Anzeige', 'groesste Gruppe zuerst');
});

test('Wege: gleiche Kanaele zusammengefasst, lange Wege gekuerzt', () => {
  const w = auswerten([
    { besucher_id: A, tag: '2026-10-01', kanal: 'bezahlt' }, { besucher_id: A, tag: '2026-10-03', kanal: 'direkt' },
    { besucher_id: B, tag: '2026-10-01', kanal: 'bezahlt' }, { besucher_id: B, tag: '2026-10-02', kanal: 'direkt' }, { besucher_id: B, tag: '2026-10-05', kanal: 'direkt' },
    { besucher_id: C, tag: '2026-10-01', kanal: 'direkt' }, { besucher_id: C, tag: '2026-10-02', kanal: 'direkt' },
  ]);
  assert.deepEqual(w.wege, [{ weg: 'Anzeige → Direkt', anzahl: 2 }, { weg: 'Direkt (mehrmals)', anzahl: 1 }]);
  const lang = auswerten(['bezahlt', 'direkt', 'email', 'social', 'organisch'].map((k, i) => ({ besucher_id: A, tag: `2026-10-0${i + 1}`, kanal: k })));
  assert.deepEqual(lang.wege, [{ weg: 'Anzeige → Direkt → E-Mail → … → Suchmaschine', anzahl: 1 }]);
});

test('Monatswechsel bei Tagen bis zur Rueckkehr', () => {
  const w = auswerten([{ besucher_id: A, tag: '2026-09-29', kanal: 'email' }, { besucher_id: A, tag: '2026-10-02', kanal: 'direkt' }]);
  assert.equal(w.erstKanal[0].tageBisRueckkehr, 3);
});

test('kaputte Zeilen werden uebergangen', () => {
  const w = auswerten([{ besucher_id: A, tag: 'gestern' }, { tag: '2026-10-01' }, null, { besucher_id: B, tag: '2026-10-01', kanal: null }]);
  assert.equal(w.besucher, 1);
  assert.equal(w.erstKanal[0].label, 'Unbekannt');
  assert.equal(kanalText('VERWEIS'), 'Verweis-Link');
});

test('Anzeige: Mindestzahl und keine Einzel-Kennungen nach aussen', () => {
  assert.ok(MINDEST_BESUCHER >= 5);
  const seite = lies('app/dashboard/analyse/page.tsx');
  assert.match(seite, /wieder\.besucher < MINDEST_BESUCHER/);
  assert.doesNotMatch(seite, /besucher_id/);
  const route = lies('app/api/analyse-daten/route.ts');
  assert.match(route, /wiedererkennung = auswerten\(zeilen\)/);
  assert.doesNotMatch(route, /zeilen[,\s]*\}\)/, 'Rohzeilen gehen nicht zum Browser');
  const iRecht = route.indexOf('darfSeite(db, user.id, seite)');
  assert.ok(iRecht > 0 && iRecht < route.indexOf("db.rpc('web_wiedererkennung'"), 'erst Zugriff pruefen');
});

test('SQL p407: nur Dienst-Rolle, nur mit Einwilligung, nur Aufrufe, Berliner Tag', () => {
  const s = lies('supabase-sql/p407-wiedererkennung.sql');
  assert.match(s, /revoke all on function public\.web_wiedererkennung\(timestamptz, text\) from public, anon, authenticated/);
  assert.match(s, /grant execute on function public\.web_wiedererkennung\(timestamptz, text\) to service_role/);
  assert.match(s, /e\.besucher_id is not null and e\.typ = 'view'/);
  assert.match(s, /Europe\/Berlin/);
  assert.doesNotMatch(s, /\bdrop table\b|\btruncate\b|\bdelete from\b/i);
});
