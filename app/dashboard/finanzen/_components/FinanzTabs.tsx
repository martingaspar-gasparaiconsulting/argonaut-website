"use client";

import { usePathname, useRouter } from "next/navigation";

// ============================================================
// ARGONAUT OS · BLOCK D (Finanzen) · gemeinsame Tab-Leiste
// Unter-Navigation für alle Finanz-Seiten. Neue Seite = eine Zeile.
// (Privater Ordner _components -> erzeugt keine eigene Route.)
// ============================================================

const C = {
  navy: "#0A1628",
  navy2: "#0F1F33",
  gold: "#C9A84C",
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};

const TABS = [
  { label: "Ausgaben", href: "/dashboard/finanzen/ausgaben" },
  { label: "EÜR", href: "/dashboard/finanzen/euer" },
  { label: "BWA", href: "/dashboard/finanzen/bwa" },
  { label: "Export", href: "/dashboard/finanzen/export" },
];

export default function FinanzTabs() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
      {TABS.map((t) => {
        const aktiv = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <button
            key={t.href}
            onClick={() => router.push(t.href)}
            style={{
              background: aktiv ? C.gold : C.navy2,
              color: aktiv ? C.navy : C.textDim,
              border: `1px solid ${aktiv ? C.gold : C.border}`,
              borderRadius: 999,
              padding: "8px 16px",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
