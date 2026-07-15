"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------
// ARGONAUT OS · MODUL 4 VERTRIEB+CRM · C11 KI-Wochenfokus (Next-Best-Action)
// ---------------------------------------------------------------------

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

interface Eintrag {
  id: string;
  name: string;
  firma: string;
  status: string;
  dringlichkeit: string;
  warum: string;
  aktion: string;
  gruende: string[];
}

function dringFarbe(d: string): string {
  if (d === "hoch") return C.danger;
  if (d === "mittel") return C.warn;
  return C.textDim;
}

export default function WochenfokusPage() {
  const router = useRouter();

  const [liste, setListe] = useState<Eintrag[]>([]);
  const [leer, setLeer] = useState(false);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden_() {
    setLaden(true);
    setFehler(null);
    setLeer(false);
    try {
      const res = await fetch("/api/crm-nba", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setFehler(data?.error || "Wochenfokus konnte nicht geladen werden.");
      } else if (data.leer) {
        setLeer(true);
        setListe([]);
      } else {
        setListe((data.liste as Eintrag[]) || []);
      }
    } catch (e) {
      setFehler("Netzwerkfehler. Bitte erneut versuchen.");
    }
    setLaden(false);
  }

  useEffect(() => {
    laden_();
  }, []);

  return (
    <div style={{ background: C.navy, minHeight: "100vh", padding: "32px 28px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <button onClick={() => router.push("/dashboard/crm")} style={zurueckBtn}>
          ← Zurück zu Kontakten
        </button>

        {/* Kopf */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: 16,
            margin: "16px 0 24px",
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "var(--font-dm-sans), sans-serif",
                color: C.gold,
                fontSize: 30,
                margin: 0,
                letterSpacing: 0.5,
              }}
            >
              🎯 KI-Wochenfokus
            </h1>
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: C.textDim,
                margin: "6px 0 0",
                fontSize: 14,
              }}
            >
              Wen du diese Woche zuerst kontaktieren solltest – von ARGONAUT priorisiert.
            </p>
          </div>
          <button onClick={laden_} disabled={laden} style={{ ...goldBtn, opacity: laden ? 0.6 : 1 }}>
            {laden ? "Aktualisiert…" : "↻ Neu priorisieren"}
          </button>
        </div>

        {fehler && <div style={fehlerBox}>{fehler}</div>}

        {laden ? (
          <div
            style={{
              background: C.navy2,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: "40px 24px",
              textAlign: "center",
              color: C.textDim,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            ARGONAUT sichtet deine Kontakte und priorisiert…
          </div>
        ) : leer ? (
          <div
            style={{
              background: C.navy2,
              border: `1px solid ${C.green}`,
              borderRadius: 14,
              padding: "40px 24px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 34, marginBottom: 10 }}>✅</div>
            <div
              style={{
                fontFamily: "var(--font-dm-sans), sans-serif",
                color: C.green,
                fontSize: 20,
              }}
            >
              Alles im grünen Bereich
            </div>
            <div style={{ color: C.textDim, fontSize: 14, marginTop: 8 }}>
              Keine überfälligen Wiedervorlagen, einschlafenden Kontakte oder dringenden Chancen. Gute Arbeit!
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {liste.map((e, i) => (
              <div
                key={e.id}
                onClick={() => router.push(`/dashboard/crm/${e.id}`)}
                style={{
                  background: C.navy2,
                  border: `1px solid ${C.border}`,
                  borderLeft: `4px solid ${dringFarbe(e.dringlichkeit)}`,
                  borderRadius: 12,
                  padding: "16px 18px",
                  cursor: "pointer",
                  display: "flex",
                  gap: 16,
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-dm-sans), sans-serif",
                    color: C.textDim,
                    fontSize: 18,
                    fontWeight: 800,
                    minWidth: 26,
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-dm-sans), sans-serif",
                        color: "#fff",
                        fontSize: 17,
                        fontWeight: 700,
                      }}
                    >
                      {e.name}
                    </span>
                    {e.firma && (
                      <span style={{ color: C.textDim, fontSize: 13 }}>· {e.firma}</span>
                    )}
                    <span
                      style={{
                        marginLeft: "auto",
                        padding: "2px 10px",
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 700,
                        color: dringFarbe(e.dringlichkeit),
                        border: `1px solid ${dringFarbe(e.dringlichkeit)}`,
                      }}
                    >
                      {e.dringlichkeit}
                    </span>
                  </div>
                  <div
                    style={{
                      color: C.gold,
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 14,
                      marginBottom: 4,
                    }}
                  >
                    → {e.aktion}
                  </div>
                  <div
                    style={{
                      color: C.textDim,
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                    }}
                  >
                    {e.warum}
                  </div>
                  {e.gruende.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {e.gruende.map((g, gi) => (
                        <span
                          key={gi}
                          style={{
                            fontSize: 11,
                            color: C.textDim,
                            border: `1px solid ${C.border}`,
                            borderRadius: 8,
                            padding: "2px 8px",
                          }}
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --------------------------- Style-Bausteine ---------------------------

const zurueckBtn: React.CSSProperties = {
  background: "transparent",
  color: C.textDim,
  border: "none",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14,
  cursor: "pointer",
  padding: 0,
};

const goldBtn: React.CSSProperties = {
  background: C.gold,
  color: C.navy,
  border: "none",
  borderRadius: 10,
  padding: "11px 20px",
  fontFamily: "var(--font-dm-sans), sans-serif",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

const fehlerBox: React.CSSProperties = {
  background: "rgba(224,102,102,0.12)",
  border: `1px solid ${C.danger}`,
  color: C.danger,
  borderRadius: 10,
  padding: "12px 16px",
  marginBottom: 16,
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14,
};
