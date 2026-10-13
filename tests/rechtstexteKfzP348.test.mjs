// ============================================================================
// tests/rechtstexteKfzP348.test.mjs — Paket 348 (13.10.2026)
// A1 Vorlagen-Prinzip Teil 2: Kfz-Unterlagen nehmen nur noch den eigenen Text
// des Betriebs („Meine Rechtstexte"). Ohne eigenen Text kein PDF und keine
// Unterschrift für Kaufvertrag, Reservierung, Vollmacht, Probefahrt; Ankauf
// und Werkstatt nur mit Hinweis. Nie wieder ARGONAUT-Klauseltext.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { dokumentInhalt, alsText, noetigeRechtstexte, fehlendeRechtstexte, DOK_ARTEN } from '../out/kfzVerkauf.js';
import { fahrtBrauchtText, fahrtPlatzhalter } from '../out/kfzProbefahrt.js';
import { RECHTS_TEXTE, eintragFuer, textPruefen, dokumentText } from '../out/rechtsTexte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const T = (text) => ({ eigen: true, text, fassung: 4, stand: 'Fassung 4 vom 13.10.2026' });
const HEUTE = '2026-10-13';

const v = (x = {}) => ({
  nr: 'V-0001', status: 'angebot', kaeufer_art: 'verbraucher', kaeufer_name: 'Eva Muster', kaeufer_firma: null, kaeufer_anschrift: 'Weg 1\n71032 Böblingen',
  kaeufer_tel: null, kaeufer_email: null, preis_brutto: 20000, zusatz: [], inzahlung_ankauf_id: null, inzahlung_betrag: null, anzahlung: null,
  anzahlung_art: null, anzahlung_am: null, rest_art: null, gewaehr: 'gesetzlich', gewaehr_gesondert: false, reserviert_bis: '2026-10-20',
  angebot_gueltig_bis: null, liefertermin: null, vertrag_am: null, uebergabe_am: null, km_uebergabe: null, schluessel: null, papiere: [], vereinbarungen: null, ...x,
});
const fz = () => ({ marke: 'Golf', modell: 'VII', variante: null, fin: 'WVW123', erstzulassung: '2019-03-01', km_stand: 88000, leistung_kw: 85, kraftstoff: 'Benzin', farbe: 'blau', hu_bis: null, vorbesitzer: 1, interne_nr: 'B-1', vorschaden: 'keine_bekannt', vorschaden_text: null, besteuerung: 'differenz' });

test('Katalog: alle Kfz-Texte angebunden, Verjährung eigener Eintrag', () => {
  for (const k of ['kfz.kaufvertrag', 'kfz.verjaehrung', 'kfz.reservierung', 'kfz.zulassungsvollmacht', 'kfz.probefahrt', 'kfz.ankauf', 'kfz.werkstattauftrag']) {
    assert.equal(eintragFuer(k)?.angebunden, true, k);
  }
  assert.ok(RECHTS_TEXTE.every((e) => e.angebunden), 'nichts mehr „in Kürze"');
  const p = eintragFuer('kfz.probefahrt');
  assert.deepEqual(textPruefen(p, 'Selbstbeteiligung {{selbstbeteiligung}}, höchstens {{km_frei}}, Rückgabe bis {{rueckgabe}} — Fahrer {{kunde}}.'), []);
});

test('Verkauf: welche Texte nötig sind, was fehlt', () => {
  assert.deepEqual(noetigeRechtstexte('kaufvertrag', v()), ['kfz.kaufvertrag']);
  assert.deepEqual(noetigeRechtstexte('kaufvertrag', v({ gewaehr: 'ein_jahr' })), ['kfz.kaufvertrag', 'kfz.verjaehrung']);
  assert.deepEqual(noetigeRechtstexte('kaufvertrag', v({ kaeufer_art: 'unternehmer', gewaehr: 'ein_jahr' })), ['kfz.kaufvertrag']);
  assert.deepEqual(noetigeRechtstexte('reservierung', v()), ['kfz.reservierung']);
  assert.deepEqual(noetigeRechtstexte('vollmacht', v()), ['kfz.zulassungsvollmacht']);
  for (const a of ['angebot', 'anzahlung', 'uebergabe']) assert.deepEqual(noetigeRechtstexte(a, v()), [], a);
  assert.deepEqual(fehlendeRechtstexte('kaufvertrag', v({ gewaehr: 'ein_jahr' }), { 'kfz.kaufvertrag': T('x') }), ['kfz.verjaehrung']);
  assert.deepEqual(fehlendeRechtstexte('kaufvertrag', v(), { 'kfz.kaufvertrag': { eigen: false, hinweis: 'fehlt' } }), ['kfz.kaufvertrag'], 'Hinweis zählt nicht');
  assert.deepEqual(fehlendeRechtstexte('kaufvertrag', v(), { 'kfz.kaufvertrag': T('x') }), []);
});

