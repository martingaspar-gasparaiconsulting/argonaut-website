"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · Block C-4b — MAHNUNG ERSTELLEN
// /dashboard/mahnwesen/[id]
// Stufe wählen -> ARGONAUT entwirft Mahntext (/api/mahnung-ki) ->
// editieren -> Mahnung als PDF (/api/mahnung-pdf) -> als gesendet markieren.
// Absenderdaten aus profiles (gleiche Quelle wie die Rechnung).
//
// #3 (06.07.26): Beim "Als gesendet markieren" wird zusaetzlich ein
// GoBD-Nachweis in mahnung_historie geschrieben; Verlauf wird angezeigt.
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

// Stufe 1 = Zahlungserinnerung, 2 = 1. Mahnung, 3 = 2. Mahnung
const STUFE_LABEL: Record<number, string> = {
  1: "Zahlungserinnerung",
  2: "1. Mahnung",
  3: "2. Mahnung",
};
const STUFE_FARBE: Record<number, string> = {
  1: "#E07B3C",
  2: C.danger,
  3: "#B03030",
};

type HistorieEintrag = {
  id: string;
  rechnung_id: string;
  stufe: number;
  stufe_label: string;
  betrag_offen: number | null;
  gebuehr_betrag: number | null;
  zins_betrag: number | null;
  tage_ueberfaellig: number | null;
  kanal: string | null;
  notiz: string | null;
  erstellt_am: string;
};

