"use client";
import { usePathname } from "next/navigation";

// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 8 ERP · Sub-Navigation (Layout)
// Erscheint automatisch auf allen /dashboard/erp-Seiten.
// Neuer Bereich = eine Zeile in TABS (wird pro Baustein ergaenzt).
// ---------------------------------------------------------------------

const C = {
  gold: "#C9A84C",
  border: "rgba(255,255,255,0.08)",
};

type Tab = { label: string; href: string };

const TABS: Tab[] = [
  { label: "📦 Lager", href: "/dashboard/erp" },
  { label: "🚚 Lieferanten", href: "/dashboard/erp/lieferanten" },
  { label: "🛒 Bestellungen", href: "/dashboard/erp/bestellungen" },
  { label: "📥 Wareneingang", href: "/dashboard/erp/wareneingang" },
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
    <div>
      <nav
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 22,
          paddingBottom: 14,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        {TABS.map((tab) => {
          const golden = istAktiv(tab.href, pathname);
          const stil: React.CSSProperties = {
            padding: "8px 16px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
            whiteSpace: "nowrap",
            color: golden ? C.gold : "rgba(255,255,255,0.7)",
            background: golden
              ? "rgba(201,168,76,0.12)"
              : "rgba(255,255,255,0.05)",
            border: golden
              ? "1px solid rgba(201,168,76,0.3)"
              : `1px solid ${C.border}`,
          };
          return (
            <a key={tab.href} href={tab.href} style={stil}>
              {tab.label}
            </a>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
