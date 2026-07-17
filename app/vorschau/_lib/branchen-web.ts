// app/vorschau/_lib/branchen-web.ts
// Helfer für die NEUEN Branchen-Seiten (/vorschau/branchen …).
// Liest die bestehende Branchen-Datenbank (lib/branchen.ts) und filtert die
// regulierten/heiklen Branchen vorerst raus. Die Ausschluss-Liste ist mit einem
// Handgriff anpassbar, sobald Martins offizielle Liste vorliegt.

import { getAllBranchen, getBrancheBySlug, type Branche } from '@/lib/branchen'

// Vorerst ausgeschlossen (klar regulierte/heikle Branchen).
// Grenzfälle (Physio, Optiker, Anwälte, Steuerberatung …) bleiben zunächst DRIN.
export const AUSSCHLUSS = new Set<string>([
  'Banken & Sparkassen',
  'Ärzte & Praxen', 'Zahnärzte', 'Krankenhäuser & Kliniken', 'Apotheken', 'Pflegedienste',
  'Medizinische Labore', 'Hebammen', 'Psychologische Beratung', 'Suchtberatung', 'Hospize & Palliativpflege',
  'Medizintechnik', 'Pharmazeutischer Großhandel', 'Pharmaindustrie', 'Biotechnologie', 'Chemie & Pharma',
  'Jagdbedarf & Waffen', 'Verteidigung & Sicherheit',
])

// Reihenfolge der Kategorien auf der Übersicht (Mittelstand-Kern zuerst).
export const KATEGORIE_ORDER = [
  'Handwerk & Bau',
  'Handel & E-Commerce',
  'Industrie & Produktion',
  'Dienstleistungen',
  'Gastronomie & Tourismus',
  'IT & Technologie',
  'Logistik & Transport',
  'Immobilien & Verwaltung',
  'Marketing & Kommunikation',
  'Recht, Steuern & Finanzen',
  'Bildung & Soziales',
  'Medizin & Gesundheit',
]

export function websiteBranchen(): Branche[] {
  return getAllBranchen().filter((b) => !AUSSCHLUSS.has(b.name))
}

export function websiteBrancheBySlug(slug: string): Branche | undefined {
  const b = getBrancheBySlug(slug)
  if (!b || AUSSCHLUSS.has(b.name)) return undefined
  return b
}

export function websiteKategorien(): { kategorie: string; branchen: Branche[] }[] {
  const map = new Map<string, Branche[]>()
  for (const b of websiteBranchen()) {
    if (!map.has(b.kategorie)) map.set(b.kategorie, [])
    map.get(b.kategorie)!.push(b)
  }
  const known = KATEGORIE_ORDER.filter((k) => map.has(k)).map((k) => ({ kategorie: k, branchen: map.get(k)! }))
  const rest = [...map.keys()].filter((k) => !KATEGORIE_ORDER.includes(k)).map((k) => ({ kategorie: k, branchen: map.get(k)! }))
  return [...known, ...rest]
}

export type { Branche }
