// Paket 184 (30.09.2026) — Dateien, Uploads, IBAN, Import.
// M5: Datei-Pfade aus beschreibbaren Zeilen nur im Ordner des eigenen Betriebs.
// M10: Mitglieder-Liste laedt Bankdaten nur fuer Berechtigte.
// M11: Import erkennt IBANs auch am Inhalt, Werbe-Spalten auch an „Mailing".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pfadSauber, pfadImOrdner, sichererDateiname } from '../out/speicherPfad.js';
import { betriebsOrdner } from '../out/speicherPfadServer.js';
import { istIban, enthaeltIban, sperrGrund, vorschlagMapping, bereinigeMapping, spaltenBilanz, eigeneSpalten, EIGEN, NICHT } from '../out/importMotor.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const CHEF = '11111111-1111-1111-1111-111111111111';
const MA = '22222222-2222-2222-2222-222222222222';
const FREMD = '99999999-9999-9999-9999-999999999999';

test('pfadSauber: nichts, was aus dem Ordner fuehrt', () => {
  for (const p of [`${CHEF}/a.pdf`, `${CHEF}/x/y_1.pdf`]) assert.equal(pfadSauber(p), true, p);
  for (const p of ['', '/abs/a.pdf', `${CHEF}/../${FREMD}/a.pdf`, `${CHEF}//a.pdf`, `${CHEF}\\a.pdf`, `${CHEF}/./a.pdf`,
    `${CHEF}/%2e%2e/a.pdf`, `${CHEF}/a\u0000.pdf`, `${CHEF}/`, null, 42]) assert.equal(pfadSauber(p), false, String(p));
});

test('pfadImOrdner: nur Ordner des eigenen Betriebs', () => {
  assert.equal(pfadImOrdner(`${CHEF}/1_a.pdf`, [CHEF, MA]), true);
  assert.equal(pfadImOrdner(`${MA}/1_a.pdf`, [CHEF, MA]), true);
  assert.equal(pfadImOrdner(`${CHEF.toUpperCase()}/1_a.pdf`, [CHEF]), true);
  assert.equal(pfadImOrdner(`${FREMD}/1_a.pdf`, [CHEF, MA]), false, 'fremder Betrieb');
  assert.equal(pfadImOrdner(`${CHEF}x/1_a.pdf`, [CHEF]), false, 'Praefix-Trick');
  assert.equal(pfadImOrdner(`${CHEF}`, [CHEF]), false, 'nur Ordner, keine Datei');
  assert.equal(pfadImOrdner(`${CHEF}/../${FREMD}/a.pdf`, [CHEF]), false);
  assert.equal(pfadImOrdner(`${CHEF}/a.pdf`, []), false);
  assert.equal(pfadImOrdner(`${CHEF}/a.pdf`, [null, '', undefined]), false);
});

test('betriebsOrdner: Chef + Mitarbeiter-Zugaenge, bei Stoerung nur der Betrieb', async () => {
  const db = (antwort) => ({ from: () => ({ select: () => ({ eq: async () => antwort }) }) });
  assert.deepEqual(await betriebsOrdner(db({ data: [{ auth_user_id: MA }, { auth_user_id: null }, { auth_user_id: MA }], error: null }), CHEF), [CHEF, MA]);
  assert.deepEqual(await betriebsOrdner(db({ data: null, error: { message: 'x' } }), CHEF), [CHEF]);
  assert.deepEqual(await betriebsOrdner(db({ data: [{ auth_user_id: FREMD }], error: { message: 'x' } }), CHEF), [CHEF], 'Fehler zaehlt, auch mit Daten');
  assert.deepEqual(await betriebsOrdner({ from: () => { throw new Error('netz'); } }, CHEF), [CHEF]);
  assert.deepEqual(await betriebsOrdner(db({ data: [], error: null }), null), []);
});

test('sichererDateiname', () => {
  assert.equal(sichererDateiname('Größe Übersicht (final).pdf'), 'Groesse_Uebersicht_final_.pdf');
  assert.equal(sichererDateiname('../../etc/passwd'), 'etc_passwd');
  assert.equal(sichererDateiname(''), 'datei');
  assert.ok(!sichererDateiname('a/b\\c..d').includes('/'));
});

test('IBAN: Pruefziffer, auch mit Leerzeichen und mitten im Text', () => {
  assert.equal(istIban('DE89 3704 0044 0532 0130 00'), true);
  assert.equal(istIban('DE89370400440532013000'), true);
  assert.equal(istIban('DE89370400440532013001'), false, 'falsche Pruefziffer');
  assert.equal(istIban('4400'), false);
  assert.equal(enthaeltIban(['', 'Konto: DE89 3704 0044 0532 0130 00 (Sparkasse)']), true);
  assert.equal(enthaeltIban(['4400', '1200', '0151 2345678']), false, 'Sachkonten/Telefon sind keine IBAN');
});

