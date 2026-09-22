// ARGONAUT OS · tests/augeVorbehaltP41.test.mjs — Punkt 41 (22.09.2026)
// Das wachende Auge darf keine Rechtsauskunft erteilen. Unter jeder
// rechtlichen Aussage steht der Vorbehalt — und ein HARTER Waechter prueft
// die Quelldatei darauf ab, mit benannter Ausnahmeliste statt Pauschalregel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  RECHTS_VORBEHALT, RECHTS_MERKMALE, VORBEHALT_AUSNAHMEN,
  brauchtVorbehalt, scanneAugeQuelle,
} from '../out/augeVorbehalt.js';
import { augeExpose, augeBk, augeEtiketten, augeRechnungen } from '../out/auge.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const AUGE_QUELLE = readFileSync(join(HIER, '..', 'lib', 'auge.ts'), 'utf8');

// ---------------------------------------------------------------------------
// 1. DER WAECHTER — hart, auf der echten Quelldatei
// ---------------------------------------------------------------------------

test('WAECHTER: keine rechtliche Aussage im Auge ohne Vorbehalt', () => {
  const befunde = scanneAugeQuelle(AUGE_QUELLE);
  assert.deepEqual(
    befunde, [],
    'Diese Auge-Texte sagen etwas Rechtliches und tragen keinen vorbehalt:\n'
    + befunde.map((b) => `  lib/auge.ts:${b.zeile}  ${b.text}`).join('\n')
    + '\n\nEntweder vorbehalt: RECHTS_VORBEHALT an die Rueckgabe haengen ODER die'
    + '\nStelle mit Begruendung in VORBEHALT_AUSNAHMEN eintragen (lib/augeVorbehalt.ts).',
  );
});

test('der Waechter findet eine neue Stelle wirklich — Gegenprobe im Test selbst', () => {
  const erfunden = `
export function augeErfunden(k: { x: number }): AugeErgebnis {
  return { klartext: \`\${k.x} Sachen — das ist abmahnfaehig.\`, punkte: [], stimmung: 'achtung' };
}`;
  const befunde = scanneAugeQuelle(erfunden);
  assert.equal(befunde.length, 1, 'der Waechter haette das melden muessen');
  assert.match(befunde[0].grund, /ohne vorbehalt/);
});

test('mit Vorbehalt meldet der Waechter dieselbe Stelle NICHT mehr', () => {
  const repariert = `
export function augeErfunden(k: { x: number }): AugeErgebnis {
  return {
    klartext: \`\${k.x} Sachen — das ist abmahnfaehig.\`,
    punkte: [], stimmung: 'achtung', vorbehalt: RECHTS_VORBEHALT,
  };
}`;
  assert.deepEqual(scanneAugeQuelle(repariert), []);
});

test('Kommentare gehen den Waechter nichts an', () => {
  const nurKommentar = `
// Arbeitszeitgesetz § 3: werktaeglich hoechstens 10 Stunden.
/** Siehe § 87 BetrVG. */
`;
  assert.deepEqual(scanneAugeQuelle(nurKommentar), []);
});

test('die Ausnahmeliste ist BENANNT und begruendet — keine Pauschalregel', () => {
  assert.ok(Array.isArray(VORBEHALT_AUSNAHMEN));
  for (const a of VORBEHALT_AUSNAHMEN) {
    assert.equal(typeof a.enthaelt, 'string');
    assert.ok(a.enthaelt.length > 5, 'ein Ausnahme-Muster muss konkret sein');
    assert.ok(a.grund && a.grund.length > 15, 'jede Ausnahme braucht eine Begruendung');
  }
});

// ---------------------------------------------------------------------------
// 2. WORAN EINE RECHTLICHE AUSSAGE ERKANNT WIRD
// ---------------------------------------------------------------------------

test('Paragrafen und rechtliche Bewertungen werden erkannt', () => {
  assert.equal(brauchtVorbehalt('Pflichtangaben nach § 87 GEG fehlen.'), true);
  assert.equal(brauchtVorbehalt('Das ist abmahnfähig.'), true);
  assert.equal(brauchtVorbehalt('Das verstößt gegen die HeizkostenV.'), true);
  assert.equal(brauchtVorbehalt('Das ist strafbar.'), true);
  assert.equal(brauchtVorbehalt('Dafür droht ein Bußgeld.'), true);
});

