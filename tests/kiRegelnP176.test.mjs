// Paket 176 (29.09.2026) — KI-Regeln: H11 keine geschaetzten Preise, H12 keine
// Krankheitsdaten an die KI, Stapel im KI-Kostenprotokoll.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { kiPositionSaeubern, PREIS_PLATZHALTER } from '../out/kiPreisRegel.js';
import { textAus, stapelProtokoll } from '../out/kiBatch.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const E = ['Stk', 'Std', 'Psch'];

test('H11: Preis nur aus Dokument mit Quelle — sonst 0 und sichtbarer Platzhalter', () => {
  const dok = kiPositionSaeubern({ bezeichnung: 'Steckdose setzen', menge: 2, einheit: 'Stk', einzelpreis: 38.456, quelle: 'dokument', quelle_datei: 'Preisliste.pdf' }, E);
  assert.deepEqual([dok.einzelpreis, dok.quelle, dok.bezeichnung], [38.46, 'dokument', 'Steckdose setzen']);
  for (const roh of [
    { bezeichnung: 'Wallbox', einzelpreis: 1290, quelle: 'geschaetzt' },           // alte Schaetzung
    { bezeichnung: 'Wallbox', einzelpreis: 1290, quelle: 'dokument' },             // „dokument" ohne Quelle
    { bezeichnung: 'Wallbox', einzelpreis: 0, quelle: 'dokument', quelle_datei: 'x.pdf' }, // ohne Preis
    { bezeichnung: 'Wallbox', einzelpreis: 1290 },
  ]) {
    const p = kiPositionSaeubern(roh, E);
    assert.equal(p.einzelpreis, 0, JSON.stringify(roh));
    assert.equal(p.quelle, 'fehlt');
    assert.equal(p.bezeichnung, `Wallbox ${PREIS_PLATZHALTER}`);
    assert.equal(p.quelle_datei, '');
  }
  // Platzhalter wird nie doppelt angehaengt, leere Bezeichnung faellt weg
  assert.equal(kiPositionSaeubern({ bezeichnung: `Anfahrt ${PREIS_PLATZHALTER}` }, E).bezeichnung, `Anfahrt ${PREIS_PLATZHALTER}`);
  assert.equal(kiPositionSaeubern({ bezeichnung: '  ' }, E), null);
  const k = kiPositionSaeubern({ bezeichnung: 'X', menge: -3, einheit: 'Fass', mwst_satz: 400 }, E);
  assert.deepEqual([k.menge, k.einheit, k.mwst_satz], [1, 'Stk', 19]);
});

test('H11: Route bittet die KI nicht mehr um Schaetzungen und saeubert serverseitig', () => {
  const s = ohneKommentare(lies('app/api/auftrag-ki-positionen/route.ts'));
  assert.doesNotMatch(s, /marktüblich|schätze einen|Preise schätzen/i);
  assert.match(s, /Schätze NIEMALS einen Preis/);
  assert.match(s, /\.map\(\(p: any\) => kiPositionSaeubern\(p, EINHEITEN\)\)/);
  const seite = lies('app/dashboard/auftraege/[id]/page.tsx');
  assert.match(seite, /quelle: "dokument" \| "fehlt";/);
  assert.doesNotMatch(seite, /"⚠️ geschätzt"/);
});

test('H12: HR-Auswertung schickt keine Krankheitsdaten an die KI, BEM-Hinweis ohne KI', () => {
  const s = ohneKommentare(lies('app/api/hr/ki-auswertung/route.ts'));
  const prompt = s.slice(s.indexOf('const userText'), s.indexOf('const resp = await kiFetch'));
  assert.doesNotMatch(prompt, /krankTage|krankEintraege|wochenendNah|Krankheitstage|Wochenende/);
  assert.match(prompt, /bewusst KEINE Angaben/);
  assert.match(s, /bemHinweis\(body\.krankTage\)/);
  assert.match(s, /§ 167 Abs\. 2 SGB IX/);
});

test('H12: Dashboard-Chat nennt keine Namen Krankgemeldeter', () => {
  const s = ohneKommentare(lies('app/api/dashboard-chat/route.ts'));
  assert.doesNotMatch(s, /krankeNamen|krankgemeldet|maName/i);
  assert.match(s, /Heute abwesend \(Urlaub, Krankheit u\. a\. zusammen, ohne Namen\): \$\{abwesendHeute\}/);
  assert.match(s, /from\("mitarbeiter"\)\.select\("id, status"\)/);
});

test('Stapel im Kostenprotokoll: Verbrauch je Modell, halber Preis, Kennzeichen „(Stapel)"', () => {
  const zeile = (id, rein, raus, modell = 'claude-haiku-4-5') => textAus({
    custom_id: id, result: { type: 'succeeded', message: { model: modell, usage: { input_tokens: rein, output_tokens: raus }, content: [{ type: 'text', text: 'ok' }] } },
  });
  const e = [zeile('a', 1000, 500), zeile('b', 3000, 500), zeile('c', 100, 100, 'claude-sonnet-5'),
    textAus({ custom_id: 'd', result: { type: 'errored', error: { message: 'x' } } })];
  assert.equal(e[0].modell, 'claude-haiku-4-5');
  assert.deepEqual(e[0].verbrauch, { input_tokens: 1000, output_tokens: 500 });
  const p = stapelProtokoll(e, 'betrieb-1', 'content-fliessband');
  assert.equal(p.length, 2);
  const haiku = p.find((z) => z.modell === 'claude-haiku-4-5');
  assert.deepEqual([haiku.user_id, haiku.route, haiku.tokens_rein, haiku.tokens_raus], ['betrieb-1', 'content-fliessband (Stapel)', 4000, 1000]);
  assert.ok(haiku.kosten_usd > 0);
  assert.deepEqual(stapelProtokoll([], 'b', 'r'), []);
  const cron = ohneKommentare(lies('app/api/cron/ki-batch-abholen/route.ts'));
  assert.match(cron, /stapelProtokoll\(geholt\.ergebnisse, stapel\.owner_user_id, stapel\.route\)/);
  assert.match(cron, /from\('ki_nutzung'\)\.insert\(protokoll\)/);
});
