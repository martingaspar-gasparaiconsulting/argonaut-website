// ============================================================================
// tests/partnerGastRechnungP279.test.mjs — Paket 279 (08.10.2026) · K18b Gast-Link und Partner-Rechnung
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  dateiArt, rechnungPfad, rechnungPruefen, rechnungStatusName, kostenArtVorschlag, kostenArtGueltig, tokenGueltig, gastTageLesen,
  gastLinkText, gastAuftragPruefen, gastLinkLage, GAST_TAGE_MAX,
} from '../out/partnerRechnung.js';
import { DROSSEL } from '../out/drossel.js';
import { OFFENE_TUEREN } from '../out/offeneTueren.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const HEUTE = '2026-10-08';
const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const AUF = '11111111-2222-3333-4444-555555555555';
const ID = '99999999-8888-7777-6666-555555555555';

test('Rechnung prüfen: Betrag centgenau, USt 19/7/0, Datum', () => {
  const ok = rechnungPruefen({ nummer: ' R-17 ', datum: HEUTE, netto: '1.234,56', satz: 19 }, HEUTE);
  assert.deepEqual(ok, { ok: true, felder: { nummer: 'R-17', datum: HEUTE, netto: 1234.56, satz: 19, ust: 234.57, brutto: 1469.13 } });
  assert.equal(rechnungPruefen({ nummer: 'X', datum: HEUTE, netto: '42,50', satz: '19' }, HEUTE).felder.ust, 8.08, 'Paket 191: 8,075 -> 8,08');
  assert.equal(rechnungPruefen({ nummer: 'X', datum: HEUTE, netto: '100', satz: 0 }, HEUTE).felder.brutto, 100);
  assert.equal(rechnungPruefen({ nummer: 'X', datum: HEUTE, netto: '100', satz: 16 }, HEUTE).ok, false);
  assert.match(rechnungPruefen({ nummer: 'X', datum: HEUTE, netto: '10,005', satz: 19 }, HEUTE).fehler, /zwei Nachkommastellen/);
  assert.equal(rechnungPruefen({ nummer: 'X', datum: HEUTE, netto: '0', satz: 19 }, HEUTE).ok, false);
  assert.equal(rechnungPruefen({ nummer: 'X', datum: HEUTE, netto: '1000000,01', satz: 19 }, HEUTE).ok, false);
  assert.equal(rechnungPruefen({ nummer: '', datum: HEUTE, netto: '1', satz: 19 }, HEUTE).ok, false);
  assert.equal(rechnungPruefen({ nummer: 'x'.repeat(61), datum: HEUTE, netto: '1', satz: 19 }, HEUTE).ok, false);
  assert.match(rechnungPruefen({ nummer: 'X', datum: '2026-10-10', netto: '1', satz: 19 }, HEUTE).fehler, /Zukunft/);
  assert.equal(rechnungPruefen({ nummer: 'X', datum: '2026-10-09', netto: '1', satz: 19 }, HEUTE).ok, true, 'morgen erlaubt (Zeitzone)');
  assert.match(rechnungPruefen({ nummer: 'X', datum: '2025-09-01', netto: '1', satz: 19 }, HEUTE).fehler, /400/);
  assert.equal(rechnungPruefen({ nummer: 'X', datum: '08.10.2026', netto: '1', satz: 19 }, HEUTE).ok, false);
  assert.equal(rechnungStatusName('uebernommen'), 'Übernommen');
});

test('Dateiart nur aus Bytes, Rechnungspfad nur im Auftragsordner', () => {
  assert.equal(dateiArt(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])), 'pdf');
  assert.equal(dateiArt(new Uint8Array([0xff, 0xd8, 0xff, 0xe1])), 'jpg');
  assert.equal(dateiArt(new TextEncoder().encode('<html><script>')), null);
  assert.equal(dateiArt(new TextEncoder().encode('%PDX-')), null);
  assert.equal(rechnungPfad(`${A}/${AUF}/`, ID, 'pdf'), `${A}/${AUF}/rechnung-${ID}.pdf`);
  assert.equal(rechnungPfad(null, ID, 'pdf'), null);
  assert.equal(rechnungPfad(`${A}/../`, ID, 'pdf'), null);
  assert.equal(rechnungPfad(`${A}/${AUF}/`, 'x', 'pdf'), null);
});

