// Paket A4 (25.09.2026) — Lehrplan „Vom Matrosen zum Kapitän".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LEHRPLAN, etappeFuer, naechsteEtappe, lernzielSatz } from '../out/lehrplan.js';
import { MEDAILLEN } from '../out/academy.js';

const RECHTE = fs.readFileSync(new URL('../lib/rechte.ts', import.meta.url), 'utf8');
const NAV = new Map([...RECHTE.matchAll(/\{ label: '([^']+)', href: '(\/dashboard[^']*)'([^}]*)\}/g)].map((m) => [m[2], m[3]]));
const ROLLEN = ['chef', 'mitarbeiter'];
const alleTexte = () => LEHRPLAN.flatMap((e) => ROLLEN.flatMap((r) => [e.ziel[r], ...e.aufgaben[r].map((a) => a.text)]));

test('Acht Etappen: „Leinen los" plus jeder Academy-Rang in der richtigen Reihenfolge', () => {
  assert.equal(LEHRPLAN.length, MEDAILLEN.length + 1);
  assert.equal(LEHRPLAN[0].key, 'start');
  MEDAILLEN.forEach((m, i) => {
    assert.equal(LEHRPLAN[i + 1].key, m.key);
    assert.equal(LEHRPLAN[i + 1].abKursen, m.abKursen);
    assert.equal(LEHRPLAN[i + 1].rang, m.rang);
  });
});

test('Jede Etappe hat fuer Chef und Mitarbeiter ein Ziel und mindestens drei Aufgaben', () => {
  for (const e of LEHRPLAN) for (const r of ROLLEN) {
    assert.ok(e.ziel[r].length >= 30, `${e.key}/${r}: Ziel zu kurz`);
    assert.ok(e.aufgaben[r].length >= 3, `${e.key}/${r}: zu wenige Aufgaben`);
  }
});

test('Jede Aufgabe fuehrt auf eine echte Menueseite', () => {
  for (const e of LEHRPLAN) for (const r of ROLLEN) for (const a of e.aufgaben[r]) {
    assert.ok(NAV.has(a.href), `${e.key}/${r}: ${a.href} steht nicht im Menue`);
  }
});

test('Mitarbeiter-Aufgaben: nur Seiten, die jeder hat — sonst mit Freigabe-Hinweis', () => {
  for (const e of LEHRPLAN) for (const a of e.aufgaben.mitarbeiter) {
    const eintrag = NAV.get(a.href) ?? '';
    const jeder = /immer: true/.test(eintrag) || a.href === '/dashboard/academy'; // der Lehrplan steht in der Academy
    assert.ok(jeder || a.freigabe, `${e.key}: ${a.href} braucht freigabe: true`);
    assert.doesNotMatch(eintrag, /nurChef: true/, `${e.key}: Chef-Seite im Mitarbeiter-Lehrplan: ${a.href}`);
  }
});

test('Sie-Form, kein Agenten-Wort, keine Zusage, dass der Assistent selbst etwas eintraegt', () => {
  for (const t of alleTexte()) {
    assert.doesNotMatch(t, /\b(du|dein|deine|dich|dir)\b/i, t);
    assert.doesNotMatch(t, /Agent(?!ur)/i, t);
    assert.doesNotMatch(t, /\b(ich trage|ich lege|lege ich)\b/i, t);
  }
});

test('Etappe nach Kursen', () => {
  assert.equal(etappeFuer(0).key, 'start');
  assert.equal(etappeFuer(undefined).key, 'start');
  assert.equal(etappeFuer(1).key, 'erste_fahrt');
  assert.equal(etappeFuer(5).key, 'smutje');
  assert.equal(etappeFuer(6).key, 'matrose');
  assert.equal(etappeFuer(99).key, 'kapitaen');
  assert.equal(naechsteEtappe(0).key, 'erste_fahrt');
  assert.equal(naechsteEtappe(40), null);
  assert.match(lernzielSatz('mitarbeiter', 6), /^Ihr Lernziel als „Matrose":/);
});

test('Urlaubsantrag: kein Versprechen, dass der Mitarbeiter ihn selbst zuruecknimmt (gibt es nicht)', () => {
  const t = LEHRPLAN.flatMap((e) => e.aufgaben.mitarbeiter.map((a) => a.text)).join(' ');
  assert.doesNotMatch(t, /Urlaubsantrag[^.]*zurückziehen/);
});

test('Academy zeigt den Lehrplan nach Rolle', () => {
  const src = fs.readFileSync(new URL('../app/dashboard/academy/AcademyClient.tsx', import.meta.url), 'utf8');
  assert.match(src, /<Lehrplan rolle=\{istChef \? 'chef' : 'mitarbeiter'\} kurse=\{zahlen\.fertig\} \/>/);
});

test('Guide zeigt das Lernziel der Etappe — nur wenn die Kurse bekannt sind', async () => {
  const { guideLage } = await import('../out/guideLage.js');
  const nav = [{ label: '🏠 Übersicht', href: '/dashboard', exakt: true }];
  assert.match(guideLage('/dashboard', nav, 'mitarbeiter', { kurse: 6 }).lernziel, /^Ihr Lernziel als „Matrose":/);
  assert.match(guideLage('/dashboard', nav, 'chef', { kurse: 0 }).lernziel, /„Leinen los"/);
  assert.equal(guideLage('/dashboard', nav, 'chef', {}).lernziel, null);
  const b = fs.readFileSync(new URL('../app/dashboard/_components/KiGuideBegleiter.tsx', import.meta.url), 'utf8');
  assert.match(b, /inhalt\.lernziel &&/);
});
