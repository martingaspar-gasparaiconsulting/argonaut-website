// ============================================================================
// tests/partnerNetzwerkP278.test.mjs — Paket 278 (08.10.2026) · K18 Partner-Netzwerk
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  aktionen, grundPruefen, codeNorm, verbindungLage, partnerName, partnerAuswahl, einladungsText, auftragPruefen, partnerSieht,
  ueberfaellig, bildArt, ablagePfad, eintragPruefen, fahrzeugZeilen, tausender, fehlerText, statusName, laeuft, istUuid,
} from '../out/partnerNetzwerk.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const HEUTE = '2026-10-08';
const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000001';
const C = 'cccccccc-0000-0000-0000-000000000001';

test('Statusknöpfe je Seite — Spiegel des Auslösers p278_auftrag_pruefen', () => {
  const k = (seite, st, darf = true) => aktionen(seite, st, darf).map((a) => a.neu);
  assert.deepEqual(k('partner', 'offen'), ['angenommen', 'abgelehnt']);
  assert.deepEqual(k('partner', 'angenommen'), ['fertig']);
  assert.deepEqual(k('partner', 'fertig'), []);
  assert.deepEqual(k('auftraggeber', 'offen'), ['storniert']);
  assert.deepEqual(k('auftraggeber', 'angenommen'), ['storniert']);
  assert.deepEqual(k('auftraggeber', 'fertig'), ['beendet', 'angenommen']);
  for (const st of ['beendet', 'storniert', 'abgelehnt']) {
    assert.deepEqual(k('auftraggeber', st), [], st);
    assert.deepEqual(k('partner', st), [], st);
  }
  assert.deepEqual(k('partner', 'offen', false), [], 'ohne Schreibrecht keine Knöpfe');
  assert.equal(laeuft('fertig'), true);
  assert.equal(laeuft('beendet'), false);
  assert.match(statusName('fertig'), /abnehmen/);
});

test('Grund: Pflicht beim Ablehnen und bei Nachbesserung', () => {
  const ablehnen = aktionen('partner', 'offen', true).find((a) => a.neu === 'abgelehnt');
  assert.equal(grundPruefen(ablehnen, '  ').ok, false);
  assert.deepEqual(grundPruefen(ablehnen, ' keine Kapazität '), { ok: true, grund: 'keine Kapazität' });
  const nachb = aktionen('auftraggeber', 'fertig', true).find((a) => a.neu === 'angenommen');
  assert.equal(grundPruefen(nachb, '').ok, false);
  const annehmen = aktionen('partner', 'offen', true)[0];
  assert.deepEqual(grundPruefen(annehmen, 'egal'), { ok: true, grund: null });
  assert.equal(grundPruefen(ablehnen, 'x'.repeat(301)).ok, false);
});

test('Einladungs-Code normalisieren', () => {
  assert.equal(codeNorm('3f9a 0c21-b7d4'), '3F9A-0C21-B7D4');
  assert.equal(codeNorm('3F9A0C21B7D4'), '3F9A-0C21-B7D4');
  assert.equal(codeNorm('3F9A-0C21-B7D'), null);
  assert.equal(codeNorm('3F9A-0C21-B7D4-1'), null);
  assert.equal(codeNorm('ZZZZ-0C21-B7D4'), null, 'nur 0-9 und A-F');
  assert.equal(codeNorm(null), null);
});

