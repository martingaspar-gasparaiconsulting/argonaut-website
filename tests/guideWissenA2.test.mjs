// Paket A2 (25.09.2026) — Wissensbasis des Assistenten: jede Seite mit echtem Inhalt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  WISSEN, START_CHEF, START_MITARBEITER, WER_TEXT, UEBUNGSWELT_HINWEIS, wissenFuer, alleVerweise,
} from '../out/guideWissen.js';
import { modulGuide } from '../out/kiGuideModule.js';

// Menue-Pfade direkt aus lib/rechte.ts lesen (ohne die Datei zu bauen).
const RECHTE = fs.readFileSync(new URL('../lib/rechte.ts', import.meta.url), 'utf8');
const MENUE = new Set([...RECHTE.matchAll(/href: '(\/dashboard[^']*)'/g)].map((m) => m[1]));
// Seiten, die es gibt, die aber nicht im Menue stehen (Unterseiten/Einstellungen).
const AUSSER_MENUE = new Set(['/dashboard/einstellungen', '/dashboard/import', '/dashboard/kunde-akte', '/dashboard/rechte']);

const ALLE_TEXTE = (w) => [w.zweck, w.werText, ...w.schritte, w.probe?.anlegen ?? '', w.probe?.loeschen ?? '',
  ...(w.landetIn ?? []).map((v) => v.text), ...(w.vorher ?? []).map((v) => v.text)].join(' ');

test('Jeder Eintrag gehoert zu einer echten Menue-Seite', () => {
  for (const href of Object.keys(WISSEN)) assert.ok(MENUE.has(href), `nicht im Menue: ${href}`);
});

test('Jeder Link fuehrt auf eine echte Seite', () => {
  for (const href of alleVerweise()) assert.ok(MENUE.has(href) || AUSSER_MENUE.has(href), `toter Link: ${href}`);
});

test('Jeder Eintrag ist vollstaendig: Zweck, Wer, mindestens 3 Schritte', () => {
  for (const [href, w] of Object.entries(WISSEN)) {
    assert.ok(w.zweck.length >= 40, `${href}: Zweck zu kurz`);
    assert.ok(WER_TEXT[w.wer], `${href}: wer`);
    assert.ok(w.werText.length >= 15, `${href}: werText`);
    assert.ok(w.schritte.length >= 3, `${href}: zu wenige Schritte`);
    if (w.wer !== 'lesen') assert.ok(!/nichts eingetragen/.test(w.werText), `${href}: widerspruechlich`);
  }
});

test('Sie-Form, kein Agenten-Wort, keine Einheitssaetze', () => {
  for (const [href, w] of Object.entries(WISSEN)) {
    const t = ALLE_TEXTE(w);
    assert.doesNotMatch(t, /\b(du|dein|deine|deinen|dich|dir|euch|euer)\b/i, href);
    assert.doesNotMatch(t, /Agent/i, href);
    assert.doesNotMatch(t, /Sie sind im Bereich/, href);
  }
  const zwecke = Object.values(WISSEN).map((w) => w.zweck);
  assert.equal(new Set(zwecke).size, zwecke.length, 'zwei Seiten mit gleichem Zweck');
});

test('Der Assistent sagt nur: kein Eintrag verspricht, dass er selbst etwas tut', () => {
  for (const [href, w] of Object.entries(WISSEN)) {
    assert.doesNotMatch(ALLE_TEXTE(w), /\b(ich trage|ich lege|ich lösche|ich erledige|erledige ich|lege ich)\b/i, href);
  }
});

test('Startreihenfolge: Chef beginnt mit Einrichtung und Personal, Mitarbeiter mit Mein Bereich', () => {
  assert.equal(START_CHEF[0].href, '/dashboard/onboarding');
  assert.ok(START_CHEF.findIndex((s) => s.href === '/dashboard/personal') < START_CHEF.findIndex((s) => s.href === '/dashboard/rechte'));
  assert.equal(START_MITARBEITER[0].href, '/dashboard/mein-bereich');
  assert.match(UEBUNGSWELT_HINWEIS, /Übungswelt entfernen/);
});

test('Krankmeldung: eAU-Hinweis — Datei nur freiwillig', () => {
  const t = WISSEN['/dashboard/mein-bereich'].schritte.join(' ');
  assert.match(t, /elektronisch bei Ihrer Krankenkasse/);
  assert.match(t, /freiwillig/);
  assert.match(WISSEN['/dashboard/personal'].schritte.join(' '), /AU elektronisch/);
});

test('Nachschlagen: exakt, Unterseite erbt, Query und Schraegstrich egal', () => {
  assert.equal(wissenFuer('/dashboard/dispo')?.href, '/dashboard/dispo');
  assert.equal(wissenFuer('/dashboard/dispo/qualifikationen')?.href, '/dashboard/dispo');
  assert.equal(wissenFuer('/dashboard/personal/dokumente')?.href, '/dashboard/personal/dokumente');
  assert.equal(wissenFuer('/dashboard/termine?x=1')?.href, '/dashboard/termine');
  assert.equal(wissenFuer('/dashboard/termine/')?.href, '/dashboard/termine');
  assert.equal(wissenFuer('/dashboard/unbekannt'), null);
  assert.equal(wissenFuer(''), null);
});

test('Guide: Seite ohne alten Text nimmt die Wissensbasis statt des Einheitssatzes', () => {
  const links = [{ label: '🗺 Dispo-Board', href: '/dashboard/dispo' }, { label: '📋 Formulare & Checklisten', href: '/dashboard/formulare' }];
  const g = modulGuide('/dashboard/dispo', links);
  assert.equal(g.nachricht, WISSEN['/dashboard/dispo'].zweck);
  assert.equal(g.schritte.length, 3);
  assert.equal(g.aktionHref, '/dashboard/meine-einsaetze');
  assert.doesNotMatch(modulGuide('/dashboard/formulare', links).nachricht, /Sie sind im Bereich/);
});
