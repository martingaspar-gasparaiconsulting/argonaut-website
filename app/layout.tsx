import type { Metadata } from 'next'
import { Syne, DM_Sans } from 'next/font/google'
import './globals.css'
import Script from 'next/script'
import CookieBanner from '../components/CookieBanner';
import WebsiteChatGate from './components/WebsiteChatGate'

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
  title: 'ARGONAUT — KI-Agentur für den deutschen Mittelstand',
  description: 'ARGONAUT automatisiert Prozesse, die heute noch Ihre besten Leute binden – messbar, sicher und auf Ihren Betrieb zugeschnitten.',
  manifest: '/manifest.json',
  themeColor: '#0A1628',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ARGONAUT OS',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${syne.variable} ${dmSans.variable}`}>
      <body className="antialiased">
        {children}
        <CookieBanner />
        <WebsiteChatGate />
      </body>
    </html>
  )
}