test('Verbindung: Lage, Name des anderen, Auswahl nur verbundene', () => {
  const jetzt = '2026-10-08T12:00:00.000Z';
  assert.equal(verbindungLage({ status: 'angenommen', code_bis: null }, jetzt), 'verbunden');
  assert.equal(verbindungLage({ status: 'anfrage', code_bis: '2026-10-20T00:00:00.000Z' }, jetzt), 'einladung_offen');
  assert.equal(verbindungLage({ status: 'anfrage', code_bis: '2026-10-01T00:00:00.000Z' }, jetzt), 'einladung_abgelaufen');
  assert.equal(verbindungLage({ status: 'getrennt', code_bis: null }, jetzt), 'getrennt');
  const v1 = { id: '1', anfrager_betrieb: A, partner_betrieb: B, anfrager_name: 'Autohaus A', partner_name: 'Lackierer B', status: 'angenommen' };
  const v2 = { id: '2', anfrager_betrieb: C, partner_betrieb: A, anfrager_name: 'Aufbereiter C', partner_name: 'Autohaus A', status: 'angenommen' };
  const v3 = { id: '3', anfrager_betrieb: A, partner_betrieb: null, anfrager_name: 'Autohaus A', partner_name: null, status: 'anfrage' };
  const v4 = { id: '4', anfrager_betrieb: A, partner_betrieb: C, anfrager_name: 'Autohaus A', partner_name: 'Alt C', status: 'getrennt' };
  assert.equal(partnerName(v1, A), 'Lackierer B');
  assert.equal(partnerName(v1, B), 'Autohaus A');
  assert.equal(partnerName(v2, A), 'Aufbereiter C');
  assert.deepEqual(partnerAuswahl([v1, v2, v3, v4], A), [{ betrieb: C, name: 'Aufbereiter C' }, { betrieb: B, name: 'Lackierer B' }]);
  assert.deepEqual(partnerAuswahl([v3, v4], A), []);
});

test('Einladungstext: gesiezt, Code, Datum deutsch, keine Werbung', () => {
  const t = einladungsText('Autohaus Muster', '3F9A-0C21-B7D4', '2026-10-22T10:00:00Z');
  assert.match(t, /3F9A-0C21-B7D4/);
  assert.match(t, /22\.10\.2026/);
  assert.match(t, /Ihnen/);
  assert.doesNotMatch(t, /\bdu\b|\bdein/i);
  assert.match(einladungsText('', 'X', '2026-10-22'), /^Ein Betrieb/);
});

test('Auftrag prüfen', () => {
  const ok = auftragPruefen({ partner_betrieb: B, titel: ' Stoßfänger lackieren ', beschreibung: '', faellig_am: '2026-10-10', freigabe_fotos: true }, HEUTE);
  assert.deepEqual(ok, { ok: true, felder: { partner_betrieb: B, titel: 'Stoßfänger lackieren', beschreibung: null, faellig_am: '2026-10-10', freigabe_fotos: true, freigabe_fin: false, freigabe_km: true } });
  assert.equal(auftragPruefen({ partner_betrieb: 'x', titel: 'a' }, HEUTE).ok, false);
  assert.equal(auftragPruefen({ partner_betrieb: B, titel: '  ' }, HEUTE).ok, false);
  assert.equal(auftragPruefen({ partner_betrieb: B, titel: 'x'.repeat(121) }, HEUTE).ok, false);
  assert.equal(auftragPruefen({ partner_betrieb: B, titel: 'a', beschreibung: 'x'.repeat(1001) }, HEUTE).ok, false);
  assert.match(auftragPruefen({ partner_betrieb: B, titel: 'a', faellig_am: '2026-10-07' }, HEUTE).fehler, /Vergangenheit/);
  assert.equal(auftragPruefen({ partner_betrieb: B, titel: 'a', freigabe_fin: 'true' }, HEUTE).felder.freigabe_fin, false, 'nur echtes true gibt frei');
  assert.equal(auftragPruefen({ partner_betrieb: B, titel: 'a', freigabe_km: false }, HEUTE).felder.freigabe_km, false);
});

test('Vorschau: Partner sieht nie Preise/Kunde/Kennzeichen', () => {
  const v = partnerSieht({ freigabe_fotos: false, freigabe_fin: false, freigabe_km: false });
  assert.ok(!v.sieht.some((x) => /FIN|Foto|Kilometer/.test(x)));
  assert.ok(v.nie.some((x) => /Einkaufs- und Verkaufspreis/.test(x)));
  assert.ok(v.nie.some((x) => /Kunde/.test(x)));
  assert.ok(v.nie.some((x) => /Kennzeichen/.test(x)));
  const alle = partnerSieht({ freigabe_fotos: true, freigabe_fin: true, freigabe_km: true });
  assert.ok(alle.sieht.includes('Fahrgestellnummer (FIN)') && alle.sieht.includes('Fahrzeugfotos') && alle.sieht.includes('Kilometerstand'));
});

