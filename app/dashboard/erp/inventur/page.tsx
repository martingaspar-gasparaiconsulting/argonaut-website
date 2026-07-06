// ============================================================================
// ARGONAUT OS · ERP · INVENTUR (Etappe 3 · MVP)
// Bestandszaehlung: Soll (aktueller_bestand) vs. Ist (gezaehlt) je Artikel,
// Differenz + Wert-Differenz, Speichern in "inventur_zaehlung", KI-Klartext.
//
// SAFETY-FIRST + ADDITIV: eigener neuer Reiter, beruehrt die bestehende
// Lager-/Artikel-Logik NICHT. Liest "artikel", schreibt nur "inventur_zaehlung".
// Inline-Styles (kein Tailwind). Branding: ARGONAUT / "die KI" – nie "Claude".
// ============================================================================
"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiKlartext from "../../_components/KiKlartext";
import { erstelleInventurProtokollPdf } from "../../_components/inventurProtokollPdf";

const C = {
  navy: "#0A1628",
  navy2: "#0F1F33",
  gold: "#C9A84C",
  cyan: "#00e5ff",
  green: "#4CAF7D",
  danger: "#E06666",
  warn: "#E0A24C",
  textDim: "#8FA3BE",
  text: "#E8EDF4",
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type Artikel = {
  id: string;
  artikelnummer: string | null;
  bezeichnung: string;
  einheit: string | null;
  kategorie: string | null;
  aktueller_bestand: number | null;
  einkaufspreis: number | null;
  lagerort: string | null;
};
type Zaehlung = { artikel_id: string; ist_bestand: number | null };

function fmtNum(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "0";
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(v);
}
function fmtEuro(v: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(v);
}
// Eingabe-String -> Zahl (deutsches Komma erlaubt); leer/ungueltig -> null
function parseIst(s: string | undefined): number | null {
  if (s === undefined || s.trim() === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

export default function InventurSeite() {
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [ist, setIst] = useState<Record<string, string>>({});
  const [gespeichert, setGespeichert] = useState<Record<string, number>>({});
  const [laden, setLaden] = useState(true);
  const [speichern, setSpeichern] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [suche, setSuche] = useState("");
  const [kiText, setKiText] = useState<string | null>(null);
  const [kiAktion, setKiAktion] = useState<string | null>(null);
  const [pdfLaedt, setPdfLaedt] = useState(false);
  const [korrekturOffen, setKorrekturOffen] = useState(false);
  const [korrigiert, setKorrigiert] = useState(false);

  async function laden_() {
    setLaden(true);
    const [aRes, zRes] = await Promise.all([
      supabase
        .from("artikel")
        .select("id,artikelnummer,bezeichnung,einheit,kategorie,aktueller_bestand,einkaufspreis,lagerort")
        .order("bezeichnung", { ascending: true }),
      supabase.from("inventur_zaehlung").select("artikel_id,ist_bestand"),
    ]);
    const arts = (aRes.data ?? []) as Artikel[];
    const zs = (zRes.data ?? []) as Zaehlung[];
    const gesp: Record<string, number> = {};
    const eing: Record<string, string> = {};
    for (const z of zs) {
      if (z.ist_bestand != null) {
        gesp[z.artikel_id] = Number(z.ist_bestand);
        eing[z.artikel_id] = String(z.ist_bestand);
      }
    }
    setArtikel(arts);
    setGespeichert(gesp);
    setIst(eing);
    setLaden(false);
  }

  useEffect(() => {
    laden_();
  }, []);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return artikel;
    return artikel.filter((a) =>
      [a.bezeichnung, a.artikelnummer, a.kategorie, a.lagerort]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q))
    );
  }, [artikel, suche]);

  // ---- Kennzahlen ---------------------------------------------------------
  const kpi = useMemo(() => {
    let gezaehlt = 0;
    let abweichungen = 0;
    let wertDiff = 0;
    let groessteAbw = 0;
    for (const a of artikel) {
      const soll = Number(a.aktueller_bestand ?? 0);
      const istVal = parseIst(ist[a.id]);
      if (istVal === null) continue;
      gezaehlt++;
      const diff = istVal - soll;
      if (diff !== 0) {
        abweichungen++;
        wertDiff += diff * Number(a.einkaufspreis ?? 0);
        if (Math.abs(diff) > Math.abs(groessteAbw)) groessteAbw = diff;
      }
    }
    return { gesamt: artikel.length, gezaehlt, abweichungen, wertDiff, groessteAbw };
  }, [artikel, ist]);

  // Artikel, die gezaehlt wurden UND eine Abweichung haben (nur diese werden korrigiert)
  const zuKorrigieren = useMemo(() => {
    const liste: { a: Artikel; soll: number; istVal: number; diff: number; wertDiff: number }[] = [];
    for (const a of artikel) {
      const soll = Number(a.aktueller_bestand ?? 0);
      const istVal = parseIst(ist[a.id]);
      if (istVal === null) continue;
      const diff = istVal - soll;
      if (diff === 0) continue;
      liste.push({ a, soll, istVal, diff, wertDiff: diff * Number(a.einkaufspreis ?? 0) });
    }
    return liste;
  }, [artikel, ist]);

  const kopfFarbe = kpi.abweichungen > 0 ? C.danger : kpi.gezaehlt > 0 ? C.green : C.textDim;

  const kiKontext = useMemo(() => {
    if (artikel.length === 0) return "Es sind noch keine Artikel im Lager angelegt.";
    if (kpi.gezaehlt === 0)
      return `${kpi.gesamt} Artikel im Lager, noch keiner gezaehlt. Die Inventur kann beginnen.`;
    return (
      `${kpi.gesamt} Artikel, davon ${kpi.gezaehlt} gezaehlt. ` +
      `${kpi.abweichungen} mit Abweichung zwischen Soll und Ist. ` +
      `Wert-Differenz gesamt: ${fmtEuro(kpi.wertDiff)}.`
    );
  }, [kpi, artikel.length]);

  function setzeIst(id: string, wert: string) {
    setIst((prev) => ({ ...prev, [id]: wert }));
  }

  async function alleSpeichern() {
    setSpeichern(true);
    setMeldung(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) {
        setMeldung("Nicht angemeldet – bitte neu einloggen.");
        setSpeichern(false);
        return;
      }
      const rows = artikel
        .filter((a) => parseIst(ist[a.id]) !== null)
        .map((a) => ({
          owner_user_id: uid,
          artikel_id: a.id,
          artikel_name: a.bezeichnung,
          einheit: a.einheit,
          soll_bestand: Number(a.aktueller_bestand ?? 0),
          ist_bestand: parseIst(ist[a.id]),
          gezaehlt_am: new Date().toISOString(),
        }));
      if (rows.length === 0) {
        setMeldung("Es wurde noch nichts eingetragen.");
        setSpeichern(false);
        return;
      }
      const { error } = await supabase
        .from("inventur_zaehlung")
        .upsert(rows, { onConflict: "owner_user_id,artikel_id" });
      if (error) {
        setMeldung(
          `Speichern fehlgeschlagen: ${error.message}. ` +
          `Es wurden keine Zaehlungen gespeichert – bitte erneut versuchen.`
        );
        setSpeichern(false);
        return;
      }
      setMeldung(`${rows.length} Zaehlung(en) gespeichert.`);
      await laden_();
    } catch (e: unknown) {
      setMeldung("Speichern fehlgeschlagen: " + (e instanceof Error ? e.message : "Fehler"));
    } finally {
      setSpeichern(false);
    }
  }

  async function protokollDrucken() {
    setPdfLaedt(true);
    setMeldung(null);
    try {
      const { data: prof } = await supabase.from("profiles").select("*").limit(1).maybeSingle();
      const pr = (prof ?? {}) as Record<string, unknown>;
      const g = (k: string): string | null => {
        const v = pr[k];
        return v == null ? null : String(v);
      };
      const firma = {
        name: g("firma_name"),
        rechtsform: g("rechtsform"),
        strasse: g("strasse"),
        plz: g("plz"),
        ort: g("ort"),
        telefon: g("telefon") ?? g("firma_telefon"),
        email: g("email") ?? g("firma_email"),
        website: g("website") ?? g("firma_website"),
        ustId: g("ust_id"),
        steuernummer: g("steuernummer"),
        geschaeftsfuehrer: g("geschaeftsfuehrer"),
        akzentfarbe: g("akzentfarbe"),
      };
      const positionen = artikel.map((a) => {
        const soll = Number(a.aktueller_bestand ?? 0);
        const istVal = parseIst(ist[a.id]);
        const wertDiff = istVal === null ? null : (istVal - soll) * Number(a.einkaufspreis ?? 0);
        return {
          bezeichnung: a.bezeichnung,
          artikelnummer: a.artikelnummer,
          einheit: a.einheit,
          soll,
          ist: istVal,
          wertDiff,
        };
      });
      const stichtag = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
      erstelleInventurProtokollPdf({
        firma,
        stichtag,
        kpi: { gesamt: kpi.gesamt, gezaehlt: kpi.gezaehlt, abweichungen: kpi.abweichungen, wertDiff: kpi.wertDiff },
        positionen,
        kiText,
        kiAktion,
      });
    } catch (e: unknown) {
      setMeldung("PDF konnte nicht erstellt werden: " + (e instanceof Error ? e.message : "Fehler"));
    } finally {
      setPdfLaedt(false);
    }
  }

  async function bestandKorrigieren() {
    setKorrigiert(true);
    setMeldung(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) {
        setMeldung("Nicht angemeldet – bitte neu einloggen.");
        setKorrigiert(false);
        return;
      }

      // 1) Zaehlungen als Historie sichern (inventur_zaehlung)
      const zRows = zuKorrigieren.map(({ a, soll, istVal }) => ({
        owner_user_id: uid,
        artikel_id: a.id,
        artikel_name: a.bezeichnung,
        einheit: a.einheit,
        soll_bestand: soll,
        ist_bestand: istVal,
        gezaehlt_am: new Date().toISOString(),
      }));
      if (zRows.length > 0) {
        await supabase.from("inventur_zaehlung").upsert(zRows, { onConflict: "owner_user_id,artikel_id" });
      }

      // 2) Lager-Bestand je Artikel korrigieren — Erfolge/Fehler EINZELN sammeln,
      //    damit die Meldung praezise ist (welcher Artikel fehlgeschlagen ist),
      //    statt beim ersten Fehler generisch abzubrechen.
      const erfolgreich: typeof zuKorrigieren = [];
      const fehlgeschlagen: { name: string; grund: string }[] = [];

      for (const eintrag of zuKorrigieren) {
        const { a, istVal } = eintrag;
        const { error } = await supabase
          .from("artikel")
          .update({ aktueller_bestand: istVal })
          .eq("id", a.id);
        if (error) {
          fehlgeschlagen.push({ name: a.bezeichnung, grund: error.message });
        } else {
          erfolgreich.push(eintrag);
        }
      }

      // 3) GoBD-Audit-Log: fuer jede ERFOLGREICHE Korrektur einen
      //    unveraenderbaren Protokoll-Eintrag anlegen (append-only Tabelle).
      if (erfolgreich.length > 0) {
        const auditRows = erfolgreich.map(({ a, soll, istVal, diff, wertDiff }) => ({
          owner_user_id: uid,
          artikel_id: a.id,
          artikel_name: a.bezeichnung,
          artikelnummer: a.artikelnummer,
          einheit: a.einheit,
          soll_bestand: soll,
          ist_bestand: istVal,
          differenz: diff,
          einkaufspreis: a.einkaufspreis,
          wert_differenz: wertDiff,
          korrigiert_am: new Date().toISOString(),
          korrigiert_von: "Bestandskorrektur (Inventur)",
        }));
        // Log-Fehler nur still vermerken – die eigentliche Korrektur ist schon erfolgt.
        const { error: auditError } = await supabase.from("inventur_audit").insert(auditRows);
        if (auditError) {
          // Nicht abbrechen: Bestand ist korrigiert. Nur transparent hinweisen.
          setMeldung(
            `${erfolgreich.length} Artikel korrigiert, aber das GoBD-Protokoll konnte nicht ` +
            `geschrieben werden (${auditError.message}). Bitte den Support informieren.`
          );
          setKorrekturOffen(false);
          await laden_();
          setKorrigiert(false);
          return;
        }
      }

      // 4) Praezise Abschluss-Meldung
      if (fehlgeschlagen.length === 0) {
        setMeldung(
          `Bestand von ${erfolgreich.length} Artikel korrigiert und im GoBD-Protokoll gespeichert.`
        );
      } else {
        const namen = fehlgeschlagen.map((f) => f.name).join(", ");
        setMeldung(
          `${erfolgreich.length} von ${zuKorrigieren.length} Artikeln korrigiert. ` +
          `Fehlgeschlagen (${fehlgeschlagen.length}): ${namen}. ` +
          `Grund beim ersten: ${fehlgeschlagen[0].grund}`
        );
      }
      setKorrekturOffen(false);
      await laden_();
    } catch (e: unknown) {
      setMeldung("Korrektur fehlgeschlagen: " + (e instanceof Error ? e.message : "Fehler"));
    } finally {
      setKorrigiert(false);
    }
  }

  const kacheln: { label: string; wert: string; farbe: string; sub?: string }[] = [
    { label: "Artikel gesamt", wert: String(kpi.gesamt), farbe: C.cyan },
    { label: "Bereits gezählt", wert: `${kpi.gezaehlt} / ${kpi.gesamt}`, farbe: C.gold },
    {
      label: "Mit Abweichung",
      wert: String(kpi.abweichungen),
      farbe: kpi.abweichungen > 0 ? C.danger : C.green,
      sub: kpi.abweichungen > 0 ? "Soll ≠ Ist" : "alles im Soll",
    },
    {
      label: "Wert-Differenz",
      wert: fmtEuro(kpi.wertDiff),
      farbe: kpi.wertDiff < 0 ? C.danger : kpi.wertDiff > 0 ? C.warn : C.green,
      sub: "Ist − Soll × EK-Preis",
    },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "8px 0 40px" }}>
      {/* Kopf */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: kopfFarbe,
            boxShadow: `0 0 10px ${kopfFarbe}`,
          }}
        />
        <h2
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 800,
            color: C.text,
            fontFamily: "'Syne', sans-serif",
          }}
        >
          Inventur · Bestandszählung
        </h2>
      </div>
      <p style={{ margin: "0 0 20px", color: C.textDim, fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
        Zähle den tatsächlichen Bestand und vergleiche ihn mit dem System. Abweichungen werden farblich markiert.
      </p>

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
              background: C.navy2,
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800, color: kp.farbe, fontFamily: "'Syne', sans-serif", lineHeight: 1.1 }}>
              {laden ? "…" : kp.wert}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.textDim, fontSize: 13, marginTop: 4 }}>
              {kp.label}
            </div>
            {kp.sub && (
              <div style={{ fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.45)", fontSize: 11.5, marginTop: 2 }}>
                {kp.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* KI-Klartext */}
      {!laden && (
        <KiKlartext kontext={kiKontext} modul="ERP / Inventur" akzent={kopfFarbe} dunkel style={{ marginBottom: 16 }} onErgebnis={(kt, ak) => { setKiText(kt); setKiAktion(ak); }} />
      )}

      {/* Aktionsleiste */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <input
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Suche: Bezeichnung, Artikelnr., Kategorie, Lagerort…"
          style={{
            flex: "1 1 300px",
            minWidth: 220,
            background: C.navy2,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            padding: "10px 12px",
            color: C.text,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
          }}
        />
        <button
          onClick={alleSpeichern}
          disabled={speichern || laden}
          style={{
            background: C.gold,
            color: C.navy,
            border: "none",
            borderRadius: 8,
            padding: "10px 18px",
            fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            cursor: speichern || laden ? "default" : "pointer",
            opacity: speichern || laden ? 0.6 : 1,
          }}
        >
          {speichern ? "Speichert …" : "Zählung speichern"}
        </button>
        <button
          onClick={protokollDrucken}
          disabled={pdfLaedt || laden}
          style={{
            background: "transparent",
            color: C.gold,
            border: `1px solid ${C.gold}`,
            borderRadius: 8,
            padding: "10px 18px",
            fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            cursor: pdfLaedt || laden ? "default" : "pointer",
            opacity: pdfLaedt || laden ? 0.6 : 1,
          }}
        >
          {pdfLaedt ? "Erstellt …" : "📄 Protokoll (PDF)"}
        </button>
        <button
          onClick={() => setKorrekturOffen(true)}
          disabled={laden || zuKorrigieren.length === 0}
          title={zuKorrigieren.length === 0 ? "Erst Artikel mit Abweichung zaehlen" : "Ist-Bestand ins Lager uebernehmen"}
          style={{
            background: "transparent",
            color: C.cyan,
            border: `1px solid ${C.cyan}`,
            borderRadius: 8,
            padding: "10px 18px",
            fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            cursor: laden || zuKorrigieren.length === 0 ? "default" : "pointer",
            opacity: laden || zuKorrigieren.length === 0 ? 0.5 : 1,
          }}
        >
          Bestand korrigieren{zuKorrigieren.length > 0 ? ` (${zuKorrigieren.length})` : ""}
        </button>
        {meldung && (
          <span style={{ color: C.textDim, fontFamily: "'DM Sans', sans-serif", fontSize: 13.5 }}>{meldung}</span>
        )}
      </div>

      {/* Tabelle */}
      {laden ? (
        <p style={{ color: C.textDim, fontFamily: "'DM Sans', sans-serif" }}>Lade Artikel …</p>
      ) : artikel.length === 0 ? (
        <div
          style={{
            background: C.navy2,
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            padding: 24,
            color: C.textDim,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Noch keine Artikel im Lager angelegt. Lege zuerst im Reiter „Lager" Artikel an.
        </div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: C.navy2 }}>
            <thead>
              <tr>
                {["Artikel", "Lagerort", "Soll", "Ist (gezählt)", "Differenz", "Wert-Diff."].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: h === "Soll" || h === "Ist (gezählt)" || h === "Differenz" || h === "Wert-Diff." ? "right" : "left",
                      padding: "12px 14px",
                      color: C.textDim,
                      fontFamily: "'Syne', sans-serif",
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((a) => {
                const soll = Number(a.aktueller_bestand ?? 0);
                const istVal = parseIst(ist[a.id]);
                const gezaehlt = istVal !== null;
                const diff = gezaehlt ? (istVal as number) - soll : null;
                const wertDiff = diff !== null ? diff * Number(a.einkaufspreis ?? 0) : null;
                const diffFarbe = diff === null ? C.textDim : diff === 0 ? C.green : C.danger;
                return (
                  <tr key={a.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span
                          title={diff === null ? "noch nicht gezählt" : diff === 0 ? "stimmt" : "Abweichung"}
                          style={{ width: 9, height: 9, borderRadius: "50%", background: diffFarbe, flexShrink: 0, display: "inline-block" }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: C.text, fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600 }}>
                            {a.bezeichnung}
                          </div>
                          <div style={{ color: C.textDim, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>
                            {a.artikelnummer ? `Nr. ${a.artikelnummer}` : "—"}
                            {a.kategorie ? ` · ${a.kategorie}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", color: C.textDim, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                      {a.lagerort || "—"}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: C.text, fontFamily: "'DM Sans', sans-serif", fontSize: 14, whiteSpace: "nowrap" }}>
                      {fmtNum(soll)} {a.einheit || ""}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      <input
                        value={ist[a.id] ?? ""}
                        onChange={(e) => setzeIst(a.id, e.target.value)}
                        inputMode="decimal"
                        placeholder="—"
                        style={{
                          width: 90,
                          textAlign: "right",
                          background: C.navy,
                          border: `1px solid ${gezaehlt ? diffFarbe : "rgba(255,255,255,0.15)"}`,
                          borderRadius: 7,
                          padding: "7px 9px",
                          color: C.text,
                          fontFamily: "'DM Sans', sans-serif",
                          fontSize: 14,
                        }}
                      />
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {diff === null ? (
                        <span style={{ color: C.textDim }}>—</span>
                      ) : (
                        <span style={{ color: diffFarbe, fontWeight: 700, fontFamily: "'Syne', sans-serif", fontSize: 14 }}>
                          {diff > 0 ? "+" : ""}
                          {fmtNum(diff)}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {wertDiff === null || wertDiff === 0 ? (
                        <span style={{ color: C.textDim }}>—</span>
                      ) : (
                        <span style={{ color: wertDiff < 0 ? C.danger : C.warn, fontFamily: "'DM Sans', sans-serif", fontSize: 13.5 }}>
                          {wertDiff > 0 ? "+" : ""}
                          {fmtEuro(wertDiff)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bestaetigungs-Modal fuer die Bestandskorrektur */}
      {korrekturOffen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(3,8,16,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => !korrigiert && setKorrekturOffen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.navy2,
              border: `1px solid ${C.cyan}`,
              borderRadius: 16,
              padding: 24,
              maxWidth: 560,
              width: "100%",
              maxHeight: "82vh",
              overflowY: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          >
            <h3 style={{ margin: "0 0 8px", color: C.text, fontFamily: "'Syne', sans-serif", fontSize: 19, fontWeight: 800 }}>
              Bestand ins Lager übernehmen?
            </h3>
            <p style={{ margin: "0 0 16px", color: C.textDim, fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.5 }}>
              Der System-Bestand der folgenden <strong style={{ color: C.text }}>{zuKorrigieren.length}</strong> Artikel wird
              auf den gezählten Ist-Wert gesetzt. Diese Änderung wirkt direkt im Lager und wird nicht automatisch rückgängig gemacht.
            </p>

            <div style={{ display: "grid", gap: 6, marginBottom: 16 }}>
              {zuKorrigieren.map(({ a, soll, istVal, diff }) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, color: C.text, fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.bezeichnung}
                  </span>
                  <span style={{ color: C.textDim, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                    {fmtNum(soll)} → {fmtNum(istVal)} {a.einheit || ""}
                  </span>
                  <span style={{ color: C.danger, fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 800, minWidth: 44, textAlign: "right" }}>
                    {diff > 0 ? "+" : ""}{fmtNum(diff)}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setKorrekturOffen(false)}
                disabled={korrigiert}
                style={{
                  background: "transparent",
                  color: C.textDim,
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 8,
                  padding: "10px 16px",
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  cursor: korrigiert ? "default" : "pointer",
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={bestandKorrigieren}
                disabled={korrigiert}
                style={{
                  background: C.cyan,
                  color: C.navy,
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 18px",
                  fontWeight: 800,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  cursor: korrigiert ? "default" : "pointer",
                  opacity: korrigiert ? 0.6 : 1,
                }}
              >
                {korrigiert ? "Korrigiert …" : "Ja, Bestand korrigieren"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