test('gewoehnliche Zahlen-Saetze brauchen keinen Vorbehalt', () => {
  assert.equal(brauchtVorbehalt('1.200,00 € sind überfällig — die sollten Sie eintreiben.'), false);
  assert.equal(brauchtVorbehalt('Keine offenen Forderungen — alles bezahlt.'), false);
  assert.equal(brauchtVorbehalt(''), false);
  assert.equal(brauchtVorbehalt(null), false);
  assert.equal(brauchtVorbehalt(42), false);
});

test('die Merkmalsliste ist nicht heimlich leer', () => {
  assert.ok(RECHTS_MERKMALE.length >= 5);
  assert.ok(RECHTS_MERKMALE.some((r) => r.test('§ 12')));
});

// ---------------------------------------------------------------------------
// 3. DER WORTLAUT
// ---------------------------------------------------------------------------

test('der Vorbehalt sagt, was er sagen muss — geprueft am Inhalt, nicht gegen sich selbst', () => {
  assert.match(RECHTS_VORBEHALT, /keine Rechts-?\s?(oder|und)\s?Steuerberatung/i);
  assert.match(RECHTS_VORBEHALT, /Anwalt|Steuerberater/i);
  assert.ok(RECHTS_VORBEHALT.length > 100, 'zu kurz, um verstanden zu werden');
  // Er steht an EINER Stelle: in der Quelldatei darf der Satz nicht noch
  // einmal woertlich auftauchen.
  assert.equal(
    AUGE_QUELLE.includes('keine Rechts- oder Steuerberatung'),
    false,
    'der Wortlaut ist in lib/auge.ts hineinkopiert worden — er gehoert nur in lib/augeVorbehalt.ts',
  );
});

// ---------------------------------------------------------------------------
// 4. DIE VIER STELLEN IM ECHTEN AUGE
// ---------------------------------------------------------------------------

test('Exposé ohne GEG-Pflichtangaben: Vorbehalt dran, Bewertung raus', () => {
  const e = augeExpose({ aktiv: 2, reserviert: 0, abgeschlossen: 0, volumenAktiv: 0, pflichtLuecken: 2 });
  assert.equal(e.vorbehalt, RECHTS_VORBEHALT);
  assert.ok(!/abmahnf/i.test(e.klartext), '"abmahnfaehig" ist eine Rechtsauskunft');
  assert.match(e.klartext, /vor der Veröffentlichung ergänzen/);
});

test('Heizkosten: die Kuerzungs-Rechtsfolge ist raus', () => {
  const e = augeBk({ einheiten: 5, kostenGesamt: 1000, vorauszahlungGesamt: 900, saldoGesamt: 100, nachzahler: 1, heizLuecken: 2 });
  assert.equal(e.vorbehalt, RECHTS_VORBEHALT);
  assert.ok(!/15 ?%/.test(e.klartext), 'die 15-Prozent-Kuerzung ist eine Rechtsfolge');
  assert.ok(!/verstößt/i.test(e.klartext));
  assert.match(e.klartext, /prüfen lassen/);
});

test('Etiketten: LMIV ohne "abmahnfaehig" — vom Waechter gefunden, nicht aus der Bauliste', () => {
  const e = augeEtiketten({ unvollstaendig: 3, ohneNaehrwert: 1, gesamt: 10 });
  assert.equal(e.vorbehalt, RECHTS_VORBEHALT);
  assert.ok(!/abmahnf/i.test(e.klartext));
  assert.match(e.klartext, /vor dem Verkauf ergänzen/);
});

test('DER WICHTIGSTE TEST: unter gewoehnlichen Zahlen steht KEIN Vorbehalt', () => {
  // Stuende er ueberall, liest ihn niemand mehr — und das Auge wuerde zur
  // Warnhinweis-Wand.
  const e = augeRechnungen({ offenBetrag: 1000, ueberfaelligBetrag: 0, ueberfaelligAnzahl: 0, dso: 30 });
  assert.equal(e.vorbehalt, undefined);
  const gut = augeEtiketten({ unvollstaendig: 0, ohneNaehrwert: 0, gesamt: 10 });
  assert.equal(gut.vorbehalt, undefined);
});
