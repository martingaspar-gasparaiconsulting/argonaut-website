"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import FinanzTabs from "../_components/FinanzTabs";
import KiKlartext from "../../_components/KiKlartext";

// ============================================================
// ARGONAUT OS · BLOCK D (Finanzen) · D-6 — KENNZAHLEN
// /dashboard/finanzen/kennzahlen
// Oben: 3 automatische KPIs (aus echten EÜR-Daten) + KI-Auge.
// Unten: 4 Live-Rechner (Deckungsbeitrag, Break-Even, Sicherheitsmarge, ROI).
// Einnahmen/Ausgaben/Gewinn werden EXAKT wie in der Übersicht gerechnet.
// Andock-Naht für spätere "Szenario speichern"-Funktion (Schritt B) ist gesetzt.
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
type Rechnung = { id: string; netto_summe: number; brutto_summe: number };
type Ausgabe = { betrag_brutto: number; mwst_satz: number; ausgabedatum: string };

// --- Formatter -------------------------------------------------------------
function eur(n: number | null | undefined): string {
  const v = typeof n === "number" && isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
  } catch {
    return `${v.toFixed(2)} €`;
  }
}
function pct(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return `${n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function jahrVon(d: string): number | null {
  if (!d) return null;
  const j = Number(d.split("-")[0]);
  return isNaN(j) ? null : j;
}
// Eingabe (deutsches Komma erlaubt) -> Zahl
function num(v: string): number {
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

export default function FinanzKennzahlen() {
  const router = useRouter();
  const jahr = new Date().getFullYear();
  const monateBisher = new Date().getMonth() + 1; // Jan=1 … aktueller Monat

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
          supabase.from("rechnungen").select("id,netto_summe,brutto_summe"),
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

  // --- Einnahmen / Ausgaben / Gewinn — EXAKT wie in der Übersicht ----------
  const basis = useMemo(() => {
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

    const umsatz = r2(einnahmenNetto);
    const kosten = r2(ausgabenNetto);
    const gewinn = r2(einnahmenNetto - ausgabenNetto);
    return { umsatz, kosten, gewinn };
  }, [zahlungen, rechnungen, ausgaben, jahr]);

  // --- Automatische Kennzahlen ---------------------------------------------
  const umsatzrendite = basis.umsatz > 0 ? r2((basis.gewinn / basis.umsatz) * 100) : null;
  const kostenquote = basis.umsatz > 0 ? r2((basis.kosten / basis.umsatz) * 100) : null;
  const monatsgewinn = r2(basis.gewinn / (monateBisher || 1));
  const hatDaten = basis.umsatz > 0 || basis.kosten > 0;

  // --- KI-Kontext ----------------------------------------------------------
  const kiKontext = useMemo(() => {
    if (!hatDaten) return "Es sind noch keine Einnahmen oder Ausgaben für dieses Jahr erfasst.";
    return (
      `Geschäftsjahr ${jahr}: Umsatz (netto) ${eur(basis.umsatz)}, Ausgaben ${eur(basis.kosten)}, ` +
      `Gewinn ${eur(basis.gewinn)}. Umsatzrendite ${pct(umsatzrendite)}, Kostenquote ${pct(kostenquote)}, ` +
      `durchschnittlicher Monatsgewinn ${eur(monatsgewinn)} (über ${monateBisher} Monate). ` +
      `Bewerte kurz, ob das gesund ist, und gib einen konkreten Hinweis.`
    );
  }, [hatDaten, jahr, basis, umsatzrendite, kostenquote, monatsgewinn, monateBisher]);

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
            📐 Kennzahlen
          </h1>
          <p style={{ color: C.textDim, margin: "6px 0 0", fontSize: 15 }}>
            Deine Zahlen automatisch bewertet – plus Rechner für die wichtigsten kaufmännischen Formeln
          </p>
        </div>

        {laden ? (
          <div style={{ color: C.textDim, padding: "40px 0", textAlign: "center" }}>
            ARGONAUT lädt die Kennzahlen…
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
            {/* AUTOMATISCHE KENNZAHLEN */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
                marginBottom: 20,
              }}
            >
              <KpiCard
                label="Umsatzrendite"
                wert={pct(umsatzrendite)}
                farbe={C.gold}
                unter="Was von jedem Euro Umsatz übrig bleibt"
              />
              <KpiCard
                label="Kostenquote"
                wert={pct(kostenquote)}
                farbe={C.warn}
                unter="Anteil der Ausgaben am Umsatz"
              />
              <KpiCard
                label="Ø Monatsgewinn"
                wert={eur(monatsgewinn)}
                farbe={basis.gewinn >= 0 ? C.green : C.danger}
                unter={`Schnitt über ${monateBisher} Monate`}
              />
            </div>

            {/* KI-AUGE */}
            {hatDaten && (
              <div style={{ marginBottom: 28 }}>
                <KiKlartext kontext={kiKontext} modul="Finanzen · Kennzahlen" akzent={C.gold} dunkel />
              </div>
            )}

            {/* RECHNER */}
            <div style={{ ...sektionLabel, marginBottom: 14 }}>Rechner</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 16,
              }}
            >
              <Rechner
                typ="deckungsbeitrag"
                titel="Deckungsbeitrag"
                unterzeile="Was pro Stück nach den variablen Kosten übrig bleibt"
                farbe={C.cyan}
                felder={[
                  { key: "preis", label: "Verkaufspreis pro Stück", suffix: "€", placeholder: "z. B. 50" },
                  { key: "vk", label: "Variable Kosten pro Stück", suffix: "€", placeholder: "z. B. 30" },
                ]}
                berechne={(w) => {
                  const db = r2(w.preis - w.vk);
                  const quote = w.preis > 0 ? r2((db / w.preis) * 100) : null;
                  const leer = w.preis === 0 && w.vk === 0;
                  return {
                    ergebnisse: [
                      { label: "Deckungsbeitrag / Stück", wert: eur(db), gross: true },
                      { label: "Deckungsbeitrags-Quote", wert: pct(quote) },
                    ],
                    klartext: leer
                      ? "Gib Verkaufspreis und variable Kosten pro Stück ein."
                      : db > 0
                      ? `Pro verkaufter Einheit bleiben ${eur(db)} übrig, um Fixkosten zu decken und Gewinn zu machen (${pct(quote)} vom Preis).`
                      : db < 0
                      ? `Achtung: Du machst pro Stück ${eur(db)} Verlust – der Preis liegt unter den variablen Kosten.`
                      : "Der Preis deckt genau die variablen Kosten – es bleibt nichts für die Fixkosten übrig.",
                  };
                }}
              />

              <Rechner
                typ="break_even"
                titel="Break-Even (Gewinnschwelle)"
                unterzeile="Ab wie vielen Verkäufen du in die Gewinnzone kommst"
                farbe={C.green}
                felder={[
                  { key: "fix", label: "Fixkosten (pro Monat)", suffix: "€", placeholder: "z. B. 4000" },
                  { key: "preis", label: "Verkaufspreis pro Stück", suffix: "€", placeholder: "z. B. 50" },
                  { key: "vk", label: "Variable Kosten pro Stück", suffix: "€", placeholder: "z. B. 30" },
                ]}
                berechne={(w) => {
                  const db = r2(w.preis - w.vk);
                  const machbar = db > 0 && w.fix > 0;
                  const menge = machbar ? Math.ceil(w.fix / db) : null;
                  const umsatz = menge != null ? r2(menge * w.preis) : null;
                  return {
                    ergebnisse: [
                      { label: "Deckungsbeitrag / Stück", wert: eur(db) },
                      { label: "Break-Even-Menge", wert: menge != null ? `${menge} Stück` : "—", gross: true },
                      { label: "Break-Even-Umsatz", wert: umsatz != null ? eur(umsatz) : "—" },
                    ],
                    klartext:
                      w.fix === 0 && w.preis === 0
                        ? "Gib Fixkosten, Verkaufspreis und variable Kosten ein."
                        : !machbar
                        ? "Mit diesem Preis ist kein Break-Even möglich – der Deckungsbeitrag pro Stück ist 0 oder negativ."
                        : `Ab ${menge} verkauften Einheiten (${eur(umsatz)} Umsatz) deckst du deine Fixkosten. Jede weitere Einheit ist Gewinn.`,
                  };
                }}
              />

              <Rechner
                typ="sicherheitsmarge"
                titel="Sicherheitsmarge"
                unterzeile="Wie weit dein Umsatz sinken darf, bevor es kritisch wird"
                farbe={C.lila}
                felder={[
                  { key: "ist", label: "Aktueller Umsatz", suffix: "€", placeholder: "z. B. 100000" },
                  { key: "be", label: "Break-Even-Umsatz", suffix: "€", placeholder: "z. B. 80000" },
                ]}
                berechne={(w) => {
                  const marge = w.ist > 0 ? r2(((w.ist - w.be) / w.ist) * 100) : null;
                  const puffer = r2(w.ist - w.be);
                  const leer = w.ist === 0 && w.be === 0;
                  return {
                    ergebnisse: [
                      { label: "Sicherheitsmarge", wert: pct(marge), gross: true },
                      { label: "Puffer in Euro", wert: eur(puffer) },
                    ],
                    klartext: leer
                      ? "Gib deinen aktuellen Umsatz und den Break-Even-Umsatz ein."
                      : marge != null && marge >= 0
                      ? `Dein Umsatz darf um ${pct(marge)} (${eur(puffer)}) sinken, bevor du in die Verlustzone kommst.`
                      : `Achtung: Du liegst unter dem Break-Even – aktuell entsteht Verlust.`,
                  };
                }}
              />

              <Rechner
                typ="roi"
                titel="ROI (Kapitalrendite)"
                unterzeile="Wie gut sich eine Investition rechnet"
                farbe={C.gold}
                felder={[
                  { key: "gewinn", label: "Gewinn aus der Investition", suffix: "€", placeholder: "z. B. 5000" },
                  { key: "kapital", label: "Eingesetztes Kapital", suffix: "€", placeholder: "z. B. 25000" },
                ]}
                berechne={(w) => {
                  const roi = w.kapital > 0 ? r2((w.gewinn / w.kapital) * 100) : null;
                  const leer = w.gewinn === 0 && w.kapital === 0;
                  return {
                    ergebnisse: [{ label: "ROI", wert: pct(roi), gross: true }],
                    klartext: leer
                      ? "Gib den Gewinn und das eingesetzte Kapital ein."
                      : roi != null && roi >= 0
                      ? `Jeder investierte Euro bringt ${pct(roi)} Rendite. Aus ${eur(w.kapital)} werden ${eur(w.kapital + w.gewinn)}.`
                      : `Die Investition ist aktuell im Minus (${pct(roi)}).`,
                  };
                }}
              />
            </div>

            <p style={{ color: C.textDim, fontSize: 12, marginTop: 24, lineHeight: 1.5 }}>
              Die oberen Kennzahlen kommen automatisch aus deinen echten Einnahmen und Ausgaben ({jahr},
              netto). Die Rechner sind Werkzeuge zum Durchspielen – Liquiditätsgrade und Eigenkapitalquote
              folgen später, sobald Bilanz-/Kontodaten angebunden sind.
            </p>
          </>
        )}

        <div style={{ height: 30 }} />
      </div>
    </div>
  );
}

// --- automatische KPI-Kachel ----------------------------------------------
function KpiCard({
  label,
  wert,
  farbe,
  unter,
}: {
  label: string;
  wert: string;
  farbe: string;
  unter?: string;
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
      {unter && <div style={{ color: C.textDim, fontSize: 12, marginTop: 4 }}>{unter}</div>}
    </div>
  );
}

// --- generischer Live-Rechner ---------------------------------------------
type Feld = { key: string; label: string; suffix?: string; placeholder?: string };
type RechnerErgebnis = { ergebnisse: { label: string; wert: string; gross?: boolean }[]; klartext: string };

// #B Gespeichertes Szenario
type Szenario = {
  id: string;
  typ: string;
  name: string;
  eingaben: Record<string, string>;
  ergebnis: { ergebnisse?: { label: string; wert: string; gross?: boolean }[] } | null;
  created_at: string;
};

function zusammenfassung(s: Szenario): string {
  const arr = s?.ergebnis?.ergebnisse;
  if (!arr || !arr.length) return "";
  const g = arr.find((e) => e.gross) || arr[0];
  return `${g.label}: ${g.wert}`;
}

function Rechner({
  typ,
  titel,
  unterzeile,
  farbe,
  felder,
  berechne,
}: {
  typ: string;
  titel: string;
  unterzeile: string;
  farbe: string;
  felder: Feld[];
  berechne: (werte: Record<string, number>) => RechnerErgebnis;
}) {
  const [werte, setWerte] = useState<Record<string, string>>({});

  // #B Speichern-Zustand
  const [name, setName] = useState("");
  const [gespeichert, setGespeichert] = useState<Szenario[]>([]);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const zahlen: Record<string, number> = {};
  felder.forEach((f) => (zahlen[f.key] = num(werte[f.key] || "")));
  const { ergebnisse, klartext } = berechne(zahlen);

  async function ladeSzenarien() {
    const { data } = await supabase
      .from("finanz_szenarien")
      .select("id,typ,name,eingaben,ergebnis,created_at")
      .eq("typ", typ)
      .order("created_at", { ascending: false });
    setGespeichert((data as Szenario[]) || []);
  }

  useEffect(() => {
    ladeSzenarien();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function speichern() {
    if (saveBusy) return;
    if (!name.trim()) {
      setSaveMsg({ text: "Bitte einen Namen vergeben.", ok: false });
      return;
    }
    const hatEingabe = felder.some((f) => (werte[f.key] || "").trim() !== "");
    if (!hatEingabe) {
      setSaveMsg({ text: "Bitte zuerst Werte eingeben.", ok: false });
      return;
    }
    setSaveBusy(true);
    setSaveMsg(null);
    const { error } = await supabase.from("finanz_szenarien").insert({
      typ,
      name: name.trim(),
      eingaben: werte,
      ergebnis: { ergebnisse },
      // owner_user_id wird per DB-Default (auth.uid()) gesetzt
    });
    if (error) {
      setSaveMsg({ text: "Speichern fehlgeschlagen: " + error.message, ok: false });
      setSaveBusy(false);
      return;
    }
    setName("");
    setSaveMsg({ text: "Szenario gespeichert.", ok: true });
    await ladeSzenarien();
    setSaveBusy(false);
  }

  function ladenIns(s: Szenario) {
    setWerte(s.eingaben || {});
    setSaveMsg({ text: `„${s.name}" geladen.`, ok: true });
  }

  async function loeschen(id: string) {
    await supabase.from("finanz_szenarien").delete().eq("id", id);
    await ladeSzenarien();
  }

  return (
    <div
      style={{
        background: C.navy2,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "20px 22px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: farbe }} />
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{titel}</div>
      <div style={{ color: C.textDim, fontSize: 13, marginBottom: 16 }}>{unterzeile}</div>

      {/* Eingaben */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
        {felder.map((f) => (
          <div key={f.key}>
            <label style={{ display: "block", color: C.textDim, fontSize: 12.5, marginBottom: 5 }}>{f.label}</label>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                inputMode="decimal"
                value={werte[f.key] || ""}
                placeholder={f.placeholder}
                onChange={(e) => setWerte((prev) => ({ ...prev, [f.key]: e.target.value }))}
                style={{
                  width: "100%",
                  background: C.navy,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: "10px 34px 10px 12px",
                  color: "#fff",
                  fontSize: 14,
                  fontFamily: "'DM Sans', sans-serif",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {f.suffix && (
                <span
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: C.textDim,
                    fontSize: 13,
                    pointerEvents: "none",
                  }}
                >
                  {f.suffix}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Ergebnisse */}
      <div
        style={{
          background: C.navy,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {ergebnisse.map((e, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <span style={{ color: e.gross ? "#fff" : C.textDim, fontSize: e.gross ? 14 : 13, fontWeight: e.gross ? 700 : 400 }}>
              {e.label}
            </span>
            <span
              style={{
                fontFamily: "'Syne', sans-serif",
                color: e.gross ? farbe : "#fff",
                fontSize: e.gross ? 20 : 15,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {e.wert}
            </span>
          </div>
        ))}
      </div>

      <p style={{ color: C.textDim, fontSize: 12.5, margin: "12px 2px 0", lineHeight: 1.5 }}>{klartext}</p>

      {/* #B Speichern */}
      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 16, paddingTop: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            value={name}
            placeholder="Name, z. B. „Angebot Müller"
            onChange={(e) => setName(e.target.value)}
            style={{
              flex: 1,
              minWidth: 140,
              background: C.navy,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "9px 12px",
              color: "#fff",
              fontSize: 13.5,
              fontFamily: "'DM Sans', sans-serif",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={speichern}
            disabled={saveBusy}
            style={{
              background: farbe,
              color: C.navy,
              border: "none",
              borderRadius: 10,
              padding: "9px 16px",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: saveBusy ? "wait" : "pointer",
              fontFamily: "'DM Sans', sans-serif",
              opacity: saveBusy ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {saveBusy ? "…" : "💾 Speichern"}
          </button>
        </div>

        {saveMsg && (
          <div style={{ marginTop: 8, fontSize: 12.5, color: saveMsg.ok ? C.green : C.danger }}>
            {saveMsg.ok ? "✓ " : "⚠️ "}
            {saveMsg.text}
          </div>
        )}

        {gespeichert.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {gespeichert.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: C.navy,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: "9px 12px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: "#fff",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {s.name}
                  </div>
                  <div style={{ fontSize: 12, color: C.textDim }}>{zusammenfassung(s)}</div>
                </div>
                <button
                  onClick={() => ladenIns(s)}
                  title="Werte in den Rechner laden"
                  style={{
                    background: "transparent",
                    color: farbe,
                    border: `1px solid ${farbe}77`,
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    whiteSpace: "nowrap",
                  }}
                >
                  Laden
                </button>
                <button
                  onClick={() => loeschen(s.id)}
                  title="Szenario löschen"
                  style={{
                    background: "transparent",
                    color: C.textDim,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: "6px 10px",
                    fontSize: 12.5,
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
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
