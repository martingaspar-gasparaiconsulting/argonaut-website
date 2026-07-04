"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import FinanzTabs from "../_components/FinanzTabs";

// ============================================================
// ARGONAUT OS · BLOCK D (Finanzen) · D-4 — BWA-REPORT
// /dashboard/finanzen/bwa
// Monatsvergleich Einnahmen vs. Ausgaben (netto) + Gewinn-Verlauf,
// Jahres-Auswahl, Monats-Tabelle. Nutzt recharts (Fundament Block B).
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

const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

type Zahlung = { betrag: number; zahlungsdatum: string; rechnung_id: string };
type RechnungInfo = { netto_summe: number; mwst_summe: number; brutto_summe: number };
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
// Jahr/Monat direkt aus dem ISO-Datum (ohne Zeitzonen-Verschiebung)
function jahrMonat(d: string): { jahr: number; monat: number } | null {
  if (!d) return null;
  const teile = d.split("-");
  const jahr = Number(teile[0]);
  const monat = Number(teile[1]) - 1;
  if (isNaN(jahr) || isNaN(monat)) return null;
  return { jahr, monat };
}

export default function BwaReport() {
  const router = useRouter();
  const jetztJahr = new Date().getFullYear();

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zahlungen, setZahlungen] = useState<Zahlung[]>([]);
  const [rechnungMap, setRechnungMap] = useState<Record<string, RechnungInfo>>({});
  const [ausgaben, setAusgaben] = useState<Ausgabe[]>([]);
  const [jahr, setJahr] = useState<number>(jetztJahr);

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
          supabase.from("rechnungen").select("id,netto_summe,mwst_summe,brutto_summe"),
          supabase.from("ausgaben").select("betrag_brutto,mwst_satz,ausgabedatum"),
        ]);
        if (zRes.error) throw zRes.error;
        if (aRes.error) throw aRes.error;

        setZahlungen((zRes.data as Zahlung[]) || []);
        setAusgaben((aRes.data as Ausgabe[]) || []);

        const map: Record<string, RechnungInfo> = {};
        ((rRes.data as any[]) || []).forEach((r) => {
          map[r.id] = {
            netto_summe: Number(r.netto_summe) || 0,
            mwst_summe: Number(r.mwst_summe) || 0,
            brutto_summe: Number(r.brutto_summe) || 0,
          };
        });
        setRechnungMap(map);
      } catch (e: any) {
        setFehler(e?.message || "Fehler beim Laden der Finanzdaten.");
      }
      setLaden(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const daten = useMemo(() => {
    const monate = MONATE.map((m) => ({ monat: m, einnahmen: 0, ausgaben: 0, gewinn: 0 }));

    for (const z of zahlungen) {
      const jm = jahrMonat(z.zahlungsdatum);
      if (!jm || jm.jahr !== jahr) continue;
      const betrag = Number(z.betrag) || 0;
      const r = z.rechnung_id ? rechnungMap[z.rechnung_id] : undefined;
      let netto = betrag;
      if (r && r.brutto_summe > 0) netto = betrag * (r.netto_summe / r.brutto_summe);
      monate[jm.monat].einnahmen += netto;
    }

    for (const a of ausgaben) {
      const jm = jahrMonat(a.ausgabedatum);
      if (!jm || jm.jahr !== jahr) continue;
      const brutto = Number(a.betrag_brutto) || 0;
      const satz = Number(a.mwst_satz) || 0;
      monate[jm.monat].ausgaben += brutto / (1 + satz / 100);
    }

    monate.forEach((x) => {
      x.einnahmen = r2(x.einnahmen);
      x.ausgaben = r2(x.ausgaben);
      x.gewinn = r2(x.einnahmen - x.ausgaben);
    });
    return monate;
  }, [zahlungen, rechnungMap, ausgaben, jahr]);

  const summen = useMemo(() => {
    let e = 0;
    let a = 0;
    for (const m of daten) {
      e += m.einnahmen;
      a += m.ausgaben;
    }
    return { einnahmen: r2(e), ausgaben: r2(a), gewinn: r2(e - a) };
  }, [daten]);

  const hatDaten = summen.einnahmen !== 0 || summen.ausgaben !== 0;
  const jahre = [jetztJahr, jetztJahr - 1, jetztJahr - 2];

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

        {/* Kopfzeile */}
        <div style={{ marginBottom: 20 }}>
          <h1
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 30,
              fontWeight: 800,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            📈 BWA – Betriebswirtschaftliche Auswertung
          </h1>
          <p style={{ color: C.textDim, margin: "6px 0 0", fontSize: 15 }}>
            Einnahmen vs. Ausgaben pro Monat (netto) und Gewinn-Verlauf
          </p>
        </div>

        {/* Jahr-Auswahl */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
          {jahre.map((j) => {
            const aktiv = jahr === j;
            return (
              <button
                key={j}
                onClick={() => setJahr(j)}
                style={{
                  background: aktiv ? C.gold : C.navy2,
                  color: aktiv ? C.navy : C.textDim,
                  border: `1px solid ${aktiv ? C.gold : C.border}`,
                  borderRadius: 999,
                  padding: "8px 16px",
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {j}
              </button>
            );
          })}
        </div>

        {laden ? (
          <div style={{ color: C.textDim, padding: "40px 0", textAlign: "center" }}>
            ARGONAUT erstellt die BWA…
          </div>
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
            {/* Jahres-Summen */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 14,
                marginBottom: 22,
              }}
            >
              <KpiCard label={`Einnahmen ${jahr} (netto)`} wert={eur(summen.einnahmen)} farbe={C.green} />
              <KpiCard label={`Ausgaben ${jahr} (netto)`} wert={eur(summen.ausgaben)} farbe={C.warn} />
              <KpiCard
                label={summen.gewinn >= 0 ? `Gewinn ${jahr}` : `Verlust ${jahr}`}
                wert={eur(summen.gewinn)}
                farbe={summen.gewinn >= 0 ? C.gold : C.danger}
              />
            </div>

            {/* Diagramm */}
            <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 18px 12px", marginBottom: 22 }}>
              <div style={{ ...sektionLabel, paddingLeft: 4 }}>Monatsverlauf {jahr}</div>
              {!hatDaten ? (
                <p style={{ color: C.textDim, fontSize: 14, padding: "20px 4px" }}>
                  Keine Buchungen in {jahr}.
                </p>
              ) : (
                <div style={{ width: "100%", height: 380 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={daten} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="monat" tick={{ fill: C.textDim, fontSize: 12 }} axisLine={{ stroke: C.border }} tickLine={false} />
                      <YAxis
                        tick={{ fill: C.textDim, fontSize: 12 }}
                        axisLine={{ stroke: C.border }}
                        tickLine={false}
                        tickFormatter={(v: any) =>
                          Math.abs(Number(v)) >= 1000
                            ? (Number(v) / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + "k"
                            : String(v)
                        }
                      />
                      <Tooltip
                        formatter={(value: unknown) => eur(Number(value))}
                        contentStyle={{
                          background: C.navy2,
                          border: `1px solid ${C.border}`,
                          borderRadius: 10,
                          color: "#fff",
                        }}
                        labelStyle={{ color: C.textDim }}
                        itemStyle={{ color: "#fff" }}
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      />
                      <Legend wrapperStyle={{ fontSize: 13 }} />
                      <Bar dataKey="einnahmen" name="Einnahmen" fill={C.green} radius={[4, 4, 0, 0]} maxBarSize={26} />
                      <Bar dataKey="ausgaben" name="Ausgaben" fill={C.warn} radius={[4, 4, 0, 0]} maxBarSize={26} />
                      <Line type="monotone" dataKey="gewinn" name="Gewinn" stroke={C.gold} strokeWidth={2.5} dot={{ r: 3, fill: C.gold }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Monats-Tabelle */}
            <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 1fr 1fr 1fr",
                    gap: 12,
                    padding: "14px 18px",
                    borderBottom: `1px solid ${C.border}`,
                    color: C.textDim,
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    minWidth: 560,
                  }}
                >
                  <div>Monat</div>
                  <div style={{ textAlign: "right" }}>Einnahmen</div>
                  <div style={{ textAlign: "right" }}>Ausgaben</div>
                  <div style={{ textAlign: "right" }}>Ergebnis</div>
                </div>

                {daten.map((m) => (
                  <div
                    key={m.monat}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "120px 1fr 1fr 1fr",
                      gap: 12,
                      padding: "11px 18px",
                      borderBottom: `1px solid ${C.border}`,
                      alignItems: "center",
                      minWidth: 560,
                      fontSize: 13.5,
                    }}
                  >
                    <div style={{ color: C.textDim }}>{m.monat}</div>
                    <div style={{ textAlign: "right", color: m.einnahmen > 0 ? C.green : C.textDim }}>
                      {eur(m.einnahmen)}
                    </div>
                    <div style={{ textAlign: "right", color: m.ausgaben > 0 ? C.warn : C.textDim }}>
                      {eur(m.ausgaben)}
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        fontWeight: 700,
                        color: m.gewinn > 0 ? C.gold : m.gewinn < 0 ? C.danger : C.textDim,
                      }}
                    >
                      {eur(m.gewinn)}
                    </div>
                  </div>
                ))}

                {/* Summenzeile */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 1fr 1fr 1fr",
                    gap: 12,
                    padding: "14px 18px",
                    alignItems: "center",
                    minWidth: 560,
                    fontSize: 14,
                    background: "rgba(201,168,76,0.06)",
                  }}
                >
                  <div style={{ fontWeight: 800, fontFamily: "'Syne', sans-serif" }}>Gesamt</div>
                  <div style={{ textAlign: "right", fontWeight: 700, color: C.green }}>{eur(summen.einnahmen)}</div>
                  <div style={{ textAlign: "right", fontWeight: 700, color: C.warn }}>{eur(summen.ausgaben)}</div>
                  <div
                    style={{
                      textAlign: "right",
                      fontWeight: 800,
                      color: summen.gewinn >= 0 ? C.gold : C.danger,
                    }}
                  >
                    {eur(summen.gewinn)}
                  </div>
                </div>
              </div>
            </div>

            <p style={{ color: C.textDim, fontSize: 12, marginTop: 20, lineHeight: 1.5 }}>
              Hinweis: Netto-Werte nach Zufluss-/Abfluss-Prinzip. Vereinfachte Auswertung, ersetzt
              keine steuerliche Beratung.
            </p>
          </>
        )}

        <div style={{ height: 30 }} />
      </div>
    </div>
  );
}

function KpiCard({ label, wert, farbe }: { label: string; wert: string; farbe: string }) {
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
