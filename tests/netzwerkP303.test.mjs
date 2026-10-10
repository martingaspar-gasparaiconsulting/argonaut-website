// Paket 303 (10.10.2026): N1 Betriebs-Netzwerk für alle Branchen
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BEZUG_ARTEN, modulFuer, artName, akteLink, eingangLink, bezugAusAdresse, bezugTitel, partnerSiehtAllgemein, hubTexte, istBezugTyp,
} from '../out/netzwerk.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ID = '11111111-1111-4111-8111-111111111111';
const q = (o) => ({ get: (k) => (k in o ? o[k] : null) });

test('Arten, Module und Links wie in der Datenbank (p303_modul, p303_link)', () => {
  assert.deepEqual(BEZUG_ARTEN.map((a) => a.key), ['projekt', 'auftrag', 'objekt']);
  assert.equal(modulFuer('kfz_bestand'), 'kfz');
  assert.equal(modulFuer('projekt'), 'projekte');
  assert.equal(modulFuer('auftrag'), 'auftraege');
  assert.equal(modulFuer('objekt'), 'objektzeiten');
  assert.equal(modulFuer('haus'), null);
  assert.equal(istBezugTyp('objekt'), true);
  assert.equal(istBezugTyp('haus'), false);
  assert.equal(artName('kfz_bestand'), 'Fahrzeug');
  assert.equal(akteLink('kfz_bestand', ID), `/dashboard/kfz/bestand/${ID}?reiter=partner`);
  assert.equal(akteLink('projekt', ID), `/dashboard/netzwerk/bezug?typ=projekt&id=${ID}`);
  assert.equal(eingangLink('auftrag', ID), `/dashboard/netzwerk?auftrag=${ID}`);
  assert.equal(eingangLink('kfz_bestand', ID), `/dashboard/kfz/partner?auftrag=${ID}`);
  const sql = lies('supabase-sql/p303-netzwerk-alle.sql');
  for (const a of BEZUG_ARTEN) assert.match(sql, new RegExp(`when '${a.key}' then '${a.modul}'`), a.key);
  assert.match(sql, /'\/dashboard\/netzwerk\/bezug\?typ=' \|\| p_a\.bezug_typ \|\| '&id=' \|\| p_a\.bezug_id/);
  assert.match(sql, /'\/dashboard\/netzwerk\?auftrag=' \|\| p_a\.id/);
});

test('Adresse und Titel', () => {
  assert.deepEqual(bezugAusAdresse(q({ typ: 'projekt', id: ID })), { typ: 'projekt', id: ID });
  assert.equal(bezugAusAdresse(q({ typ: 'kfz_bestand', id: ID })), null, 'Fahrzeuge über die Handelsakte');
  assert.equal(bezugAusAdresse(q({ typ: 'projekt', id: 'x' })), null);
  assert.equal(bezugAusAdresse(q({})), null);
  assert.equal(bezugTitel('projekt', { name: ' Neubau ' }), 'Neubau');
  assert.equal(bezugTitel('projekt', {}), 'Projekt');
  assert.equal(bezugTitel('auftrag', { auftragsnummer: 'A-7', titel: 'Dach' }), 'A-7 · Dach');
  assert.equal(bezugTitel('auftrag', { titel: '' }), 'Auftrag');
  assert.equal(bezugTitel('objekt', { bezeichnung: 'Praxis Dr. X' }), 'Praxis Dr. X');
  assert.equal(bezugTitel('kfz_bestand', { marke: 'VW', modell: 'Golf' }), 'VW Golf');
  assert.equal(bezugTitel('projekt', null), 'Projekt');
});

test('Partner sieht nur Name und Aufgabe — nie Kunde, Adresse, Preise', () => {
  const p = partnerSiehtAllgemein('auftrag');
  assert.match(p.sieht.join(' '), /Name des Auftrags/);
  assert.match(p.nie.join(' '), /Kunde und Adresse/);
  assert.match(p.nie.join(' '), /Preise/);
  assert.match(hubTexte('kfz').leerEingang, /Fahrzeug/);
  assert.match(hubTexte('netzwerk').leerAusgang, /Projekt, einen Auftrag oder ein Objekt/);
});

