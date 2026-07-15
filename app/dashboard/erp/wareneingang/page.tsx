"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 8 ERP · E6 Wareneingang-Übersicht
// Liste aller Wareneingänge. Erfassung erfolgt in der Bestellung
// ("📥 Wareneingang buchen") – dort wird der Lagerbestand hochgebucht.
// ---------------------------------------------------------------------

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const C = {
  navy: "#0A1628",
  navy2: "#0F1F33",
  gold: "#C9A84C",
  cyan: "#00e5ff",
  green: "#4CAF7D",
  danger: "#E06666",
  warn: "#E0A24C",
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};

interface WareneingangRow {
  id: string;
  lieferschein_nr: string | null;
  eingangsdatum: string | null;
  bestellung_id: string | null;
  bestellung: { bestellnummer: string | null } | null;
  positionen: { menge: number }[];
}

function datum(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE");
}

export default function WareneingangListe() {
  const router = useRouter();
  const [eingaenge, setEingaenge] = useState<WareneingangRow[]>([]);
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    lade();
  }, []);

  async function lade() {
    setLaden(true);
    const { data, error } = await supabase
      .from("wareneingang")
      .select(
        "id, lieferschein_nr, eingangsdatum, bestellung_id, bestellung:bestellungen(bestellnummer), positionen:wareneingang_positionen(menge)"
      )
      .order("eingangsdatum", { ascending: false });
    if (!error && data) setEingaenge(data as unknown as WareneingangRow[]);
    setLaden(false);
  }

  // ---------- Styles ----------
  const card: React.CSSProperties = {
    background: C.navy2,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: "18px 20px",
  };
  const thStil: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 'clamp(11px, 0.94vw, 15px)',
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: C.textDim,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap",
  };
  const tdStil: React.CSSProperties = {
    padding: "12px",
    fontSize: 'clamp(14px, 1.25vw, 20px)',
    color: "#fff",
    borderBottom: `1px solid ${C.border}`,
  };

  return (
    <div style={{ color: "#fff", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(26px, 2.25vw, 36px)', fontWeight: 800 }}>
          📥 Wareneingang
        </h1>
        <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
          Alle erfassten Lieferungen. Neue Eingänge buchst du direkt in der
          jeweiligen Bestellung.
        </p>
      </div>

      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        {laden ? (
          <div style={{ padding: 30, color: C.textDim }}>
            Lade Wareneingänge…
          </div>
        ) : eingaenge.length === 0 ? (
          <div style={{ padding: 30, color: C.textDim }}>
            Noch keine Wareneingänge erfasst. Öffne eine Bestellung und klicke
            dort auf „📥 Wareneingang buchen".
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStil}>Datum</th>
                <th style={thStil}>Bestellung</th>
                <th style={thStil}>Lieferschein-Nr.</th>
                <th style={{ ...thStil, textAlign: "right" }}>Positionen</th>
                <th style={{ ...thStil, textAlign: "right" }}>Menge gesamt</th>
              </tr>
            </thead>
            <tbody>
              {eingaenge.map((w) => {
                const anzahl = w.positionen?.length ?? 0;
                const gesamt = (w.positionen ?? []).reduce(
                  (s, x) => s + (Number(x.menge) || 0),
                  0
                );
                return (
                  <tr
                    key={w.id}
                    style={{ cursor: w.bestellung_id ? "pointer" : "default" }}
                    onClick={() => {
                      if (w.bestellung_id)
                        router.push(
                          `/dashboard/erp/bestellungen/${w.bestellung_id}`
                        );
                    }}
                  >
                    <td style={{ ...tdStil, color: C.textDim }}>
                      {datum(w.eingangsdatum)}
                    </td>
                    <td style={{ ...tdStil, fontWeight: 700, color: C.cyan }}>
                      {w.bestellung?.bestellnummer || "—"}
                    </td>
                    <td style={tdStil}>{w.lieferschein_nr || "—"}</td>
                    <td style={{ ...tdStil, textAlign: "right" }}>{anzahl}</td>
                    <td
                      style={{
                        ...tdStil,
                        textAlign: "right",
                        fontWeight: 700,
                      }}
                    >
                      {gesamt.toLocaleString("de-DE", {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
