// ============================================================================
// tests/verkaufsteamP358.test.mjs — Paket 358 (13.10.2026)
// VK1 Verkaufsteam, Teil 1: Zuständige (Setter/Closer), Funktionen, freie Setter.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  teamAufbauen, personName, auswahl, meineRolle, nachZustaendig, zustaendigText, zuweisungPruefen, funktionWerte, istOffen, uebersicht, funktionName,
} from '../out/verkaufsteam.js';
import { NAV_LINKS, MODUL_PFAD, pfadPasst } from '../out/rechte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const CHEF = 'c';
const MA = [
  { auth_user_id: 'a', vorname: 'Anna', nachname: 'Setz', status: 'aktiv' },
  { auth_user_id: 'b', vorname: 'Ben', nachname: 'Schluss', status: null },
  { auth_user_id: 'f', vorname: 'Fritz', nachname: 'Frei', status: 'aktiv' },
  { auth_user_id: null, vorname: 'Ohne', nachname: 'Login' },
  { auth_user_id: 'x', vorname: 'Ex', nachname: 'Weg', status: 'ausgeschieden' },
];
const FN = [
  { user_id: 'a', funktion: 'setter', frei: false, aktiv: true },
  { user_id: 'b', funktion: 'closer', frei: false, aktiv: true },
  { user_id: 'f', funktion: 'setter', frei: true, aktiv: true },
  { user_id: 'c', funktion: 'teamleitung', frei: true, aktiv: true },
];

test('Team: Geschäftsleitung zuerst, nur mit Anmeldung, Chef nie frei, Ausgeschiedene inaktiv', () => {
  const t = teamAufbauen(CHEF, MA, FN);
  assert.deepEqual(t.map((p) => p.name), ['Geschäftsleitung', 'Anna Setz', 'Ben Schluss', 'Ex Weg', 'Fritz Frei']);
  assert.equal(t[0].chef, true);
  assert.equal(t[0].frei, false, 'Geschäftsleitung nie frei, auch wenn die Zeile es sagt');
  assert.equal(t[0].funktion, 'teamleitung');
  assert.equal(t.find((p) => p.user_id === 'f').frei, true);
  assert.equal(t.find((p) => p.user_id === 'x').aktiv, false);
  assert.equal(personName(t, 'b'), 'Ben Schluss');
  assert.equal(personName(t, 'weg'), 'nicht mehr im Team');
  assert.equal(personName(t, null), null);
  assert.equal(funktionName('closer'), 'Closer');
  assert.equal(teamAufbauen(CHEF, [{ auth_user_id: CHEF }], []).length, 1, 'kein Doppel');
});

test('Auswahl: passende Funktion zuerst, Inaktive und freie Closer raus — außer der aktuelle', () => {
  const t = teamAufbauen(CHEF, MA, FN);
  const s = auswahl(t, 'setter').map((p) => p.user_id);
  assert.deepEqual(s.slice(0, 2), ['a', 'f']);
  assert.ok(!s.includes('x'));
  const c = auswahl(t, 'closer').map((p) => p.user_id);
  assert.equal(c[0], 'b');
  assert.equal(c[1], CHEF, 'Teamleitung danach');
  assert.ok(!c.includes('f'), 'freier Setter nie Closer');
  assert.ok(auswahl(t, 'setter', 'x').some((p) => p.user_id === 'x'), 'aktueller Inaktiver bleibt sichtbar');
});

test('Meine, Filter, Text', () => {
  const t = teamAufbauen(CHEF, MA, FN);
  const L = [
    { id: 1, setter_user_id: 'a', closer_user_id: 'b' },
    { id: 2, setter_user_id: 'a', closer_user_id: null },
    { id: 3, setter_user_id: null, closer_user_id: null },
    { id: 4, setter_user_id: 'b', closer_user_id: 'b' },
    { id: 5, setter_user_id: null, closer_user_id: 'b' },
  ];
  assert.equal(meineRolle(L[0], 'b'), 'closer');
  assert.equal(meineRolle(L[3], 'b'), 'beides');
  assert.equal(meineRolle(L[2], 'b'), null);
  assert.equal(meineRolle(L[0], null), null);
  assert.deepEqual(nachZustaendig(L, 'meine', 'a').map((l) => l.id), [1, 2]);
  assert.deepEqual(nachZustaendig(L, 'ohne', 'a').map((l) => l.id), [3]);
  assert.deepEqual(nachZustaendig(L, 'b', 'a').map((l) => l.id), [1, 4, 5]);
  assert.equal(nachZustaendig(L, 'alle', 'a').length, 5);
  assert.equal(zustaendigText(L[0], t), 'Setter: Anna Setz · Closer: Ben Schluss');
  assert.equal(zustaendigText(L[2], t), null);
});