test('SQL: Partner sieht bei Projekt/Auftrag/Objekt keine Zeile des Bezugs, Rechte je Art, Kfz unverändert', () => {
  const sql = lies('supabase-sql/p303-netzwerk-alle.sql');
  const detail = sql.slice(sql.indexOf('function public.p279_detail'), sql.indexOf('function public.p278_eingang()'));
  assert.match(detail, /if p_a\.bezug_typ = 'kfz_bestand' then/, 'Fahrzeug-Positivliste nur bei Kfz');
  assert.doesNotMatch(detail, /projekte|auftraege|objekte/, 'keine Daten aus Projekt/Auftrag/Objekt an den Partner');
  assert.match(sql, /partner_auftrag_bezug_typ_p303[\s\S]*'kfz_bestand', 'projekt', 'auftrag', 'objekt'/);
  // jede Partner-Funktion prüft das Recht je Auftrag
  for (const f of ['p278_eingang_detail', 'p278_status', 'p278_ablage_ziel', 'p278_foto_pfad', 'p279_rechnung_ziel', 'p279_rechnung_einreichen', 'p279_meine_rechnungen', 'p279_gast_link']) {
    const teil = sql.slice(sql.indexOf(`function public.${f}(`), sql.indexOf('end $$;', sql.indexOf(`function public.${f}(`)));
    assert.match(teil, /p303_darf_auftrag\(v_a, (true|false)\)/, f);
  }
  assert.match(sql, /if v_a\.bezug_typ = 'kfz_bestand' then\s+insert into public\.kfz_bestand_kosten/, 'Fahrzeugkosten nur bei Kfz');
  const regeln = sql.match(/create policy [^;]*;/g) || [];
  assert.equal(regeln.length, 6);
  for (const r of regeln) assert.doesNotMatch(r, /darf_ich_modul_(sehen|aendern)\('kfz'\)/, 'nicht mehr fest auf Kfz');
  assert.doesNotMatch(sql, /drop table|delete from|truncate/i, 'nichts wird gelöscht');
  assert.match(sql, /revoke all on function public\.p303_bezug\(text, uuid, uuid\) from public, anon, authenticated;/);
});

test('Einbindung: Menü, Seiten, Hilfe, Kfz weiter gleich', () => {
  assert.match(lies('lib/rechte.ts'), /href: '\/dashboard\/netzwerk', ebene: 3/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/netzwerk': \{/);
  assert.match(lies('app/dashboard/netzwerk/page.tsx'), /<PartnerHub ort="netzwerk" \/>/);
  assert.match(lies('app/dashboard/kfz/partner/page.tsx'), /<PartnerHub ort="kfz" \/>/);
  assert.match(lies('app/dashboard/kfz/bestand/KfzPartner.tsx'), /typ: 'kfz_bestand'/);
  const auftr = lies('app/dashboard/netzwerk/PartnerAuftraege.tsx');
  assert.match(auftr, /bezug_typ: bezug\.typ, bezug_id: fz\.id/);
  assert.match(auftr, /\{istKfz && <div style=\{\{ display: 'flex', gap: 16/, 'Fahrzeug-Freigaben nur beim Fahrzeug');
  assert.match(auftr, /const k = istKfz \? \(art\[r\.id\] \|\| kostenArtVorschlag\(a\.titel\)\) : 'fremd';/);
  const hub = lies('app/dashboard/netzwerk/PartnerHub.tsx');
  assert.match(hub, /href=\{akteLink\(a\.bezug_typ \?\? 'kfz_bestand', a\.bezug_id\)\}/);
  assert.match(hub, /\{detail\.fahrzeug \? \(/);
  const bezug = lies('app/dashboard/netzwerk/bezug/page.tsx');
  assert.match(bezug, /zeile\.owner_user_id !== betrieb/, 'nur eigener Betrieb');
  for (const t of [hub, auftr, bezug]) assert.doesNotMatch(t, /KI-Agent|KI-Crew/);
});
