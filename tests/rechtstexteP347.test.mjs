// ============================================================================
// tests/rechtstexteP347.test.mjs — Paket 347 (13.10.2026)
// A1 Vorlagen-Prinzip Teil 1: „Meine Rechtstexte"
//   · Katalog sauber, Schlüssel passen zur Datenbank
//   · Gerüst = nur Überschriften und Lücken, nie ein Wortlaut
//   · Speichern nur ohne Lücken und nur mit erlaubten Platzhaltern
//   · Dokument: eigener Text (gefüllt) oder Hinweis — nie ein Mustertext
//   · Verwahrprotokoll enthält keine ARGONAUT-Klauseln mehr
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  RECHTS_TEXTE, LUECKE, TEXT_MIN, HINWEIS_ANWALT, eintragFuer, geruest, nachBereich, platzhalterImText, textPruefen, textFuellen,
  dokumentText, standText, uebersicht,
} from '../out/rechtsTexte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const V = eintragFuer('verwahrung.bedingungen');
const EIGEN = 'Laufzeit: Die Einlagerung gilt für eine Saison. Abholung nach Terminabsprache mit {{betrieb}}. Kunde {{kunde}}, Stand {{datum}}.';

test('Katalog: Schlüssel eindeutig, passen zur Datenbank, jeder Eintrag vollständig', () => {
  const k = RECHTS_TEXTE.map((e) => e.schluessel);
  assert.equal(new Set(k).size, k.length);
  for (const e of RECHTS_TEXTE) {
    assert.match(e.schluessel, /^[a-z]+\.[a-z_]+$/, e.schluessel);
    assert.ok(e.schluessel.length <= 60);
    assert.ok(e.titel && e.wofuer && e.wo && e.empfaenger && e.bereich, e.schluessel);
    assert.ok(e.gliederung.length >= 2, 'Gerüst mit Überschriften: ' + e.schluessel);
    assert.ok(e.platzhalter.every((p) => /^[a-z_]+$/.test(p.key)));
  }
  assert.equal(V.angebunden, true, 'Verwahrung ist in diesem Paket angebunden');
  assert.ok(Object.isFrozen(RECHTS_TEXTE));
  assert.equal(nachBereich().reduce((n, b) => n + b.eintraege.length, 0), RECHTS_TEXTE.length);
  assert.match(HINWEIS_ANWALT, /keinen Mustertext/);
});

test('Gerüst: nur nummerierte Überschriften und Lücken — kein Wortlaut', () => {
  for (const e of RECHTS_TEXTE) {
    const zeilen = geruest(e).split('\n').filter((z) => z.trim());
    assert.equal(zeilen.length, e.gliederung.length * 2, e.schluessel);
    zeilen.forEach((z, i) => {
      if (i % 2 === 1) assert.equal(z, LUECKE);
      else assert.equal(z, `${i / 2 + 1}. ${e.gliederung[i / 2]}`);
    });
    for (const g of e.gliederung) assert.ok(g.length <= 45 && !/[.!?;:]$/.test(g), 'Überschrift, kein Satz: ' + g);
    assert.ok(textPruefen(e, geruest(e)).some((f) => f.includes(LUECKE)), 'ungefülltes Gerüst ist nicht speicherbar');
  }
});

test('Prüfen: Mindestlänge, Lücken, Platzhalter, Vermerk', () => {
  assert.deepEqual(textPruefen(V, EIGEN), []);
  assert.match(textPruefen(V, 'kurz').join(' '), new RegExp(`mindestens ${TEXT_MIN}`));
  assert.match(textPruefen(V, '   ' + 'x'.repeat(TEXT_MIN - 1) + '    ').join(' '), /mindestens/, 'Leerzeichen zählen nicht');
  assert.deepEqual(textPruefen(V, 'x'.repeat(TEXT_MIN)), []);
  assert.match(textPruefen(V, EIGEN + ' ' + LUECKE).join(' '), /Lücke/);
  assert.match(textPruefen(V, EIGEN + ' {{iban}} {{ kunde }}').join(' '), /Unbekannte Platzhalter: \{\{iban\}\}/);
  assert.match(textPruefen(V, 'x'.repeat(30001)).join(' '), /zu lang/);
  assert.match(textPruefen(V, EIGEN, 'v'.repeat(301)).join(' '), /Prüf-Vermerk/);
  assert.deepEqual(platzhalterImText('{{a}} {{ b }} {{a}}'), ['a', 'b']);
});

test('Füllen: Werte eingesetzt, fehlende Werte bleiben sichtbar', () => {
  assert.equal(textFuellen('Hallo {{kunde}}, {{ betrieb }}.', { kunde: 'Frau Muster', betrieb: 'Reifen Kurz' }), 'Hallo Frau Muster, Reifen Kurz.');
  assert.equal(textFuellen('Hallo {{kunde}}.', { kunde: '  ' }), 'Hallo [kunde].');
  assert.equal(textFuellen('Hallo {{kunde}}.', {}), 'Hallo [kunde].');
});

