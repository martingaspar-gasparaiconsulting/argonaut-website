// Paket VK2 (16.10.2026): Qualifizierung und Übergabe Setter → Closer
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  STANDARD_FRAGEN, GRUENDE, istGrund, grundText, frageKey, fragenBereinigen, bogenFragen, antwortenBereinigen,
  fehlendePflicht, ergebnisPruefen, spickzettel, gruendeZaehlen, passtQuote,
} from '../out/qualifizierung.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const K = 'a0000000-0000-4000-8000-000000000003';

test('Standardbogen: Bedarf, Budget, Entscheider, Zeitpunkt — alle Pflicht', () => {
  assert.deepEqual(STANDARD_FRAGEN.map((f) => f.key), ['bedarf', 'budget', 'entscheider', 'zeitpunkt']);
  assert.ok(STANDARD_FRAGEN.every((f) => f.pflicht));
  assert.ok(Object.isFrozen(STANDARD_FRAGEN));
});

test('Gruende stimmen mit der Datenbank-Regel ueberein', () => {
  const sql = lies('supabase-sql/p408-qualifizierung.sql');
  const m = /grund in \(([^)]+)\)/.exec(sql);
  const db = m[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  assert.deepEqual(db, GRUENDE.map((g) => g.key));
  assert.ok(istGrund('kein_budget') && !istGrund('egal'));
  assert.equal(grundText('gebiet'), 'Außerhalb unseres Einzugsgebiets');
});

test('Frage-Schluessel: Umlaute, eindeutig, beginnt mit Buchstabe', () => {
  assert.equal(frageKey('Größe des Bads (m²)?'), 'groesse_des_bads_m');
  assert.equal(frageKey('Größe des Bads', ['groesse_des_bads']), 'groesse_des_bads_2');
  assert.equal(frageKey('1. Termin'), 'frage_1_termin');
  assert.equal(frageKey(''), 'frage');
});

test('Fragen bereinigen: leere weg, Auswahl braucht 2 Moeglichkeiten, doppelte Schluessel neu', () => {
  const f = fragenBereinigen([
    { frage: 'Fläche', typ: 'zahl', pflicht: true },
    { frage: '  ', typ: 'text' },
    { frage: 'Farbe', typ: 'auswahl', optionen: ['weiß'] },
    { frage: 'Material', typ: 'auswahl', optionen: ['Holz', 'Holz', 'Stein', ''] },
    { key: 'flaeche', frage: 'Fläche zweimal', typ: 'quatsch' },
    null,
  ]);
  assert.deepEqual(f.map((x) => [x.key, x.typ, x.pflicht]), [['flaeche', 'zahl', true], ['material', 'auswahl', false], ['flaeche_zweimal', 'text', false]]);
  assert.deepEqual(f[1].optionen, ['Holz', 'Stein']);
  assert.deepEqual(fragenBereinigen('kein array'), []);
});

test('Bogen: Standard + eigene, eigene Frage mit gleichem Schluessel ersetzt Standard', () => {
  const b = bogenFragen([{ key: 'budget', frage: 'Budget (genau)', typ: 'zahl' }, { frage: 'Etage', typ: 'zahl' }]);
  assert.deepEqual(b.map((f) => f.key), ['bedarf', 'entscheider', 'zeitpunkt', 'budget', 'etage']);
  assert.deepEqual(bogenFragen([{ frage: 'Etage', typ: 'zahl' }], false).map((f) => f.key), ['etage']);
});

test('Antworten: nur bekannte Fragen und gueltige Werte', () => {
  const fr = bogenFragen([{ frage: 'Etage', typ: 'zahl' }, { frage: 'Aufzug', typ: 'janein' }]);
  const a = antwortenBereinigen(fr, { budget: 'über 20.000 €', entscheider: 'vielleicht', etage: '1.200,5', aufzug: 'jein', fremd: 'x', bedarf: '  Bad neu  ' });
  assert.deepEqual(a, { budget: 'über 20.000 €', etage: '1.200,5', bedarf: 'Bad neu' });
  assert.deepEqual(fehlendePflicht(fr, a), ['Entscheidet der Gesprächspartner selbst?', 'Wann soll es losgehen?']);
});

