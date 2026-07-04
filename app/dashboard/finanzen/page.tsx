"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import FinanzTabs from "./_components/FinanzTabs";

// ============================================================
// ARGONAUT OS · BLOCK D (Finanzen) · D-5b — FINANZ-COCKPIT
// /dashboard/finanzen — Übersicht + Schnellzugriff auf alle Finanz-Tools.
// ============================================================

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
  lila: "#A98CE0",
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};

type Zahlung = { betrag: number; zahlungsdatum: string; rechnung_id: string };
type Rechnung = {
  id: string;
  netto_summe: number;
  mwst_summe: number;
  brutto_summe: number;
  bezahlter_betrag: number;
  zahlungsstatus: string;
  faelligkeitsdatum: string | null;
};
type Ausgabe = { betrag_brutto: number; mwst_satz: number; ausgabedatum: string };

function eur(n: number | null | undefined): string {
  const v = typeof n === "number" ? n : 0;
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
  } catch {
    return `${v.toFixed(2)} €`;
  }
}
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function jahrVon(d: string): number | null {
  if (!d) return null;
  const j = Number((d.split("-"))[0]);
  return isNaN(j) ? null : j;
}
function heuteIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${t}`;
}

export default function FinanzCockpit() {
  const router = useRouter();
  const jahr = new Date().getFullYear();

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zahlungen, setZahlungen] = useState<Zahlung[]>([]);
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([]);
  const [ausgaben, setAusgaben] = useState<Ausgabe[]>([]);

  useEffect(() => {
    (async () => {
      setLaden(true);
      setFehler(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      try {
        const [zRes, rRes, aRes] = await Promise.all([
          supabase.from("zahlungen").select("betrag,zahlungsdatum,rechnung_id"),
          supabase
            .from("rechnungen")
            .select("id,netto_summe,mwst_summe,brutto_summe,bezahlter_betrag,zahlungsstatus,faelligkeitsdatum"),
          supabase.from("ausgaben").select("betrag_brutto,mwst_satz,ausgabedatum"),
        ]);
        if (zRes.error) throw zRes.error;
        if (rRes.error) throw rRes.error;
        if (aRes.error) throw aRes.error;
        setZahlungen((zRes.data as Zahlung[]) || []);
        setRechnungen((rRes.data as Rechnung[]) || []);
        setAusgaben((aRes.data as Ausgabe[]) || []);
      } catch (e: any) {
        setFehler(e?.message || "Fehler beim Laden der Finanzdaten.");
      }
      setLaden(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kpis = useMemo(() => {
    const rMap: Record<string, Rechnung> = {};
    rechnungen.forEach((r) => (rMap[r.id] = r));

    let einnahmenNetto = 0;
    for (const z of zahlungen) {
      if (jahrVon(z.zahlungsdatum) !== jahr) continue;
      const betrag = Number(z.betrag) || 0;
      const r = z.rechnung_id ? rMap[z.rechnung_id] : undefined;
      if (r && Number(r.brutto_summe) > 0) {
        einnahmenNetto += betrag * (Number(r.netto_summe) / Number(r.brutto_summe));
      } else {
        einnahmenNetto += betrag;
      }
    }

    let ausgabenNetto = 0;
    for (const a of ausgaben) {
      if (jahrVon(a.ausgabedatum) !== jahr) continue;
      const brutto = Number(a.betrag_brutto) || 0;
      const satz = Number(a.mwst_satz) || 0;
      ausgabenNetto += brutto / (1 + satz / 100);
    }

    // Offene Forderungen (nicht bezahlt/storniert)
    const heute = heuteIso();
    let offen = 0;
    let ueberfaelligAnzahl = 0;
    for (const r of rechnungen) {
      const st = r.zahlungsstatus;
      if (st === "bezahlt" || st === "storniert") continue;
      const rest = (Number(r.brutto_summe) || 0) - (Number(r.bezahlter_betrag) || 0);
      if (rest <= 0.005) continue;
      offen += rest;
      if (r.faelligkeitsdatum && r.faelligkeitsdatum < heute) ueberfaelligAnzahl += 1;
    }

    return {
      einnahmenNetto: r2(einnahmenNetto),
      ausgabenNetto: r2(ausgabenNetto),
      gewinn: r2(einnahmenNetto - ausgabenNetto),
      offen: r2(offen),
      ueberfaelligAnzahl,
    };
  }, [zahlungen, rechnungen, ausgaben, jahr]);

  const tools = [
    { icon: "💶", titel: "Ausgaben", text: "Belege erfassen & kategorisieren", href: "/dashboard/finanzen/ausgaben", farbe: C.warn },
    { icon: "📊", titel: "EÜR", text: "Einnahmen minus Ausgaben (netto)", href: "/dashboard/finanzen/euer", farbe: C.green },
    { icon: "📈", titel: "BWA", text: "Monatsverlauf & Gewinn", href: "/dashboard/finanzen/bwa", farbe: C.gold },
    { icon: "📤", titel: "Export", text: "CSV für den Steuerberater", href: "/dashboard/finanzen/export", farbe: C.cyan },
  ];

  return (
    <div
      style={{
        background: C.navy,
        minHeight: "100vh",
        padding: "32px 24px 64px",
        color: "#fff",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <FinanzTabs />

        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 30,
              fontWeight: 800,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            💶 Finanzen
          </h1>
          <p style={{ color: C.textDim, margin: "6px 0 0", fontSize: 15 }}>
            Dein Überblick über Einnahmen, Ausgaben und Gewinn – {jahr}
          </p>
        </div>

        {laden ? (
          <div style={{ color: C.textDim, padding: "40px 0", textAlign: "center" }}>ARGONAUT lädt die Finanzen…</div>
        ) : fehler ? (
          <div
            style={{
              background: "rgba(224,102,102,0.1)",
              border: `1px solid ${C.danger}`,
              borderRadius: 12,
              padding: 16,
              color: C.danger,
            }}
          >
            ⚠️ {fehler}
          </div>
        ) : (
          <>
            {/* KPI-Strip */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
                marginBottom: 28,
              }}
            >
              <KpiCard label={`Einnahmen ${jahr} (netto)`} wert={eur(kpis.einnahmenNetto)} farbe={C.green} />
              <KpiCard label={`Ausgaben ${jahr} (netto)`} wert={eur(kpis.ausgabenNetto)} farbe={C.warn} />
              <KpiCard
                label={kpis.gewinn >= 0 ? `Gewinn ${jahr}` : `Verlust ${jahr}`}
                wert={eur(kpis.gewinn)}
                farbe={kpis.gewinn >= 0 ? C.gold : C.danger}
              />
              <KpiCard
                label="Offene Forderungen"
                wert={eur(kpis.offen)}
                farbe={C.cyan}
                unter={
                  kpis.ueberfaelligAnzahl > 0
                    ? `${kpis.ueberfaelligAnzahl} überfällig`
                    : "nichts überfällig"
                }
                unterFarbe={kpis.ueberfaelligAnzahl > 0 ? C.danger : C.textDim}
              />
            </div>

            {/* Schnellzugriff */}
            <div style={{ ...sektionLabel, marginBottom: 14 }}>Werkzeuge</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                gap: 14,
              }}
            >
              {tools.map((t) => (
                <button
                  key={t.href}
                  onClick={() => router.push(t.href)}
                  style={{
                    textAlign: "left",
                    background: C.navy2,
                    border: `1px solid ${C.border}`,
                    borderRadius: 14,
                    padding: "20px 20px",
                    cursor: "pointer",
                    color: "#fff",
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "border-color 0.15s, transform 0.1s",
                    position: "relative",
                    overflow: "hidden",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = t.farbe + "88")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
                >
                  <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: t.farbe }} />
                  <div style={{ fontSize: 26, marginBottom: 10 }}>{t.icon}</div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                    {t.titel}
                  </div>
                  <div style={{ color: C.textDim, fontSize: 13.5 }}>{t.text}</div>
                  <div style={{ color: t.farbe, fontSize: 13, fontWeight: 700, marginTop: 12 }}>Öffnen →</div>
                </button>
              ))}
            </div>

            <p style={{ color: C.textDim, fontSize: 12, marginTop: 24, lineHeight: 1.5 }}>
              Alle Werte netto nach Zufluss-/Abfluss-Prinzip. Der Banking-Abgleich (automatischer
              Kontoimport) folgt in einer späteren Ausbaustufe.
            </p>
          </>
        )}

        <div style={{ height: 30 }} />
      </div>
    </div>
  );
}

function KpiCard({
  label,
  wert,
  farbe,
  unter,
  unterFarbe,
}: {
  label: string;
  wert: string;
  farbe: string;
  unter?: string;
  unterFarbe?: string;
}) {
  return (
    <div
      style={{
        background: C.navy2,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "18px 18px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: farbe }} />
      <div style={{ color: C.textDim, fontSize: 13, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, color: farbe }}>{wert}</div>
      {unter && <div style={{ color: unterFarbe || C.textDim, fontSize: 12, marginTop: 4, fontWeight: 600 }}>{unter}</div>}
    </div>
  );
}

const sektionLabel: React.CSSProperties = {
  color: C.textDim,
  fontSize: 12.5,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  marginBottom: 14,
};
