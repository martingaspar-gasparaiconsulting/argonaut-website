"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import KiKlartext from "../../_components/KiKlartext";

// ---------------------------------------------------------------------------
// ARGONAUT OS — Block C: Mahnwesen (3a Übersicht, nur lesend)
// Datenquelle: SQL-Funktion mahnwesen_uebersicht() (auth.uid() als Default)
// ---------------------------------------------------------------------------

type Ampel = "gruen" | "gelb" | "orange" | "rot";

type MahnRow = {
  id: string;
  rechnungsnummer: string | null;
  titel: string | null;
  kontakt_id: string | null;
  firma_id: string | null;
  brutto_summe: number | string;
  bezahlter_betrag: number | string;
  offener_betrag: number | string;
  rechnungsdatum: string;
  faelligkeit_effektiv: string;
  tage_ueberfaellig: number;
  mahnstufe: number;
  letzte_mahnung_am: string | null;
  empfohlene_mahnstufe: number;
  aktion_faellig: boolean;
  ampel: Ampel;
};

// --- Marken-/Ampelfarben ---------------------------------------------------
const NAVY = "#0A1628";
const GOLD = "#C9A84C";

const AMPEL: Record<Ampel, { farbe: string; label: string }> = {
  gruen: { farbe: "#16a34a", label: "Nicht fällig" },
  gelb: { farbe: "#eab308", label: "Zahlungserinnerung" },
  orange: { farbe: "#ea580c", label: "In Mahnung" },
  rot: { farbe: "#dc2626", label: "Inkasso / letzte Stufe" },
};

// --- Formatter -------------------------------------------------------------
const num = (v: number | string): number => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const eur = (n: number): string =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const datum = (s: string | null): string =>
  s ? new Date(s).toLocaleDateString("de-DE") : "—";

function aktionLabel(r: MahnRow): string {
  if (r.tage_ueberfaellig <= 0) return "—";
  if (!r.aktion_faellig) return "kein weiterer Schritt";
  const stufe = r.empfohlene_mahnstufe;
  if (stufe === 1) return "1. Mahnung fällig";
  if (stufe === 2) return "2. Mahnung fällig";
  if (stufe === 3) return "3. Mahnung fällig";
  return "Mahnung fällig";
}

function mahnstufeLabel(stufe: number): string {
  if (stufe <= 0) return "—";
  if (stufe === 1) return "1. Mahnung";
  if (stufe === 2) return "2. Mahnung";
  return "3. Mahnung";
}