test('Zuweisung prüfen wie der Wächter, Funktion speichern', () => {
  const t = teamAufbauen(CHEF, MA, FN);
  assert.deepEqual(zuweisungPruefen({ setter_user_id: 'a', closer_user_id: 'b' }, t, false), []);
  assert.match(zuweisungPruefen({ setter_user_id: 'zz' }, t, false).join(' '), /Setter gehört nicht/);
  assert.match(zuweisungPruefen({ closer_user_id: 'zz' }, t, false).join(' '), /Closer gehört nicht/);
  assert.match(zuweisungPruefen({ setter_user_id: 'a' }, t, true).join(' '), /Geschäftsleitung oder die Teamleitung/);
  assert.match(zuweisungPruefen({ closer_user_id: 'f' }, t, false).join(' '), /freier Setter kann nicht Closer/);
  const chef = t[0];
  assert.deepEqual(funktionWerte(chef, 'teamleitung', true, true), { user_id: CHEF, funktion: 'teamleitung', frei: false, aktiv: true });
  assert.equal(funktionWerte(t[1], 'quatsch', false, true).funktion, null);
});

test('Übersicht je Person, offen nach Stufe vor Status', () => {
  const t = teamAufbauen(CHEF, MA, FN);
  assert.equal(istOffen({ stufe: 'kunde', status: 'neu' }), false);
  assert.equal(istOffen({ stufe: null, status: 'verloren' }), false);
  assert.equal(istOffen({ stufe: 'termin_gebucht' }), true);
  const L = [
    { setter_user_id: 'a', closer_user_id: 'b', stufe: 'termin_gebucht' },
    { setter_user_id: 'a', closer_user_id: null, stufe: 'kunde' },
    { setter_user_id: null, closer_user_id: null, status: 'neu' },
    { setter_user_id: null, closer_user_id: null, status: 'verloren' },
  ];
  const u = uebersicht(t, L);
  const anna = u.zeilen.find((z) => z.person.user_id === 'a');
  assert.deepEqual([anna.setter, anna.closer, anna.offen], [2, 0, 1]);
  const ben = u.zeilen.find((z) => z.person.user_id === 'b');
  assert.deepEqual([ben.setter, ben.closer, ben.offen], [0, 1, 1]);
  assert.deepEqual([u.ohne, u.ohneOffen], [2, 1]);
});

test('Menü: Unterpfade ohne eigenen Modul-Schlüssel (MODUL_PFAD zeigt auf die Hauptseite)', () => {
  assert.equal(MODUL_PFAD.leads, '/dashboard/leads');
  assert.equal(MODUL_PFAD.tierbestand, '/dashboard/tierbestand', 'Fund P358: P357 hatte den Pfad umgebogen');
  const team = NAV_LINKS.find((l) => l.href === '/dashboard/leads/team');
  assert.ok(team && !team.modul);
  // Wächter: kein Eintrag mit Modul-Schlüssel liegt unter einem anderen Eintrag mit demselben Schlüssel
  for (const a of NAV_LINKS) for (const b of NAV_LINKS) {
    if (a === b || !a.modul || a.modul !== b.modul) continue;
    if (a.modul === 'erp') continue; // bekannt seit vor P358 (Kontrollgang-2), Import-Zuordnung faellt dort auf „Infrastruktur" zurueck
    assert.ok(!(a.href !== b.href && pfadPasst(a.href, b.href)), `${a.href} liegt unter ${b.href} mit gleichem Modul ${a.modul}`);
  }
});

test('Verdrahtung: SQL, Seiten, Sicherung, Guide', () => {
  const sql = lies('supabase-sql/p358-verkaufsteam-zustaendige.sql');
  assert.match(sql, /as restrictive for select to authenticated\s+using \(not public\.p358_frei\(\) or setter_user_id = auth\.uid\(\) or closer_user_id = auth\.uid\(\)\)/);
  assert.match(sql, /p358_frei_deal on public\.crm_deal as restrictive for all/);
  assert.match(sql, /exception when others then v := false;/, 'Fehler sperrt niemanden aus');
  assert.match(sql, /if v_frei then new\.setter_user_id := auth\.uid\(\)/);
  assert.ok(lies('lib/sicherungTabellen.ts').includes("'vk_funktion'"));
  assert.ok(lies('lib/guideWissen.ts').includes("'/dashboard/leads/team'"));
  const detail = lies('app/dashboard/leads/[id]/page.tsx');
  assert.match(detail, /stand\.frei \? \{ \.\.\.data, angebot_entwurf: null/, 'freie Setter bekommen keinen Angebotsentwurf');
  assert.match(lies('app/dashboard/leads/[id]/LeadDetailClient.tsx'), /ohneAngebot \? <div \/> : \(/);
  assert.match(lies('app/dashboard/leads/page.tsx'), /ladeZustaendige\(supabase\)/);
  assert.ok(!/setter_user_id/.test(lies('app/dashboard/leads/page.tsx').match(/\.select\('id, created_at[^']*'\)/)[0]), 'Hauptabfrage ohne neue Spalten — Liste bleibt ohne SQL 358 sichtbar');
});
