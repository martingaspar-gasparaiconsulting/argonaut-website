"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import FinanzTabs from "../_components/FinanzTabs";

// ============================================================
// ARGONAUT OS · BLOCK D (Finanzen) · D-3 — EÜR-REPORT
// /dashboard/finanzen/euer
// Einnahmen (aus zahlungen, Netto/USt via Rechnung) minus Ausgaben (netto),
// Regelbesteuerung: Netto + USt getrennt. Zeitraum wählbar.
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
type RechnungInfo = { netto_summe: number; mwst_summe: number; brutto_summe: number };
type Ausgabe = { betrag_brutto: number; mwst_satz: number; ausgabedatum: string; kategorie: string };

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
function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${t}`;
}

type Zeitraum = "monat" | "quartal" | "jahr" | "vorjahr" | "frei";

function bereichFuer(zr: Zeitraum, vonFrei: string, bisFrei: string): { von: string; bis: string } {
  const jetzt = new Date();
  const j = jetzt.getFullYear();
  const m = jetzt.getMonth();
  if (zr === "monat") {
    return { von: iso(new Date(j, m, 1)), bis: iso(new Date(j, m + 1, 0)) };
  }
  if (zr === "quartal") {
    const qStart = Math.floor(m / 3) * 3;
    return { von: iso(new Date(j, qStart, 1)), bis: iso(new Date(j, qStart + 3, 0)) };
  }
  if (zr === "jahr") {
    return { von: iso(new Date(j, 0, 1)), bis: iso(new Date(j, 11, 31)) };
  }
  if (zr === "vorjahr") {
    return { von: iso(new Date(j - 1, 0, 1)), bis: iso(new Date(j - 1, 11, 31)) };
  }
  // frei
  return { von: vonFrei || iso(new Date(j, 0, 1)), bis: bisFrei || iso(new Date(j, 11, 31)) };
}

export default function EuerReport() {
  const router = useRouter();

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [zahlungen, setZahlungen] = useState<Zahlung[]>([]);
  const [rechnungMap, setRechnungMap] = useState<Record<string, RechnungInfo>>({});
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
          supabase.from("rechnungen").select("id,netto_summe,mwst_summe,brutto_summe"),
          supabase.from("ausgaben").select("betrag_brutto,mwst_satz,ausgabedatum,kategorie"),
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

  const bereich = useMemo(() => bereichFuer(zeitraum, vonFrei, bisFrei), [zeitraum, vonFrei, bisFrei]);

  const ergebnis = useMemo(() => {
    const { von, bis } = bereich;

    // EINNAHMEN aus Zahlungen (Netto/USt über die Rechnung aufteilen)
    let einnahmenNetto = 0;
    let vereinnahmteUst = 0;
    let einnahmenBrutto = 0;
    for (const z of zahlungen) {
      const d = z.zahlungsdatum;
      if (!d || d < von || d > bis) continue;
      const betrag = Number(z.betrag) || 0;
      einnahmenBrutto += betrag;
      const r = z.rechnung_id ? rechnungMap[z.rechnung_id] : undefined;
      if (r && r.brutto_summe > 0) {
        einnahmenNetto += betrag * (r.netto_summe / r.brutto_summe);
        vereinnahmteUst += betrag * (r.mwst_summe / r.brutto_summe);
      } else {
        // Keine Rechnungsinfo -> vorsichtig als Netto behandeln
        einnahmenNetto += betrag;
      }
    }

    // AUSGABEN (Netto + Vorsteuer herausrechnen), zusätzlich nach Kategorie
    let ausgabenNetto = 0;
    let vorsteuer = 0;
    let ausgabenBrutto = 0;
    const proKategorie: Record<string, number> = {};
    for (const a of ausgaben) {
      const d = a.ausgabedatum;
      if (!d || d < von || d > bis) continue;
      const brutto = Number(a.betrag_brutto) || 0;
      const satz = Number(a.mwst_satz) || 0;
      const netto = brutto / (1 + satz / 100);
      ausgabenBrutto += brutto;
      ausgabenNetto += netto;
      vorsteuer += brutto - netto;
      const k = a.kategorie || "Sonstiges";
      proKategorie[k] = (proKategorie[k] || 0) + netto;
    }

    const kategorien = Object.entries(proKategorie)
      .map(([name, netto]) => ({ name, netto: r2(netto) }))
      .sort((x, y) => y.netto - x.netto);

    return {
      einnahmenNetto: r2(einnahmenNetto),
      einnahmenBrutto: r2(einnahmenBrutto),
      vereinnahmteUst: r2(vereinnahmteUst),
      ausgabenNetto: r2(ausgabenNetto),
      ausgabenBrutto: r2(ausgabenBrutto),
      vorsteuer: r2(vorsteuer),
      gewinn: r2(einnahmenNetto - ausgabenNetto),
      ustZahllast: r2(vereinnahmteUst - vorsteuer),
      kategorien,
    };
  }, [zahlungen, rechnungMap, ausgaben, bereich]);

  const gewinnPositiv = ergebnis.gewinn >= 0;
  const ausgabenSummeNetto = ergebnis.ausgabenNetto || 1;

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
              fontFamily: "var(--font-dm-sans), sans-serif",
              fontSize: 30,
              fontWeight: 800,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            📊 EÜR – Einnahmen-Überschuss-Rechnung
          </h1>
          <p style={{ color: C.textDim, margin: "6px 0 0", fontSize: 15 }}>
            Einnahmen minus Ausgaben (netto) – Regelbesteuerung mit getrennter Umsatzsteuer
          </p>
        </div>

        {/* Zeitraum-Auswahl */}
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

        <p style={{ color: C.textDim, fontSize: 12.5, margin: "6px 2px 22px" }}>
          Zeitraum: {new Date(bereich.von).toLocaleDateString("de-DE")} –{" "}
          {new Date(bereich.bis).toLocaleDateString("de-DE")}
        </p>

        {laden ? (
          <div style={{ color: C.textDim, padding: "40px 0", textAlign: "center" }}>
            ARGONAUT rechnet die EÜR…
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
            {/* ERGEBNIS (netto) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
                marginBottom: 22,
              }}
            >
              <GrosseKarte label="Einnahmen (netto)" wert={eur(ergebnis.einnahmenNetto)} farbe={C.green} />
              <GrosseKarte label="Ausgaben (netto)" wert={eur(ergebnis.ausgabenNetto)} farbe={C.warn} />
              <GrosseKarte
                label={gewinnPositiv ? "Gewinn (netto)" : "Verlust (netto)"}
                wert={eur(ergebnis.gewinn)}
                farbe={gewinnPositiv ? C.gold : C.danger}
                gross
              />
            </div>

            {/* UMSATZSTEUER-BLOCK */}
            <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 22px", marginBottom: 22 }}>
              <div style={sektionLabel}>Umsatzsteuer</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
                <MiniKarte label="Vereinnahmte USt" wert={eur(ergebnis.vereinnahmteUst)} farbe={C.cyan} />
                <MiniKarte label="Vorsteuer (aus Ausgaben)" wert={eur(ergebnis.vorsteuer)} farbe={C.lila} />
                <MiniKarte
                  label={ergebnis.ustZahllast >= 0 ? "USt-Zahllast (an Finanzamt)" : "USt-Erstattung (Guthaben)"}
                  wert={eur(Math.abs(ergebnis.ustZahllast))}
                  farbe={ergebnis.ustZahllast >= 0 ? C.warn : C.green}
                />
              </div>
              <p style={{ color: C.textDim, fontSize: 12, margin: "14px 2px 0", lineHeight: 1.5 }}>
                Grobe Orientierung, keine Umsatzsteuervoranmeldung. Brutto-Kontrolle: Einnahmen{" "}
                {eur(ergebnis.einnahmenBrutto)} · Ausgaben {eur(ergebnis.ausgabenBrutto)}.
              </p>
            </div>

            {/* AUSGABEN NACH KATEGORIE */}
            <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 22px" }}>
              <div style={sektionLabel}>Ausgaben nach Kategorie (netto)</div>
              {ergebnis.kategorien.length === 0 ? (
                <p style={{ color: C.textDim, fontSize: 14, margin: 0 }}>
                  Keine Ausgaben im gewählten Zeitraum.
                </p>
              ) : (
                <div>
                  {ergebnis.kategorien.map((k) => {
                    const anteil = Math.round((k.netto / ausgabenSummeNetto) * 100);
                    return (
                      <div key={k.name} style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 5 }}>
                          <span>{k.name}</span>
                          <span style={{ color: C.textDim }}>
                            {eur(k.netto)} · {anteil}%
                          </span>
                        </div>
                        <div style={{ height: 8, background: C.navy, borderRadius: 999, overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${Math.max(anteil, 2)}%`,
                              height: "100%",
                              background: C.warn,
                              borderRadius: 999,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <p style={{ color: C.textDim, fontSize: 12, marginTop: 20, lineHeight: 1.5 }}>
              Hinweis: Vereinfachte Übersicht nach Zufluss-/Abfluss-Prinzip. Ersetzt keine steuerliche
              Beratung – die finale EÜR erstellt dein Steuerberater.
            </p>
          </>
        )}

        <div style={{ height: 30 }} />
      </div>
    </div>
  );
}

function GrosseKarte({ label, wert, farbe, gross }: { label: string; wert: string; farbe: string; gross?: boolean }) {
  return (
    <div
      style={{
        background: C.navy2,
        border: `1px solid ${gross ? farbe + "55" : C.border}`,
        borderRadius: 14,
        padding: "20px 20px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: farbe }} />
      <div style={{ color: C.textDim, fontSize: 13, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-dm-sans), sans-serif", fontSize: gross ? 30 : 26, fontWeight: 800, color: farbe }}>
        {wert}
      </div>
    </div>
  );
}

function MiniKarte({ label, wert, farbe }: { label: string; wert: string; farbe: string }) {
  return (
    <div style={{ background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ color: C.textDim, fontSize: 12.5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 20, fontWeight: 700, color: farbe }}>{wert}</div>
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

const labelStyle: React.CSSProperties = {
  display: "block",
  color: C.textDim,
  fontSize: 13,
  fontWeight: 600,
  margin: "0 0 6px",
};

const inputStyle: React.CSSProperties = {
  background: C.navy2,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "10px 14px",
  color: "#fff",
  fontSize: 14,
  fontFamily: "'DM Sans', sans-serif",
  outline: "none",
};
