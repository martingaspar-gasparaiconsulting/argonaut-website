"use client";

// ============================================================
// ARGONAUT OS · MODUL · P43 — TERMIN → EINSATZ (Button)
// ------------------------------------------------------------
// Kleiner Button für die Termin-Detailansicht. Erstellt aus dem
// Termin einen Field-Service-Einsatz (über /api/termin-zu-einsatz)
// und verknüpft beide. Zeigt den Zustand:
//   · noch kein Einsatz -> "→ Einsatz erstellen"
//   · bereits verknüpft -> "✓ Einsatz vorhanden" (+ Link)
//
// Nutzung in termine/page.tsx:
//   import TerminEinsatzButton from "../_components/TerminEinsatzButton";
//   <TerminEinsatzButton terminId={t.id} einsatzId={t.einsatz_id}
//     ownerUserId={user.id} onErstellt={(eid)=>{...}} />
// ============================================================

import React, { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const GOLD = "#C9A84C";
const CYAN = "#00e5ff";
const GRUEN = "#00e676";
const DIM = "rgba(232,240,248,0.6)";

type Props = {
  terminId: string;
  einsatzId?: string | null;    // wenn schon verknüpft
  onErstellt?: (einsatzId: string) => void;
};

export default function TerminEinsatzButton({ terminId, einsatzId, onErstellt }: Props) {
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState("");
  const [erstellteId, setErstellteId] = useState<string | null>(einsatzId || null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const vorhanden = !!erstellteId;

  async function erstelle() {
    if (laden || vorhanden) return;
    setLaden(true);
    setFehler("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setFehler("Nicht angemeldet."); return; }

      const res = await fetch("/api/termin-zu-einsatz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termin_id: terminId, owner_user_id: user.id }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setFehler(j?.error || "Einsatz konnte nicht erstellt werden.");
        return;
      }
      setErstellteId(j.einsatz_id);
      if (onErstellt) onErstellt(j.einsatz_id);
    } catch (e: any) {
      setFehler("Unerwarteter Fehler: " + (e?.message || String(e)));
    } finally {
      setLaden(false);
    }
  }

  if (vorhanden) {
    return (
      <a
        href={`/dashboard/meine-einsaetze?einsatz=${erstellteId}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 8, textDecoration: "none",
          background: "rgba(0,230,118,0.10)", border: `1px solid ${GRUEN}`,
          color: GRUEN, fontWeight: 700, fontSize: 'clamp(13px, 1.13vw, 18px)',
        }}
        title="Verknüpften Einsatz öffnen"
      >
        ✓ Einsatz vorhanden
      </a>
    );
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button
        onClick={erstelle}
        disabled={laden}
        style={{
          padding: "8px 14px", borderRadius: 8, cursor: laden ? "default" : "pointer",
          background: "transparent", border: `1px solid ${CYAN}`, color: CYAN,
          fontWeight: 700, fontSize: 'clamp(13px, 1.13vw, 18px)', opacity: laden ? 0.6 : 1,
        }}
        title="Aus diesem Termin einen Field-Service-Einsatz erstellen"
      >
        {laden ? "Erstelle…" : "→ Einsatz erstellen"}
      </button>
      {fehler && <span style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', color: "#ff9a9a" }}>{fehler}</span>}
    </span>
  );
}
