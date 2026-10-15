import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { angebotAusLeadUrl, aufmassTerminUrl, vorbelegungLesen } from '../out/leadWeiter.js';

// ===========================================================================
// HW-12 (15.10.2026) — Lead -> Angebot und Aufmass-Termin
// ===========================================================================

const K = '11111111-2222-3333-4444-555555555555';
const lead = { id: 'l1', name: 'Familie Huber', email: 'huber@example.de', telefon: '0711 123', dienstleistung: 'Badsanierung', menge: '8', einheit: 'm²', nachricht: 'Bitte vormittags', kontakt_id: K };

test('Angebot-Link traegt Kunde, Kontakt, Titel und Anfrage — keine Preise', () => {
  const u = angebotAusLeadUrl(lead);
  assert.ok(u.startsWith('/dashboard/angebote?'));
  const v = vorbelegungLesen(u.split('?')[1]);
  assert.equal(v.kunde, 'Familie Huber');
  assert.equal(v.kontakt, K);
  assert.equal(v.titel, 'Angebot Badsanierung');
  assert.match(v.notiz, /Menge laut Anfrage: 8 m²/);
  assert.match(v.notiz, /Telefon: 0711 123/);
  assert.doesNotMatch(u, /preis/i);
});

test('Termin-Link: Titel „Aufmaß: …", E-Mail, Kontakt', () => {
  const v = vorbelegungLesen(aufmassTerminUrl(lead).split('?')[1]);
  assert.equal(v.titel, 'Aufmaß: Familie Huber – Badsanierung');
  assert.equal(v.email, 'huber@example.de');
  assert.equal(v.kontakt, K);
});

test('Ohne neu=1 keine Vorbelegung; falsche Kontakt-Kennung wird verworfen; Laengen begrenzt', () => {
  assert.equal(vorbelegungLesen('kunde=x'), null);
  const v = vorbelegungLesen('neu=1&kontakt=abc&kunde=' + 'x'.repeat(500));
  assert.equal(v.kontakt, '');
  assert.equal(v.kunde.length, 120);
});

test('Lead ohne Kontakt: kein kontakt-Feld', () => {
  const v = vorbelegungLesen(angebotAusLeadUrl({ ...lead, kontakt_id: null }).split('?')[1]);
  assert.equal(v.kontakt, '');
});

test('Waechter: Lead-Seite hat beide Knoepfe, Ziele lesen die Vorbelegung', () => {
  const l = fs.readFileSync('app/dashboard/leads/[id]/LeadDetailClient.tsx', 'utf8');
  assert.match(l, /aufmassTerminUrl\(/);
  assert.match(l, /!ohneAngebot && \(\s*<a href=\{angebotAusLeadUrl\(/);
  assert.doesNotMatch(l, /bernimm diesen Lead/, 'Chef wird gesiezt');
  for (const f of ['app/dashboard/angebote/page.tsx', 'app/dashboard/termine/page.tsx']) {
    assert.match(fs.readFileSync(f, 'utf8'), /vorbelegungLesen\(window\.location\.search\)/, f);
  }
});
