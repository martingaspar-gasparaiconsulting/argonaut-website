"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import FinanzTabs from "../_components/FinanzTabs";

// ============================================================
// ARGONAUT OS · BLOCK D (Finanzen) · D-5a — EXPORT (CSV)
// /dashboard/finanzen/export
// Universelles CSV (Semikolon, deutsche Zahlen, UTF-8 mit BOM),
// das jeder Steuerberater in DATEV/Lexware/Excel einlesen kann.
// Einnahmen (aus zahlungen+rechnungen) + Ausgaben (aus ausgaben).
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
type RechnungInfo = {
  rechnungsnummer: string | null;
  netto_summe: number;
  mwst_summe: number;
  brutto_summe: number;
  kontakt_id: string | null;
  firma_id: string | null;
};
type Ausgabe = {
  bezeichnung: string;
  kategorie: string;
  betrag_brutto: number;
  mwst_satz: number;
  ausgabedatum: string;
  lieferant: string | null;
  zahlungsart: string;
};

type Zeitraum = "monat" | "quartal" | "jahr" | "vorjahr" | "frei";

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}
function bereichFuer(zr: Zeitraum, vonFrei: string, bisFrei: string): { von: string; bis: string } {
  const jetzt = new Date();
  const j = jetzt.getFullYear();
  const m = jetzt.getMonth();
  if (zr === "monat") return { von: iso(new Date(j, m, 1)), bis: iso(new Date(j, m + 1, 0)) };
  if (zr === "quartal") {
    const q = Math.floor(m / 3) * 3;
    return { von: iso(new Date(j, q, 1)), bis: iso(new Date(j, q + 3, 0)) };
  }
  if (zr === "jahr") return { von: iso(new Date(j, 0, 1)), bis: iso(new Date(j, 11, 31)) };
  if (zr === "vorjahr") return { von: iso(new Date(j - 1, 0, 1)), bis: iso(new Date(j - 1, 11, 31)) };
  return { von: vonFrei || iso(new Date(j, 0, 1)), bis: bisFrei || iso(new Date(j, 11, 31)) };
}