function geld(n: number | null | undefined, waehrung = "EUR"): string {
  const wert = typeof n === "number" ? n : 0;
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: waehrung || "EUR" }).format(wert);
  } catch {
    return `${wert.toFixed(2)} €`;
  }
}
function datumDe(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return d;
  }
}
function datumZeitDe(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
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
function tageBisFaellig(faellig: string | null | undefined): number | null {
  if (!faellig) return null;
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const f = new Date(faellig);
  f.setHours(0, 0, 0, 0);
  return Math.round((f.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));
}

export default function MahnungErstellen() {
  const router = useRouter();
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [nichtGefunden, setNichtGefunden] = useState(false);

  const [rechnung, setRechnung] = useState<any>(null);
  const [kontakt, setKontakt] = useState<any>(null);
  const [firma, setFirma] = useState<any>(null);
  const [firmenprofil, setFirmenprofil] = useState<any>(null);

  const [stufe, setStufe] = useState<number>(1);
  const [text, setText] = useState<string>("");

  const [kiBusy, setKiBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [erfolg, setErfolg] = useState<string | null>(null);

  // #3: Mahn-Historie dieser Rechnung
  const [historie, setHistorie] = useState<HistorieEintrag[]>([]);

  async function ladeHistorie() {
    const { data } = await supabase
      .from("mahnung_historie")
      .select("*")
      .eq("rechnung_id", id)
      .order("erstellt_am", { ascending: false });
    setHistorie((data || []) as HistorieEintrag[]);
  }

  async function laden() {
    setLoading(true);
    setFehler(null);

    const { data: r, error } = await supabase.from("rechnungen").select("*").eq("id", id).single();
    if (error || !r) {
      setNichtGefunden(true);
      setLoading(false);
      return;
    }
    setRechnung(r);
    // Vorschlag: nächste Stufe (0->1, 1->2, 2->3, 3->3)
    setStufe(Math.min((r.mahnstufe || 0) + 1, 3));

    if (r.kontakt_id) {
      const { data: k } = await supabase.from("kontakte").select("*").eq("id", r.kontakt_id).single();
      if (k) setKontakt(k);
    }
    if (r.firma_id) {
      const { data: f } = await supabase.from("firmen").select("*").eq("id", r.firma_id).single();
      if (f) setFirma(f);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select(
          "firma_name, firma_strasse, firma_plz, firma_ort, firma_telefon, firma_email, firma_ust_id, firma_steuernummer, firma_iban, firma_bank, firma_bic"
        )
        .eq("id", user.id)
        .single();
      if (prof) setFirmenprofil(prof);
    }

    // #3: Historie mitladen
    await ladeHistorie();

    setLoading(false);
  }

  useEffect(() => {
    if (id) laden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const empfaengerName = useMemo(() => {
    if (kontakt) return kontaktName(kontakt);
    if (firma) return firmaName(firma);
    return rechnung?.titel || "—";
  }, [kontakt, firma, rechnung]);

  const offenerRest = useMemo(() => {
    const brutto = Number(rechnung?.brutto_summe) || 0;
    const bezahlt = Number(rechnung?.bezahlter_betrag) || 0;
    return Math.round((brutto - bezahlt + Number.EPSILON) * 100) / 100;
  }, [rechnung]);

  const tageUeberfaellig = useMemo(() => {
    const t = tageBisFaellig(rechnung?.faelligkeitsdatum);
    return t !== null && t < 0 ? Math.abs(t) : 0;
  }, [rechnung]);

  // ---------- KI: Mahntext entwerfen ----------
  async function entwerfen() {
    if (kiBusy) return;
    setKiBusy(true);
    setFehler(null);
    setErfolg(null);
    try {
      const res = await fetch("/api/mahnung-ki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mahnung: {
            stufe,
            rechnungsnummer: rechnung?.rechnungsnummer || "",
            betrag: offenerRest,
            waehrung: rechnung?.waehrung || "EUR",
            faelligkeitsdatum: rechnung?.faelligkeitsdatum || "",
            tage_ueberfaellig: tageUeberfaellig,
            empfaenger_name: empfaengerName,
            absender_name: firmenprofil?.firma_name || "",
          },
        }),
      });
      const data = await res.json();
      if (data?.fehler) {
        setFehler(data.fehler);
      } else if (data?.text) {
        setText(data.text);
      } else {
        setFehler("Es konnte kein Text erzeugt werden. Bitte erneut versuchen.");
      }
    } catch (e: any) {
      setFehler("Fehler: " + (e?.message || "unbekannt"));
    }
    setKiBusy(false);
  }

  // ---------- PDF erzeugen ----------
  async function pdfErstellen() {
    if (pdfBusy) return;
    if (!text.trim()) {
      setFehler("Bitte zuerst einen Mahntext erstellen oder eingeben.");
      return;
    }
    setPdfBusy(true);
    setFehler(null);
    setErfolg(null);
    try {
      const p = firmenprofil || {};
      const anschrift = [
        p.firma_strasse,
        [p.firma_plz, p.firma_ort].filter(Boolean).join(" "),
      ]
        .filter((s: any) => s && String(s).trim())
        .join("\n");
      const aussteller = {
        name: p.firma_name || "",
        anschrift,
        steuernummer: p.firma_steuernummer || "",
        ust_idnr: p.firma_ust_id || "",
        telefon: p.firma_telefon || "",
        email: p.firma_email || "",
        bank_iban: p.firma_iban || "",
        bank_bic: p.firma_bic || "",
        bank_name: p.firma_bank || "",
      };

      const res = await fetch("/api/mahnung-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mahnung: { stufe, betreff: STUFE_LABEL[stufe], text },
          rechnung: {
            rechnungsnummer: rechnung?.rechnungsnummer || "",
            rechnungsdatum: rechnung?.rechnungsdatum || "",
            faelligkeitsdatum: rechnung?.faelligkeitsdatum || "",
            waehrung: rechnung?.waehrung || "EUR",
            brutto_summe: rechnung?.brutto_summe || 0,
            offener_betrag: offenerRest,
          },
          empfaengerName,
          firmaName: firma ? firmaName(firma) : "",
          aussteller,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFehler(d?.error || "PDF konnte nicht erstellt werden.");
        setPdfBusy(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const praefix = stufe >= 3 ? "Mahnung2" : stufe === 2 ? "Mahnung1" : "Zahlungserinnerung";
      a.href = url;
      a.download = `${praefix}_${rechnung?.rechnungsnummer || "Dokument"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setFehler("PDF-Fehler: " + (e?.message || "unbekannt"));
    }
    setPdfBusy(false);
  }

  // ---------- Als gesendet markieren (+ Historie-Nachweis) ----------
  async function alsGesendet() {
    if (sendBusy) return;
    setSendBusy(true);
    setFehler(null);
    setErfolg(null);
    const heute = new Date().toISOString().slice(0, 10);

    // 1) GoBD-Nachweis zuerst schreiben (append-only Historie)
    const { error: histErr } = await supabase.from("mahnung_historie").insert({
      rechnung_id: id,
      stufe,
      stufe_label: STUFE_LABEL[stufe],
      betrag_offen: offenerRest,
      tage_ueberfaellig: tageUeberfaellig,
      kanal: "pdf",
      // owner_user_id wird per DB-Default (auth.uid()) gesetzt
      // gebuehr_betrag / zins_betrag folgen mit #1 / #2
    });
    if (histErr) {
      setFehler("Konnte den Historie-Eintrag nicht speichern: " + histErr.message);
      setSendBusy(false);
      return;
    }

    // 2) Aktuellen Mahnstatus auf der Rechnung nachziehen
    const { error } = await supabase
      .from("rechnungen")
      .update({ mahnstufe: stufe, letzte_mahnung_am: heute, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setFehler(
        "Historie gespeichert, aber der Mahnstatus konnte nicht aktualisiert werden: " + error.message
      );
      await ladeHistorie();
      setSendBusy(false);
      return;
    }

    setRechnung((prev: any) => (prev ? { ...prev, mahnstufe: stufe, letzte_mahnung_am: heute } : prev));
    setErfolg(`Als „${STUFE_LABEL[stufe]}" vermerkt (${datumDe(heute)}) und in der Historie protokolliert.`);
    await ladeHistorie();
    setSendBusy(false);
  }

  if (loading) {
    return (
      <Rahmen>
        <div style={{ color: C.textDim, padding: "60px 0", textAlign: "center" }}>
          ARGONAUT lädt den Vorgang…
        </div>
      </Rahmen>
    );
  }

  if (nichtGefunden) {
    return (
      <Rahmen>
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontFamily: "'Syne', sans-serif", marginBottom: 10 }}>Rechnung nicht gefunden</h2>
          <p style={{ color: C.textDim, marginBottom: 24 }}>
            Diese Rechnung existiert nicht oder gehört nicht zu deinem Konto.
          </p>
          <button onClick={() => router.push("/dashboard/mahnwesen")} style={btnGold}>
            Zurück zum Mahnwesen
          </button>
        </div>
      </Rahmen>
    );
  }

  const aktuelleStufe = rechnung?.mahnstufe || 0;

  return (
    <Rahmen>
      {/* KOPFZEILE */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => router.push("/dashboard/mahnwesen")}
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
          ← Zurück zum Mahnwesen
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
          <span>⚠️ Mahnung</span>
          <span style={{ color: C.gold }}>{rechnung?.rechnungsnummer || "Rechnung"}</span>
        </h1>
        <p style={{ color: C.textDim, fontSize: 14, margin: "8px 0 0" }}>
          {empfaengerName}
          {"  ·  "}
          <button
            onClick={() => router.push(`/dashboard/rechnungen/${id}`)}
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
            zur Rechnung
          </button>
        </p>
      </div>

      {/* VORGANGS-ÜBERSICHT */}
      <div style={{ marginBottom: 20 }}>
        <Karte titel="Vorgang">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
            <Feld label="Offener Betrag" wert={geld(offenerRest, rechnung?.waehrung || "EUR")} farbe={C.gold} />
            <Feld label="Fällig seit" wert={datumDe(rechnung?.faelligkeitsdatum)} farbe="#fff" />
            <Feld
              label="Überfällig"
              wert={tageUeberfaellig > 0 ? `${tageUeberfaellig} Tage` : "—"}
              farbe={C.danger}
            />
            <Feld
              label="Bisherige Mahnstufe"
              wert={aktuelleStufe === 0 ? "Nicht gemahnt" : STUFE_LABEL[aktuelleStufe] || String(aktuelleStufe)}
              farbe={aktuelleStufe === 0 ? C.textDim : STUFE_FARBE[aktuelleStufe] || C.warn}
            />
          </div>
        </Karte>
      </div>

      {/* STUFE WÄHLEN */}
      <div style={{ marginBottom: 20 }}>
        <Karte titel="Welche Mahnung erstellen?">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[1, 2, 3].map((s) => {
              const aktiv = stufe === s;
              const farbe = STUFE_FARBE[s];
              return (
                <button
                  key={s}
                  onClick={() => setStufe(s)}
                  style={{
                    background: aktiv ? farbe : "transparent",
                    color: aktiv ? "#fff" : farbe,
                    border: `1px solid ${farbe}${aktiv ? "" : "77"}`,
                    borderRadius: 10,
                    padding: "9px 16px",
                    fontSize: 13.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {STUFE_LABEL[s]}
                </button>
              );
            })}
          </div>
          <p style={{ color: C.textDim, fontSize: 12.5, margin: "12px 2px 0", lineHeight: 1.5 }}>
            Vorgeschlagen ist die nächste sinnvolle Stufe. ARGONAUT passt den Ton automatisch an:
            höflich bei der Zahlungserinnerung, bestimmter bei den Mahnungen.
          </p>
        </Karte>
      </div>

      {/* MAHNTEXT */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            background: C.navy2,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: "20px 22px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <div style={sektionLabel}>Mahntext</div>
            <button
              onClick={entwerfen}
              disabled={kiBusy}
              style={{
                background: "transparent",
                color: C.lila,
                border: `1px solid ${C.lila}77`,
                borderRadius: 10,
                padding: "9px 16px",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: kiBusy ? "wait" : "pointer",
                fontFamily: "'DM Sans', sans-serif",
                opacity: kiBusy ? 0.6 : 1,
              }}
            >
              {kiBusy ? "ARGONAUT schreibt…" : "✨ ARGONAUT entwirft den Mahntext"}
            </button>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Hier erscheint der Entwurf – oder schreibe direkt selbst. Du kannst alles frei anpassen, bevor du das PDF erzeugst."
            rows={14}
            style={{
              width: "100%",
              background: C.navy,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "14px 16px",
              color: "#fff",
              fontSize: 14,
              fontFamily: "'DM Sans', sans-serif",
              outline: "none",
              boxSizing: "border-box",
              resize: "vertical",
              minHeight: 240,
              lineHeight: 1.6,
            }}
          />
        </div>
      </div>

      {/* AKTIONEN */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={pdfErstellen}
          disabled={pdfBusy}
          style={{
            background: "transparent",
            color: C.gold,
            border: `1px solid ${C.gold}77`,
            borderRadius: 10,
            padding: "11px 18px",
            fontSize: 14,
            fontWeight: 700,
            cursor: pdfBusy ? "wait" : "pointer",
            fontFamily: "'DM Sans', sans-serif",
            opacity: pdfBusy ? 0.6 : 1,
          }}
        >
          {pdfBusy ? "ARGONAUT erstellt das PDF…" : "📄 Mahnung als PDF"}
        </button>
        <button
          onClick={alsGesendet}
          disabled={sendBusy}
          style={{ ...btnGold, opacity: sendBusy ? 0.6 : 1, cursor: sendBusy ? "wait" : "pointer" }}
        >
          {sendBusy ? "Speichert…" : `✓ Als „${STUFE_LABEL[stufe]}" gesendet markieren`}
        </button>
      </div>

      {erfolg && (
        <div
          style={{
            background: "rgba(76,175,125,0.12)",
            border: `1px solid ${C.green}`,
            borderRadius: 10,
            padding: "12px 16px",
            color: C.green,
            marginTop: 20,
            fontSize: 14,
          }}
        >
          ✓ {erfolg}
        </div>
      )}

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

      {/* #3: MAHN-VERLAUF (GoBD-Nachweis) */}
      <div style={{ marginTop: 24 }}>
        <Karte titel="Mahn-Verlauf">
          {historie.length === 0 ? (
            <div style={{ color: C.textDim, fontSize: 14 }}>
              Noch keine Mahnung protokolliert. Sobald du oben „gesendet markierst",
              erscheint hier der Nachweis.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {historie.map((h) => {
                const farbe = STUFE_FARBE[h.stufe] || C.warn;
                const zusatz = (Number(h.gebuehr_betrag) || 0) + (Number(h.zins_betrag) || 0);
                return (
                  <div
                    key={h.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                      background: C.navy,
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      padding: "12px 14px",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        background: `${farbe}22`,
                        color: farbe,
                        border: `1px solid ${farbe}55`,
                        borderRadius: 999,
                        padding: "3px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h.stufe_label}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                      {geld(Number(h.betrag_offen) || 0)}
                    </span>
                    {zusatz > 0 && (
                      <span style={{ fontSize: 12.5, color: C.textDim }}>
                        + {geld(zusatz)} Gebühr/Zinsen
                      </span>
                    )}
                    {typeof h.tage_ueberfaellig === "number" && h.tage_ueberfaellig > 0 && (
                      <span style={{ fontSize: 12.5, color: C.textDim }}>
                        {h.tage_ueberfaellig} Tage überfällig
                      </span>
                    )}
                    <span style={{ fontSize: 12.5, color: C.textDim, marginLeft: "auto" }}>
                      {h.kanal === "email" ? "✉️ E-Mail" : "📄 PDF"} · {datumZeitDe(h.erstellt_am)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Karte>
      </div>

      <p style={{ color: C.textDim, fontSize: 12, marginTop: 20, lineHeight: 1.5 }}>
        Hinweis: „Als gesendet markieren" setzt die Mahnstufe und das Datum und legt einen
        Nachweis im Mahn-Verlauf ab – der eigentliche Versand per E-Mail folgt im Finale
        (verifizierte Absender-Domain).
      </p>

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

function Feld({ label, wert, farbe }: { label: string; wert: string; farbe: string }) {
  return (
    <div style={{ background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ color: C.textDim, fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: farbe }}>{wert}</div>
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
