// Paket 329 (12.10.2026): G2b Betriebsanweisungs-Entwurf (TRGS 555) — nur übernommener Wortlaut, Freigabe gesperrt bis R49
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ABSCHNITTE, LEER_INHALT, pAbschnitt, entwurf, saubererInhalt, freigabeFehler, druckHtml } from '../out/betriebsanweisung.js';
import { startFrei } from '../out/startSperre.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const STOFF = { bezeichnung: 'Verdünnung V12', hersteller: 'Muster GmbH', arbeitsbereiche: 'Lackierkabine', h_saetze: 'H225, H319, EUH066', piktogramme: ['GHS02'], signalwort: 'Gefahr' };
const ANGABEN = {
  status: 'bestaetigt', piktogramme: ['GHS02', 'GHS07'], signalwort: 'Gefahr',
  h_saetze: [{ code: 'H225', text: 'Flüssigkeit und Dampf leicht entzündbar.' }, { code: 'H319', text: 'Verursacht schwere Augenreizung.' }],
  p_saetze: [
    { code: 'P210', text: 'Von Hitze fernhalten.' },
    { code: 'P305+P351+P338', text: 'BEI KONTAKT MIT DEN AUGEN: Einige Minuten lang behutsam mit Wasser spülen.' },
    { code: 'P370+P378', text: 'Bei Brand: CO2 zum Löschen verwenden.' },
    { code: 'P403+P235', text: 'An einem gut belüfteten Ort aufbewahren. Kühl halten.' },
    { code: 'P501', text: 'Inhalt/Behälter einer zugelassenen Entsorgung zuführen.' },
  ],
};

test('P-Sätze landen im richtigen Abschnitt', () => {
  assert.equal(pAbschnitt('P210'), 'schutz');
  assert.equal(pAbschnitt('P280'), 'schutz');
  assert.equal(pAbschnitt('P403+P235'), 'schutz');
  assert.equal(pAbschnitt('P305+P351+P338'), 'erstehilfe');
  assert.equal(pAbschnitt('P362'), 'erstehilfe');
  assert.equal(pAbschnitt('P370+P378'), 'gefahrfall');
  assert.equal(pAbschnitt('P391'), 'gefahrfall');
  assert.equal(pAbschnitt('P501'), 'entsorgung');
  assert.equal(pAbschnitt('p 210'), null);
  assert.equal(pAbschnitt('H225'), null);
  assert.equal(pAbschnitt(null), null);
});

test('Entwurf mit bestätigten Angaben: nur übernommener Wortlaut, Rest leer mit Hinweis', () => {
  const e = entwurf(STOFF, ANGABEN);
  assert.equal(e.inhalt.arbeitsbereich, 'Lackierkabine');
  assert.equal(e.inhalt.notruf, '112');
  assert.equal(e.inhalt.gefahren, 'H225: Flüssigkeit und Dampf leicht entzündbar.\nH319: Verursacht schwere Augenreizung.');
  assert.equal(e.inhalt.schutz, 'P210: Von Hitze fernhalten.\nP403+P235: An einem gut belüfteten Ort aufbewahren. Kühl halten.');
  assert.match(e.inhalt.erstehilfe, /^P305\+P351\+P338: BEI KONTAKT/);
  assert.match(e.inhalt.gefahrfall, /^P370\+P378/);
  assert.match(e.inhalt.entsorgung, /^P501/);
  assert.equal(e.inhalt.taetigkeit, '', 'Tätigkeit schreibt der Betrieb');
  assert.deepEqual(e.piktogramme, ['GHS02', 'GHS07']);
  assert.equal(e.signalwort, 'Gefahr');
  assert.equal(e.hinweise.length, 0);
});

test('Ohne bestätigte Angaben: nur H-Codes aus dem Verzeichnis, Platzhalter und Hinweise', () => {
  for (const a of [null, { ...ANGABEN, status: 'vorschlag' }]) {
    const e = entwurf(STOFF, a);
    assert.equal(e.inhalt.gefahren, 'H225: (Wortlaut aus dem Sicherheitsdatenblatt ergänzen)\nH319: (Wortlaut aus dem Sicherheitsdatenblatt ergänzen)\nEUH066: (Wortlaut aus dem Sicherheitsdatenblatt ergänzen)');
    assert.equal(e.inhalt.schutz, '', 'Vorschläge werden nicht übernommen');
    assert.deepEqual(e.piktogramme, ['GHS02']);
    assert.ok(e.hinweise.some((h) => /Keine bestätigten Gefahr-Angaben/.test(h)));
    assert.ok(e.hinweise.some((h) => /Abschnitt 2 .* aus Abschnitt 7 und 8/.test(h)));
    assert.equal(e.hinweise.length, 5, 'Hinweis + vier leere Abschnitte');
  }
  // fremdes Signalwort / unbekanntes Piktogramm fällt raus
  const e = entwurf({ ...STOFF, signalwort: 'Vorsicht', piktogramme: ['GHS99', 'GHS05'] }, null);
  assert.equal(e.signalwort, null);
  assert.deepEqual(e.piktogramme, ['GHS05']);
});

