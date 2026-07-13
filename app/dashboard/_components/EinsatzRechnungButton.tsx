"use client";

// ============================================================
// ARGONAUT OS · MODUL · P44 — EINSATZ → RECHNUNG (Button)
// ------------------------------------------------------------
// Button für die Einsatz-Detailansicht. Erstellt aus dem Einsatz
// eine Rechnung über die bestehende Route /api/rechnung-aus-einsatz
// (branchenneutral: nutzt einsatz_positionen). Die Route hat bereits
// Doppelschutz (einsaetze.rechnung_id) — der Button wertet das aus.
//
// Zustände:
//   · noch keine Rechnung -> "→ Rechnung erstellen"
//   · bereits fakturiert  -> "✓ Rechnung vorhanden" (+ Link)
//   · keine Leistungen    -> Fehlermeldung von der Route
//
// Nutzung:
//   import EinsatzRechnungButton from "../_components/EinsatzRechnungButton";
//   <EinsatzRechnungButton einsatzId={e.id} rechnungId={e.rechnung_id} />
// ============================================================

import React, { useState } from "react";

const CYAN = "#00e5ff";
const GRUEN = "#00e676";

type Props = {
  einsatzId: string;
  rechnungId?: string | null;   // wenn schon fakturiert
  onErstellt?: (rechnungId: string) => void;
};

export default function EinsatzRechnungButton({ einsatzId, rechnungId, onErstellt }: Props) {
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState("");
  const [erstellteId, setErstellteId] = useState<string | null>(rechnungId || null);

  const vorhanden = !!erstellteId;

  async function erstelle() {
    if (laden || vorhanden) return;
    setLaden(true);
    setFehler("");
    try {
      const res = await fetch("/api/rechnung-aus-einsatz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ einsatzId }),
      });
      const j = await res.json();
      if (!res.ok) {
        setFehler(j?.error || "Rechnung konnte nicht erstellt werden.");
        return;
      }
      // Route liefert { rechnungId, bereitsVorhanden }
      const rid = j.rechnungId;
      if (rid) {
        setErstellteId(rid);
        if (onErstellt) onErstellt(rid);
      } else {
        setFehler("Keine Rechnungs-ID erhalten.");
      }
    } catch (e: any) {
      setFehler("Unerwarteter Fehler: " + (e?.message || String(e)));
    } finally {
      setLaden(false);
    }
  }

  if (vorhanden) {
    return (
      <a
        href={`/dashboard/rechnungen/${erstellteId}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 8, textDecoration: "none",
          background: "rgba(0,230,118,0.10)", border: `1px solid ${GRUEN}`,
          color: GRUEN, fontWeight: 700, fontSize: 13,
        }}
        title="Verknüpfte Rechnung öffnen"
      >
        ✓ Rechnung vorhanden
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
          fontWeight: 700, fontSize: 13, opacity: laden ? 0.6 : 1,
        }}
        title="Aus diesem Einsatz eine Rechnung mit den erfassten Leistungen erstellen"
      >
        {laden ? "Erstelle…" : "→ Rechnung erstellen"}
      </button>
      {fehler && <span style={{ fontSize: 11, color: "#ff9a9a", maxWidth: 220 }}>{fehler}</span>}
    </span>
  );
}
