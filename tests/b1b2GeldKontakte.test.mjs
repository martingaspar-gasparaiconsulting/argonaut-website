// B1b-2 (26.09.2026): Geld-Stellen und Kontakte — Martins „so".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { istMitarbeiterKennung, rechnungsRechtFehlt, RECHNUNG_NUR_CHEF, ZAHLUNG_NUR_CHEF } from '../out/nurGeschaeftsleitung.js';
import { profilKennung } from '../out/betriebProfil.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('Wer ist Mitarbeiter? mein_chef_id liefert einen Chef', async () => {
  assert.equal(istMitarbeiterKennung('chef-1'), true);
  assert.equal(istMitarbeiterKennung(null), false);
  assert.equal(istMitarbeiterKennung(''), false);
  assert.equal(await rechnungsRechtFehlt({ rpc: async () => ({ data: 'chef-1' }) }), RECHNUNG_NUR_CHEF);
  assert.equal(await rechnungsRechtFehlt({ rpc: async () => ({ data: null }) }), null);
  assert.equal(await rechnungsRechtFehlt({ rpc: async () => { throw new Error('x'); } }), null);
  assert.match(ZAHLUNG_NUR_CHEF, /Geschäftsleitung/);
});

test('Alle 17 Rechnung-aus-Wege weisen Mitarbeiter ab, bevor etwas entsteht', () => {
  const ordner = fs.readdirSync(new URL('../app/api/', import.meta.url)).filter((d) => d.startsWith('rechnung-aus-'));
  assert.equal(ordner.length, 17);
  for (const d of ordner) {
    const s = lies(`app/api/${d}/route.ts`);
    const pruef = s.indexOf('const nurChef = await rechnungsRechtFehlt(supabase);');
    assert.ok(pruef > 0, d);
    assert.ok(s.includes('if (nurChef) return NextResponse.json({ error: nurChef }, { status: 403 });'), d);
    const anlegen = s.search(/from\(["']rechnungen["']\)\s*\.insert\(/);
    assert.ok(anlegen < 0 || pruef < anlegen, d + ': Pruefung muss vor dem Anlegen stehen');
  }
});

test('Zahlungen und Banking: nur die Geschaeftsleitung erfasst Zahlungen', () => {
  for (const p of ['app/dashboard/zahlungen/page.tsx', 'app/dashboard/banking/page.tsx']) {
    const s = lies(p);
    const pruef = s.indexOf('if (istMitarbeiterKennung(chefId)) throw new Error(ZAHLUNG_NUR_CHEF);');
    assert.ok(pruef > 0 && pruef < s.indexOf(".from('zahlungen').insert("), p);
  }
});

test('Angebote, Kalkulator, Projektabrechnung, Foerder-Angebot, Anlagen, Leistungskatalog speichern fuer den Betrieb', () => {
  const faelle = [
    ['app/dashboard/angebote/page.tsx', 2], ['app/dashboard/projekt-abrechnung/page.tsx', 1],
    ['app/dashboard/foerder-angebot/page.tsx', 1], ['app/dashboard/anlagen/page.tsx', 1],
    ['app/dashboard/leistungskatalog/page.tsx', 2], ['app/dashboard/kalkulator/page.tsx', 5],
  ];
  for (const [p, n] of faelle) {
    const s = lies(p);
    assert.equal((s.match(/owner_user_id: besitzer \?\? uid/g) || []).length, n, p);
    assert.ok(s.includes("supabase.rpc('mein_chef_id')"), p);
  }
  // Kalkulations-Normen sind Einstellungen und bleiben beim Chef (B1b-1)
  assert.equal((lies('app/dashboard/kalkulator/page.tsx').match(/owner_user_id: uid, gewerk,/g) || []).length, 2);
});

test('PDFs holen die Firmendaten vom Betrieb', () => {
  assert.deepEqual(profilKennung('chef-1', 'ma-7'), { id: 'chef-1', fremd: true });
  assert.deepEqual(profilKennung(null, 'chef-1'), { id: 'chef-1', fremd: false });
  assert.deepEqual(profilKennung('chef-1', 'chef-1'), { id: 'chef-1', fremd: false });
  for (const p of ['app/api/angebot-pdf/route.ts', 'app/api/foerder-angebot-pdf/route.ts']) {
    const s = lies(p);
    assert.ok(s.includes('const p = await ladeBetriebProfil(supabase, user.id);'), p);
    assert.ok(!s.includes(".from('profiles').select('*').eq('id', user.id)"), p);
  }
});

test('Kontakte: Importe gehoeren dem Betrieb, SQL ohne Loeschrecht und ohne Rechnungs-Regeln', () => {
  assert.ok(lies('app/dashboard/crm/import/page.tsx').includes('owner_user_id: betrieb,'));
  const imp = lies('app/dashboard/import/page.tsx');
  assert.ok(imp.includes("if (ziel.tabelle === 'kontakte')") && imp.includes('owner_user_id: neuOwner'));
  const sql = lies('supabase-sql/b1b2-geld-kontakte.sql').replace(/--[^\n]*/g, '');
  const liste = sql.slice(sql.indexOf('tabellen text[]'), sql.indexOf('umhaengen text[]'));
  for (const t of ['angebote', 'angebot_positionen', 'kalkulationen', 'leistungskatalog', 'projektleistungen', 'foerder_angebote', 'kontakte']) assert.ok(liste.includes(`'${t}'`), t);
  assert.ok(!/'rechnungen'|'zahlungen'|'rechnung_positionen'/.test(liste));
  assert.ok(!/for delete/i.test(sql) && !/delete from/i.test(sql) && !/drop table/i.test(sql));
});
