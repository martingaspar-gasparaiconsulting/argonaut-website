// ============================================================================
// tests/mitgliederBankP201.test.mjs — Paket 201 (Entscheidung E4)
//   Mitglieder-Bankdaten in eigener Tabelle, alte Leseregel mgd_select_ma weg.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bankAusFormular, bankIstLeer, mischeBank, tabelleFehlt, BANK_LEER, BANK_TABELLE } from '../out/mitgliederBank.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Formular → Bankdaten: IBAN/BIC kompakt und groß, Datum nur ISO', () => {
  assert.deepEqual(bankAusFormular({ iban: ' de89 3704 0044 0532 0130 00 ', bic: 'cobadeffxxx', mandatsreferenz: ' M-1 ', mandat_datum: '2026-01-01' }),
    { iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', mandatsreferenz: 'M-1', mandat_datum: '2026-01-01' });
  assert.deepEqual(bankAusFormular({ iban: '', bic: '  ', mandatsreferenz: '', mandat_datum: '01.01.2026' }), BANK_LEER);
  assert.equal(bankIstLeer(BANK_LEER), true);
  assert.equal(bankIstLeer({ ...BANK_LEER, mandat_datum: '2026-01-01' }), false);
});

test('Bankzeilen an Mitglieder hängen — neu (mitglied_id) und alter Weg (id)', () => {
  const m = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const neu = mischeBank(m, [{ mitglied_id: 'a', iban: 'DE1', bic: null, mandatsreferenz: 'M', mandat_datum: '2026-01-01' }]);
  assert.equal(neu[0].iban, 'DE1');
  assert.equal(neu[1].iban, null, 'ohne Bankzeile: leer');
  const alt = mischeBank(m, [{ id: 'b', iban: 'DE2' }]);
  assert.equal(alt[1].iban, 'DE2');
  assert.equal(mischeBank(m, null)[0].mandatsreferenz, null);
});

test('Übergang: fehlende Tabelle wird erkannt, andere Fehler nicht', () => {
  assert.equal(tabelleFehlt({ code: '42P01', message: 'relation "mitglieder_bank" does not exist' }), true);
  assert.equal(tabelleFehlt({ code: 'PGRST205', message: "Could not find the table 'public.mitglieder_bank' in the schema cache" }), true);
  assert.equal(tabelleFehlt({ code: '42501', message: 'new row violates row-level security policy for table "mitglieder_bank"' }), false);
  assert.equal(tabelleFehlt(null), false);
});

test('Seite: Bankdaten nur aus mitglieder_bank, nie mehr im Mitglieder-Payload', () => {
  const s = lies('app/dashboard/mitglieder/page.tsx');
  assert.ok(s.includes('supabase.from(BANK_TABELLE).select(BANK_SPALTEN)'));
  assert.ok(s.includes(".upsert({ mitglied_id: mitgliedId, owner_user_id: besitzer ?? uid, ...b }, { onConflict: 'mitglied_id' })"));
  assert.ok(!/payload = \{[\s\S]{0,600}iban:/.test(s), 'payload ohne iban');
  assert.ok(s.includes('rpc(\'darf_ich_modul_aendern\', { p_modul: \'mitglieder\' })'), 'Bank nur mit Schreibrecht');
  assert.equal(BANK_TABELLE, 'mitglieder_bank');
  assert.ok(lies('lib/sicherungTabellen.ts').includes("'mitglieder_bank'"), 'Datensicherung enthält die Bankdaten');
});

test('SQL p201: neue Tabelle mit Schreibrecht-Regel, alte Leseregel weg, Spalten bleiben, Zwei-Faktor', () => {
  const s = lies('supabase-sql/p201-mitglieder-bank.sql');
  const ohne = s.replace(/--.*$/gm, '');
  assert.ok(ohne.includes('drop policy if exists mgd_select_ma on public.mitglieder;'));
  assert.ok(!/drop\s+(table|column)/i.test(ohne), 'Spalten/Tabellen werden nicht gelöscht');
  assert.ok(ohne.includes("public.darf_ich_modul_aendern('mitglieder')"));
  assert.ok(!ohne.includes("darf_ich_modul_sehen('mitglieder')"), 'Nur-Lesen sieht keine Bankdaten');
  assert.ok(ohne.includes('create policy p164s3_aal on public.mitglieder_bank as restrictive'));
  assert.ok(ohne.includes('revoke all on public.mitglieder_bank from anon;'));
  assert.ok(ohne.includes('on conflict (mitglied_id) do nothing'));
  assert.ok(s.includes('AUSSPERR-HINWEIS'));
  assert.ok(s.includes('RÜCKWEG'));
});
