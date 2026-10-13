// ============================================================================
// tests/rechtstextePraxisWebP349.test.mjs — Paket 349 (13.10.2026)
// A1 Vorlagen-Prinzip Teil 3: Praxis-Einwilligungen nur mit eigenem Text,
// Website ohne interne Hinweise und ohne AGB-Abschnitt ohne eigene AGB,
// KI-Dokumente mit Rechtswirkung tragen „ENTWURF" + Prüfhinweis.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { eintragFuer, textPruefen, RECHTS_TEXTE } from '../out/rechtsTexte.js';
import { einwilligungText, einwilligungWerte, praxisRechtstext, EINWILLIGUNGEN } from '../out/praxis.js';
import { agbOeffentlich, agbText, datenschutzText, fussHtml } from '../out/webRecht.js';
import { seiteHtml } from '../out/webBloecke.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const AGB = 'AGB der Muster GmbH: § 1 Geltungsbereich — diese Bedingungen gelten für alle Aufträge.';

test('Katalog: alle sechs Praxis-Einwilligungen und Website-AGB, Platzhalter passend', () => {
  for (const e of EINWILLIGUNGEN) {
    const k = praxisRechtstext(e.key);
    assert.ok(eintragFuer(k)?.angebunden, k);
  }
  assert.deepEqual(textPruefen(eintragFuer('praxis.recall'), 'Ich möchte von {{betrieb}} per {{wege}} erinnert werden. Widerruf jederzeit.'), []);
  assert.match(textPruefen(eintragFuer('praxis.recall'), 'Ich möchte von {{betrieb}} {{betrag}} erinnert werden, und zwar regelmäßig.').join(' '), /Unbekannte Platzhalter: \{\{betrag\}\}/);
  assert.ok(eintragFuer('web.agb')?.angebunden);
  assert.ok(RECHTS_TEXTE.length >= 15);
});

test('Praxis: ohne eigenen Text kein Wortlaut, mit eigenem Text gefüllt', () => {
  for (const e of EINWILLIGUNGEN) {
    assert.equal(einwilligungText(e.key, 'Praxis Sonne', {}), null, e.key);
    assert.equal(einwilligungText(e.key, 'Praxis Sonne', {}, 'zu kurz'), null);
    assert.equal(einwilligungText(e.key, 'Praxis Sonne', {}, 'x'.repeat(60) + ' [Ihr Text]'), null, 'Lücke = kein Text');
  }
  const t = einwilligungText('weitergabe', 'Praxis Sonne', { empfaenger: 'Labor Nord' }, 'Ich willige ein, dass {{betrieb}} Angaben an {{empfaenger}} gibt. Kunde: {{kunde}}.', 'Anna Berg');
  assert.equal(t, 'Ich willige ein, dass Praxis Sonne Angaben an Labor Nord gibt. Kunde: Anna Berg.');
  assert.equal(einwilligungWerte('recall', 'X', { kanaele: ['email', 'sms'] }).wege.split(', ').length, 2);
  const src = lies('lib/praxis.ts');
  assert.doesNotMatch(src, /Ich willige ein, dass \$\{f\}|const WIDERRUF =/, 'alter Wortlaut entfernt');
  const seite = lies('app/dashboard/wellness/praxis/page.tsx');
  assert.match(seite, /ladeRechtstext\(supabase, p\.betrieb, praxisRechtstext\(p\.art\)\)/);
  assert.match(seite, /if \(!text\) f\.push\(/);
  assert.match(seite, /disabled=\{!text\} onClick=\{\(\) => void speichern\(\)\}/);
  assert.doesNotMatch(seite, /Mustertexte — vor dem ersten Einsatz/);
});

test('Website: kein interner Hinweis öffentlich, AGB nur mit eigenem Text', () => {
  assert.equal(agbOeffentlich(null), null);
  assert.equal(agbOeffentlich('kurz'), null);
  assert.equal(agbOeffentlich(AGB), AGB);
  assert.match(agbText({ firma: 'Muster' }), /keine eigenen AGB hinterlegt/);
  assert.equal(agbText({ firma: 'Muster' }, AGB), AGB);
  assert.match(datenschutzText({ firma: 'M' }), /Grundgerüst aus ARGONAUT OS/, 'im Dashboard mit Hinweis');
  assert.doesNotMatch(datenschutzText({ firma: 'M' }, undefined, { mitHinweis: false }), /Grundgerüst aus ARGONAUT/);
  assert.doesNotMatch(fussHtml({ firma: 'M' }, 2026), /#agb/);
  assert.match(fussHtml({ firma: 'M' }, 2026, { agb: true }), /href="#agb"/);
  const ohne = seiteHtml({ bloecke: [{ typ: 'hero', titel: 'Hallo' }] }, { firma: 'Muster' }, 2026, { oeffentlichId: 'abc' });
  assert.doesNotMatch(ohne, /Grundgerüst aus ARGONAUT|ergänzen wir automatisch|id="agb"|href="#agb"/);
  const mit = seiteHtml({ bloecke: [{ typ: 'hero', titel: 'Hallo' }] }, { firma: 'Muster' }, 2026, { oeffentlichId: 'abc', agbText: AGB });
  assert.match(mit, /id="agb"/); assert.match(mit, /href="#agb"/); assert.match(mit, /AGB der Muster GmbH/);
  for (const r of ['app/p/[id]/route.ts', 'app/p-domain/[host]/route.ts']) {
    assert.match(lies(r), /\.eq\('schluessel', 'web\.agb'\)\.maybeSingle\(\)/, r);
    assert.match(lies(r), /agbText, /, r);
  }
});

test('KI-Dokumente mit Rechtswirkung: ENTWURF + Prüfhinweis, kein „Agent" in der Oberfläche', () => {
  const t = lies('lib/document-templates.ts');
  for (const id of ['arbeitsvertrag', 'kuendigung', 'abmahnung', 'aufhebungsvertrag', 'nda', 'vollmacht']) assert.match(t, new RegExp(`'${id}'`), id);
  assert.match(lies('lib/document-render.ts'), /if \(RECHTLICH_PRUEFEN\.has\(tpl\.id\)\) paragraphs\.push\(\{ text: HINWEIS_RECHTLICH, bold: true \}\);/);
  const chat = lies('app/dashboard/chat/page.tsx');
  assert.match(chat, /RECHTLICH_PRUEFEN\.has\(v\.templateId\)/);
  assert.doesNotMatch(chat, />Agent: \{/);
});
