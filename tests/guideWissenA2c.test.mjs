// Paket A2c (25.09.2026) — Wissensbasis Finanzen: jede Finanz-Seite am echten Code geprueft.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WISSEN } from '../out/guideWissen.js';
import { modulGuide, MODUL_TEXTE } from '../out/kiGuideModule.js';

const RECHTE = fs.readFileSync(new URL('../lib/rechte.ts', import.meta.url), 'utf8');
const FINANZ = [...RECHTE.matchAll(/href: '(\/dashboard[^']*)'[^\n]*gruppe: 'finanzen'/g)].map((m) => m[1]);
const texte = (w) => [w.zweck, w.werText, ...w.schritte, w.probe?.anlegen ?? '', w.probe?.loeschen ?? ''].join(' ');

test('Jede Finanz-Seite im Menue hat einen Eintrag in der Wissensbasis', () => {
  assert.ok(FINANZ.length >= 30, `nur ${FINANZ.length} Finanz-Seiten gefunden`);
  for (const href of FINANZ) assert.ok(WISSEN[href], `fehlt: ${href}`);
});

test('Finanz-Seiten sind sensibel: jeder Eintrag sagt, wer Zugriff hat', () => {
  for (const href of FINANZ) {
    if (href.startsWith('/dashboard/personal')) continue;
    assert.match(WISSEN[href].werText, /sensibel|Chef/, href);
  }
});

test('Veraltete Guide-Texte sind raus: diese Seiten sprechen aus der Wissensbasis', () => {
  const seiten = ['/dashboard/rechnungen', '/dashboard/mahnwesen', '/dashboard/nachkalkulation', '/dashboard/eingangsbelege',
    '/dashboard/finanzen', '/dashboard/datev', '/dashboard/elster', '/dashboard/reports'];
  for (const href of seiten) {
    assert.equal(MODUL_TEXTE[href], undefined, `alter Text noch da: ${href}`);
    const g = modulGuide(href, [{ label: 'X', href }]);
    assert.equal(g.nachricht, WISSEN[href].zweck, href);
    assert.doesNotMatch(g.schritte.join(' '), /Kontostand und Fixkosten|Jede Mahnung wird protokolliert/, href);
  }
});

test('Loeschen ohne Rueckfrage wird ausdruecklich gewarnt', () => {
  for (const href of ['/dashboard/dsgvo', '/dashboard/foerdermittel', '/dashboard/foerder-angebot', '/dashboard/mahnwesen',
    '/dashboard/zahlungen', '/dashboard/banking', '/dashboard/abo-rechnungen', '/dashboard/rechnungen']) {
    assert.match(texte(WISSEN[href]), /ohne Rückfrage/, href);
  }
});

test('Seiten ohne Loeschweg sagen das beim Probe-Eintrag', () => {
  for (const href of ['/dashboard/spenden', '/dashboard/erechnung-import', '/dashboard/gobd', '/dashboard/mitglieder/checkin',
    '/dashboard/sepa-einzug', '/dashboard/nachkalkulation']) {
    assert.match(WISSEN[href].probe.loeschen, /nicht möglich/i, href);
  }
});

test('Fachliche Kernaussagen stimmen mit dem Code', () => {
  assert.match(WISSEN['/dashboard/rechnungen'].schritte[0], /keinen Knopf für eine neue Rechnung/);
  assert.match(texte(WISSEN['/dashboard/rechnungen']), /nicht löschen, nur stornieren/);
  assert.match(texte(WISSEN['/dashboard/erechnung-import']), /Beleg-Inbox/);
  assert.equal(WISSEN['/dashboard/mitglieder/vertraege'].wer, 'chef');
  assert.equal(WISSEN['/dashboard/controlling'].wer, 'lesen');
  assert.match(texte(WISSEN['/dashboard/controlling']), /nichts gespeichert/);
  assert.match(texte(WISSEN['/dashboard/banking']), /nur geplant/);
  assert.match(texte(WISSEN['/dashboard/elster']), /noch gesperrt/);
  assert.match(texte(WISSEN['/dashboard/datev']), /OHNE Vorsteuer/);
  assert.match(texte(WISSEN['/dashboard/sepa-einzug']), /nicht zweimal einziehen/);
  assert.match(texte(WISSEN['/dashboard/dsgvo']), /LOESCHEN/);
});