export default function MahnwesenSeite() {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [rows, setRows] = useState<MahnRow[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      setLaden(true);
      setFehler(null);
      try {
        const { data, error } = await supabase.rpc("mahnwesen_uebersicht");
        if (error) throw error;
        if (aktiv) setRows((data as MahnRow[]) ?? []);
      } catch (e: unknown) {
        if (aktiv)
          setFehler(
            "Daten konnten nicht geladen werden: " +
              (e instanceof Error ? e.message : "Unbekannter Fehler")
          );
      } finally {
        if (aktiv) setLaden(false);
      }
    })();
    return () => {
      aktiv = false;
    };
  }, [supabase]);

  // --- Kennzahlen ----------------------------------------------------------
  const offenGesamt = rows.reduce((s, r) => s + num(r.offener_betrag), 0);
  const ueberfaellig = rows.filter((r) => r.tage_ueberfaellig > 0);
  const ueberfaelligBetrag = ueberfaellig.reduce(
    (s, r) => s + num(r.offener_betrag),
    0
  );
  const aktionFaellig = rows.filter((r) => r.aktion_faellig);

  // --- Diagramm-Daten: offener Betrag je Ampel-Kategorie -------------------
  const chartData = (["rot", "orange", "gelb", "gruen"] as Ampel[])
    .map((k) => ({
      name: AMPEL[k].label,
      betrag: rows
        .filter((r) => r.ampel === k)
        .reduce((s, r) => s + num(r.offener_betrag), 0),
      farbe: AMPEL[k].farbe,
    }))
    .filter((d) => d.betrag > 0);

  // --- KI-Kontext (echte Zahlen für die ARGONAUT-KI) -----------------------
  const kiKontext = useMemo(() => {
    if (rows.length === 0) return "Es gibt aktuell keine offenen Rechnungen.";
    const details = rows
      .map(
        (r) =>
          `${r.rechnungsnummer ?? "o. Nr."}: offen ${eur(
            num(r.offener_betrag)
          )}, ${
            r.tage_ueberfaellig > 0
              ? `${r.tage_ueberfaellig} Tage überfällig`
              : "noch nicht fällig"
          }, aktuelle Mahnstufe ${r.mahnstufe}${
            r.aktion_faellig ? ` → ${aktionLabel(r)}` : ""
          }`
      )
      .join(" | ");
    return (
      `Offene Rechnungen gesamt: ${rows.length} über ${eur(offenGesamt)}. ` +
      `Davon überfällig: ${ueberfaellig.length} über ${eur(
        ueberfaelligBetrag
      )}. ` +
      `Neue Mahnung fällig bei ${aktionFaellig.length} Rechnung(en). ` +
      `Einzelfälle: ${details}.`
    );
  }, [rows, offenGesamt, ueberfaellig.length, ueberfaelligBetrag, aktionFaellig.length]);

  // -------------------------------------------------------------------------
  return (
    <div
      style={{
        fontFamily: "'DM Sans', system-ui, sans-serif",
        background: "#f6f7f9",
        minHeight: "100vh",
        padding: "28px 32px 60px",
        color: NAVY,
      }}
    >
      {/* Kopf */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 28,
            fontWeight: 700,
            margin: 0,
            color: NAVY,
          }}
        >
          Mahnwesen
        </h1>
        <p style={{ margin: "6px 0 0", color: "#5b6472", fontSize: 15 }}>
          Offene Rechnungen, Fälligkeiten und Mahnstufen auf einen Blick.
        </p>
      </div>

      {laden && (
        <div style={karteStyle}>
          <p style={{ margin: 0, color: "#5b6472" }}>Lade offene Rechnungen …</p>
        </div>
      )}

      {fehler && (
        <div
          style={{
            ...karteStyle,
            borderLeft: "4px solid #dc2626",
            color: "#dc2626",
          }}
        >
          {fehler}
        </div>
      )}

      {!laden && !fehler && (
        <>
          {/* KPI-Kacheln */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
              marginBottom: 24,
            }}
          >
            <KpiKachel
              titel="Offener Betrag gesamt"
              wert={eur(offenGesamt)}
              akzent={GOLD}
              zusatz={`${rows.length} offene Rechnung${
                rows.length === 1 ? "" : "en"
              }`}
            />
            <KpiKachel
              titel="Überfällig"
              wert={eur(ueberfaelligBetrag)}
              akzent="#ea580c"
              zusatz={`${ueberfaellig.length} Rechnung${
                ueberfaellig.length === 1 ? "" : "en"
              } überfällig`}
            />
            <KpiKachel
              titel="Aktion fällig"
              wert={String(aktionFaellig.length)}
              akzent="#dc2626"
              zusatz="Rechnungen brauchen eine neue Mahnung"
            />
            <KpiKachel
              titel="Höchste Mahnstufe"
              wert={
                rows.length
                  ? String(Math.max(...rows.map((r) => r.mahnstufe)))
                  : "0"
              }
              akzent={NAVY}
              zusatz="aktuell erreichte Stufe"
            />
          </div>

          {/* KI-Auge (oben, für Modul-Konsistenz) */}
          <div style={{ marginBottom: 24 }}>
            <KiKlartext kontext={kiKontext} modul="Mahnwesen" akzent={GOLD} />
          </div>

          {rows.length === 0 ? (
            <div style={{ ...karteStyle, textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
                Alles bezahlt – keine offenen Rechnungen.
              </p>
              <p style={{ margin: "6px 0 0", color: "#5b6472" }}>
                Sobald eine Rechnung offen ist, erscheint sie hier automatisch.
              </p>
            </div>
          ) : (
            <>
              {/* Diagramm */}
              {chartData.length > 0 && (
                <div style={{ ...karteStyle, marginBottom: 24 }}>
                  <h2 style={ueberschriftStyle}>Offener Betrag nach Status</h2>
                  <div style={{ width: "100%", height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                      >
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 12, fill: "#5b6472" }}
                        />
                        <YAxis
                          tick={{ fontSize: 12, fill: "#5b6472" }}
                          tickFormatter={(v: unknown) => eur(num(v as number))}
                          width={90}
                        />
                        <Tooltip
                          formatter={(v: unknown) => eur(num(v as number))}
                          labelStyle={{ color: NAVY, fontWeight: 600 }}
                        />
                        <Bar dataKey="betrag" radius={[6, 6, 0, 0]}>
                          {chartData.map((d, i) => (
                            <Cell key={i} fill={d.farbe} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Ampel-Liste */}
              <div style={karteStyle}>
                <h2 style={ueberschriftStyle}>Offene Rechnungen</h2>
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 14,
                      minWidth: 760,
                    }}
                  >
                    <thead>
                      <tr>
                        {[
                          "",
                          "Rechnung",
                          "Fällig am",
                          "Überfällig",
                          "Offener Betrag",
                          "Mahnstufe",
                          "Empfehlung",
                        ].map((h, i) => (
                          <th
                            key={i}
                            style={{
                              textAlign:
                                i === 4 ? "right" : i === 3 ? "center" : "left",
                              padding: "10px 12px",
                              borderBottom: "2px solid #eceef1",
                              color: "#5b6472",
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td style={zelle}>
                            <span
                              title={AMPEL[r.ampel].label}
                              style={{
                                display: "inline-block",
                                width: 12,
                                height: 12,
                                borderRadius: "50%",
                                background: AMPEL[r.ampel].farbe,
                              }}
                            />
                          </td>
                          <td style={zelle}>
                            <div style={{ fontWeight: 600 }}>
                              {r.rechnungsnummer ?? "ohne Nr."}
                            </div>
                            <div style={{ color: "#8a929e", fontSize: 12 }}>
                              {r.titel ?? ""}
                            </div>
                          </td>
                          <td style={zelle}>{datum(r.faelligkeit_effektiv)}</td>
                          <td style={{ ...zelle, textAlign: "center" }}>
                            {r.tage_ueberfaellig > 0 ? (
                              <span style={{ color: "#dc2626", fontWeight: 600 }}>
                                {r.tage_ueberfaellig} Tage
                              </span>
                            ) : (
                              <span style={{ color: "#16a34a" }}>—</span>
                            )}
                          </td>
                          <td
                            style={{
                              ...zelle,
                              textAlign: "right",
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {eur(num(r.offener_betrag))}
                          </td>
                          <td style={zelle}>{mahnstufeLabel(r.mahnstufe)}</td>
                          <td style={zelle}>
                            {r.aktion_faellig ? (
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "3px 10px",
                                  borderRadius: 20,
                                  background: "#fde8e8",
                                  color: "#b91c1c",
                                  fontWeight: 600,
                                  fontSize: 12.5,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {aktionLabel(r)}
                              </span>
                            ) : (
                              <span style={{ color: "#8a929e" }}>
                                {aktionLabel(r)}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// --- Sub-Komponente: KPI-Kachel -------------------------------------------
function KpiKachel({
  titel,
  wert,
  akzent,
  zusatz,
}: {
  titel: string;
  wert: string;
  akzent: string;
  zusatz: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "18px 20px",
        boxShadow: "0 1px 3px rgba(10,22,40,0.08)",
        borderTop: `3px solid ${akzent}`,
      }}
    >
      <div style={{ fontSize: 13, color: "#5b6472", fontWeight: 600 }}>
        {titel}
      </div>
      <div
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 26,
          fontWeight: 700,
          margin: "6px 0 4px",
          color: NAVY,
        }}
      >
        {wert}
      </div>
      <div style={{ fontSize: 12.5, color: "#8a929e" }}>{zusatz}</div>
    </div>
  );
}

// --- gemeinsame Styles -----------------------------------------------------
const karteStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: "20px 22px",
  boxShadow: "0 1px 3px rgba(10,22,40,0.08)",
};

const ueberschriftStyle: React.CSSProperties = {
  fontFamily: "'Syne', sans-serif",
  fontSize: 17,
  fontWeight: 700,
  margin: "0 0 16px",
  color: NAVY,
};

const zelle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #f0f1f3",
  verticalAlign: "top",
};