test('Import: Spalte „Konto" mit IBAN-Inhalt bleibt draussen, „Konto" mit Sachkonto nicht', () => {
  const ziel = { key: 'kontakte', felder: [{ key: 'name', label: 'Name', typ: 'text', alias: ['name'] }] };
  const kopf = ['Name', 'Konto', 'Sachkonto'];
  const zeilen = [['Meier', 'DE89 3704 0044 0532 0130 00', '4400'], ['Huber', '', '1200']];
  assert.ok(sperrGrund('Konto', ziel, ['DE89370400440532013000']));
  assert.equal(sperrGrund('Konto', ziel, ['4400']), null);
  const m = vorschlagMapping(kopf, zeilen, ziel);
  assert.equal(m['Konto'], NICHT);
  assert.equal(m['Sachkonto'], EIGEN);
  assert.equal(bereinigeMapping(kopf, { Name: 'name', Konto: EIGEN, Sachkonto: EIGEN }, ziel, zeilen)['Konto'], NICHT);
  const b = spaltenBilanz(kopf, zeilen, { Name: 'name', Konto: EIGEN, Sachkonto: EIGEN }, ziel);
  assert.equal(b.eintraege.find((e) => e.spalte === 'Konto').art, 'nicht');
  assert.deepEqual(eigeneSpalten(kopf, zeilen, { Name: 'name', Konto: EIGEN, Sachkonto: EIGEN }, ziel).map((e) => e.spalte), ['Sachkonto']);
});

test('Import: „Mailing ja/nein" und „Werbeerlaubnis" gelten als Werbe-Einwilligung', () => {
  assert.ok(sperrGrund('Mailing ja/nein'));
  assert.ok(sperrGrund('Werbeerlaubnis'));
  assert.equal(sperrGrund('Ort'), null);
});

test('WAECHTER: Download-/Loeschwege pruefen den Ordner', () => {
  for (const f of ['app/api/wissen-dokument/route.ts', 'app/api/erstellte-dokumente/download/route.ts',
    'app/api/marketing/social-video/route.ts', 'app/api/marketing/freebie/route.ts',
    'app/api/oeffentlich/freebie-bestaetigen/route.ts', 'app/api/oeffentlich/portal/baustelle/route.ts']) {
    const s = lies(f);
    assert.match(s, /pfadImOrdner\(/, f);
    assert.match(s, /betriebsOrdner\(/, f);
  }
  assert.match(lies('app/api/wissen-dokument/route.ts'), /\n    if \(!pfadImOrdner\(d\.storage_path, ordner\)\) return NextResponse\.json\(\{ ok: false/);
  assert.match(lies('app/api/erstellte-dokumente/download/route.ts'), /\n    if \(!pfadImOrdner\(doc\.storage_path, ordner\)\) \{\n      return NextResponse\.json\(\{ ok: false/);
  assert.match(lies('app/api/marketing/social-video/route.ts'), /\n    if \(pfadImOrdner\(v\.pfad, await betriebsOrdner\(db as never, v\.owner_user_id\)\)\) \{\n      await db\.storage\.from\(BUCKET\)\.remove/);
  assert.match(lies('app/api/oeffentlich/freebie-bestaetigen/route.ts'), /\n    if \(f\.datei_pfad && pfadImOrdner\(f\.datei_pfad, await betriebsOrdner/);
  assert.match(lies('app/api/oeffentlich/portal/baustelle/route.ts'), /\.filter\(\(p\) => pfadImOrdner\(p, ordner\)\)/);
  assert.match(lies('app/api/documents/trigger-analysis/route.ts'), /pfadImOrdner\(d\.storage_path, \[user\.id\]\)/);
  assert.match(lies('app/api/oeffentlich/freebie-bestaetigen/route.ts'), /\.eq\('owner_user_id', l\.owner_user_id\)/);
  assert.match(lies('app/dashboard/documents/DocumentsClient.tsx'), /sichererDateiname\(file\.name\)/);
});

test('WAECHTER: Mitglieder laden Bankdaten nur fuer Berechtigte, Speichern leert sie nie', () => {
  const s = lies('app/dashboard/mitglieder/page.tsx');
  assert.ok(!s.includes("from('mitglieder').select('*')"));
  assert.match(s, /const SPALTEN_OHNE_BANK = '[^']*'/);
  assert.ok(!/iban|bic|mandat/.test(s.match(/const SPALTEN_OHNE_BANK = '([^']*)'/)[1]));
  // Paket 201 (bewusst angepasst): Bankdaten liegen in mitglieder_bank; geladen
  // nur bei darfBank, gespeichert getrennt und nur bei darfBank — nie leerend.
  assert.match(s, /if \(darfBank\) \{\s+const neu = await supabase\.from\(BANK_TABELLE\)\.select\(BANK_SPALTEN\)/);
  assert.match(s, /if \(darfBank\) \{ const vorher = liste\.find/);
  assert.match(s, /if \(bankIstLeer\(b\) && !schonDa\) return;/);
  assert.match(s, /darf_ich_modul_aendern', \{ p_modul: 'mitglieder' \}/);
  assert.ok(!lies('app/dashboard/wiederkehr/page.tsx').includes("from('mitglieder').select('*')"));
});
