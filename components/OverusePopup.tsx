'use client'

// ============================================================
// ARGONAUT OS · OverusePopup — A3: bewusst DEAKTIVIERT (04.08.2026)
//
// Das ursprüngliche Bauteil zeigte ab 80 % ein Warnbanner und ab 100 %
// ein Vollbild-Modal „KI-Call-Limit erreicht / 599 € aufstocken" mit
// veraltetem START/PRO/BUSINESS-Preismodell. Das widerspricht direkt der
// Zusage „KI unbegrenzt inklusive" und konnte mitten in einer Vorführung
// aufpoppen.
//
// Deshalb rendert die Komponente jetzt NICHTS. Die Props bleiben
// unverändert, damit die Startseite (app/dashboard/page.tsx) ohne
// Änderung weiter kompiliert. Die komplette alte Logik liegt in der
// Git-Historie — zum Reaktivieren einfach die vorherige Dateiversion
// wiederherstellen.
// ============================================================

interface Props {
  kiUsed: number
  kiLimit: number
  currentPaket: string
  userEmail: string
}

export default function OverusePopup(_props: Props) {
  return null
}
