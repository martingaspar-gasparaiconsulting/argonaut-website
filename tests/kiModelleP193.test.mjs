// ============================================================================
// tests/kiModelleP193.test.mjs — Paket 193: KI-Modelle zentral nach Aufgabe
//
// Martin 30.09.2026: Premium-Anspruch — schnell (Haiku) nur für Kurzes/Internes,
// professionell (Sonnet 5.5) für alles, was Kunden lesen oder nach Qualität
// aussehen muss, premium (Opus 5.5) für Strategie, Personal, Presse, E-Book.
// EINE Liste; kein Modellname sonst im Code.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { KI_STUFEN, KI_AUFGABEN, modellFuer, stufeFuer } from '../out/kiModelle.js';
import { familieVon } from '../out/kiPreise.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Drei Stufen, aktuelle Modelle, Preis-Familie erkannt', () => {
  assert.deepEqual(KI_STUFEN, { schnell: 'claude-haiku-4-5', professionell: 'claude-sonnet-5-5', premium: 'claude-opus-5-5' });
  assert.equal(familieVon(KI_STUFEN.schnell), 'haiku');
  assert.equal(familieVon(KI_STUFEN.professionell), 'sonnet');
  assert.equal(familieVon(KI_STUFEN.premium), 'opus');
});

test('Jede Aufgabe hat eine gültige Stufe', () => {
  for (const [a, s] of Object.entries(KI_AUFGABEN)) assert.ok(['schnell', 'professionell', 'premium'].includes(s), a);
  assert.ok(Object.keys(KI_AUFGABEN).length >= 55);
});

test('Martins Entscheidung 30.09.: die Zuordnung', () => {
  const erwartet = {
    schnell: ['chat.cockpit', 'chat.dashboard', 'chat.mitarbeiter', 'chat.team', 'sachbearbeiter.postfach', 'beleg.lesen', 'visitenkarte.lesen', 'gespraech.protokoll', 'crm.sprachnotiz', 'crm.wochenfokus', 'ki.klartext', 'bau.foto', 'erp.bestellvorschlag', 'chat.webseite'],
    professionell: ['kunde.followup', 'kunde.ticketantwort', 'kunde.mahnung', 'kunde.kuendigung', 'kunde.brief', 'angebot.text', 'webseite.text', 'shop.produkttext', 'marketing.seo', 'marketing.videoskript', 'marketing.contentfliessband', 'marketing.lagebericht', 'marketing.roi', 'analyse.website', 'projekt.statusbericht', 'crm.briefing', 'uebersetzung', 'ablauf.baustein', 'ki.auge', 'chat.branche', 'beleg.nachpruefen'],
    premium: ['marketing.stratege', 'personal.texte', 'hr.auswertung', 'textmotor.ebook', 'textmotor.presse', 'textmotor.strategie'],
  };
  for (const [stufe, liste] of Object.entries(erwartet)) {
    for (const a of liste) {
      assert.equal(stufeFuer(a), stufe, a);
      assert.equal(modellFuer(a), KI_STUFEN[stufe], a);
    }
  }
});

test('KI-Berater auf Kundenseiten bleibt schnell (Stufenpreis 99 € / 3.000 Gespräche)', () => {
  assert.equal(stufeFuer('chat.webseite'), 'schnell');
  assert.match(lies('lib/kiModelle.ts'), /3\.000 Gespräche wären ~114 € bei 99 € Einnahme/);
});

function alleDateien() {
  const out = [];
  const lauf = (d) => {
    for (const e of fs.readdirSync(path.join(WURZEL, d), { withFileTypes: true })) {
      const rel = path.posix.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.next') lauf(rel); }
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
    }
  };
  for (const d of ['app', 'lib', 'components']) lauf(d);
  return out;
}

test('WAECHTER: kein Modellname ausserhalb von lib/kiModelle.ts und lib/kiPreise.ts', () => {
  const funde = [];
  for (const f of alleDateien()) {
    if (f === 'lib/kiModelle.ts' || f === 'lib/kiPreise.ts') continue;
    if (/claude-(haiku|sonnet|opus|fable)/.test(lies(f))) funde.push(f);
  }
  assert.deepEqual(funde, [], 'Bitte modellFuer(<aufgabe>) aus lib/kiModelle nehmen');
});

test('WAECHTER: jede Stelle mit KI-Aufruf holt ihr Modell zentral', () => {
  const ohne = [];
  for (const f of alleDateien()) {
    if (['lib/ki.ts', 'lib/kiBatch.ts', 'lib/kiModelle.ts', 'lib/kiPreise.ts'].includes(f)) continue;
    const s = lies(f);
    if (!/kiFetch\(|api\.anthropic\.com/.test(s)) continue;
    if (!/kiModell\(|modellFuer\(|modellWahl\(|FOTO_KI_MODELL|UEBERSETZ_MODELL/.test(s)) ohne.push(f);
  }
  assert.deepEqual(ohne, []);
});

test('Stichproben: Aufgabe passt zur Stelle', () => {
  const stelle = {
    'app/api/mahnung-ki/route.ts': 'kunde.mahnung',
    'app/api/hr/ki-auswertung/route.ts': 'hr.auswertung',
    'app/api/cockpit-chat/route.ts': 'chat.cockpit',
    'app/api/ki-auge/route.ts': 'ki.auge',
    'app/api/personal-text/route.ts': 'personal.texte',
    'app/api/oeffentlich/chat/route.ts': 'chat.webseite',
    'app/api/marketing-stratege/route.ts': 'marketing.stratege',
    'lib/ablaufKi.ts': 'ablauf.baustein',
  };
  for (const [f, a] of Object.entries(stelle)) assert.match(lies(f), new RegExp(`kiModell\\('${a.replace('.', '\\.')}'\\)`), f);
  const b = lies('app/api/beleg-upload/route.ts');
  assert.match(b, /kiModell\('beleg\.lesen'\)/);
  assert.match(b, /kiModell\('beleg\.nachpruefen'\)/);
  assert.match(lies('app/api/text-motor/route.ts'), /modellFuer\('einzel', art\)/);
});
