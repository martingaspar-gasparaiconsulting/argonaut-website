import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// ===========================================================================
// MO0b (16.10.2026) — Werbeversprechen auf Gebautes zurückschneiden
// Webseite, Branchen-Seiten, Vorführung und Fachdossiers versprechen nur, was
// ARGONAUT OS heute kann. Unbelegte Prozentzahlen raus. (UWG § 5: irreführend)
// ===========================================================================

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const DATEIEN = [
  'lib/branchen.ts', 'lib/vorfuehrungInhalt.ts', 'lib/fachdossier.ts',
  'app/vorschau/_lib/branchen-web-extra.ts', 'app/vorschau/_lib/branchen-seo.ts',
];

const VERBOTEN = [
  [/\d+ ?% weniger/, 'unbelegte Prozent-Ersparnis'],
  [/Automatische Krankenkassenabrechnung/, 'Kassenabrechnung ist nicht gebaut'],
  [/KI-optimierte Tourenplanung|KI-Routenoptimierung/, 'KI-Tourenplanung ist nicht gebaut'],
  [/Retourenquote/, 'Retourenquote je Filiale ist nicht gebaut'],
  [/Paketstände/, 'Paket-/Guthabenkonto (MO3) ist nicht gebaut'],
  [/Abrechnung mit den Kostenträgern/, 'Kostenträger-Abrechnung ist nicht gebaut'],
  [/ARGONAUT OS[^"']{0,80}Kassenabrechnung/, 'Kassenabrechnung als ARGONAUT-Leistung'],
  [/über Sprints|mit Sprints|nach Sprint|Roadmaps, Sprints/, 'Sprints (IT-4) sind nicht gebaut'],
];

for (const p of DATEIEN) {
  test(`${p}: keine Versprechen für Ungebautes`, () => {
    const s = lies(p);
    for (const [re, warum] of VERBOTEN) {
      const m = s.match(re);
      assert.equal(m, null, `${warum}: „${m?.[0]}"`);
    }
  });
}

test('Beschreibungen der Kunden-Arbeit bleiben (z. B. „arbeiten Sie in Sprints")', () => {
  assert.match(lies('app/vorschau/_lib/branchen-seo.ts'), /arbeiten Sie in Sprints/);
});
