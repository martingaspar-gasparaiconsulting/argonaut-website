// ============================================================================
// ARGONAUT OS · lib/bewertungName.ts — Paket 199 (Entscheidung D7, 04.10.2026)
// Öffentliche Bewertungen zeigen nur „Vorname + Initial"
//
// Bisher stand auf der Webseite der volle Name aus der Bewertungsanfrage
// („Maria Mustermann"). Eine Bewertung ist schon mit „Maria M." glaubwürdig —
// der volle Name ist für die Webseite nicht nötig (Datensparsamkeit, Art. 5
// DSGVO). Firmennamen (GmbH, AG, e. K. …) bleiben ganz, sie sind keine
// Privatperson. Anreden und Titel fallen weg.
//
// Reine Funktion → node --test. Genutzt von /api/oeffentlich/bewertungen und
// der Vorschau im Bewertungs-Dashboard.
// ============================================================================

const ANREDEN = new Set(['herr', 'frau', 'hr', 'fr', 'dr', 'prof', 'dipl', 'ing', 'med', 'mag', 'divers']);
const FIRMA = /\b(gmbh|ag|kg|ohg|gbr|ug|e\.?\s?k\.?|e\.?\s?v\.?|mbh|ltd|inc|se|co\.?|partg|stiftung|verein|gruppe|holding)\b/i;

/** „Maria Mustermann" → „Maria M.", „Dr. Hans-Peter von Berg" → „Hans-Peter B.", „Maria" → „Maria". */
export function oeffentlicherName(roh: unknown): string {
  const voll = (typeof roh === 'string' ? roh : roh == null ? '' : String(roh)).replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!voll) return 'Kunde';
  if (FIRMA.test(voll)) return voll.slice(0, 80);
  // „Mustermann, Maria" → „Maria Mustermann"
  const gedreht = voll.includes(',') ? voll.split(',').map((t) => t.trim()).filter(Boolean).reverse().join(' ') : voll;
  const teile = gedreht.split(' ').filter((t) => t && !ANREDEN.has(t.split('.').join('').toLowerCase()));
  if (teile.length === 0) return 'Kunde';
  const vorname = teile[0];
  if (teile.length === 1) return vorname.slice(0, 40);
  const nach = teile[teile.length - 1].replace(/[^\p{L}]/gu, '');
  const initial = nach ? nach[0].toLocaleUpperCase('de-DE') + '.' : '';
  return `${vorname.slice(0, 40)}${initial ? ' ' + initial : ''}`;
}
