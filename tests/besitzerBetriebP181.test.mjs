// Paket 181 (30.09.2026) — Besitzer = Betrieb, Teil 3: Geld- und Personal-Seiten.
// Was ein Mitarbeiter anlegt, gehoert dem Betrieb; Anlegen/Aendern nur mit
// Schreibrecht, Lesen nur mit Sicht- oder Schreibrecht fuers Modul.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const SQL = lies('supabase-sql/p181-besitzer-betrieb-3.sql');
const ohneKommentar = SQL.split('\n').filter((z) => !z.trim().startsWith('--')).join('\n');

const PAARE = [
  ['abo_rechnungen', 'rechnungen'], ['eingangsbelege', 'rechnungen'], ['ausgaben', 'finanzen'], ['reisekosten', 'reisekosten'],
  ['mitglieder', 'mitglieder'], ['hr_einstellungen', 'personal'], ['personal_vertrag', 'personal'],
  ['provision_partner', 'provisionen'], ['provision_zuordnung', 'provisionen'], ['projekt_kosten', 'controlling'],
  ['markt_verkauf', 'ernte'], ['portal_zugaenge', 'kundenportal'], ['vertraege', 'vertraege'],
  ['foerder_vorhaben', 'foerdermittel'], ['rueckhol_strecke', 'marketing'], ['rueckhol_schritt', 'marketing'],
];

test('SQL: jede Tabelle mit ihrem Modul (Modulnamen wie auf der Seite /rechte)', () => {
  for (const [t, m] of PAARE) assert.ok(SQL.includes(`array['${t}', '${m}']`), t);
  const rechte = lies('lib/rechte.ts');
  for (const m of new Set(PAARE.map(([, m]) => m))) assert.ok(rechte.includes(`modul: '${m}'`), 'Modul unbekannt: ' + m);
});

test('SQL: Lesen nur mit Modul-Recht, Anlegen/Aendern nur mit Schreibrecht, Loeschen nie', () => {
  assert.match(ohneKommentar, /for select to authenticated using \(owner_user_id = public\.mein_chef_id\(\) and \(public\.darf_ich_modul_sehen\(%L\) or public\.darf_ich_modul_aendern\(%L\)\)\)/);
  assert.match(ohneKommentar, /for insert to authenticated with check \(owner_user_id = public\.mein_chef_id\(\) and public\.darf_ich_modul_aendern\(%L\)\)/);
  assert.match(ohneKommentar, /for update to authenticated using \(owner_user_id = public\.mein_chef_id\(\) and public\.darf_ich_modul_aendern\(%L\)\) with check/);
  assert.ok(!/for delete|for all/i.test(ohneKommentar));
});

test('SQL: additiv — nichts geloescht, RLS wird nicht umgeschaltet, nur eigene Regeln neu gesetzt', () => {
  assert.ok(!/drop table|drop column|delete from|truncate/i.test(ohneKommentar));
  assert.ok(!/enable row level security|disable row level security/i.test(ohneKommentar), 'RLS nicht anfassen');
  const drops = ohneKommentar.match(/drop (policy|trigger) if exists (\S+)/g) || [];
  assert.ok(drops.length > 0 && drops.every((d) => /p181_/.test(d)));
});

test('SQL: Zahlungen und Artikel bleiben bei ihren eigenen Regeln', () => {
  assert.ok(!/'zahlungen'|'artikel'/.test(ohneKommentar));
});

test('SQL: Besitzer-Trigger — Mitarbeiter legt fuer den Betrieb an, Aendern behaelt den Besitzer, exception-sicher', () => {
  const i = SQL.indexOf('function public.p181_besitzer()');
  const f = SQL.slice(i, SQL.indexOf('$$;', i));
  assert.match(f, /v_chef := public\.mein_chef_id\(\);\s+if v_chef is not null then\s+new\.owner_user_id := v_chef;/);
  assert.match(f, /if auth\.uid\(\) is not null then\s+new\.owner_user_id := old\.owner_user_id;/);
  assert.match(f, /exception when others then/);
});

const SEITEN = [
  'app/dashboard/abo-rechnungen/page.tsx', 'app/dashboard/eingangsbelege/page.tsx', 'app/dashboard/finanzen/ausgaben/page.tsx',
  'app/dashboard/reisekosten/page.tsx', 'app/dashboard/mitglieder/page.tsx', 'app/dashboard/personal/dokumente/page.tsx',
  'app/dashboard/partner/_Provisionen.tsx', 'app/dashboard/partner/page.tsx', 'app/dashboard/nachkalkulation/page.tsx',
  'app/dashboard/ernte/page.tsx', 'app/dashboard/portal/page.tsx', 'app/dashboard/vertraege/page.tsx',
  'app/dashboard/foerdermittel/page.tsx', 'app/dashboard/marketing/rueckholung/page.tsx',
];

test('Seiten: nie mehr die eigene Kennung als Besitzer, Betrieb wird ermittelt, Rueckfall ueber anlegenFuerBetrieb', () => {
  for (const s of SEITEN) {
    const src = lies(s);
    assert.ok(!/owner_user_id: (uid|uidLocal|userId|user\.id)\b/.test(src), s);
    assert.ok(!/\?\s*\{ \.\.\.(payload|base), owner_user_id: userId \}/.test(src), s);
    assert.ok(/mein_chef_id/.test(src) && /betriebsKennung/.test(src) && /anlegenFuerBetrieb\(/.test(src), s + ': Betrieb wird nicht ermittelt');
  }
});

test('Personal: Bundesland gilt fuer den Betrieb (lesen und speichern)', () => {
  const src = lies('app/dashboard/personal/page.tsx');
  assert.ok(src.includes(".eq('owner_user_id', betriebsKennung(chef, uid))"));
  assert.ok(!src.includes("upsert({ owner_user_id: uid, bundesland: neu }"));
});

test('Rueckholung: Strecke, Kunden und Rechnungen des Betriebs', () => {
  const src = lies('app/dashboard/marketing/rueckholung/page.tsx');
  assert.equal((src.match(/\.eq\('owner_user_id', betrieb\)/g) || []).length, 3);
  assert.ok(!src.includes(".eq('owner_user_id', user.id)"));
});

test('Aendern schreibt den Besitzer nicht mehr mit (Abo-Rechnungen, Belege, Reisekosten, Mitglieder)', () => {
  for (const s of ['abo-rechnungen', 'eingangsbelege', 'reisekosten', 'mitglieder']) {
    const src = lies(`app/dashboard/${s}/page.tsx`);
    const i = src.indexOf('const payload = {');
    assert.ok(i > 0, s);
    assert.ok(!src.slice(i, src.indexOf('};', i)).includes('owner_user_id'), s);
  }
});