test('Überfällig nur bei laufenden, nicht fertig gemeldeten Aufträgen', () => {
  assert.equal(ueberfaellig({ status: 'angenommen', faellig_am: '2026-10-07' }, HEUTE), true);
  assert.equal(ueberfaellig({ status: 'offen', faellig_am: '2026-10-08' }, HEUTE), false);
  assert.equal(ueberfaellig({ status: 'fertig', faellig_am: '2026-10-01' }, HEUTE), false);
  assert.equal(ueberfaellig({ status: 'beendet', faellig_am: '2026-10-01' }, HEUTE), false);
  assert.equal(ueberfaellig({ status: 'offen', faellig_am: null }, HEUTE), false);
});

test('Fotos: Bildart nur aus den Bytes, Pfad nur im Auftragsordner', () => {
  assert.equal(bildArt(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'jpg');
  assert.equal(bildArt(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
  assert.equal(bildArt(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), 'webp');
  assert.equal(bildArt(new Uint8Array([0x25, 0x50, 0x44, 0x46])), null, 'PDF ist kein Foto');
  assert.equal(bildArt(new TextEncoder().encode('<svg onload=alert(1)>')), null, 'SVG nie');
  assert.equal(bildArt(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20])), null, 'RIFF/AVI ist kein WebP');
  const ziel = `${A}/11111111-2222-3333-4444-555555555555/`;
  const id = '99999999-8888-7777-6666-555555555555';
  assert.equal(ablagePfad(ziel, id, 'webp'), `${ziel}${id}.webp`);
  assert.equal(ablagePfad(null, id, 'jpg'), null, 'kein Ziel = darf nicht');
  assert.equal(ablagePfad(`${A}/../x/`, id, 'jpg'), null);
  assert.equal(ablagePfad(`${A}/11111111-2222-3333-4444-555555555555`, id, 'jpg'), null, 'Ordner muss mit / enden');
  assert.equal(ablagePfad(ziel, '../x', 'jpg'), null);
  assert.equal(istUuid(A), true);
  assert.equal(istUuid(`${A} `), false);
});

test('Eintrag prüfen', () => {
  assert.deepEqual(eintragPruefen(' Kratzer links ', []), { ok: true, text: 'Kratzer links' });
  assert.deepEqual(eintragPruefen('', [{}]), { ok: true, text: null });
  assert.equal(eintragPruefen('  ', []).ok, false);
  assert.equal(eintragPruefen('x'.repeat(2001), []).ok, false);
  assert.equal(eintragPruefen('x', new Array(11).fill({})).ok, false);
});

test('Fahrzeugzeilen nur aus der gelieferten Positivliste', () => {
  const z = fahrzeugZeilen({ marke: 'BMW', modell: '320d', variante: 'Touring', farbe: 'Schwarz', farbcode: '475', erstzulassung: '2019-03-01', leistung_kw: 140, km_stand: 88000, fin: null, kraftstoff: 'Diesel' });
  assert.deepEqual(z, [['Fahrzeug', 'BMW 320d Touring'], ['Farbe', 'Schwarz (475)'], ['Erstzulassung', '03/2019'], ['Kraftstoff', 'Diesel'], ['Leistung', '140 kW (190 PS)'], ['Kilometerstand', '88.000 km']]);
  assert.deepEqual(fahrzeugZeilen(null), []);
  assert.equal(tausender(1234567), '1.234.567');
  assert.equal(tausender(999), '999');
});

test('Fehlertexte: fehlendes SQL verständlich', () => {
  assert.match(fehlerText({ message: 'Could not find the function public.p278_eingang without parameters', code: 'PGRST202' }), /SQL Paket 278/);
  assert.match(fehlerText({ message: 'relation "public.partner_auftrag" does not exist', code: '42P01' }), /SQL Paket 278/);
  assert.equal(fehlerText({ message: 'Der Code ist ungültig oder abgelaufen.' }), 'Der Code ist ungültig oder abgelaufen.');
  assert.equal(fehlerText({ message: 'new row violates row-level security policy' }), 'Dafür fehlt das Recht.');
});

// --- Bauwächter: Sicherheit steckt in SQL und Routen -----------------------------------------------

test('SQL: keine Regel öffnet fremden Betrieben den Bestand, Positivliste ohne Preise/Kunde', () => {
  const sql = lies('supabase-sql/p278-partner-netzwerk.sql');
  assert.doesNotMatch(sql, /create policy[^;]*on public\.kfz_bestand\b/i, 'P278 legt keine Regel auf kfz_bestand');
  assert.doesNotMatch(sql, /create policy[^;]*on storage\.objects/i, 'Ablage-Ordner ohne Regeln');
  assert.match(sql, /'partner-ablage', 'partner-ablage', false/);
  const detail = sql.slice(sql.indexOf('function public.p278_eingang_detail'), sql.indexOf('function public.p278_status'));
  for (const verboten of ['ek_netto', 'vk_brutto', 'notiz', 'kennzeichen', 'kontakt', 'standort']) {
    assert.doesNotMatch(detail.replace(/--[^\n]*/g, ''), new RegExp(`v_f\\.${verboten}`), `Partner sieht nie ${verboten}`);
  }
  assert.match(detail, /case when v_a\.freigabe_fin then v_f\.fin end/);
  assert.match(detail, /case when v_a\.freigabe_km then v_f\.km_stand end/);
  assert.match(detail, /if not v_akt then return v_erg; end if;/, 'nach Ende nur Kopfdaten');
  // Partner-Tabellen: Regeln nur für die eigene Seite (owner / mein_chef_id), nie partner_betrieb
  const regelnAuftrag = sql.match(/create policy [^;]*on public\.partner_auftrag[^;]*;/g) || [];
  assert.equal(regelnAuftrag.length, 6);
  for (const r of regelnAuftrag) assert.doesNotMatch(r, /partner_betrieb/, r);
  const regelnEintrag = sql.match(/create policy [^;]*on public\.partner_eintrag[^;]*;/g) || [];
  assert.equal(regelnEintrag.length, 2);
  for (const r of regelnEintrag) assert.match(r, /for select/, 'Einträge nur lesen, schreiben über p278_eintrag');
  assert.match(sql, /before update or delete on public\.partner_eintrag/);
  assert.match(sql, /revoke all on function public\.p278_eingang\(\) from public, anon;/);
  assert.match(sql, /where id = new\.bezug_id and owner_user_id = new\.owner_user_id/, 'Auftrag nur an eigenes Fahrzeug');
});

test('Routen: nur mit Login, Pfad entscheidet die Datenbank', () => {
  for (const p of ['app/api/partner/foto/route.ts', 'app/api/partner/fahrzeugbild/route.ts']) {
    const r = lies(p);
    assert.match(r, /auth\.getUser\(\)/, p);
    assert.doesNotMatch(r, /getSession/, p);
    assert.match(r, /rpc\('p278_/, p);
  }
  const foto = lies('app/api/partner/foto/route.ts');
  assert.match(foto, /bildArt\(bytes\)/, 'Bildart aus Bytes');
  assert.match(foto, /FOTO_MAX_BYTES/);
  assert.match(foto, /upsert: false/, 'nie überschreiben');
  assert.ok(foto.indexOf("rpc('p278_ablage_ziel'") < foto.indexOf('createAdminClient()'), 'erst Datenbank fragen, dann Dienst-Rolle');
  const offen = lies('lib/offeneTueren.ts');
  assert.doesNotMatch(offen, /partner\/foto|partner\/fahrzeugbild/, 'keine offene Tür');
});

test('Einbindung: Reiter, Menü, Hub, Guide', () => {
  const akte = lies('app/dashboard/kfz/bestand/[id]/page.tsx');
  assert.match(akte, /\['partner', 'Partner'\]/);
  assert.match(akte, /<KfzPartner /);
  assert.match(lies('lib/rechte.ts'), /href: '\/dashboard\/kfz\/partner'/);
  assert.match(lies('app/dashboard/kfz/page.tsx'), /href="\/dashboard\/kfz\/partner"/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/kfz\/partner': \{/);
  assert.match(lies('app/dashboard/kfz/partner/page.tsx'), /<PartnerHub ort="kfz" \/>/);
  const seite = lies('app/dashboard/netzwerk/PartnerHub.tsx'); // seit Paket 303 gemeinsam
  assert.match(seite, /So geht&apos;s/);
  assert.match(seite, /<Leerzustand /);
  assert.doesNotMatch(seite + lies('app/dashboard/netzwerk/PartnerAuftraege.tsx'), /KI-Agent|KI-Crew/);
});
