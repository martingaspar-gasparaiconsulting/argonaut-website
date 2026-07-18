import type { MetadataRoute } from 'next'

// ============================================================================
// ARGONAUT OS · app/robots.ts — generiert /robots.txt
// Erlaubt Suchmaschinen das Crawlen, verweist auf die Sitemap. Admin-/Login-/
// API-Bereiche werden ausgeschlossen. (Wird beim Go-live wirksam; solange die
// Seiten noindex sind, indexiert Google ohnehin nichts.)
// ============================================================================

const BASE = 'https://argonaut-os.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/admin-login', '/api/', '/auth/', '/dashboard'],
    },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  }
}