test('Säubern und Freigabe-Prüfung', () => {
  const s = saubererInhalt({ gefahren: ' a\r\nb ', fremd: 'x', notruf: 'n'.repeat(500), schutz: 7, taetigkeit: 'x'.repeat(5000) });
  assert.equal(s.gefahren, 'a\nb');
  assert.equal(s.fremd, undefined);
  assert.equal(s.notruf.length, 200);
  assert.equal(s.schutz, '');
  assert.equal(s.taetigkeit.length, 3000);
  const leer = { ...LEER_INHALT, notruf: '' };
  assert.deepEqual(saubererInhalt(null), leer, 'nichts erfinden — auch keinen Notruf');
  assert.deepEqual(saubererInhalt(['x']), leer);

  const voll = { ...LEER_INHALT, arbeitsbereich: 'A', taetigkeit: 'T', gefahren: 'g', schutz: 's', gefahrfall: 'f', erstehilfe: 'e', entsorgung: 'n' };
  assert.deepEqual(freigabeFehler(voll), []);
  assert.equal(freigabeFehler(LEER_INHALT).length, 2 + ABSCHNITTE.length);
  assert.ok(freigabeFehler({ ...voll, gefahren: 'H225: (Wortlaut aus dem Sicherheitsdatenblatt ergänzen)' }).some((f) => /Wortlaut/.test(f)));
  assert.ok(freigabeFehler({ ...voll, notruf: ' ' }).includes('Notruf fehlt.'));
});

test('Druck: TRGS-555-Rahmen, ENTWURF bis zur Freigabe, alles maskiert', () => {
  const inhalt = { ...LEER_INHALT, arbeitsbereich: 'Halle <2>', taetigkeit: 'T', gefahren: 'H225: <script>x</script>\nZeile 2' };
  const roh = { firma: 'A & B', stoff: 'V12', inhalt, piktogramme: ['GHS02'], signalwort: 'Gefahr', freigegeben: false };
  const h = druckHtml(roh);
  assert.match(h, /BETRIEBSANWEISUNG/);
  assert.match(h, /<div class="entwurf"><span>ENTWURF<\/span><\/div>/);
  assert.match(h, /ENTWURF — nicht freigegeben/);
  assert.ok(!h.includes('<script>x'), 'kein ungeschütztes HTML');
  assert.match(h, /&lt;script&gt;x&lt;\/script&gt;<br>Zeile 2/);
  assert.match(h, /A &amp; B/);
  assert.match(h, /Halle &lt;2&gt;/);
  for (const a of ABSCHNITTE) assert.ok(h.includes(`${a.nr}. ${a.titel}`), a.titel);
  assert.match(h, /Notruf: 112/);
  const f = druckHtml({ ...roh, freigegeben: true, freigegebenAm: '12.10.2026', version: 2 });
  assert.ok(!f.includes('class="entwurf"'));
  assert.match(f, /Freigegeben am 12\.10\.2026 · Version 2/);
});

test('Freigabe ist gesperrt bis zur Abnahme (R49) und im Sperr-Gedächtnis', () => {
  assert.equal(startFrei('betriebsanweisung'), false);
  assert.match(lies('docs/ARGONAUT-SPERR-GEDAECHTNIS.md'), /SCHALTER startSperre\.betriebsanweisung = aus/);
});

test('Seite: Freigabe nur mit Schalter, nur Chef, Druck ohne Freigabe = ENTWURF; Link im Verzeichnis', () => {
  const s = lies('app/dashboard/nachweise/gefahrstoffe/[id]/betriebsanweisung/page.tsx');
  assert.match(s, /const freigabeOffen = startFrei\('betriebsanweisung', freigabe\);/);
  assert.match(s, /if \(!ba \|\| !freigabeOffen\) return;/);
  assert.match(s, /freigegeben: freigabeOffen && freigegeben && !geaendert/);
  assert.match(s, /const nurLesen = !istChef;/);
  assert.match(s, /\{!nurLesen && ba && /);
  assert.match(s, /upsert\(zeile, \{ onConflict: 'gefahrstoff_id' \}\)/);
  assert.ok(!/status:\s*'entwurf'/.test(s), 'Speichern setzt den Status nicht selbst (macht der Wächter)');
  assert.match(s, /Der Entwurf ersetzt keine Gefährdungsbeurteilung/);
  assert.match(lies('app/dashboard/nachweise/gefahrstoffe/page.tsx'), /href=\{`\/dashboard\/nachweise\/gefahrstoffe\/\$\{z\.id\}\/betriebsanweisung`\}/);
});

test('SQL p329: Wächter, nur Chef gibt frei, MA lesen, additiv', () => {
  const q = lies('supabase-sql/p329-betriebsanweisung.sql');
  assert.match(q, /create table if not exists public\.betriebsanweisung/);
  assert.match(q, /unique \(gefahrstoff_id\)/);
  assert.match(q, /if public\.mein_chef_id\(\) is not null then\s+raise exception 'Freigeben darf nur die Geschaeftsleitung\.'/);
  assert.match(q, /if tg_op = 'UPDATE' and v_neu and old\.status = 'freigegeben' then\s+new\.status := 'entwurf';/);
  assert.match(q, /for select to authenticated\s+using \(owner_user_id = public\.mein_chef_id\(\)\)/);
  assert.ok(!/\bdrop table\b(?![^\n]*RÜCKWEG)/i.test(q.split('\n').filter((l) => !l.startsWith('--')).join('\n')), 'nichts Destruktives');
});
