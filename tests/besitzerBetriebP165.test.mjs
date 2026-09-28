// Paket 165 (28.09.2026) — Besitzer = Betrieb, Teil 2: was ein Mitarbeiter
// anlegt, gehoert dem Betrieb; Anlegen/Aendern nur mit Schreibrecht fuers Modul.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const SQL = lies('supabase-sql/p165-besitzer-betrieb-2.sql');
const ohneKommentar = SQL.split('\n').filter((z) => !z.trim().startsWith('--')).join('\n');

const PAARE = [
  ['bewertungsanfragen', 'bewertungen'], ['buchungen', 'buchungen'], ['ernte_ernte', 'ernte'], ['markt_produkt', 'ernte'],
  ['forst_einsatzmittel', 'forst'], ['forst_nachweis', 'forst'], ['holz_sortiment', 'holz'], ['holz_preise', 'holz'],
  ['holz_mengenrabatt', 'holz'], ['holz_auftraege', 'holz'], ['holz_auftrag_positionen', 'holz'], ['pakete', 'holz'],
  ['paket_positionen', 'holz'], ['marketing_segment', 'marketing'], ['webinare', 'marketing'], ['webinar_termin', 'marketing'],
  ['shop_bestellungen', 'shop'],
];

test('SQL: jede Tabelle mit ihrem Modul', () => {
  for (const [t, m] of PAARE) assert.ok(SQL.includes(`array['${t}', '${m}']`), t);
});

test('SQL: Anlegen/Aendern nur mit Schreibrecht, Loeschen nie, nichts entfernt', () => {
  assert.match(ohneKommentar, /for insert to authenticated with check \(owner_user_id = public\.mein_chef_id\(\) and public\.darf_ich_modul_aendern\(%L\)\)/);
  assert.match(ohneKommentar, /for update to authenticated using \(owner_user_id = public\.mein_chef_id\(\) and public\.darf_ich_modul_aendern\(%L\)\)/);
  assert.ok(!/for delete|for all/i.test(ohneKommentar));
  assert.ok(!/drop table|drop column|delete from|truncate/i.test(ohneKommentar));
  const drops = ohneKommentar.match(/drop (policy|trigger) if exists (\S+)/g) || [];
  assert.ok(drops.every((d) => /p165_/.test(d)), 'nur eigene Regeln/Trigger werden neu gesetzt');
});

test('SQL: Besitzer-Trigger — Mitarbeiter legt fuer den Betrieb an, Aendern behaelt den Besitzer, exception-sicher', () => {
  const i = SQL.indexOf('function public.p165_besitzer()');
  const f = SQL.slice(i, SQL.indexOf('$$;', i));
  assert.match(f, /v_chef := public\.mein_chef_id\(\);\s+if v_chef is not null then\s+new\.owner_user_id := v_chef;/);
  assert.match(f, /if auth\.uid\(\) is not null then\s+new\.owner_user_id := old\.owner_user_id;/);
  assert.match(f, /exception when others then/);
});

const SEITEN = [
  'app/dashboard/bewertungen/page.tsx', 'app/dashboard/buchungen/page.tsx', 'app/dashboard/forst/einsatzmittel/page.tsx',
  'app/dashboard/forst/nachweise/page.tsx', 'app/dashboard/marketing/segmente/page.tsx', 'app/dashboard/marketing/webinare/page.tsx',
  'app/dashboard/holz/page.tsx', 'app/dashboard/holz/auftraege/page.tsx', 'app/dashboard/holz/pakete/page.tsx', 'app/dashboard/holz/import/page.tsx',
];

test('Seiten: nie mehr die eigene Kennung als Besitzer beim Speichern', () => {
  for (const s of SEITEN) {
    const src = lies(s);
    assert.ok(!/owner_user_id: (uid|user\.id),/.test(src), s);
    assert.ok(/mein_chef_id/.test(src) && /betriebsKennung/.test(src), s + ': Betrieb wird nicht ermittelt');
  }
});

test('Holz: Auftragsnummer und Preis-Abgleich laufen ueber den Betrieb', () => {
  assert.ok(lies('app/dashboard/holz/auftraege/page.tsx').includes("{ p_owner: besitzer ?? uid }"));
  const imp = lies('app/dashboard/holz/import/page.tsx');
  assert.equal((imp.match(/owner_user_id: betrieb,/g) || []).length, 2);
});

test('Webinare: Liste laedt die des Betriebs', () => {
  const src = lies('app/dashboard/marketing/webinare/page.tsx');
  assert.ok(src.includes('await alles(betrieb ?? id);'));
  assert.ok(!src.includes('await alles(uid);'));
});

test('Termine: Besitzer setzt die Datenbank, Ende ist nie leer', () => {
  const src = lies('app/dashboard/termine/page.tsx');
  assert.ok(!/owner_user_id: uid/.test(src));
  assert.ok(!/ende_am: ende \? new Date\(ende\)\.toISOString\(\) : null/.test(src));
  assert.ok(src.includes('new Date(beginnD.getTime() + 60 * 60 * 1000)'));
});

test('Bewertungs-Links: kein ratbarer Rueckfall', () => {
  for (const s of ['app/dashboard/bewertungen/page.tsx', 'app/api/marketing/bewertung-kampagne/route.ts']) {
    assert.ok(!/Math\.random\(\)/.test(lies(s)), s);
  }
});