test('Kostenart-Vorschlag aus dem Auftragstitel', () => {
  assert.equal(kostenArtVorschlag('Stoßfänger hinten lackieren'), 'lack');
  assert.equal(kostenArtVorschlag('Smart-Repair Delle'), 'lack');
  assert.equal(kostenArtVorschlag('Innenraum-Aufbereitung + Politur'), 'aufbereitung');
  assert.equal(kostenArtVorschlag('Überführung nach Stuttgart'), 'transport');
  assert.equal(kostenArtVorschlag('Gutachten'), 'fremd');
  assert.equal(kostenArtGueltig('lack'), true);
  assert.equal(kostenArtGueltig('kaffee'), false);
});

test('Gast-Link: Form, Tage, Text, Lage', () => {
  assert.equal(tokenGueltig('A'.repeat(32)), true);
  assert.equal(tokenGueltig('A'.repeat(31)), false);
  assert.equal(tokenGueltig('A'.repeat(31) + '/'), false);
  assert.equal(tokenGueltig(null), false);
  assert.equal(gastTageLesen(7), 7);
  assert.equal(gastTageLesen(999), GAST_TAGE_MAX);
  assert.equal(gastTageLesen('x'), 14);
  assert.equal(gastTageLesen(0), 14);
  const t = gastLinkText('Autohaus Muster', 'PA-0003 · Smart Repair', 'https://argonaut-os.com/partner-gast/abc', '2026-10-22T10:00:00Z');
  assert.match(t, /22\.10\.2026/);
  assert.match(t, /Ihnen/);
  assert.match(t, /nicht weiter/);
  assert.doesNotMatch(t, /\bdu\b|kostenlos|testen/i, 'kein Werbetext');
  const J = '2026-10-08T12:00:00.000Z';
  assert.equal(gastLinkLage({ gast_bis: null, gast_gesperrt: false }, J), 'keiner');
  assert.equal(gastLinkLage({ gast_bis: '2026-10-20T00:00:00Z', gast_gesperrt: false }, J), 'aktiv');
  assert.equal(gastLinkLage({ gast_bis: '2026-10-01T00:00:00Z', gast_gesperrt: false }, J), 'abgelaufen');
  assert.equal(gastLinkLage({ gast_bis: '2026-10-20T00:00:00Z', gast_gesperrt: true }, J), 'gesperrt');
});

test('Gast-Auftrag prüfen', () => {
  const ok = gastAuftragPruefen({ gast_name: ' Dellen-Doktor ', titel: 'Smart Repair', freigabe_fotos: true }, HEUTE);
  assert.deepEqual(ok.felder, { partner_betrieb: null, gast_name: 'Dellen-Doktor', gast_kontakt: null, titel: 'Smart Repair', beschreibung: null, faellig_am: null, freigabe_fotos: true, freigabe_fin: false, freigabe_km: true });
  assert.equal(gastAuftragPruefen({ gast_name: '', titel: 'x' }, HEUTE).ok, false);
  assert.equal(gastAuftragPruefen({ gast_name: 'x', titel: '' }, HEUTE).ok, false);
  assert.equal(gastAuftragPruefen({ gast_name: 'x'.repeat(121), titel: 'x' }, HEUTE).ok, false);
  assert.equal(gastAuftragPruefen({ gast_name: 'x', gast_kontakt: 'y'.repeat(201), titel: 'x' }, HEUTE).ok, false);
  assert.equal(gastAuftragPruefen({ gast_name: 'x', titel: 'x', faellig_am: '2026-10-01' }, HEUTE).ok, false);
});

test('Offene Tür und Mengen-Deckel für den Gast', () => {
  for (const pfad of ['oeffentlich/partner-gast', 'oeffentlich/partner-gast/bild']) {
    const t = OFFENE_TUEREN.find((x) => x.pfad === pfad);
    assert.ok(t, pfad);
    assert.equal(t.schutz, 'token');
    assert.ok(DROSSEL[pfad].some((r) => r.art === 'ip'), pfad);
    assert.ok(DROSSEL[pfad].some((r) => r.art === 'ziel'), pfad);
  }
});

