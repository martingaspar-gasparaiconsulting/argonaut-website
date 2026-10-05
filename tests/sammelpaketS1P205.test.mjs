// ============================================================================
// tests/sammelpaketS1P205.test.mjs — Paket 205 (Stufe 3 · S1 Sammelpaket Kontrollgang)
//   1. Newsletter-Dashboard „Abmelden" trägt in die Sperrliste aller Kanäle ein
//   2. Beispiel-Adressen in Vorlagen/Platzhaltern nur noch auf example.com
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { widerspruchEintragen } from '../out/werbeErlaubnisServer.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const BETRIEB = '11111111-2222-3333-4444-555555555555';

/** Kleine Attrappe der Datenbank: merkt sich jede Schreib-Aktion je Tabelle. */
function attrappe() {
  const log = [];
  const kette = (tabelle, art, wert) => {
    const eintrag = { tabelle, art, wert, filter: [] };
    log.push(eintrag);
    const k = {
      eq: (s, v) => { eintrag.filter.push([s, v]); return k; },
      neq: () => k, is: () => k, ilike: (s, v) => { eintrag.filter.push([s, v]); return k; },
      then: (r) => r({ error: null }),
    };
    return k;
  };
  return {
    log,
    from: (t) => ({
      upsert: (w) => kette(t, 'upsert', w),
      update: (w) => kette(t, 'update', w),
    }),
  };
}

test('Abmelden aus dem Dashboard: Sperrliste + alle Kanäle, nur eigener Betrieb', async () => {
  const db = attrappe();
  const ok = await widerspruchEintragen(db, BETRIEB, ' Kunde@Beispiel.Example.com ', 'newsletter_dashboard');
  assert.equal(ok, true);
  const sperre = db.log.find((e) => e.tabelle === 'werbe_sperre');
  assert.ok(sperre, 'Sperrliste beschrieben');
  assert.equal(sperre.wert.email, 'kunde@beispiel.example.com');
  assert.equal(sperre.wert.owner_user_id, BETRIEB);
  assert.equal(sperre.wert.quelle, 'newsletter_dashboard');
  for (const t of ['kontakte', 'newsletter_abonnenten', 'autoresponder_lauf', 'rueckhol_lauf']) {
    const e = db.log.find((x) => x.tabelle === t);
    assert.ok(e, `Kanal ${t} angesprochen`);
    assert.ok(e.filter.some(([s, v]) => s === 'owner_user_id' && v === BETRIEB), `${t} auf Betrieb gefiltert`);
  }
});

test('Route und Seite sind verdrahtet', () => {
  const route = lies('app/api/newsletter/abmelden-hand/route.ts');
  assert.match(route, /modulRechtPruefen\(supabase, user\?\.id \?\? null, 'marketing', 'aendern'\)/);
  assert.match(route, /widerspruchEintragen\(db, betrieb, email, ABMELDE_QUELLE\)/);
  assert.match(route, /\.eq\('owner_user_id', betrieb\)[\s\S]*\.eq\('owner_user_id', betrieb\)/, 'Lesen und Schreiben auf Betrieb gefiltert');
  assert.doesNotMatch(route, /^export const ABMELDE_QUELLE/m, 'Next.js erlaubt keine Fremd-Exporte in Routen');
  const seite = lies('app/dashboard/marketing/newsletter/page.tsx');
  assert.match(seite, /\/api\/newsletter\/abmelden-hand/);
  assert.doesNotMatch(seite, /\.update\(\{ status: neu/, 'kein reines Status-Setzen mehr im Browser');
});

test('Beispiel-Adressen nur auf example.com', () => {
  const dateien = [
    'app/dashboard/erp/lieferanten/import/page.tsx',
    'app/dashboard/marketing/autoresponder/page.tsx',
    'app/dashboard/marketing/newsletter/page.tsx',
    'app/dashboard/posteingang/page.tsx',
    'app/dashboard/shop/page.tsx',
    'lib/beispielKatalog.ts',
    'lib/beispielKern.ts',
    'lib/beispielStammdaten.ts',
    'lib/beispielModule.ts',
  ];
  const mail = /[a-z0-9._-]+@([a-z0-9-]+\.)+[a-z]{2,}/gi;
  for (const d of dateien) {
    const treffer = (lies(d).match(mail) || []).filter((m) => !/\.example\.(com|org|net)$/i.test(m) && !/@example\.(com|org|net)$/i.test(m));
    assert.deepEqual(treffer, [], `${d}: echte Domains ${treffer.join(', ')}`);
  }
  assert.doesNotMatch(lies('app/dashboard/erp/lieferanten/import/page.tsx'), /STIHL|Aspen/, 'keine echten Firmennamen im Beispiel');
});
