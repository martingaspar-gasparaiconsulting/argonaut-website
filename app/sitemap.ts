import type { MetadataRoute } from 'next'
import { websiteBranchen } from './vorschau/_lib/branchen-web'

// ============================================================================
// ARGONAUT OS · app/sitemap.ts — generiert /sitemap.xml
// Statische Hauptseiten + alle Branchen-Detailseiten (/branchen/[slug]).
// Go-live-Struktur: die Branchenseiten liegen unter /branchen (nicht /vorschau).
// ============================================================================

const BASE = 'https://argonaut-os.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const statisch: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/branchen`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/vergleich`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/uber-uns`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/impressum`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/datenschutz`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/agb`, changeFrequency: 'yearly', priority: 0.2 },
  ]

  const branchen: MetadataRoute.Sitemap = websiteBranchen().map((b) => ({
    url: `${BASE}/branchen/${b.slug}`,
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  return [...statisch, ...branchen]
}
