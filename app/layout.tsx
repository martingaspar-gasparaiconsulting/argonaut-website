import type { Metadata, Viewport } from 'next'
import { Syne, DM_Sans } from 'next/font/google'
import './globals.css'
const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-syne',
})
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-dm-sans',
})
export const metadata: Metadata = {
  metadataBase: new URL('https://argonaut-os.com'),
  title: {
    default: 'ARGONAUT OS — Das KI-Betriebssystem für den deutschen Mittelstand',
    template: '%s',
  },
  description: 'Ein System statt zwölf: CRM, Aufträge, Rechnungen, Personal und Auswertungen in einem — für den deutschen Mittelstand, DSGVO-konform, deutscher Server.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ARGONAUT OS',
  },
}
export const viewport: Viewport = {
  themeColor: '#0A1628',
}

const orgJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'ARGONAUT OS',
      legalName: 'Gaspar AI Consulting',
      url: 'https://argonaut-os.com',
      email: 'info@argonaut-os.com',
      slogan: 'Ein System statt zwölf — das KI-Betriebssystem für den deutschen Mittelstand.',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Tübinger Straße 50',
        postalCode: '71032',
        addressLocality: 'Böblingen',
        addressRegion: 'Baden-Württemberg',
        addressCountry: 'DE',
      },
    },
    { '@type': 'WebSite', name: 'ARGONAUT OS', url: 'https://argonaut-os.com', inLanguage: 'de-DE' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${syne.variable} ${dmSans.variable}`}>
      <body className="antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
        {children}
      </body>
    </html>
  )
}
