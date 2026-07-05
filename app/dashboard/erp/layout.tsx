"use client";
import { usePathname } from "next/navigation";

// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 8 ERP · Sub-Navigation + Modul-Kopf (Layout)
// Grosser Titel + Beschreibung + farbige Bereich-Buttons (wie CRM).
// Erscheint automatisch auf allen /dashboard/erp-Seiten.
// Neuer Bereich = eine Zeile in TABS.
// ---------------------------------------------------------------------

const C = {
  gold: "#C9A84C",
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};

type Tab = { label: string; href: string; farbe: string };

const TABS: Tab[] = [
  { label: "📦 Lager", href: "/dashboard/erp", farbe: "#00e5ff" },
  { label: "🚚 Lieferanten", href: "/dashboard/erp/lieferanten", farbe: "#E06666" },
  { label: "🛒 Bestellungen", href: "/dashboard/erp/bestellungen", farbe: "#4CAF7D" },
  { label: "📥 Wareneingang", href: "/dashboard/erp/wareneingang", farbe: "#A78BFA" },
  { label: "🔧 Inventar", href: "/dashboard/erp/inventar", farbe: "#E0A24C" },
  { label: "📋 Inventur", href: "/dashboard/erp/inventur", farbe: "#2DD4BF" },
  { label: "🚜 Fuhrpark", href: "/dashboard/erp/fuhrpark", farbe: "#C9A84C" },
];

function istAktiv(href: string, pathname: string): boolean {
  if (href === "/dashboard/erp") {
    // "Lager" = Basis + Artikel-Detailseiten, aber NICHT andere Bereiche
    if (pathname === "/dashboard/erp") return true;
    const andererBereich = TABS.some(
      (t) =>
        t.href !== "/dashboard/erp" &&
        (pathname === t.href || pathname.startsWith(t.href + "/"))
    );
    return pathname.startsWith("/dashboard/erp/") && !andererBereich;
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export default function ErpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div style={{ paddingBottom: 80 }}>
      <div
        style={{
          maxWidth: 1400,
          marginLeft: "auto",
          marginRight: "auto",
          paddingTop: 28,
          marginBottom: 24,
        }}
      >
        {/* Modul-Kopf */}
        <h1
          style={{
            margin: 0,
            fontSize: 30,
            fontWeight: 800,
            color: C.gold,
            letterSpacing: "-0.01em",
          }}
        >
          📦 ERP / Warenwirtschaft
        </h1>
        <p
          style={{
            margin: "8px 0 22px",
            color: C.textDim,
            fontSize: 15,
            maxWidth: 720,
          }}
        >
          Lager, Einkauf, Inventar &amp; Fuhrpark — deine komplette Warenwirtschaft
          an einem Ort. Bestände im Blick, Nachschub per Klick, Prüf- und
          TÜV-Fristen automatisch im Auge.
        </p>

        {/* Bereich-Buttons */}
        <nav
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            paddingBottom: 18,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          {TABS.map((tab) => {
            const aktiv = istAktiv(tab.href, pathname);
            const stil: React.CSSProperties = {
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "11px 20px",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              textDecoration: "none",
              whiteSpace: "nowrap",
              border: `1px solid ${aktiv ? tab.farbe : tab.farbe + "55"}`,
              background: aktiv ? tab.farbe + "1F" : "rgba(255,255,255,0.03)",
              color: aktiv ? tab.farbe : "rgba(255,255,255,0.85)",
              boxShadow: aktiv ? `0 0 14px ${tab.farbe}33` : "none",
              transition: "border-color 0.15s ease, background 0.15s ease",
            };
            return (
              <a key={tab.href} href={tab.href} style={stil}>
                {tab.label}
              </a>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