function datumDeIso(d: string): string {
  const t = (d || "").split("-");
  if (t.length !== 3) return d || "";
  return `${t[2]}.${t[1]}.${t[0]}`;
}
function geldCsv(n: number): string {
  return (Number(n) || 0).toFixed(2).replace(".", ",");
}
function csvFeld(s: any): string {
  const t = String(s ?? "");
  if (/[;"\n]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
  return t;
}
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export default function ExportSeite() {
  const router = useRouter();

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zahlungen, setZahlungen] = useState<Zahlung[]>([]);
  const [rechnungMap, setRechnungMap] = useState<Record<string, RechnungInfo>>({});
  const [kontaktMap, setKontaktMap] = useState<Record<string, string>>({});
  const [firmaMap, setFirmaMap] = useState<Record<string, string>>({});
  const [ausgaben, setAusgaben] = useState<Ausgabe[]>([]);

  const [zeitraum, setZeitraum] = useState<Zeitraum>("jahr");
  const [vonFrei, setVonFrei] = useState("");
  const [bisFrei, setBisFrei] = useState("");

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
            .select("id,rechnungsnummer,netto_summe,mwst_summe,brutto_summe,kontakt_id,firma_id"),
          supabase
            .from("ausgaben")
            .select("bezeichnung,kategorie,betrag_brutto,mwst_satz,ausgabedatum,lieferant,zahlungsart"),
        ]);
        if (zRes.error) throw zRes.error;
        if (aRes.error) throw aRes.error;

        setZahlungen((zRes.data as Zahlung[]) || []);
        setAusgaben((aRes.data as Ausgabe[]) || []);

        const rMap: Record<string, RechnungInfo> = {};
        const kIds = new Set<string>();
        const fIds = new Set<string>();
        ((rRes.data as any[]) || []).forEach((r) => {
          rMap[r.id] = {
            rechnungsnummer: r.rechnungsnummer,
            netto_summe: Number(r.netto_summe) || 0,
            mwst_summe: Number(r.mwst_summe) || 0,
            brutto_summe: Number(r.brutto_summe) || 0,
            kontakt_id: r.kontakt_id,
            firma_id: r.firma_id,
          };
          if (r.kontakt_id) kIds.add(r.kontakt_id);
          if (r.firma_id) fIds.add(r.firma_id);
        });
        setRechnungMap(rMap);

        if (kIds.size) {
          const { data: kData } = await supabase.from("kontakte").select("*").in("id", Array.from(kIds));
          const kMap: Record<string, string> = {};
          (kData || []).forEach((k: any) => {
            kMap[k.id] =
              k.anzeigename ||
              [k.vorname, k.nachname].filter(Boolean).join(" ") ||
              k.name ||
              k.email ||
              "Kontakt";
          });
          setKontaktMap(kMap);
        }
        if (fIds.size) {
          const { data: fData } = await supabase.from("firmen").select("*").in("id", Array.from(fIds));
          const fMap: Record<string, string> = {};
          (fData || []).forEach((f: any) => {
            fMap[f.id] = f.name || f.firmenname || f.firma || "Firma";
          });
          setFirmaMap(fMap);
        }
      } catch (e: any) {
        setFehler(e?.message || "Fehler beim Laden der Finanzdaten.");
      }
      setLaden(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bereich = useMemo(() => bereichFuer(zeitraum, vonFrei, bisFrei), [zeitraum, vonFrei, bisFrei]);

  // Zeilen für Export + Zusammenfassung
  const zeilen = useMemo(() => {
    const { von, bis } = bereich;
    const out: {
      datum: string;
      typ: string;
      belegNr: string;
      text: string;
      kategorie: string;
      partner: string;
      brutto: number;
      satz: number;
      ust: number;
      netto: number;
      zahlungsart: string;
      sort: string;
    }[] = [];

    // EINNAHMEN
    for (const z of zahlungen) {
      const d = z.zahlungsdatum;
      if (!d || d < von || d > bis) continue;
      const betrag = Number(z.betrag) || 0;
      const r = z.rechnung_id ? rechnungMap[z.rechnung_id] : undefined;
      let netto = betrag;
      let ust = 0;
      let satz = 0;
      let belegNr = "";
      let partner = "";
      if (r) {
        belegNr = r.rechnungsnummer || "";
        if (r.brutto_summe > 0) {
          netto = betrag * (r.netto_summe / r.brutto_summe);
          ust = betrag * (r.mwst_summe / r.brutto_summe);
        }
        if (r.netto_summe > 0) satz = Math.round((r.mwst_summe / r.netto_summe) * 100);
        partner = (r.firma_id && firmaMap[r.firma_id]) || (r.kontakt_id && kontaktMap[r.kontakt_id]) || "";
      }
      out.push({
        datum: datumDeIso(d),
        typ: "Einnahme",
        belegNr,
        text: belegNr ? `Zahlung Rechnung ${belegNr}` : "Zahlungseingang",
        kategorie: "Umsatzerlöse",
        partner,
        brutto: r2(betrag),
        satz,
        ust: r2(ust),
        netto: r2(netto),
        zahlungsart: "",
        sort: d,
      });
    }

    // AUSGABEN
    for (const a of ausgaben) {
      const d = a.ausgabedatum;
      if (!d || d < von || d > bis) continue;
      const brutto = Number(a.betrag_brutto) || 0;
      const satz = Number(a.mwst_satz) || 0;
      const netto = brutto / (1 + satz / 100);
      const ust = brutto - netto;
      out.push({
        datum: datumDeIso(d),
        typ: "Ausgabe",
        belegNr: "",
        text: a.bezeichnung || "",
        kategorie: a.kategorie || "Sonstiges",
        partner: a.lieferant || "",
        brutto: r2(brutto),
        satz,
        ust: r2(ust),
        netto: r2(netto),
        zahlungsart: a.zahlungsart || "",
        sort: d,
      });
    }

    out.sort((x, y) => (x.sort < y.sort ? -1 : x.sort > y.sort ? 1 : 0));
    return out;
  }, [zahlungen, rechnungMap, kontaktMap, firmaMap, ausgaben, bereich]);

  const zusammenfassung = useMemo(() => {
    let einnahmen = 0;
    let ausgabenS = 0;
    let anzE = 0;
    let anzA = 0;
    for (const z of zeilen) {
      if (z.typ === "Einnahme") {
        einnahmen += z.brutto;
        anzE += 1;
      } else {
        ausgabenS += z.brutto;
        anzA += 1;
      }
    }
    return { einnahmen: r2(einnahmen), ausgaben: r2(ausgabenS), anzE, anzA };
  }, [zeilen]);

  function csvHerunterladen() {
    const kopf = [
      "Belegdatum",
      "Typ",
      "Beleg-Nr",
      "Text",
      "Kategorie",
      "Geschäftspartner",
      "Betrag brutto",
      "MwSt-Satz %",
      "MwSt-Betrag",
      "Betrag netto",
      "Zahlungsart",
    ];
    const zeilenText = zeilen.map((z) =>
      [
        z.datum,
        z.typ,
        z.belegNr,
        z.text,
        z.kategorie,
        z.partner,
        geldCsv(z.brutto),
        String(z.satz),
        geldCsv(z.ust),
        geldCsv(z.netto),
        z.zahlungsart,
      ]
        .map(csvFeld)
        .join(";")
    );
    const inhalt = "\uFEFF" + [kopf.join(";"), ...zeilenText].join("\r\n");
    const blob = new Blob([inhalt], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ARGONAUT_Finanzexport_${bereich.von}_bis_${bereich.bis}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const hatZeilen = zeilen.length > 0;

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
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <FinanzTabs />

        <div style={{ marginBottom: 20 }}>
          <h1
            style={{
              fontFamily: "var(--font-dm-sans), sans-serif",
              fontSize: 'clamp(30px, 2.63vw, 42px)',
              fontWeight: 800,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            📤 Export für den Steuerberater
          </h1>
          <p style={{ color: C.textDim, margin: "6px 0 0", fontSize: 'clamp(15px, 1.31vw, 21px)' }}>
            Einnahmen und Ausgaben als CSV – einlesbar in DATEV, Lexware oder Excel
          </p>
        </div>

        {/* Zeitraum */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          {(
            [
              { k: "monat", label: "Dieser Monat" },
              { k: "quartal", label: "Dieses Quartal" },
              { k: "jahr", label: "Dieses Jahr" },
              { k: "vorjahr", label: "Letztes Jahr" },
              { k: "frei", label: "Frei wählen" },
            ] as { k: Zeitraum; label: string }[]
          ).map((opt) => {
            const aktiv = zeitraum === opt.k;
            return (
              <button
                key={opt.k}
                onClick={() => setZeitraum(opt.k)}
                style={{
                  background: aktiv ? C.gold : C.navy2,
                  color: aktiv ? C.navy : C.textDim,
                  border: `1px solid ${aktiv ? C.gold : C.border}`,
                  borderRadius: 999,
                  padding: "8px 14px",
                  fontSize: 'clamp(13px, 1.13vw, 18px)',
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {zeitraum === "frei" && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <div>
              <label style={labelStyle}>Von</label>
              <input type="date" value={vonFrei} onChange={(e) => setVonFrei(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Bis</label>
              <input type="date" value={bisFrei} onChange={(e) => setBisFrei(e.target.value)} style={inputStyle} />
            </div>
          </div>
        )}

        <p style={{ color: C.textDim, fontSize: 'clamp(12.5px, 1.13vw, 18px)', margin: "6px 2px 22px" }}>
          Zeitraum: {datumDeIso(bereich.von)} – {datumDeIso(bereich.bis)}
        </p>

        {laden ? (
          <div style={{ color: C.textDim, padding: "40px 0", textAlign: "center" }}>ARGONAUT lädt die Daten…</div>
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 14,
                marginBottom: 22,
              }}
            >
              <KpiCard label="Einnahmen (brutto)" wert={geldEuro(zusammenfassung.einnahmen)} unter={`${zusammenfassung.anzE} Belege`} farbe={C.green} />
              <KpiCard label="Ausgaben (brutto)" wert={geldEuro(zusammenfassung.ausgaben)} unter={`${zusammenfassung.anzA} Belege`} farbe={C.warn} />
              <KpiCard label="Zeilen im Export" wert={String(zeilen.length)} unter="gesamt" farbe={C.cyan} />
            </div>

            <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "22px 22px" }}>
              <div style={sektionLabel}>CSV herunterladen</div>
              <p style={{ color: C.textDim, fontSize: 'clamp(13.5px, 1.19vw, 19px)', margin: "0 0 16px", lineHeight: 1.6 }}>
                Enthält je Buchung: Belegdatum, Typ, Beleg-Nr., Text, Kategorie, Geschäftspartner, Brutto,
                MwSt-Satz, MwSt-Betrag, Netto und Zahlungsart. Semikolon-getrennt, deutsche Zahlen,
                UTF-8 – so öffnet es sich auch in Excel korrekt mit Umlauten.
              </p>
              <button
                onClick={csvHerunterladen}
                disabled={!hatZeilen}
                style={{
                  ...btnGold,
                  opacity: hatZeilen ? 1 : 0.5,
                  cursor: hatZeilen ? "pointer" : "default",
                }}
              >
                ⬇ CSV herunterladen ({zeilen.length} Zeilen)
              </button>
              {!hatZeilen && (
                <p style={{ color: C.textDim, fontSize: 'clamp(12.5px, 1.13vw, 18px)', marginTop: 12 }}>
                  Keine Buchungen im gewählten Zeitraum.
                </p>
              )}
            </div>

            {/* Vorschau (erste Zeilen) */}
            {hatZeilen && (
              <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginTop: 22 }}>
                <div style={{ ...sektionLabel, padding: "18px 18px 0" }}>Vorschau (erste 8 Zeilen)</div>
                <div style={{ overflowX: "auto", padding: "12px 0 0" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "100px 100px 1fr 130px 120px 110px",
                      gap: 12,
                      padding: "10px 18px",
                      borderBottom: `1px solid ${C.border}`,
                      color: C.textDim,
                      fontSize: 'clamp(11.5px, 1vw, 16px)',
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      minWidth: 720,
                    }}
                  >
                    <div>Datum</div>
                    <div>Typ</div>
                    <div>Text</div>
                    <div>Partner</div>
                    <div style={{ textAlign: "right" }}>Brutto</div>
                    <div style={{ textAlign: "right" }}>Netto</div>
                  </div>
                  {zeilen.slice(0, 8).map((z, i) => (
                    <div
                      key={i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "100px 100px 1fr 130px 120px 110px",
                        gap: 12,
                        padding: "10px 18px",
                        borderBottom: `1px solid ${C.border}`,
                        alignItems: "center",
                        minWidth: 720,
                        fontSize: 'clamp(13px, 1.13vw, 18px)',
                      }}
                    >
                      <div style={{ color: C.textDim }}>{z.datum}</div>
                      <div style={{ color: z.typ === "Einnahme" ? C.green : C.warn, fontWeight: 600 }}>{z.typ}</div>
                      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{z.text}</div>
                      <div style={{ color: C.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {z.partner || "—"}
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 600 }}>{geldEuro(z.brutto)}</div>
                      <div style={{ textAlign: "right", color: C.textDim }}>{geldEuro(z.netto)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p style={{ color: C.textDim, fontSize: 'clamp(12px, 1.06vw, 17px)', marginTop: 20, lineHeight: 1.5 }}>
              Hinweis: Universelles Buchungs-CSV nach Zufluss-/Abfluss-Prinzip. Ein striktes
              DATEV-Buchungsstapel-Format (mit Kontenrahmen SKR03/SKR04) folgt in einer späteren Phase.
            </p>
          </>
        )}

        <div style={{ height: 30 }} />
      </div>
    </div>
  );
}

function geldEuro(n: number): string {
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
  } catch {
    return `${(Number(n) || 0).toFixed(2)} €`;
  }
}

function KpiCard({ label, wert, unter, farbe }: { label: string; wert: string; unter?: string; farbe: string }) {
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
      <div style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(24px, 2.13vw, 34px)', fontWeight: 800, color: farbe }}>{wert}</div>
      {unter && <div style={{ color: C.textDim, fontSize: 'clamp(12px, 1.06vw, 17px)', marginTop: 4 }}>{unter}</div>}
    </div>
  );
}

const sektionLabel: React.CSSProperties = {
  color: C.textDim,
  fontSize: 'clamp(12.5px, 1.13vw, 18px)',
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  marginBottom: 14,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: C.textDim,
  fontSize: 'clamp(13px, 1.13vw, 18px)',
  fontWeight: 600,
  margin: "0 0 6px",
};

const inputStyle: React.CSSProperties = {
  background: C.navy2,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "10px 14px",
  color: "#fff",
  fontSize: 'clamp(14px, 1.25vw, 20px)',
  fontFamily: "'DM Sans', sans-serif",
  outline: "none",
};

const btnGold: React.CSSProperties = {
  background: C.gold,
  color: C.navy,
  border: "none",
  borderRadius: 10,
  padding: "12px 22px",
  fontSize: 'clamp(14.5px, 1.25vw, 20px)',
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
};
