"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import KiKlartext from "../_components/KiKlartext";
import RechnungenAuge from "./RechnungenAuge";

// ============================================================
// ARGONAUT OS · MODUL 6 "RECHNUNG" · R2 RECHNUNGS-COCKPIT
// /dashboard/rechnungen — Liste, KPI-Strip, Suche, Filter, Ampel
// ============================================================

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

type Rechnung = {
  id: string;
  rechnungsnummer: string | null;
  titel: string | null;
  kontakt_id: string | null;
  firma_id: string | null;
  auftrag_id: string | null;
  zahlungsstatus: string;
  rechnungsdatum: string | null;
  faelligkeitsdatum: string | null;
  bezahlt_am: string | null;
  netto_summe: number | null;
  mwst_summe: number | null;
  brutto_summe: number | null;
  bezahlter_betrag: number | null;
  waehrung: string | null;
  kleinunternehmer: boolean | null;
};

const STATUS_META: Record<string, { label: string; farbe: string }> = {
  offen: { label: "Offen", farbe: C.cyan },
  teilbezahlt: { label: "Teilbezahlt", farbe: C.lila },
  bezahlt: { label: "Bezahlt", farbe: C.green },
  ueberfaellig: { label: "Überfällig", farbe: C.danger },
  storniert: { label: "Storniert", farbe: C.textDim },
};

function eur(n: number | null | undefined, waehrung = "EUR"): string {
  const v = typeof n === "number" ? n : 0;
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: waehrung || "EUR",
    }).format(v);
  } catch {
    return `${v.toFixed(2)} €`;
  }
}

