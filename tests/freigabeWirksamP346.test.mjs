// ============================================================================
// tests/freigabeWirksamP346.test.mjs — Paket 346 (13.10.2026)
// A0 Freigabe-Zentrale Teil 2: Die Freigabe wirkt.
//   · wirksam frei = Code an ODER Datenbank an — nie anders
//   · jeder Fehler, unbekannte Schlüssel, kaputte Antworten = gesperrt
//   · alle Prüfstellen (Server und Seiten) nutzen den wirksamen Stand
//   · Freigeben verlangt den Haken „Mitziehen erledigt", Speicher wird geleert
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { codeStand, standAusDb, standAusAntwort, nurDurchDatenbank, CACHE_MS } from '../out/freigabeStand.js';
import { START_FREIGABE, startFrei, startSperrGrund } from '../out/startSperre.js';
import { ANWALT_FREIGABE, anwaltSperrGrund } from '../out/anwaltFreigabe.js';
import { importErlaubt } from '../out/importRechte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Code-Stand: alles aus, unverändert', () => {
  const c = codeStand();
  assert.deepEqual(c.start, { ...START_FREIGABE });
  assert.deepEqual(c.anwalt, { ...ANWALT_FREIGABE });
  assert.ok(Object.values(c.start).every((v) => v === false), 'Code-Standard bleibt aus');
  assert.ok(Object.values(c.anwalt).every((v) => v === false));
  c.start.shop = true;
  assert.equal(codeStand().start.shop, false, 'jede Abfrage bekommt eine frische Kopie');
});

test('Datenbank öffnet nur bekannte Bereiche mit an === true', () => {
  const s = standAusDb([
    { schluessel: 'startSperre.shop', an: true },
    { schluessel: 'startSperre.fernhilfe', an: 'true' },
    { schluessel: 'startSperre.whatsappWerbung', an: 1 },
    { schluessel: 'startSperre.gibtsNicht', an: true },
    { schluessel: 'startSperre.__proto__', an: true },
    { schluessel: 'startSperre.kiBeraterFremd.extra', an: true },
    { schluessel: 'anwaltFreigabe.tier', an: true },
    { schluessel: 'anwaltFreigabe.shop', an: true },
    { schluessel: 'flags.BESTELLSTRECKE_LIVE', an: true },
    { schluessel: 'kasse.modus', an: true },
    null, 42, { an: true },
  ]);
  assert.equal(s.start.shop, true);
  assert.equal(s.start.fernhilfe, false, 'nur echtes true');
  assert.equal(s.start.whatsappWerbung, false);
  assert.equal(s.start.kiBeraterFremd, false, 'Schlüssel mit Zusatz öffnet nichts');
  assert.equal('gibtsNicht' in s.start, false, 'unbekannter Bereich entsteht nicht');
  assert.equal(Object.keys(s.start).length, Object.keys(START_FREIGABE).length);
  assert.equal(s.anwalt.tier, true);
  assert.equal(s.anwalt.gesundheit, false);
  assert.equal('shop' in s.anwalt, false, 'Gruppen werden nicht vermischt');
  assert.deepEqual(nurDurchDatenbank(s).sort(), ['anwaltFreigabe.tier', 'startSperre.shop']);
  assert.equal(startFrei('shop', s.start), true);
  assert.equal(startSperrGrund('shop', s.start), null);
  assert.equal(startFrei('fernhilfe', s.start), false);
  assert.equal(anwaltSperrGrund('tier', s.anwalt), null);
  assert.ok(anwaltSperrGrund('gesundheit', s.anwalt));
});

test('Fehler = gesperrt: kein Array, leere Antwort, kaputte Browser-Antwort', () => {
  for (const x of [null, undefined, 'x', 7, {}]) assert.deepEqual(standAusDb(x), codeStand(), String(x));
  assert.deepEqual(standAusDb([]), codeStand());
  for (const x of [null, undefined, 'kaputt', [], { start: 'ja' }, { start: { shop: 'true' } }, { start: { shop: 1 } }]) {
    assert.equal(standAusAntwort(x).start.shop, false, JSON.stringify(x));
  }
  const ok = standAusAntwort({ start: { shop: true, gibtsNicht: true }, anwalt: { kanzlei: true } });
  assert.equal(ok.start.shop, true);
  assert.equal(ok.anwalt.kanzlei, true);
  assert.equal('gibtsNicht' in ok.start, false);
  assert.equal(CACHE_MS, 60_000, 'höchstens eine Minute alt');
});

test('Import: Sperre folgt dem wirksamen Stand, Rechte bleiben', () => {
  const chef = { chef: true, module: [], schreibModule: null };
  const zu = importErlaubt('patienten', chef);
  assert.equal(zu.ok, false, 'Code-Stand: gesperrt, auch für den Chef');
  assert.match(zu.grund, /Art\. 9/);
  assert.equal(importErlaubt('patienten', chef, { ...ANWALT_FREIGABE, gesundheit: true }).ok, true);
  assert.equal(importErlaubt('patienten', chef, { ...ANWALT_FREIGABE, tier: true }).ok, false, 'andere Freigabe öffnet nicht');
  assert.equal(importErlaubt('patienten', null, { ...ANWALT_FREIGABE, gesundheit: true }).ok, false, 'ohne Rechte nie frei');
  assert.equal(importErlaubt('kontakte', chef).ok, true);
});