test('Dokument: eigener Text oder Hinweis — nie ein Mustertext', () => {
  const g = { text: EIGEN, fassung: 3, geaendert_am: '2026-10-13T08:00:00Z' };
  const d = dokumentText(V, g, { kunde: 'Frau Muster', betrieb: 'Reifen Kurz', datum: '13.10.2026' });
  assert.equal(d.eigen, true);
  assert.match(d.text, /Frau Muster/);
  assert.equal(d.fassung, 3);
  assert.equal(d.stand, 'Fassung 3 vom 13.10.2026');
  for (const leer of [null, undefined, { ...g, text: 'kurz' }, { ...g, text: EIGEN + LUECKE }]) {
    const h = dokumentText(V, leer);
    assert.equal(h.eigen, false);
    assert.match(h.hinweis, /kein eigener Text/);
    assert.equal('text' in h, false);
  }
  assert.equal(standText({ fassung: 1, geaendert_am: null }), 'Fassung 1');
  assert.equal(standText({ fassung: 2, geaendert_am: '2026-10-12T22:30:00Z' }), 'Fassung 2 vom 13.10.2026', 'Berliner Datum');
  const u = uebersicht([{ schluessel: 'kfz.kaufvertrag' }]);
  assert.equal(u.hinterlegt, 1);
  assert.equal(u.fehlenAngebunden, RECHTS_TEXTE.filter((e) => e.angebunden).length);
});

test('Verwahrprotokoll: keine ARGONAUT-Klauseln mehr, Text des Betriebs oder Hinweis', () => {
  const pdf = lies('lib/verwahrProtokollPdf.ts');
  for (const alt of ['stillschweigend', 'Frist von 14 Tagen', 'Obhutspflicht', 'Vertragslaufzeit 12 Monate', 'Verwahrungsvertrag nach § 688']) {
    assert.ok(!pdf.includes(alt), 'alter Wortlaut noch drin: ' + alt);
  }
  assert.match(pdf, /if \(b && b\.eigen\) \{/);
  assert.match(pdf, /Es sind keine eigenen Bedingungen des Betriebs hinterlegt/);
  const seite = lies('app/dashboard/reservierung/page.tsx');
  assert.match(seite, /ladeDokumentText\(supabase, besitzer, 'verwahrung\.bedingungen'/);
  assert.match(seite, /bedingungen,\n\s+\}\);/);
  const laden = lies('lib/rechtsTexteLaden.ts');
  assert.match(laden, /\.eq\('owner_user_id', betrieb\)\.eq\('schluessel', schluessel\)/);
  assert.match(laden, /if \(error \|\| !data\) return null;/);
});

test('SQL p347: Mitarbeiter nur lesen, Fassungen fest, nichts gelöscht', () => {
  const sql = lies('supabase-sql/p347-rechtstexte.sql');
  assert.match(sql, /schluessel ~ '\^\[a-z\]\+\\\.\[a-z_\]\+\$'/);
  assert.match(sql, /char_length\(btrim\(text\)\) between 50 and 30000/);
  assert.match(sql, /create policy p347_ma_select on public\.rechtstext for select to authenticated/);
  assert.doesNotMatch(sql, /p347_ma_(insert|update|delete)/, 'Mitarbeiter schreiben nicht');
  assert.match(sql, /before update or delete on public\.rechtstext_fassung/);
  assert.match(sql, /new\.fassung := old\.fassung \+ 1;/);
  assert.match(sql, /select coalesce\(max\(f\.fassung\), 0\) \+ 1 into new\.fassung from public\.rechtstext_fassung f/, 'nach Entfernen weiterzählen');
  assert.match(sql, /revoke all on public\.rechtstext from anon;/);
  assert.doesNotMatch(sql, /\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\b/i);
});

test('Seite, Menü, Guide, Sicherung', () => {
  const seite = lies('app/dashboard/rechtstexte/page.tsx');
  assert.match(seite, /So geht&apos;s/);
  assert.match(seite, /HINWEIS_ANWALT/);
  assert.match(seite, /nichtsGeschrieben\(data\)/);
  assert.match(seite, /onConflict: 'owner_user_id,schluessel'/);
  assert.match(lies('lib/rechte.ts'), /\{ label: '📜 Meine Rechtstexte', href: '\/dashboard\/rechtstexte', nurChef: true/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/rechtstexte': \{/);
  assert.match(lies('lib/sicherungTabellen.ts'), /'rechtstext', 'rechtstext_fassung'/);
});