function datum(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

// Tage bis Fälligkeit (negativ = überfällig)
function tageBisFaellig(faellig: string | null | undefined): number | null {
  if (!faellig) return null;
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const f = new Date(faellig);
  f.setHours(0, 0, 0, 0);
  return Math.round((f.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));
}

// Effektiver Status: "offen" mit abgelaufener Fälligkeit -> überfällig (nur Anzeige)
function effektiverStatus(r: Rechnung): string {
  if (r.zahlungsstatus === "offen" || r.zahlungsstatus === "teilbezahlt") {
    const t = tageBisFaellig(r.faelligkeitsdatum);
    if (t !== null && t < 0) return "ueberfaellig";
  }
  return r.zahlungsstatus;
}

export default function RechnungenCockpit() {
  const router = useRouter();
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
      ),
    []
  );

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([]);
  const [kontaktMap, setKontaktMap] = useState<Record<string, string>>({});
  const [firmaMap, setFirmaMap] = useState<Record<string, string>>({});

  const [suche, setSuche] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");

  useEffect(() => {
    let aktiv = true;
    (async () => {
      setLaden(true);
      setFehler(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }

        const { data: rData, error: rErr } = await supabase
          .from("rechnungen")
          .select(
            "id,rechnungsnummer,titel,kontakt_id,firma_id,auftrag_id,zahlungsstatus,rechnungsdatum,faelligkeitsdatum,bezahlt_am,netto_summe,mwst_summe,brutto_summe,bezahlter_betrag,waehrung,kleinunternehmer"
          )
          .order("rechnungsdatum", { ascending: false })
          .order("created_at", { ascending: false });

        if (rErr) throw rErr;
        const liste = (rData || []) as Rechnung[];

        // Kontakt-Namen defensiv auflösen
        const kIds = Array.from(
          new Set(liste.map((r) => r.kontakt_id).filter(Boolean))
        ) as string[];
        const kMap: Record<string, string> = {};
        if (kIds.length) {
          const { data: kData } = await supabase
            .from("kontakte")
            .select("*")
            .in("id", kIds);
          (kData || []).forEach((k: any) => {
            const name =
              k.anzeigename ||
              [k.vorname, k.nachname].filter(Boolean).join(" ") ||
              k.name ||
              k.email ||
              "Kontakt";
            kMap[k.id] = name;
          });
        }

        // Firmen-Namen defensiv auflösen
        const fIds = Array.from(
          new Set(liste.map((r) => r.firma_id).filter(Boolean))
        ) as string[];
        const fMap: Record<string, string> = {};
        if (fIds.length) {
          const { data: fData } = await supabase
            .from("firmen")
            .select("*")
            .in("id", fIds);
          (fData || []).forEach((f: any) => {
            const name = f.name || f.firmenname || f.firma || "Firma";
            fMap[f.id] = name;
          });
        }

        if (!aktiv) return;
        setRechnungen(liste);
        setKontaktMap(kMap);
        setFirmaMap(fMap);
      } catch (e: any) {
        if (aktiv) setFehler(e?.message || "Fehler beim Laden der Rechnungen.");
      } finally {
        if (aktiv) setLaden(false);
      }
    })();
    return () => {
      aktiv = false;
    };
  }, [supabase, router]);

  // KPIs
  const kpis = useMemo(() => {
    let offen = 0;
    let ueberfaellig = 0;
    let bezahlt = 0;
    let umsatz = 0; // bezahlte Brutto-Summe
    for (const r of rechnungen) {
      const st = effektiverStatus(r);
      const brutto = r.brutto_summe || 0;
      if (st === "bezahlt") {
        bezahlt += brutto;
        umsatz += brutto;
      } else if (st === "ueberfaellig") {
        ueberfaellig += brutto;
      } else if (st === "offen" || st === "teilbezahlt") {
        offen += brutto;
        umsatz += r.bezahlter_betrag || 0;
      }
    }
    return { offen, ueberfaellig, bezahlt, umsatz };
  }, [rechnungen]);

  // Gefilterte Liste
  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return rechnungen.filter((r) => {
      const st = effektiverStatus(r);
      if (statusFilter !== "alle" && st !== statusFilter) return false;
      if (!q) return true;
      const kontakt = r.kontakt_id ? kontaktMap[r.kontakt_id] || "" : "";
      const firma = r.firma_id ? firmaMap[r.firma_id] || "" : "";
      const hay = [
        r.rechnungsnummer || "",
        r.titel || "",
        kontakt,
        firma,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rechnungen, suche, statusFilter, kontaktMap, firmaMap]);

  // DSO (Ø Zahlungsdauer bezahlter Rechnungen) + überfällige Posten
  const zahlungsAnalyse = useMemo(() => {
    // DSO: bezahlt_am − rechnungsdatum, gemittelt über bezahlte Rechnungen
    const bezahlteMitDaten = rechnungen.filter(
      (r) => r.zahlungsstatus === "bezahlt" && r.rechnungsdatum && r.bezahlt_am
    );
    let dso: number | null = null;
    if (bezahlteMitDaten.length > 0) {
      const summeTage = bezahlteMitDaten.reduce((s, r) => {
        const rd = new Date(r.rechnungsdatum as string).getTime();
        const bz = new Date(r.bezahlt_am as string).getTime();
        const tage = Math.round((bz - rd) / 86_400_000);
        return s + Math.max(0, tage);
      }, 0);
      dso = Math.round(summeTage / bezahlteMitDaten.length);
    }

    // Überfällige offene/teilbezahlte Rechnungen (älteste zuerst)
    const ueberfaellig = rechnungen
      .filter((r) => {
        if (r.zahlungsstatus !== "offen" && r.zahlungsstatus !== "teilbezahlt") return false;
        const t = tageBisFaellig(r.faelligkeitsdatum);
        return t !== null && t < 0;
      })
      .map((r) => {
        const t = tageBisFaellig(r.faelligkeitsdatum) ?? 0;
        const empf =
          (r.kontakt_id && kontaktMap[r.kontakt_id]) ||
          (r.firma_id && firmaMap[r.firma_id]) ||
          r.titel ||
          "Unbenannt";
        const offenerBetrag = (r.brutto_summe || 0) - (r.bezahlter_betrag || 0);
        return { empf, tageUeber: Math.abs(t), offenerBetrag, nummer: r.rechnungsnummer || "—" };
      })
      .sort((a, b) => b.tageUeber - a.tageUeber);

    return { dso, ueberfaellig };
  }, [rechnungen, kontaktMap, firmaMap]);

  // Kompakter, stabiler Kontext für die KI-Klartext-Box
  const rechnungenKiKontext = useMemo(() => {
    const { dso, ueberfaellig } = zahlungsAnalyse;
    const teile: string[] = [];
    teile.push(`Offene Forderungen gesamt: ${eur(kpis.offen + kpis.ueberfaellig)}.`);
    if (dso !== null) teile.push(`Kunden zahlen im Schnitt nach ${dso} Tagen (DSO).`);
    if (ueberfaellig.length === 0) {
      teile.push("Aktuell keine überfälligen Rechnungen.");
    } else {
      const summeUeber = ueberfaellig.reduce((s, u) => s + u.offenerBetrag, 0);
      teile.push(`${ueberfaellig.length} Rechnung(en) überfällig, Summe ${eur(summeUeber)}.`);
      const top = ueberfaellig
        .slice(0, 3)
        .map((u) => `- ${u.empf} (${u.nummer}): ${u.tageUeber} Tage über Ziel, ${eur(u.offenerBetrag)} offen`);
      teile.push("Am längsten überfällig:\n" + top.join("\n"));
    }
    return teile.join("\n");
  }, [zahlungsAnalyse, kpis]);

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
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Kopfzeile */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "var(--font-dm-sans), sans-serif",
                fontSize: 30,
                fontWeight: 800,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              🧾 Rechnungen
            </h1>
            <p style={{ color: C.textDim, margin: "6px 0 0", fontSize: 15 }}>
              Alle Ausgangsrechnungen – Übersicht, Status &amp; Fälligkeiten
            </p>
          </div>
        </div>

        {/* KPI-Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}
        >
          <KpiCard label="Offen" wert={eur(kpis.offen)} farbe={C.cyan} />
          <KpiCard
            label="Überfällig"
            wert={eur(kpis.ueberfaellig)}
            farbe={C.danger}
          />
          <KpiCard label="Bezahlt" wert={eur(kpis.bezahlt)} farbe={C.green} />
          <KpiCard
            label="Umsatz (vereinnahmt)"
            wert={eur(kpis.umsatz)}
            farbe={C.gold}
          />
          <KpiCard
            label="Ø Zahlungsdauer (DSO)"
            wert={zahlungsAnalyse.dso !== null ? `${zahlungsAnalyse.dso} Tage` : "—"}
            farbe={C.lila}
          />
        </div>

        {/* KI-Auge: was heißt die Rechnungs-Lage gerade für mich? */}
      <RechnungenAuge />

        {/* Suche + Filter */}
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Suche nach Nummer, Titel, Kontakt, Firma…"
            style={{
              flex: "1 1 320px",
              minWidth: 240,
              background: C.navy2,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: "12px 16px",
              color: "#fff",
              fontSize: 15,
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { k: "alle", label: "Alle" },
              { k: "offen", label: "Offen" },
              { k: "ueberfaellig", label: "Überfällig" },
              { k: "teilbezahlt", label: "Teilbezahlt" },
              { k: "bezahlt", label: "Bezahlt" },
              { k: "storniert", label: "Storniert" },
            ].map((opt) => {
              const aktiv = statusFilter === opt.k;
              return (
                <button
                  key={opt.k}
                  onClick={() => setStatusFilter(opt.k)}
                  style={{
                    background: aktiv ? C.gold : C.navy2,
                    color: aktiv ? C.navy : C.textDim,
                    border: `1px solid ${aktiv ? C.gold : C.border}`,
                    borderRadius: 999,
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Inhalt */}
        {laden ? (
          <div style={{ color: C.textDim, padding: "40px 0", textAlign: "center" }}>
            ARGONAUT lädt die Rechnungen…
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
            {fehler}
          </div>
        ) : gefiltert.length === 0 ? (
          <div
            style={{
              background: C.navy2,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: "48px 24px",
              textAlign: "center",
              color: C.textDim,
            }}
          >
            {rechnungen.length === 0 ? (
              <>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
                <div style={{ fontSize: 17, color: "#fff", marginBottom: 6 }}>
                  Noch keine Rechnungen
                </div>
                <div style={{ fontSize: 14 }}>
                  Rechnungen entstehen aus einem Auftrag – öffne einen Auftrag und
                  klicke dort auf „Rechnung erstellen".
                </div>
              </>
            ) : (
              "Keine Rechnungen passen zu Suche/Filter."
            )}
          </div>
        ) : (
          <div
            style={{
              background: C.navy2,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            {/* Tabellenkopf (nur Desktop-artig) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "140px 1fr 150px 120px 130px 120px",
                gap: 12,
                padding: "14px 18px",
                borderBottom: `1px solid ${C.border}`,
                color: C.textDim,
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              <div>Nummer</div>
              <div>Empfänger / Titel</div>
              <div>Fälligkeit</div>
              <div style={{ textAlign: "right" }}>Brutto</div>
              <div>Status</div>
              <div style={{ textAlign: "right" }}>Datum</div>
            </div>

            {gefiltert.map((r) => {
              const st = effektiverStatus(r);
              const meta = STATUS_META[st] || {
                label: st,
                farbe: C.textDim,
              };
              const empfaenger =
                (r.kontakt_id && kontaktMap[r.kontakt_id]) ||
                (r.firma_id && firmaMap[r.firma_id]) ||
                r.titel ||
                "—";
              const t = tageBisFaellig(r.faelligkeitsdatum);
              const bezahlt = st === "bezahlt" || st === "storniert";

              // Fälligkeits-Ampel
              let ampel = C.textDim;
              let ampelText = "—";
              if (r.faelligkeitsdatum && !bezahlt) {
                if (t === null) {
                  ampel = C.textDim;
                } else if (t < 0) {
                  ampel = C.danger;
                  ampelText = `${Math.abs(t)} T überfällig`;
                } else if (t <= 5) {
                  ampel = C.warn;
                  ampelText = t === 0 ? "heute fällig" : `in ${t} T`;
                } else {
                  ampel = C.green;
                  ampelText = `in ${t} T`;
                }
              } else if (bezahlt) {
                ampel = C.green;
                ampelText = meta.label;
              }

              return (
                <div
                  key={r.id}
                  onClick={() => router.push(`/dashboard/rechnungen/${r.id}`)}
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "140px 1fr 150px 120px 130px 120px",
                    gap: 12,
                    padding: "16px 18px",
                    borderBottom: `1px solid ${C.border}`,
                    cursor: "pointer",
                    alignItems: "center",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "rgba(255,255,255,0.03)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <div
                    style={{
                      fontFamily: "var(--font-dm-sans), sans-serif",
                      fontWeight: 700,
                      color: C.gold,
                      fontSize: 14,
                    }}
                  >
                    {r.rechnungsnummer || "—"}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 15,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {empfaenger}
                    </div>
                    {r.titel && empfaenger !== r.titel && (
                      <div
                        style={{
                          color: C.textDim,
                          fontSize: 13,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {r.titel}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        background: ampel,
                        flexShrink: 0,
                        boxShadow: `0 0 8px ${ampel}66`,
                      }}
                    />
                    <span style={{ fontSize: 13, color: C.textDim }}>
                      {ampelText}
                    </span>
                  </div>

                  <div
                    style={{
                      textAlign: "right",
                      fontWeight: 700,
                      fontSize: 15,
                    }}
                  >
                    {eur(r.brutto_summe, r.waehrung || "EUR")}
                  </div>

                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        background: `${meta.farbe}22`,
                        color: meta.farbe,
                        border: `1px solid ${meta.farbe}55`,
                        borderRadius: 999,
                        padding: "4px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {meta.label}
                    </span>
                  </div>

                  <div
                    style={{
                      textAlign: "right",
                      color: C.textDim,
                      fontSize: 13,
                    }}
                  >
                    {datum(r.rechnungsdatum)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!laden && !fehler && gefiltert.length > 0 && (
          <div
            style={{
              marginTop: 14,
              color: C.textDim,
              fontSize: 13,
              textAlign: "right",
            }}
          >
            {gefiltert.length} von {rechnungen.length} Rechnungen
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  wert,
  farbe,
}: {
  label: string;
  wert: string;
  farbe: string;
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
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 4,
          height: "100%",
          background: farbe,
        }}
      />
      <div style={{ color: C.textDim, fontSize: 13, marginBottom: 8 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-dm-sans), sans-serif",
          fontSize: 24,
          fontWeight: 800,
          color: farbe,
        }}
      >
        {wert}
      </div>
    </div>
  );
}