test('Ergebnis pruefen: passt braucht Pflicht + Closer aus dem Team; passt nicht braucht Grund', () => {
  const fr = STANDARD_FRAGEN;
  const voll = { bedarf: 'Bad', budget: 'noch offen', entscheider: 'ja, allein', zeitpunkt: 'sofort' };
  assert.deepEqual(ergebnisPruefen({ ergebnis: 'passt', anUser: K }, fr, voll, [K]), []);
  assert.match(ergebnisPruefen({ ergebnis: 'passt', anUser: K }, fr, { bedarf: 'Bad' }, [K])[0], /Bitte noch beantworten/);
  assert.deepEqual(ergebnisPruefen({ ergebnis: 'passt', anUser: null }, fr, voll, [K]), ['Bitte einen Closer für die Übergabe wählen.']);
  assert.deepEqual(ergebnisPruefen({ ergebnis: 'passt', anUser: 'fremd' }, fr, voll, [K]), ['Der gewählte Closer gehört nicht zu Ihrem Team.']);
  assert.deepEqual(ergebnisPruefen({ ergebnis: 'passt_nicht', grund: '' }, fr, {}, []), ['Bitte einen Grund wählen.']);
  assert.equal(ergebnisPruefen({ ergebnis: 'passt_nicht', grund: 'sonstiges', grundText: ' ' }, fr, {}, []).length, 1);
  assert.deepEqual(ergebnisPruefen({ ergebnis: 'passt_nicht', grund: 'kein_budget' }, fr, {}, []), [], 'ohne Pflichtantworten abschliessbar');
});

test('Spickzettel: Reihenfolge der Fragen, offene markiert', () => {
  const z = spickzettel(STANDARD_FRAGEN, { budget: '1.000–5.000 €' });
  assert.equal(z.length, 4);
  assert.deepEqual(z[1], { frage: 'Budget', antwort: '1.000–5.000 €', offen: false });
  assert.deepEqual(z[0], { frage: 'Was genau braucht der Kunde?', antwort: '—', offen: true });
});

test('Auswertung: Gruende zaehlen, Quote nur aus entschiedenen', () => {
  const z = [{ ergebnis: 'passt' }, { ergebnis: 'passt_nicht', grund: 'kein_budget' }, { ergebnis: 'passt_nicht', grund: 'kein_budget' },
    { ergebnis: 'passt_nicht', grund: 'quatsch' }, { ergebnis: 'offen' }];
  assert.deepEqual(gruendeZaehlen(z), [{ key: 'kein_budget', text: 'Kein Budget / zu teuer', anzahl: 2 }, { key: 'sonstiges', text: 'Sonstiges', anzahl: 1 }]);
  assert.deepEqual(passtQuote(z), { passt: 1, passtNicht: 3, offen: 1, quote: 25 });
  assert.equal(passtQuote([{ ergebnis: 'offen' }]).quote, null);
});

test('SQL p408: Lese-Regeln haengen an der Lead-Sichtbarkeit, Glocke per Datenbank, additiv', () => {
  const s = lies('supabase-sql/p408-qualifizierung.sql');
  assert.match(s, /exists \(select 1 from public\.leads l where l\.id = lead_id\)/);
  assert.match(s, /p358_im_team\(new\.owner_user_id, new\.an_user_id\)/);
  assert.match(s, /insert into public\.benachrichtigungen/);
  assert.match(s, /exception when others then null; -- Glocke darf die Uebergabe nie verhindern/);
  assert.match(s, /constraint lead_quali_grund_chk check \(\(ergebnis = 'passt_nicht'\) = \(grund is not null\)\)/);
  assert.match(s, /new\.von_user_id := auth\.uid\(\)/, 'Absender nicht faelschbar');
  assert.doesNotMatch(s, /\bdrop table\b|\btruncate\b|\bdelete from\b/i);
  assert.doesNotMatch(s, /p408_ueb_\w+ on public\.vk_uebergabe for (update|delete)/, 'Uebergaben nur anhaengen');
});

test('Oberflaeche: Passt nicht setzt verloren und stoppt Nachfassen; Spickzettel verlinkt', () => {
  const q = lies('app/dashboard/leads/[id]/QualiBox.tsx');
  assert.match(q, /feldwerteFuerStufe\('verloren'/);
  assert.match(q, /nachfassAktiv \? stoppWerte\('gestoppt'\)/);
  assert.match(q, /ergebnisPruefen\(\{ ergebnis: 'passt'/);
  assert.match(q, /\/spickzettel/);
  const p = lies('app/dashboard/leads/[id]/page.tsx');
  assert.match(p, /<QualiBox /);
  assert.match(p, /<LeadDetailClient key=/);
  const z = lies('app/dashboard/leads/[id]/spickzettel/page.tsx');
  assert.match(z, /if \(!data\) notFound\(\)/, 'nicht sichtbarer Lead = 404');
  assert.doesNotMatch(z.replace(/\/\/.*$/gm, ''), /angebot_entwurf|wert_netto|preis/i, 'keine Preise auf dem Spickzettel');
});
