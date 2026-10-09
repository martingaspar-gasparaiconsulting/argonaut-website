// „Darf abrechnen" (27.09.2026) — Martins Entscheidung: Die Büroleitung muss
// Rechnungen schreiben können, der Chef kontrolliert. Rechnungen gehören immer
// dem Betrieb; Stornieren, Reaktivieren und Zahlungen löschen bleibt beim Chef.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  abrechnungEntscheiden, abrechnungPruefen, rechnungsRechtFehlt,
  RECHNUNG_NUR_CHEF, ZAHLUNG_NUR_CHEF, MAHNUNG_NUR_CHEF, STORNO_NUR_CHEF,
} from '../out/nurGeschaeftsleitung.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/** rpc-Attrappe: antwortet je Funktion mit dem hinterlegten Wert oder wirft. */
const rpcMit = (werte) => ({
  rpc: async (fn) => {
    const w = werte[fn];
    if (w instanceof Error) throw w;
    return { data: w ?? null, error: null };
  },
});

test('Entscheidung: Chef, Mitarbeiter mit Haken, Mitarbeiter ohne Haken', () => {
  assert.deepEqual(abrechnungEntscheiden(null, false, 'chef-1'), { ok: true, betrieb: 'chef-1', mitarbeiter: false });
  assert.deepEqual(abrechnungEntscheiden('chef-1', true, 'ma-7'), { ok: true, betrieb: 'chef-1', mitarbeiter: true });
  assert.deepEqual(abrechnungEntscheiden('chef-1', false, 'ma-7'), { ok: false, fehler: RECHNUNG_NUR_CHEF });
  // nur echtes true zählt — kein „truthy"
  assert.equal(abrechnungEntscheiden('chef-1', 'true', 'ma-7').ok, false);
  assert.equal(abrechnungEntscheiden('chef-1', 1, 'ma-7').ok, false);
  assert.deepEqual(abrechnungEntscheiden('chef-1', false, 'ma-7', ZAHLUNG_NUR_CHEF), { ok: false, fehler: ZAHLUNG_NUR_CHEF });
});

test('Prüfung gegen die Datenbank: nie still erlauben', async () => {
  // Chef
  assert.deepEqual(await abrechnungPruefen(rpcMit({ mein_chef_id: null }), 'chef-1'), { ok: true, betrieb: 'chef-1', mitarbeiter: false });
  // Mitarbeiter mit Haken -> Betrieb ist der Chef
  assert.deepEqual(await abrechnungPruefen(rpcMit({ mein_chef_id: 'chef-1', darf_ich_abrechnen: true }), 'ma-7'), { ok: true, betrieb: 'chef-1', mitarbeiter: true });
  // ohne Haken
  assert.equal((await abrechnungPruefen(rpcMit({ mein_chef_id: 'chef-1', darf_ich_abrechnen: false }), 'ma-7')).ok, false);
  // SQL noch nicht gelaufen (Funktion fehlt) -> kein Recht
  assert.equal((await abrechnungPruefen(rpcMit({ mein_chef_id: 'chef-1', darf_ich_abrechnen: new Error('fehlt') }), 'ma-7')).ok, false);
  assert.equal((await abrechnungPruefen({ rpc: async (fn) => (fn === 'mein_chef_id' ? { data: 'chef-1' } : { data: true, error: { message: 'x' } }) }, 'ma-7')).ok, false);
  // alte Schnittstelle
  assert.equal(await rechnungsRechtFehlt(rpcMit({ mein_chef_id: 'chef-1', darf_ich_abrechnen: true })), null);
  assert.equal(await rechnungsRechtFehlt(rpcMit({ mein_chef_id: 'chef-1' })), RECHNUNG_NUR_CHEF);
  for (const t of [RECHNUNG_NUR_CHEF, ZAHLUNG_NUR_CHEF, MAHNUNG_NUR_CHEF]) assert.match(t, /Darf abrechnen/);
  assert.match(STORNO_NUR_CHEF, /Geschäftsleitung/);
});