test('Unterlagen: eigener Text mit Fassung, sonst Hinweis — nie ARGONAUT-Klauseln', () => {
  const alt = /bleibt bis zur vollständigen Zahlung|Leben, Körper oder Gesundheit|keinem anderen Interessenten|bevollmächtigt den oben genannten Betrieb|eigens darauf hingewiesen|unentgeltlich zur/;
  for (const d of DOK_ARTEN) {
    const ohne = alsText(dokumentInhalt(d.key, v({ gewaehr: 'ein_jahr', anzahlung: 100 }), fz(), null, null, HEUTE));
    assert.doesNotMatch(ohne, alt, d.key);
  }
  const kv = dokumentInhalt('kaufvertrag', v({ gewaehr: 'ein_jahr' }), fz(), null, null, HEUTE, { 'kfz.kaufvertrag': T('§ 1 Eigene Regel A\n§ 2 Eigene Regel B'), 'kfz.verjaehrung': T('Eigene Verjährung.') });
  const t = alsText(kv);
  assert.match(t, /VERTRAGSBEDINGUNGEN\n§ 1 Eigene Regel A\n§ 2 Eigene Regel B\n\(Fassung 4 vom 13\.10\.2026\)/);
  const ges = kv.abschnitte.find((a) => a.titel === 'Gesonderte Vereinbarung zur Verjährung');
  assert.ok(ges?.eigeneUnterschrift, 'gesonderte Unterschrift bleibt');
  assert.deepEqual(ges.text.slice(0, 1), ['Eigene Verjährung.']);
  const ohneKv = dokumentInhalt('kaufvertrag', v(), fz(), null, null, HEUTE, { 'kfz.kaufvertrag': dokumentText(eintragFuer('kfz.kaufvertrag'), null) });
  assert.match(alsText(ohneKv), /kein eigener Text des Betriebs hinterlegt/);
  assert.match(alsText(dokumentInhalt('vollmacht', v(), fz(), null, null, HEUTE, { 'kfz.zulassungsvollmacht': T('Eigene Vollmacht.') })), /Eigene Vollmacht\.[\s\S]*SEPA-Lastschriftmandat/);
  assert.match(alsText(dokumentInhalt('reservierung', v(), fz(), null, null, HEUTE, { 'kfz.reservierung': T('Eigene Reservierung.') })), /BEDINGUNGEN DER RESERVIERUNG\nEigene Reservierung\./);
});

test('Probefahrt: Text nur für die Vereinbarung, Platzhalter-Werte', () => {
  assert.equal(fahrtBrauchtText('vereinbarung', { art: 'probefahrt' }), true);
  assert.equal(fahrtBrauchtText('vereinbarung', { art: 'ersatzwagen' }), true);
  assert.equal(fahrtBrauchtText('vereinbarung', { art: 'ueberfuehrung' }), false);
  assert.equal(fahrtBrauchtText('rueckgabe', { art: 'probefahrt' }), false);
  const w = fahrtPlatzhalter({ fahrer_name: ' Max ', selbstbeteiligung: 1000, km_frei: 50, ende_geplant: '2026-10-13T14:00:00Z' }, { name: 'Autohaus' }, HEUTE);
  assert.equal(w.kunde, 'Max'); assert.equal(w.betrieb, 'Autohaus'); assert.equal(w.selbstbeteiligung, '1.000,00 €'); assert.equal(w.km_frei, '50 km'); assert.equal(w.datum, '13.10.2026');
  assert.match(w.rueckgabe, /13\.10\.2026/);
  assert.equal(fahrtPlatzhalter({ fahrer_name: null, selbstbeteiligung: 0, km_frei: null, ende_geplant: null }, null, HEUTE).selbstbeteiligung, '');
});

test('Seiten: Sperre vor PDF und Unterschrift, Hinweis auf Meine Rechtstexte', () => {
  const vk = lies('app/dashboard/kfz/bestand/KfzVerkauf.tsx');
  assert.match(vk, /if \(r\.fehlt\) \{ setFehler\(r\.fehlt\); return; \}\n\s+verkaufPdf\(/);
  assert.match(vk, /if \(r\.fehlt\) \{ setFehler\(r\.fehlt\); return; \}\n\s+const name = DOK_ARTEN/);
  assert.doesNotMatch(vk, /Die Vertragstexte sind Vorlagen von ARGONAUT/);
  const pf = lies('app/dashboard/kfz/bestand/KfzProbefahrt.tsx');
  assert.match(pf, /if \(!t\.eigen\) \{\n\s+setFehler\(/);
  assert.equal((pf.match(/await dokument\(z, art, firma\); if \(!d\) return;/g) ?? []).length, 2, 'PDF und Unterschrift');
  assert.doesNotMatch(pf, /Texte sind Vorlagen von ARGONAUT/);
  assert.match(lies('app/dashboard/kfz/ankauf/[id]/page.tsx'), /ladeDokumentText\(supabase, a\.owner_user_id, 'kfz\.ankauf'/);
  assert.match(lies('app/dashboard/werkstatt/page.tsx'), /ladeDokumentText\(supabase, besitzer \?\? uid, 'kfz\.werkstattauftrag'/);
  const pdf = lies('app/dashboard/_components/werkstattAuftragPdf.ts');
  assert.match(pdf, /if \(bedingungen && bedingungen\.eigen\) \{/);
  const ank = lies('lib/kfzAnkauf.ts');
  assert.doesNotMatch(ank, /erklärt, Eigentümer des Fahrzeugs zu sein/);
});