test('SQL: Gast nur über Dienst-Rolle, nur Prüfwert, Rechnung unveränderlich, Übernahme einmal', () => {
  const sql = lies('supabase-sql/p279-partner-gast-rechnung.sql');
  assert.match(sql, /to service_role;/);
  for (const f of ['p279_gast_auftrag(text)', 'p279_gast_status(text, text, text)', 'p279_gast_eintrag(text, text, text[])', 'p279_gast_rechnung(text, text, date, numeric, numeric, text)', 'p279_gast_bild_pfad(text, uuid, integer, uuid)', 'p279_gast_ziel(text, boolean)']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${f.replace(/[()[\]]/g, '\\$&')} from public, anon, authenticated;`), f);
  }
  assert.match(sql, /gast_token_hash ~ '\^\[0-9a-f\]\{64\}\$'/, 'nur SHA-256-Prüfwert');
  assert.match(sql, /not a\.gast_gesperrt and a\.gast_bis > now\(\)/);
  assert.match(sql, /before update or delete on public\.partner_rechnung/);
  assert.doesNotMatch(sql, /create policy[^;]*on public\.partner_rechnung for (update|insert|delete|all)/i, 'Rechnung nur lesen per Regel');
  assert.doesNotMatch(sql, /create policy[^;]*on public\.kfz_bestand\b/i);
  assert.doesNotMatch(sql, /create policy[^;]*on storage\.objects/i);
  const ueb = sql.slice(sql.indexOf('function public.p279_rechnung_uebernehmen'), sql.indexOf('function public.p279_rechnung_ablehnen'));
  assert.match(ueb, /for update;/);
  assert.match(ueb, /if v_r\.status <> 'eingereicht'/, 'nie doppelt');
  assert.match(ueb, /insert into public\.eingangsbelege/);
  assert.match(ueb, /insert into public\.kfz_bestand_kosten/);
  assert.match(sql, /mein_chef_id\(\) is null or \(public\.darf_ich_abrechnen\(\) and public\.darf_ich_modul_aendern\('kfz'\)\)/);
  const detail = sql.slice(sql.indexOf('function public.p279_detail'), sql.indexOf('function public.p279_rechnung_erlaubt'));
  for (const v of ['ek_netto', 'vk_brutto', 'notiz', 'kennzeichen']) assert.doesNotMatch(detail, new RegExp(`v_f\\.${v}`), v);
  assert.match(sql, /if coalesce\(current_setting\('p279\.link', true\), ''\) <> 'an' then\s+new\.gast_token_hash := old\.gast_token_hash/, 'Prüfwert nur über p279_gast_link');
  assert.match(sql, /interval '30 days'/);
});

test('Routen: Login bzw. Token, Hash statt Link, Bytes statt Name', () => {
  for (const p of ['app/api/partner/rechnung/route.ts', 'app/api/partner/rechnung-uebernehmen/route.ts', 'app/api/partner/gast-link/route.ts']) {
    const r = lies(p);
    assert.match(r, /auth\.getUser\(\)/, p);
    assert.doesNotMatch(r, /getSession/, p);
  }
  const gl = lies('app/api/partner/gast-link/route.ts');
  assert.match(gl, /randomBytes\(24\)/);
  assert.match(gl, /createHash\('sha256'\)/);
  assert.match(gl, /p_hash: hash/);
  assert.doesNotMatch(gl, /p_hash: token/);
  const gast = lies('app/api/oeffentlich/partner-gast/route.ts');
  assert.match(gast, /tokenGueltig\(t\)/);
  assert.match(gast, /p_hash: hash\(t\)/);
  assert.doesNotMatch(gast, /p_hash: t\b/);
  assert.match(gast, /drossel\(db, TUER/);
  assert.match(gast, /dateiArt\(bytes\)/);
  assert.match(gast, /bildArt\(bytes\)/);
  const r = lies('app/api/partner/rechnung/route.ts');
  assert.ok(r.indexOf("rpc('p279_rechnung_ziel'") < r.indexOf('createAdminClient()'), 'erst Datenbank, dann Dienst-Rolle');
  const u = lies('app/api/partner/rechnung-uebernehmen/route.ts');
  assert.ok(u.indexOf("rpc('p279_rechnung_info'") < u.indexOf('createAdminClient()'));
  const bild = lies('app/api/oeffentlich/partner-gast/bild/route.ts');
  assert.match(bild, /ERLAUBT\.has\(b\.bucket\)/);
});

test('Gast-Seite: nie bei Google, kein Referrer; Einbindung', () => {
  const s = lies('app/partner-gast/[token]/page.tsx');
  assert.match(s, /index: false/);
  assert.match(s, /referrer: 'no-referrer'/);
  assert.match(lies('app/robots.ts'), /'\/partner-gast\/'/);
  const akte = lies('app/dashboard/kfz/bestand/KfzPartner.tsx');
  assert.match(akte, /Partner ohne ARGONAUT \(Gast-Link\)/);
  assert.match(akte, /rechnung-uebernehmen/);
  assert.match(lies('app/dashboard/kfz/partner/page.tsx'), /<RechnungEinreichen /);
  assert.match(lies('lib/guideWissen.ts'), /Rechnung des Partners/);
});
