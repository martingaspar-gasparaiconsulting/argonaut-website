"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · R4 — Rechnungs-Detailseite
// Positionen-Editor (Live-Summen), Zahlungsstatus-Workflow,
// Daten (Rechnungs-/Leistungs-/Faelligkeitsdatum), §19-Kleinunternehmer.
// Route: /dashboard/rechnungen/[id]
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

type StatusKey = "offen" | "teilbezahlt" | "bezahlt" | "ueberfaellig" | "storniert";

const STATUS: Record<StatusKey, { label: string; farbe: string; icon: string }> = {
  offen: { label: "Offen", farbe: C.cyan, icon: "📨" },
  teilbezahlt: { label: "Teilbezahlt", farbe: C.lila, icon: "◐" },
  bezahlt: { label: "Bezahlt", farbe: C.green, icon: "✅" },
  ueberfaellig: { label: "Überfällig", farbe: C.danger, icon: "⏰" },
  storniert: { label: "Storniert", farbe: C.textDim, icon: "⚪" },
};

const EINHEITEN = ["Stk", "Std", "Tag", "m", "m²", "m³", "kg", "t", "lfm", "Psch"];

type Zeile = {
  id: string;
  bezeichnung: string;
  menge: string;
  einheit: string;
  einzelpreis: string;
  mwst_satz: string;
};