test('Server: Fehler = Code-Stand, Speicher eine Minute, Admin leert ihn', () => {
  const srv = lies('lib/freigabeServer.ts');
  assert.match(srv, /stand = error \? codeStand\(\) : standAusDb\(data \?\? \[\]\);/);
  assert.match(srv, /\} catch \{\n\s+stand = codeStand\(\);/);
  assert.match(srv, /\.eq\('an', true\)/);
  assert.doesNotMatch(srv, /^'use client'/m);
  const admin = lies('app/api/admin/freigaben/route.ts');
  assert.match(admin, /freigabeSpeicherLeeren\(\);/);
  assert.match(admin, /mitgezogen: body\.mitgezogen === true/);
  assert.match(admin, /if \(basis\.an\) return NextResponse\.json\(\{ ok: false, error: 'Ein freigegebener Schalter wird nicht ausgeblendet/);
  const stand = lies('app/api/freigaben/stand/route.ts');
  assert.match(stand, /if \(!user\) return NextResponse\.json\(codeStand\(\)/);
  assert.match(stand, /catch \{\n\s+return NextResponse\.json\(codeStand\(\)/);
  assert.doesNotMatch(stand, /vermerk/, 'nur ja/nein, keine Vermerke');
  const hook = lies('lib/useFreigabeStand.ts');
  assert.match(hook, /useState<FreigabeStand>\(codeStand\)/, 'Browser startet gesperrt');
  assert.match(hook, /\.catch\(\(\) => codeStand\(\)\)/);
});

// Wächter: Jede Prüfstelle nutzt den WIRKSAMEN Stand. Ein Aufruf mit nur dem
// Bereich (= nur Code) ist ausserhalb der Grundbausteine verboten.
const ERLAUBT = new Set([
  'lib/startSperre.ts', 'lib/anwaltFreigabe.ts', 'lib/freigabeStand.ts', 'lib/freigabeServer.ts', 'lib/useFreigabeStand.ts', 'lib/freigabeZentrale.ts',
  // Rückfall, wenn kein Stand mitgegeben wird (Vorschau im Browser): Code = gesperrt
  'lib/webBloecke.ts',
]);
function dateien(dir) {
  const raus = [];
  for (const e of fs.readdirSync(path.join(WURZEL, dir), { withFileTypes: true })) {
    const p = path.posix.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') raus.push(...dateien(p)); }
    else if (/\.(ts|tsx)$/.test(e.name)) raus.push(p);
  }
  return raus;
}

test('Wächter: keine Prüfstelle liest nur den Code', () => {
  const nurCode = /\b(startFrei|startSperrGrund|anwaltSperrGrund)\(\s*(['"])[A-Za-z]+\2\s*\)|\bimportErlaubt\([^()]*,\s*[A-Za-z]+\s*\)/;
  const funde = [];
  for (const f of [...dateien('app'), ...dateien('lib')]) {
    if (ERLAUBT.has(f)) continue;
    const t = fs.readFileSync(path.join(WURZEL, f), 'utf8');
    t.split('\n').forEach((z, i) => { if (nurCode.test(z) && !/^\s*(\/\/|\*)/.test(z)) funde.push(`${f}:${i + 1}: ${z.trim().slice(0, 100)}`); });
  }
  assert.deepEqual(funde, [], 'Bitte den wirksamen Stand nutzen (startFreiServer, ladeFreigabeStand, useFreigabeStand):\n' + funde.join('\n'));
});

test('Öffentliche Seiten, Menü und Shop-Wege lesen den wirksamen Stand', () => {
  assert.match(lies('app/p/[id]/route.ts'), /shopFrei: await startFreiServer\('shop'\)/);
  assert.match(lies('app/p-domain/[host]/route.ts'), /shopFrei: await startFreiServer\('shop'\)/);
  assert.match(lies('app/dashboard/layout.tsx'), /\(await startFreiServer\('fernhilfe'\)\) && <FernhilfeKnopf \/>/);
  const best = lies('app/api/oeffentlich/shop-bestellung/route.ts');
  assert.ok(best.indexOf('ladeFreigabeStand()') < best.indexOf("startSperrGrund('shop', freigabe)"), 'Stand vor der Prüfung');
  assert.match(lies('lib/shopB2bServer.ts'), /const frei = freiVorgabe \?\? \(await startFreiServer\('gewerbeNachweis'\)\);/);
  const wb = lies('lib/webBloecke.ts');
  assert.match(wb, /const shopFrei = opts\.shopFrei \?\? startFrei\('shop'\);/);
  assert.match(wb, /blockHtml\(b, ci, \{ oeffentlichId: opts\.oeffentlichId, editor: opts\.editor, shopFrei \}\)/);
  assert.match(wb, /webDiensteDerSeite\(seite\.bloecke \|\| \[\], shopFrei\)/);
});
