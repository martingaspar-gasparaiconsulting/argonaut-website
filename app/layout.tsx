import type { Metadata } from 'next'
import { Syne, DM_Sans } from 'next/font/google'
import './globals.css'
import Script from 'next/script'

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
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${syne.variable} ${dmSans.variable}`}>
      <body className="antialiased">
        {children}
        <Script
          id="crisp-chat"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.$crisp=[];
              window.CRISP_WEBSITE_ID="c268dca7-a811-49c1-91c5-88c7b65fa82d";
              (function(){
                var d=document;
                var s=d.createElement("script");
                s.src="https://client.crisp.chat/l.js";
                s.async=1;
                d.getElementsByTagName("head")[0].appendChild(s);
              })();
            `,
          }}
        />
      </body>
    </html>
  )
}