function parseZahl(s: string): number {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function ladeStr(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return String(n).replace(".", ",");
}
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function geld(n: number | null | undefined, waehrung = "EUR"): string {
  const wert = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: waehrung || "EUR",
  }).format(wert);
}
function datumDe(d: string | null | undefined): string {
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
function kontaktName(k: any): string {
  return (
    k?.anzeigename ||
    [k?.vorname, k?.nachname].filter(Boolean).join(" ").trim() ||
    k?.name ||
    k?.email ||
    "Kontakt"
  );
}
function firmaName(f: any): string {
  return f?.name || f?.firmenname || f?.firma || "Firma";
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

export default function RechnungDetail() {
  const router = useRouter();
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [nichtGefunden, setNichtGefunden] = useState(false);

  const [rechnung, setRechnung] = useState<any>(null);
  const [kontakt, setKontakt] = useState<any>(null);
  const [firma, setFirma] = useState<any>(null);

  const [titel, setTitel] = useState("");
  const [status, setStatus] = useState<StatusKey>("offen");
  const [rechnungsdatum, setRechnungsdatum] = useState<string>("");
  const [leistungsdatum, setLeistungsdatum] = useState<string>("");
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState<string>("");
  const [zahlungszielTage, setZahlungszielTage] = useState<string>("14");
  const [waehrung, setWaehrung] = useState("EUR");
  const [notizen, setNotizen] = useState("");
  const [kleinunternehmer, setKleinunternehmer] = useState(false);
  const [bezahltAm, setBezahltAm] = useState<string>("");
  const [bezahlterBetrag, setBezahlterBetrag] = useState<string>("");

  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [geladeneIds, setGeladeneIds] = useState<string[]>([]);

  const [dirty, setDirty] = useState(false);
  const [speichern, setSpeichern] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);
  const [pdfLaedt, setPdfLaedt] = useState(false);

  // Bezahlte Rechnungen sind schreibgeschützt (Storno+Neu ist der korrekte Weg)
  const gesperrt = status === "bezahlt" || status === "storniert";

  async function laden() {
    setLoading(true);
    setFehler(null);

    const [rRes, pRes] = await Promise.all([
      supabase.from("rechnungen").select("*").eq("id", id).single(),
      supabase
        .from("rechnung_positionen")
        .select("*")
        .eq("rechnung_id", id)
        .order("position", { ascending: true }),
    ]);

    if (rRes.error || !rRes.data) {
      setNichtGefunden(true);
      setLoading(false);
      return;
    }

    const r = rRes.data as any;
    setRechnung(r);
    setTitel(r.titel || "");
    setStatus((r.zahlungsstatus as StatusKey) || "offen");
    setRechnungsdatum(r.rechnungsdatum || "");
    setLeistungsdatum(r.leistungsdatum || "");
    setFaelligkeitsdatum(r.faelligkeitsdatum || "");
    setZahlungszielTage(r.zahlungsziel_tage != null ? String(r.zahlungsziel_tage) : "14");
    setWaehrung(r.waehrung || "EUR");
    setNotizen(r.notizen || "");
    setKleinunternehmer(!!r.kleinunternehmer);
    setBezahltAm(r.bezahlt_am || "");
    setBezahlterBetrag(r.bezahlter_betrag != null ? ladeStr(r.bezahlter_betrag) : "");

    const pos = (pRes.data as any[]) || [];
    const zl: Zeile[] = pos.map((p) => ({
      id: p.id,
      bezeichnung: p.bezeichnung || "",
      menge: ladeStr(p.menge),
      einheit: p.einheit || "Stk",
      einzelpreis: ladeStr(p.einzelpreis),
      mwst_satz: ladeStr(p.mwst_satz),
    }));
    setZeilen(zl);
    setGeladeneIds(zl.map((z) => z.id));

    // Kontakt + Firma defensiv nachladen
    if (r.kontakt_id) {
      const { data: k } = await supabase.from("kontakte").select("*").eq("id", r.kontakt_id).single();
      if (k) setKontakt(k);
    }
    if (r.firma_id) {
      const { data: f } = await supabase.from("firmen").select("*").eq("id", r.firma_id).single();
      if (f) setFirma(f);
    }

    setDirty(false);
    setLoading(false);
  }

  useEffect(() => {
    if (id) laden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function markDirty() {
    setDirty(true);
    setGespeichert(false);
  }
  function aendern<T>(setter: (v: T) => void, v: T) {
    setter(v);
    markDirty();
  }

  function neueId(): string {
    try {
      return crypto.randomUUID();
    } catch {
      return "neu-" + Math.random().toString(36).slice(2) + Date.now();
    }
  }
  function zeileHinzufuegen() {
    if (gesperrt) return;
    setZeilen((prev) => [
      ...prev,
      { id: neueId(), bezeichnung: "", menge: "1", einheit: "Stk", einzelpreis: "0", mwst_satz: kleinunternehmer ? "0" : "19" },
    ]);
    markDirty();
  }
  function zeileAendern(zid: string, feld: keyof Zeile, wert: string) {
    setZeilen((prev) => prev.map((z) => (z.id === zid ? { ...z, [feld]: wert } : z)));
    markDirty();
  }
  function zeileLoeschen(zid: string) {
    if (gesperrt) return;
    setZeilen((prev) => prev.filter((z) => z.id !== zid));
    markDirty();
  }

  const summen = useMemo(() => {
    let netto = 0;
    let mwst = 0;
    for (const z of zeilen) {
      const zn = parseZahl(z.menge) * parseZahl(z.einzelpreis);
      netto += zn;
      // Bei Kleinunternehmer wird keine MwSt ausgewiesen
      mwst += kleinunternehmer ? 0 : zn * (parseZahl(z.mwst_satz) / 100);
    }
    netto = r2(netto);
    mwst = r2(mwst);
    return { netto, mwst, brutto: r2(netto + mwst) };
  }, [zeilen, kleinunternehmer]);

  function zeileNetto(z: Zeile): number {
    return r2(parseZahl(z.menge) * parseZahl(z.einzelpreis));
  }

  // ---------- Speichern ----------
  async function speichernJetzt() {
    if (speichern) return;
    setSpeichern(true);
    setFehler(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setFehler("Nicht eingeloggt.");
        setSpeichern(false);
        return;
      }

      // Fälligkeit automatisch aus Rechnungsdatum + Zahlungsziel, falls Ziel gesetzt
      let faellig = faelligkeitsdatum || null;
      const ziel = parseInt(zahlungszielTage, 10);
      if (rechnungsdatum && !isNaN(ziel)) {
        const f = new Date(rechnungsdatum);
        f.setDate(f.getDate() + ziel);
        faellig = f.toISOString().slice(0, 10);
      }

      // 1) Kopf aktualisieren
      const { error: rErr } = await supabase
        .from("rechnungen")
        .update({
          titel: titel || null,
          zahlungsstatus: status,
          rechnungsdatum: rechnungsdatum || null,
          leistungsdatum: leistungsdatum || null,
          faelligkeitsdatum: faellig,
          zahlungsziel_tage: isNaN(ziel) ? 14 : ziel,
          waehrung,
          kleinunternehmer,
          notizen: notizen || null,
          bezahlt_am: bezahltAm || null,
          bezahlter_betrag: parseZahl(bezahlterBetrag),
          netto_summe: summen.netto,
          mwst_summe: summen.mwst,
          brutto_summe: summen.brutto,
        })
        .eq("id", id);

      if (rErr) {
        setFehler("Speichern fehlgeschlagen: " + rErr.message);
        setSpeichern(false);
        return;
      }

      // 2) Positionen: gelöschte entfernen, bestehende/neue upserten
      const aktuelleIds = zeilen.map((z) => z.id).filter((zid) => !zid.startsWith("neu-"));
      const zuLoeschen = geladeneIds.filter((gid) => !aktuelleIds.includes(gid));
      if (zuLoeschen.length > 0) {
        await supabase.from("rechnung_positionen").delete().in("id", zuLoeschen);
      }

      // Neue und bestehende schreiben
      let pos = 1;
      for (const z of zeilen) {
        const datensatz: any = {
          owner_user_id: user.id,
          rechnung_id: id,
          position: pos,
          bezeichnung: z.bezeichnung || null,
          menge: parseZahl(z.menge),
          einheit: z.einheit || "Stk",
          einzelpreis: parseZahl(z.einzelpreis),
          mwst_satz: kleinunternehmer ? 0 : parseZahl(z.mwst_satz),
          gesamt_netto: zeileNetto(z),
        };
        if (z.id.startsWith("neu-")) {
          await supabase.from("rechnung_positionen").insert(datensatz);
        } else {
          await supabase.from("rechnung_positionen").update(datensatz).eq("id", z.id);
        }
        pos++;
      }

      setGespeichert(true);
      setDirty(false);
      await laden();
    } catch (e: any) {
      setFehler("Fehler: " + (e?.message || "unbekannt"));
    }
    setSpeichern(false);
  }

  // ---------- PDF erzeugen (§14-konform, Gotenberg) ----------
  async function pdfErstellen() {
    if (pdfLaedt) return;
    if (dirty) {
      const weiter = window.confirm(
        "Es gibt ungespeicherte Änderungen. Für ein korrektes PDF sollten die Daten erst gespeichert werden. Trotzdem fortfahren?"
      );
      if (!weiter) return;
    }
    setPdfLaedt(true);
    setFehler(null);
    try {
      // Positionen im Format der Route (mit gesamt_netto)
      const posDaten = zeilen.map((z) => ({
        bezeichnung: z.bezeichnung,
        menge: parseZahl(z.menge),
        einheit: z.einheit,
        einzelpreis: parseZahl(z.einzelpreis),
        mwst_satz: kleinunternehmer ? 0 : parseZahl(z.mwst_satz),
        gesamt_netto: zeileNetto(z),
      }));

      const rechnungDaten = {
        rechnungsnummer: rechnung?.rechnungsnummer || "",
        titel: titel,
        rechnungsdatum,
        leistungsdatum,
        faelligkeitsdatum,
        waehrung,
        kleinunternehmer,
        netto_summe: summen.netto,
        mwst_summe: summen.mwst,
        brutto_summe: summen.brutto,
        notizen,
      };

      // Absenderdaten (§14) — Nahtstelle zu den Firmen-Einstellungen.
      // Vorerst leer -> PDF zeigt Platzhalter, damit die Pflichtfelder sichtbar sind.
      const aussteller = {
        name: "",
        anschrift: "",
        steuernummer: "",
        ust_idnr: "",
        telefon: "",
        email: "",
        bank_iban: "",
        bank_bic: "",
        bank_name: "",
      };

      const res = await fetch("/api/rechnung-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rechnung: rechnungDaten,
          positionen: posDaten,
          kontaktName: kontakt ? kontaktName(kontakt) : "",
          firmaName: firma ? firmaName(firma) : "",
          aussteller,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFehler(d?.error || "PDF konnte nicht erstellt werden.");
        setPdfLaedt(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Rechnung_" + (rechnung?.rechnungsnummer || "Dokument") + ".pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setFehler("PDF-Fehler: " + (e?.message || "unbekannt"));
    }
    setPdfLaedt(false);
  }

  // ---------- Status-Workflow ----------
  async function statusSetzen(neu: StatusKey) {
    setStatus(neu);
    markDirty();
    // Bei "bezahlt" automatisch Bezahlt-Datum + Vollbetrag vorschlagen
    if (neu === "bezahlt") {
      if (!bezahltAm) setBezahltAm(new Date().toISOString().slice(0, 10));
      setBezahlterBetrag(ladeStr(summen.brutto));
    }
  }

  const empfaengerName = useMemo(() => {
    if (kontakt) return kontaktName(kontakt);
    if (firma) return firmaName(firma);
    return titel || "—";
  }, [kontakt, firma, titel]);

  const restBetrag = useMemo(() => {
    return r2(summen.brutto - parseZahl(bezahlterBetrag));
  }, [summen.brutto, bezahlterBetrag]);

  const faelligInfo = useMemo(() => {
    if (status === "bezahlt" || status === "storniert") return null;
    const t = tageBisFaellig(faelligkeitsdatum);
    if (t === null) return null;
    if (t < 0) return { text: Math.abs(t) + " Tage überfällig", farbe: C.danger };
    if (t === 0) return { text: "heute fällig", farbe: C.warn };
    if (t <= 5) return { text: "in " + t + " Tagen fällig", farbe: C.warn };
    return { text: "in " + t + " Tagen fällig", farbe: C.green };
  }, [faelligkeitsdatum, status]);

  if (loading) {
    return (
      <Rahmen>
        <div style={{ color: C.textDim, padding: "60px 0", textAlign: "center" }}>
          ARGONAUT lädt die Rechnung…
        </div>
      </Rahmen>
    );
  }

  if (nichtGefunden) {
    return (
      <Rahmen>
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
          <h2 style={{ fontFamily: "'Syne', sans-serif", marginBottom: 10 }}>Rechnung nicht gefunden</h2>
          <p style={{ color: C.textDim, marginBottom: 24 }}>
            Diese Rechnung existiert nicht oder gehört nicht zu deinem Konto.
          </p>
          <button onClick={() => router.push("/dashboard/rechnungen")} style={btnGold}>
            Zurück zur Übersicht
          </button>
        </div>
      </Rahmen>
    );
  }

  const stCfg = STATUS[status] || STATUS.offen;

  return (
    <Rahmen>
      {/* KOPFZEILE */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <button
            onClick={() => router.push("/dashboard/rechnungen")}
            style={{
              background: "transparent",
              color: C.textDim,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              padding: 0,
              marginBottom: 8,
            }}
          >
            ← Zurück zu Rechnungen
          </button>
          <h1
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 28,
              fontWeight: 800,
              margin: 0,
              letterSpacing: "-0.5px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: C.gold }}>{rechnung?.rechnungsnummer || "Rechnung"}</span>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                fontWeight: 700,
                background: `${stCfg.farbe}22`,
                color: stCfg.farbe,
                border: `1px solid ${stCfg.farbe}55`,
                borderRadius: 999,
                padding: "4px 12px",
              }}
            >
              {stCfg.icon} {stCfg.label}
            </span>
          </h1>
          <p style={{ color: C.textDim, fontSize: 14, margin: "8px 0 0" }}>
            {empfaengerName}
            {rechnung?.auftrag_id && (
              <>
                {" · "}
                <button
                  onClick={() => router.push("/dashboard/auftraege/" + rechnung.auftrag_id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: C.cyan,
                    cursor: "pointer",
                    fontSize: 14,
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  zum Auftrag
                </button>
              </>
            )}
          </p>
          {faelligInfo && (
            <p style={{ color: faelligInfo.farbe, fontSize: 13, fontWeight: 600, margin: "6px 0 0" }}>
              ⏱ {faelligInfo.text}
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={pdfErstellen}
            disabled={pdfLaedt}
            style={{
              background: "transparent",
              color: C.gold,
              border: `1px solid ${C.gold}77`,
              borderRadius: 10,
              padding: "11px 18px",
              fontSize: 14,
              fontWeight: 700,
              cursor: pdfLaedt ? "wait" : "pointer",
              fontFamily: "'DM Sans', sans-serif",
              opacity: pdfLaedt ? 0.6 : 1,
            }}
          >
            {pdfLaedt ? "ARGONAUT erstellt das PDF…" : "📄 Rechnung als PDF"}
          </button>
          <button
            onClick={speichernJetzt}
            disabled={speichern || !dirty}
            style={{
              ...btnGold,
              opacity: speichern || !dirty ? 0.55 : 1,
              cursor: speichern || !dirty ? "default" : "pointer",
            }}
          >
            {speichern ? "Speichert…" : gespeichert ? "✓ Gespeichert" : "💾 Speichern"}
          </button>
        </div>
      </div>

      {/* STATUS-WORKFLOW */}
      <div style={{ marginBottom: 20 }}>
        <Karte titel="Zahlungsstatus">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["offen", "teilbezahlt", "bezahlt"] as StatusKey[]).map((s) => {
              const aktiv = status === s;
              const cfg = STATUS[s];
              return (
                <button
                  key={s}
                  onClick={() => statusSetzen(s)}
                  style={{
                    background: aktiv ? cfg.farbe : "transparent",
                    color: aktiv ? C.navy : cfg.farbe,
                    border: `1px solid ${cfg.farbe}${aktiv ? "" : "77"}`,
                    borderRadius: 10,
                    padding: "9px 16px",
                    fontSize: 13.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {cfg.icon} {cfg.label}
                </button>
              );
            })}
            <div style={{ flex: 1 }} />
            {status !== "storniert" ? (
              <button onClick={() => statusSetzen("storniert")} style={stornoBtn}>
                Stornieren
              </button>
            ) : (
              <button onClick={() => statusSetzen("offen")} style={reaktivierBtn}>
                Reaktivieren
              </button>
            )}
          </div>

          {/* Bezahlt-Erfassung (bei teilbezahlt/bezahlt sichtbar) */}
          {(status === "teilbezahlt" || status === "bezahlt") && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 14,
                marginTop: 18,
              }}
            >
              <div>
                <label style={labelStyle}>Bezahlter Betrag ({waehrung})</label>
                <input
                  value={bezahlterBetrag}
                  onChange={(e) => aendern(setBezahlterBetrag, e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Bezahlt am</label>
                <input
                  type="date"
                  value={bezahltAm}
                  onChange={(e) => aendern(setBezahltAm, e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Offener Rest</label>
                <div
                  style={{
                    ...inputStyle,
                    display: "flex",
                    alignItems: "center",
                    color: restBetrag > 0 ? C.warn : C.green,
                    fontWeight: 700,
                  }}
                >
                  {geld(restBetrag, waehrung)}
                </div>
              </div>
            </div>
          )}
        </Karte>
      </div>

      {/* DATEN */}
      <div style={{ marginBottom: 20 }}>
        <Karte titel="Rechnungsdaten">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            <div>
              <label style={labelStyle}>Titel / Betreff</label>
              <input value={titel} onChange={(e) => aendern(setTitel, e.target.value)} placeholder="z. B. Leistungen Mai" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Rechnungsdatum</label>
              <input type="date" value={rechnungsdatum} onChange={(e) => aendern(setRechnungsdatum, e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Leistungsdatum</label>
              <input type="date" value={leistungsdatum} onChange={(e) => aendern(setLeistungsdatum, e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Zahlungsziel (Tage)</label>
              <input value={zahlungszielTage} onChange={(e) => aendern(setZahlungszielTage, e.target.value)} inputMode="numeric" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Fälligkeit</label>
              <div style={{ ...inputStyle, display: "flex", alignItems: "center", color: C.textDim }}>
                {datumDe(faelligkeitsdatum) || "wird berechnet"}
              </div>
            </div>
          </div>

          {/* Kleinunternehmer-Umschalter */}
          <div
            style={{
              marginTop: 18,
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: C.navy,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "12px 16px",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1 }}>
              <input
                type="checkbox"
                checked={kleinunternehmer}
                onChange={(e) => aendern(setKleinunternehmer, e.target.checked)}
                style={{ width: 18, height: 18, accentColor: C.gold, cursor: "pointer" }}
              />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Kleinunternehmer nach §19 UStG</span>
            </label>
          </div>
          {kleinunternehmer && (
            <p style={{ color: C.textDim, fontSize: 12.5, margin: "10px 2px 0", lineHeight: 1.5 }}>
              Auf der Rechnung wird keine Umsatzsteuer ausgewiesen. Es erscheint der Hinweis:
              „Gemäß §19 UStG wird keine Umsatzsteuer berechnet."
            </p>
          )}
        </Karte>
      </div>

      {/* POSITIONEN */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            background: C.navy2,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: "20px 22px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div style={sektionLabel}>Positionen</div>
            {!gesperrt && (
              <button onClick={zeileHinzufuegen} style={btnKlein}>
                + Position
              </button>
            )}
          </div>

          {gesperrt && (
            <p style={{ color: C.warn, fontSize: 12.5, margin: "0 0 14px" }}>
              {status === "bezahlt"
                ? "Diese Rechnung ist als bezahlt markiert und schreibgeschützt. Für Änderungen bitte stornieren und neu erstellen."
                : "Stornierte Rechnung – schreibgeschützt. Zum Bearbeiten reaktivieren."}
            </p>
          )}

          {zeilen.length === 0 ? (
            <p style={{ color: C.textDim, fontSize: 14, padding: "16px 0" }}>
              Noch keine Positionen. {!gesperrt && "Füge oben eine hinzu."}
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <div style={posKopf}>
                <div>Bezeichnung</div>
                <div>Menge</div>
                <div>Einheit</div>
                <div style={{ textAlign: "right" }}>Einzelpreis</div>
                <div style={{ textAlign: "right" }}>MwSt %</div>
                <div style={{ textAlign: "right" }}>Netto</div>
                <div />
              </div>
              {zeilen.map((z) => (
                <div key={z.id} style={posZeile}>
                  <input value={z.bezeichnung} disabled={gesperrt} onChange={(e) => zeileAendern(z.id, "bezeichnung", e.target.value)} placeholder="Leistung / Artikel" style={zellInput} />
                  <input value={z.menge} disabled={gesperrt} onChange={(e) => zeileAendern(z.id, "menge", e.target.value)} inputMode="decimal" style={{ ...zellInput, textAlign: "right" }} />
                  <select value={z.einheit} disabled={gesperrt} onChange={(e) => zeileAendern(z.id, "einheit", e.target.value)} style={zellInput}>
                    {EINHEITEN.map((e) => (
                      <option key={e} value={e} style={{ background: C.navy2 }}>{e}</option>
                    ))}
                  </select>
                  <input value={z.einzelpreis} disabled={gesperrt} onChange={(e) => zeileAendern(z.id, "einzelpreis", e.target.value)} inputMode="decimal" style={{ ...zellInput, textAlign: "right" }} />
                  <input value={kleinunternehmer ? "0" : z.mwst_satz} disabled={gesperrt || kleinunternehmer} onChange={(e) => zeileAendern(z.id, "mwst_satz", e.target.value)} inputMode="decimal" style={{ ...zellInput, textAlign: "right", opacity: kleinunternehmer ? 0.5 : 1 }} />
                  <div style={{ textAlign: "right", fontSize: 14, fontWeight: 600, alignSelf: "center", color: C.cyan }}>
                    {geld(zeileNetto(z), waehrung)}
                  </div>
                  {!gesperrt ? (
                    <button onClick={() => zeileLoeschen(z.id)} title="Position löschen" style={{ background: "transparent", border: "none", color: C.textDim, cursor: "pointer", fontSize: 15, alignSelf: "center" }}>
                      🗑
                    </button>
                  ) : (
                    <div />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SUMMEN */}
      <Karte titel="Summen">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <SummeFeld label="Netto" wert={geld(summen.netto, waehrung)} farbe={C.cyan} />
          <SummeFeld label={kleinunternehmer ? "MwSt (§19: keine)" : "MwSt"} wert={geld(summen.mwst, waehrung)} farbe={C.textDim} />
          <SummeFeld label="Brutto" wert={geld(summen.brutto, waehrung)} farbe={C.gold} />
        </div>
        <p style={{ color: C.textDim, fontSize: 12, marginTop: 14 }}>
          Summen rechnen live aus den Positionen. Mit „💾 Speichern" werden sie festgeschrieben.
        </p>
      </Karte>

      {/* NOTIZEN */}
      <div style={{ marginTop: 20 }}>
        <Karte titel="Notizen">
          <textarea
            value={notizen}
            onChange={(e) => aendern(setNotizen, e.target.value)}
            placeholder="Interne Notizen zur Rechnung…"
            rows={4}
            style={{ ...inputStyle, resize: "vertical", minHeight: 100, lineHeight: 1.5 }}
          />
        </Karte>
      </div>

      {fehler && (
        <div
          style={{
            background: "rgba(224,102,102,0.12)",
            border: `1px solid ${C.danger}`,
            borderRadius: 10,
            padding: "12px 16px",
            color: C.danger,
            marginTop: 20,
            fontSize: 14,
          }}
        >
          ⚠️ {fehler}
        </div>
      )}

      <div style={{ height: 40 }} />
    </Rahmen>
  );
}

function Rahmen({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: C.navy,
        minHeight: "100vh",
        padding: "32px 24px 80px",
        color: "#fff",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

function Karte({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 22px" }}>
      <div style={sektionLabel}>{titel}</div>
      {children}
    </div>
  );
}

function SummeFeld({ label, wert, farbe }: { label: string; wert: string; farbe: string }) {
  return (
    <div style={{ background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ color: C.textDim, fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: farbe }}>{wert}</div>
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
  width: "100%",
  background: C.navy,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "11px 14px",
  color: "#fff",
  fontSize: 14,
  fontFamily: "'DM Sans', sans-serif",
  outline: "none",
  boxSizing: "border-box",
};

const btnGold: React.CSSProperties = {
  background: C.gold,
  color: C.navy,
  border: "none",
  borderRadius: 10,
  padding: "11px 20px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
};

const btnKlein: React.CSSProperties = {
  background: "transparent",
  color: C.gold,
  border: `1px solid ${C.gold}77`,
  borderRadius: 8,
  padding: "7px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
};

const stornoBtn: React.CSSProperties = {
  background: "transparent",
  color: C.danger,
  border: `1px solid ${C.danger}55`,
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
};

const reaktivierBtn: React.CSSProperties = {
  background: "transparent",
  color: C.cyan,
  border: `1px solid ${C.cyan}55`,
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
};

const posSpalten = "1fr 80px 90px 120px 80px 130px 36px";

const posKopf: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: posSpalten,
  gap: 10,
  padding: "0 0 10px",
  borderBottom: `1px solid ${C.border}`,
  color: C.textDim,
  fontSize: 11.5,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.4px",
  minWidth: 640,
};

const posZeile: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: posSpalten,
  gap: 10,
  padding: "10px 0",
  borderBottom: `1px solid ${C.border}`,
  minWidth: 640,
};

const zellInput: React.CSSProperties = {
  width: "100%",
  background: C.navy,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "9px 10px",
  color: "#fff",
  fontSize: 13.5,
  fontFamily: "'DM Sans', sans-serif",
  outline: "none",
  boxSizing: "border-box",
};
