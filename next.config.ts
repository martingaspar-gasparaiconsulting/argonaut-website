import type { NextConfig } from "next";
import { kopfzeilenRegel } from "./lib/sicherheitsKopfzeilen";

const nextConfig: NextConfig = {
  // Lese-Bibliotheken serverseitig laden statt bündeln (Vercel-sicher).
  // nodemailer + mailparser (10.09.2026) gehören dazu: reine Node-Bibliotheken
  // mit Sockets und Zeichensatz-Tabellen. Gebündelt wirft der Build Warnungen
  // und im Betrieb fehlen einzelne Zeichensätze — extern geladen läuft beides.
  serverExternalPackages: ["unpdf", "mammoth", "exceljs", "nodemailer", "mailparser"],

  // Go-Live: die alten /vorschau-URLs dauerhaft auf die sauberen Root-URLs
  // umleiten (SEO-Konsolidierung, keine Dubletten). Die alte Demo-Seite
  // (veraltete Agenten-Preise) ebenfalls auf die Startseite.
  // Sicherheits-Kopfzeilen (16.09.2026). Bis dahin ging jede Antwort ohne eine
  // einzige davon raus. Die Liste steht in lib/sicherheitsKopfzeilen.ts, damit
  // sie node-getestet ist — und damit dort dokumentiert bleibt, was BEWUSST
  // fehlt: frame-ancestors, X-Frame-Options und Permissions-Policy wuerden den
  // Berater auf fremden Kundenseiten, den Vorfuehr-Modus bzw. Diktat und
  // Beleg-Erkennung abschalten. Die gehoeren einzeln gebaut und im Browser
  // nachgeprueft.
  async headers() {
    return [kopfzeilenRegel()];
  },

  async redirects() {
    return [
      { source: "/vorschau", destination: "/", permanent: true },
      { source: "/vorschau/branchen", destination: "/branchen", permanent: true },
      { source: "/vorschau/branchen/:slug", destination: "/branchen/:slug", permanent: true },
      { source: "/vorschau/vergleich", destination: "/vergleich", permanent: true },
      { source: "/vorschau/roadmap", destination: "/roadmap", permanent: true },
      { source: "/vorschau/ressourcen", destination: "/ressourcen", permanent: true },
      { source: "/vorschau/ressourcen/:slug", destination: "/ressourcen/:slug", permanent: true },
      { source: "/demo", destination: "/", permanent: true },
      { source: "/baustelle", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