test('Alle 22 Rechnung-aus-Wege: Rechnung, Positionen und Rückschrieb gehören dem Betrieb', () => {
  const ordner = fs.readdirSync(new URL('../app/api/', import.meta.url)).filter((d) => d.startsWith('rechnung-aus-'));
  assert.equal(ordner.length, 22); // P268: + rechnung-aus-kfz-verkauf · P292: + rechnung-aus-vermietung · P293: + rechnung-aus-bussgeld · P295: + rechnung-aus-dienstrad · P296: + rechnung-aus-trackday
  for (const d of ordner) {
    const s = lies(`app/api/${d}/route.ts`);
    assert.ok(!s.includes('owner_user_id: user.id'), d + ': Besitzer darf nie die klickende Person sein');
    assert.ok((s.match(/owner_user_id: betrieb/g) || []).length >= 2, d);
    assert.ok(s.includes('const schreiber = quellSchreiber(supabase, abr);'), d);
    // Jeder Rückschrieb über den Schreiber trägt die Betriebs-Grenze
    const rueck = s.split('schreiber').slice(1).filter((t) => /^\s*\.from\(/.test(t) || /^\.from\(/.test(t));
    assert.ok(rueck.length >= 1, d + ': Rückschrieb fehlt');
    for (const t of rueck) {
      const bisEnde = t.slice(0, t.indexOf(';'));
      assert.ok(bisEnde.includes('"owner_user_id", betrieb') || bisEnde.includes("'owner_user_id', betrieb"), d + ': Rückschrieb ohne Betriebs-Grenze');
    }
    assert.ok(!/from\(["']profiles["']\)/.test(s), d + ': Profil nur über ladeBetriebProfil');
  }
});

test('Wiederkehr-Lauf: vorher legte ein Mitarbeiter Rechnungen auf sich selbst an', () => {
  const s = lies('app/api/wiederkehr-lauf/route.ts');
  const pruef = s.indexOf('const abr = await abrechnungPruefen(supabase, user.id);');
  assert.ok(pruef > 0);
  assert.ok(pruef < s.indexOf('rechnungAnlegen(\n        supabase, betrieb,'));
  assert.equal((s.match(/supabase, betrieb,/g) || []).length, 2);
  assert.ok(!s.includes('supabase, user.id,'));
  assert.ok(s.includes('await schreiber.from("wartungsvertraege")') && s.includes('await schreiber.from("abo_rechnungen")'));
  assert.equal((s.match(/\.eq\("owner_user_id", betrieb\)/g) || []).length, 2);
  assert.ok(s.includes('owner_user_id: betrieb,\n      gestartet_von: user.id,'));
});

test('Zahlungen, Banking, Rechnungsseite: Zahlung gehört dem Betrieb, Recht wird vorher geprüft', () => {
  for (const p of ['app/dashboard/zahlungen/page.tsx', 'app/dashboard/banking/page.tsx']) {
    const s = lies(p);
    const pruef = s.indexOf('const abr = await abrechnungPruefen(supabase, u.user.id, ZAHLUNG_NUR_CHEF);');
    assert.ok(pruef > 0 && pruef < s.indexOf(".from('zahlungen').insert("), p);
    assert.ok(s.includes('owner_user_id: abr.betrieb,'), p);
  }
  const r = lies('app/dashboard/rechnungen/[id]/page.tsx');
  assert.equal((r.match(/owner_user_id: rechnung\?\.owner_user_id \?\? user\.id/g) || []).length, 2);
  assert.ok(!r.includes('owner_user_id: user.id'));
  assert.ok(r.includes('if (istMa) {\n      setFehler(STORNO_NUR_CHEF);'));
  assert.ok(r.includes('if (istMa) {\n      setFehler(ZAHLUNG_LOESCHEN_NUR_CHEF);'));
  // Paket 267: Storno-Knöpfe kommen aus stornoKnoepfe() — beim Mitarbeiter keine (istChef: !istMa)
  assert.ok(r.includes('const k = stornoKnoepfe({ status, festgeschrieben, istStorno: !!rechnung?.storno_zu, hatStorno: !!stornoDurch, istChef: !istMa });'), 'Storno-Knopf beim Mitarbeiter ausgeblendet');
  assert.ok(r.includes('fetch("/api/betrieb-firmendaten")'), 'Absender vom Betrieb');
  assert.ok(r.includes('erstellt von {ersteller}'));
});

test('Mahnwesen und SEPA', () => {
  const m = lies('app/dashboard/mahnwesen/page.tsx');
  assert.equal((m.match(/abrechnungPruefen\(supabase, "", MAHNUNG_NUR_CHEF\)/g) || []).length, 2);
  const md = lies('app/dashboard/mahnwesen/[id]/page.tsx');
  assert.ok(md.includes('abrechnungPruefen(supabase, "", MAHNUNG_NUR_CHEF)') && md.includes('fetch("/api/betrieb-firmendaten")'));
  const sepa = lies('app/dashboard/sepa-einzug/page.tsx');
  assert.equal((sepa.match(/if \(istMa\) \{ setFehler\(SEPA_NUR_CHEF\); return; \}/g) || []).length, 3);
});

test('PDFs, Versand und Archiv tragen den Betrieb', () => {
  const pdf = lies('app/api/rechnung-pdf/route.ts');
  assert.equal((pdf.match(/await betriebLeser\(supabase, user\.id\)/g) || []).length, 2);
  assert.ok(pdf.includes(".eq('owner_user_id', betrieb).eq('typ', 'zahlung')"));
  assert.ok(pdf.includes(".eq('owner_user_id', betrieb)\n          .limit(1);"));
  assert.ok(lies('app/api/mahnung-pdf/route.ts').includes(".from('web_ci').select(CI_SPALTEN).eq('owner_user_id', betrieb)"));
  const senden = lies('app/api/rechnung-senden/route.ts');
  assert.ok(senden.includes('absenderBranding(quellSchreiber(supabase, { mitarbeiter }), absenderId)'));
  const archiv = lies('app/api/erechnung-archivieren/route.ts');
  assert.ok(archiv.includes("await nutzerClient.rpc('mein_chef_id')"));
  const firma = lies('app/api/betrieb-firmendaten/route.ts');
  assert.ok(firma.includes("pruef('darf_ich_abrechnen')") && firma.includes("p_modul: 'rechnungen'"));
  assert.ok(!/firma_akzentfarbe|sepa_iban|email\b.*full_name/.test(firma.slice(firma.indexOf('const RECHNUNGS_FELDER'), firma.indexOf('] as const'))), 'nur Rechnungsfelder');
});

test('Rechte-Seite: nur der Eigentümer vergibt das Recht, Seite lädt auch ohne neue Spalte', () => {
  const s = lies('app/dashboard/rechte/page.tsx');
  assert.ok(s.includes('if (meineRolle !== "eigentuemer") return;\n    const frage = an'));
  assert.ok(s.includes('.select("id,darf_abrechnen")'), 'eigene Abfrage');
  assert.ok(s.includes('.select("id,vorname,nachname,position,abteilung,status,auth_user_id,rolle,darf_verteilen")'), 'Hauptliste unverändert');
  assert.ok(s.includes('.update({ darf_abrechnen: an })') && s.includes('.select("id");'));
});

test('SQL: additiv, ohne Löschrecht auf Rechnungen, Storno-Wächter, Glocke', () => {
  const sql = lies('supabase-sql/darf-abrechnen.sql').replace(/--[^\n]*/g, '');
  assert.ok(/add column if not exists darf_abrechnen boolean not null default false/.test(sql));
  assert.ok(!/drop table|drop column|delete from|truncate|alter column [a-z_]+ type/i.test(sql));
  // Löschregeln nur für Positionen und Abschläge — nie für Rechnungen oder Zahlungen
  const loesch = [...sql.matchAll(/create policy abr_delete on public\.([a-z_]+)/g)].map((m) => m[1]);
  assert.deepEqual(loesch, ['rechnung_positionen', 'rechnung_abschlaege']);
  assert.ok(!/abr_delete on public\.(rechnungen|zahlungen)\b/.test(sql));
  assert.ok(!/abr_update on public\.zahlungen/.test(sql));
  // jede neue Regel verlangt Betrieb UND Haken
  for (const m of sql.matchAll(/create policy (abr_\w+) on public\.(rechnungen|rechnung_positionen|zahlungen|mahnung_historie)[^;]+;/g)) {
    assert.ok(m[0].includes('public.mein_chef_id()') && m[0].includes('public.darf_ich_abrechnen()'), m[1] + ' ' + m[2]);
  }
  assert.ok(sql.includes("raise exception 'Stornieren und Reaktivieren macht die Geschäftsleitung.'"));
  assert.ok(sql.includes("interval '10 minutes'"));
  assert.ok(sql.includes('after insert on public.rechnungen') && sql.includes('after insert on public.zahlungen'));
  assert.ok(sql.includes("if vorgabe = 'auth.uid()' then"), 'Vorgabe nur umstellen, wo sie genau auth.uid() ist');
});
