// ============================================================================
// ARGONAUT OS · Komponente "MarketingRoi" (Etappe 2 · Quick-Win 9)
// Marketing-ROI & Budget-Effizienz – additiv, self-contained.
//
// Holt sich Kampagnen (Budget = Kosten) selbst und – sobald eine Kampagne
// ueber "rechnung_id" mit einer Rechnung verknuepft ist – den echten Umsatz.
// Solange keine Verknuepfung existiert, zeigt das Modul EHRLICH die
// Budget-Effizienz + einen KI-Klartext, KEINEN Fehlalarm-ROI.
//
// SAFETY-FIRST + ADDITIV: ersetzt nichts. Einfach importieren + <MarketingRoi/>.
// Wird automatisch "scharf", sobald im Finale rechnung_id verbunden wird.
//
// Inline-Styles (kein Tailwind). Branding: ARGONAUT / "die KI" – nie "Claude".
// ============================================================================
"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiKlartext from "./KiKlartext";

// Marken-Palette (identisch zur Marketing-Seite, lokal gehalten -> self-contained)
const C = {
  navy: "#0A1628",
  navy2: "#0F1F33",
  gold: "#C9A84C",
  cyan: "#00e5ff",
  green: "#4CAF7D",
  danger: "#E06666",
  warn: "#E0A24C",
  textDim: "#8FA3BE",
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type KampagneRoi = {
  id: string;
  name: string | null;
  status: string | null;
  budget: number | null;
  rechnung_id: string | null;
};

type RechnungInfo = {
  id: string;
  brutto_summe: number | null;
  bezahlter_betrag: number | null;
  zahlungsstatus: string | null;
};

// ---- Anzeige-Helfer -------------------------------------------------------
function fmtEuro(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "\u2014";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtProzent(v: number | null): string {
  if (v == null || Number.isNaN(v)) return "\u2014";
  const p = Math.round(v * 100);
  return (p > 0 ? "+" : "") + p + " %";
}

// ROI-Ampel: Gruen ab +100 %, Gelb 0-100 %, Rot Verlust, Neutral = kein Ertrag
function roiAmpel(roi: number | null): { farbe: string; text: string } {
  if (roi == null) return { farbe: C.textDim, text: "Ertrag noch nicht zugeordnet" };
  if (roi < 0) return { farbe: C.danger, text: "Verlust" };
  if (roi < 1) return { farbe: C.warn, text: "Profitabel" };
  return { farbe: C.green, text: "Sehr profitabel" };
}

// Umsatz einer Kampagne: bevorzugt tatsaechlich bezahlt, sonst Brutto der Rechnung
function umsatzAusRechnung(r: RechnungInfo | undefined): number | null {
  if (!r) return null;
  const bez = r.bezahlter_betrag != null ? Number(r.bezahlter_betrag) : null;
  if (bez != null && !Number.isNaN(bez) && bez > 0) return bez;
  const bru = r.brutto_summe != null ? Number(r.brutto_summe) : null;
  if (bru != null && !Number.isNaN(bru)) return bru;
  return null;
}

export default function MarketingRoi({ style }: { style?: React.CSSProperties }) {
  const [kampagnen, setKampagnen] = useState<KampagneRoi[]>([]);
  const [rechnungen, setRechnungen] = useState<Record<string, RechnungInfo>>({});
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      setLaden(true);
      const { data: kData } = await supabase
        .from("marketing_kampagnen")
        .select("id, name, status, budget, rechnung_id");

      const ks = (kData ?? []) as KampagneRoi[];

      // Verknuepfte Rechnungs-IDs einsammeln
      const rIds = Array.from(
        new Set(ks.map((k) => k.rechnung_id).filter((x): x is string => !!x))
      );

      const rMap: Record<string, RechnungInfo> = {};
      if (rIds.length > 0) {
        const { data: rData } = await supabase
          .from("rechnungen")
          .select("id, brutto_summe, bezahlter_betrag, zahlungsstatus")
          .in("id", rIds);
        for (const r of (rData ?? []) as RechnungInfo[]) {
          rMap[r.id] = r;
        }
      }

      if (!aktiv) return;
      setKampagnen(ks);
      setRechnungen(rMap);
      setLaden(false);
    })();
    return () => {
      aktiv = false;
    };
  }, []);

  // ---- Kennzahlen ---------------------------------------------------------
  const auswertung = useMemo(() => {
    let budgetGesamt = 0;
    let budgetAktiv = 0;
    let budgetVerknuepft = 0;
    let umsatzBelegt = 0;
    let anzahlVerknuepft = 0;

    const zeilen = kampagnen.map((k) => {
      const budget = Number(k.budget ?? 0) || 0;
      budgetGesamt += budget;
      if (k.status === "aktiv") budgetAktiv += budget;

      const rInfo = k.rechnung_id ? rechnungen[k.rechnung_id] : undefined;
      const umsatz = umsatzAusRechnung(rInfo);

      let roi: number | null = null;
      if (umsatz != null && budget > 0) {
        roi = (umsatz - budget) / budget;
        budgetVerknuepft += budget;
        umsatzBelegt += umsatz;
        anzahlVerknuepft += 1;
      }

      return { k, budget, umsatz, roi };
    });

    const roiGesamt =
      budgetVerknuepft > 0 ? (umsatzBelegt - budgetVerknuepft) / budgetVerknuepft : null;

    return {
      zeilen,
      budgetGesamt,
      budgetAktiv,
      budgetVerknuepft,
      umsatzBelegt,
      anzahlVerknuepft,
      roiGesamt,
    };
  }, [kampagnen, rechnungen]);

  // ---- KI-Kontext (echte Zahlen, knapp) -----------------------------------
  const kiKontext = useMemo(() => {
    const a = auswertung;
    if (kampagnen.length === 0) {
      return "Es sind noch keine Marketing-Kampagnen angelegt.";
    }
    if (a.anzahlVerknuepft === 0) {
      return (
        `${kampagnen.length} Marketing-Kampagne(n), ` +
        `${fmtEuro(a.budgetGesamt)} Budget im Markt ` +
        `(davon ${fmtEuro(a.budgetAktiv)} in aktiven Kampagnen). ` +
        `Noch keiner Kampagne ist ein Umsatz (Rechnung) zugeordnet, ` +
        `daher laesst sich der echte ROI noch nicht berechnen.`
      );
    }
    return (
      `${kampagnen.length} Marketing-Kampagne(n), ` +
      `${fmtEuro(a.budgetGesamt)} Budget gesamt. ` +
      `${a.anzahlVerknuepft} davon mit Umsatz verknuepft: ` +
      `${fmtEuro(a.umsatzBelegt)} Umsatz auf ${fmtEuro(a.budgetVerknuepft)} Budget, ` +
      `ROI ${fmtProzent(a.roiGesamt)}.`
    );
  }, [auswertung, kampagnen.length]);

  const gesamtAmpel = roiAmpel(auswertung.roiGesamt);

  // ---- KPI-Kacheln --------------------------------------------------------
  const kacheln: { label: string; wert: string; farbe: string; sub?: string }[] = [
    { label: "Budget gesamt", wert: fmtEuro(auswertung.budgetGesamt), farbe: C.cyan },
    { label: "Budget aktiver Kampagnen", wert: fmtEuro(auswertung.budgetAktiv), farbe: C.gold },
    {
      label: "Belegter Umsatz",
      wert: fmtEuro(auswertung.umsatzBelegt),
      farbe: C.green,
      sub:
        auswertung.anzahlVerknuepft > 0
          ? `${auswertung.anzahlVerknuepft} Kampagne(n) verknuepft`
          : "noch keine Rechnung verknuepft",
    },
    {
      label: "ROI gesamt",
      wert: fmtProzent(auswertung.roiGesamt),
      farbe: gesamtAmpel.farbe,
      sub: gesamtAmpel.text,
    },
  ];

  return (
    <div
      style={{
        background: C.navy2,
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        ...style,
      }}
    >
      {/* Kopf */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span
          style={{
            display: "inline-block",
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: gesamtAmpel.farbe,
            boxShadow: `0 0 10px ${gesamtAmpel.farbe}`,
          }}
        />
        <h3
          style={{
            margin: 0,
            fontSize: 'clamp(16px, 1.38vw, 22px)',
            fontWeight: 800,
            letterSpacing: 0.3,
            color: "#fff",
            fontFamily: "var(--font-dm-sans), sans-serif",
          }}
        >
          Marketing-ROI &amp; Budget-Effizienz
        </h3>
      </div>

      {/* KPI-Kacheln */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {kacheln.map((kp) => (
          <div
            key={kp.label}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                fontSize: 'clamp(22px, 1.94vw, 31px)',
                fontWeight: 800,
                color: kp.farbe,
                fontFamily: "var(--font-dm-sans), sans-serif",
                lineHeight: 1.1,
              }}
            >
              {laden ? "\u2026" : kp.wert}
            </div>
            <div
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: C.textDim,
                fontSize: 'clamp(13px, 1.13vw, 18px)',
                marginTop: 4,
              }}
            >
              {kp.label}
            </div>
            {kp.sub && (
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 'clamp(11.5px, 1vw, 16px)',
                  marginTop: 2,
                }}
              >
                {kp.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Kampagnen-Effizienz-Liste (kompakt) */}
      {!laden && auswertung.zeilen.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          {auswertung.zeilen.map(({ k, budget, umsatz, roi }) => {
            const amp = roiAmpel(roi);
            return (
              <div
                key={k.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <span
                  title={amp.text}
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: amp.farbe,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    color: "rgba(255,255,255,0.9)",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 'clamp(14px, 1.25vw, 20px)',
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {k.name || "Unbenannte Kampagne"}
                </span>
                <span
                  style={{
                    color: C.textDim,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 'clamp(13px, 1.13vw, 18px)',
                    flexShrink: 0,
                  }}
                >
                  Budget {fmtEuro(budget)}
                </span>
                <span
                  style={{
                    color: umsatz != null ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.35)",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 'clamp(13px, 1.13vw, 18px)',
                    flexShrink: 0,
                    minWidth: 90,
                    textAlign: "right",
                  }}
                >
                  {umsatz != null ? `Umsatz ${fmtEuro(umsatz)}` : "kein Umsatz"}
                </span>
                <span
                  style={{
                    color: amp.farbe,
                    fontFamily: "var(--font-dm-sans), sans-serif",
                    fontSize: 'clamp(13.5px, 1.19vw, 19px)',
                    fontWeight: 800,
                    flexShrink: 0,
                    minWidth: 74,
                    textAlign: "right",
                  }}
                >
                  {roi != null ? fmtProzent(roi) : "\u2014"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* KI-Klartext: "Was heisst das fuer mich?" */}
      {!laden && (
        <KiKlartext
          kontext={kiKontext}
          modul="Marketing / ROI & Budget"
          akzent={gesamtAmpel.farbe}
          dunkel
        />
      )}
    </div>
  );
}
