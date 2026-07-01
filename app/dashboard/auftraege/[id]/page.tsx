"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ============================================================
// ARGONAUT OS · Modul 5 (Vertrag/Auftrag) · Detailseite A3+A4+A6+A7
// Positionen, Live-Summen, geführter Status-Workflow & PDF-Export
// Route: /dashboard/auftraege/[id]
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

type StatusKey =
  | "entwurf"
  | "beauftragt"
  | "in_bearbeitung"
  | "abgeschlossen"
  | "storniert";

const STATUS: Record<StatusKey, { label: string; farbe: string; icon: string }> =
  {
    entwurf: { label: "Entwurf", farbe: C.gold, icon: "📝" },
    beauftragt: { label: "Beauftragt", farbe: C.cyan, icon: "📩" },
    in_bearbeitung: { label: "In Bearbeitung", farbe: C.green, icon: "🔧" },
    abgeschlossen: { label: "Abgeschlossen", farbe: C.green, icon: "✅" },
    storniert: { label: "Storniert", farbe: C.textDim, icon: "⚪" },
  };

const FLUSS: StatusKey[] = ["entwurf", "beauftragt", "in_bearbeitung", "abgeschlossen"];

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

export default function AuftragDetail() {
  const router = useRouter();
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [nichtGefunden, setNichtGefunden] = useState(false);

  const [auftrag, setAuftrag] = useState<any>(null);

  const [titel, setTitel] = useState("");
  const [status, setStatus] = useState<StatusKey>("entwurf");
  const [auftragsdatum, setAuftragsdatum] = useState<string>("");
  const [lieferdatum, setLieferdatum] = useState<string>("");
  const [waehrung, setWaehrung] = useState("EUR");
  const [kontaktId, setKontaktId] = useState<string>("");
  const [firmaId, setFirmaId] = useState<string>("");
  const [notizen, setNotizen] = useState("");

  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [geladeneIds, setGeladeneIds] = useState<string[]>([]);

  const [dirty, setDirty] = useState(false);
  const [speichern, setSpeichern] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);
  const [pdfLaedt, setPdfLaedt] = useState(false);

  const [kontakte, setKontakte] = useState<any[]>([]);
  const [firmen, setFirmen] = useState<any[]>([]);

  async function laden() {
    setLoading(true);
    setFehler(null);

    const [aRes, pRes, kRes, fRes] = await Promise.all([
      supabase.from("auftraege").select("*").eq("id", id).single(),
      supabase
        .from("auftrag_positionen")
        .select("*")
        .eq("auftrag_id", id)
        .order("position", { ascending: true }),
      supabase.from("kontakte").select("*"),
      supabase.from("firmen").select("*"),
    ]);

    if (aRes.error || !aRes.data) {
      setNichtGefunden(true);
      setLoading(false);
      return;
    }

    const a = aRes.data as any;
    setAuftrag(a);
    setTitel(a.titel || "");
    setStatus((a.status as StatusKey) || "entwurf");
    setAuftragsdatum(a.auftragsdatum || "");
    setLieferdatum(a.lieferdatum || "");
    setWaehrung(a.waehrung || "EUR");
    setKontaktId(a.kontakt_id || "");
    setFirmaId(a.firma_id || "");
    setNotizen(a.notizen || "");

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

    if (!kRes.error && kRes.data) setKontakte(kRes.data as any[]);
    if (!fRes.error && fRes.data) setFirmen(fRes.data as any[]);

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
    setZeilen((prev) => [
      ...prev,
      { id: neueId(), bezeichnung: "", menge: "1", einheit: "Stk", einzelpreis: "0", mwst_satz: "19" },
    ]);
    markDirty();
  }
  function zeileAendern(zid: string, feld: keyof Zeile, wert: string) {
    setZeilen((prev) => prev.map((z) => (z.id === zid ? { ...z, [feld]: wert } : z)));
    markDirty();
  }
  function zeileLoeschen(zid: string) {
    setZeilen((prev) => prev.filter((z) => z.id !== zid));
    markDirty();
  }

  const summen = useMemo(() => {
    let netto = 0;
    let mwst = 0;
    for (const z of zeilen) {
      const zn = parseZahl(z.menge) * parseZahl(z.einzelpreis);
      netto += zn;
      mwst += zn * (parseZahl(z.mwst_satz) / 100);
    }
    netto = r2(netto);
    mwst = r2(mwst);
    return { netto, mwst, brutto: r2(netto + mwst) };
  }, [zeilen]);

  function zeileNetto(z: Zeile): number {
    return r2(parseZahl(z.menge) * parseZahl(z.einzelpreis));
  }

  const kontaktOptionen = useMemo(
    () => [...kontakte].sort((a, b) => kontaktName(a).localeCompare(kontaktName(b), "de")),
    [kontakte]
  );
  const firmaOptionen = useMemo(
    () => [...firmen].sort((a, b) => firmaName(a).localeCompare(firmaName(b), "de")),
    [firmen]
  );

  async function speichernJetzt() {
    if (!titel.trim()) {
      setFehler("Bitte einen Titel eingeben.");
      return;
    }
    setSpeichern(true);
    setFehler(null);

    const posRows = zeilen.map((z, i) => ({
      id: z.id,
      auftrag_id: id,
      position: i + 1,
      bezeichnung: z.bezeichnung || "",
      menge: parseZahl(z.menge),
      einheit: z.einheit || "Stk",
      einzelpreis: parseZahl(z.einzelpreis),
      mwst_satz: parseZahl(z.mwst_satz),
      gesamt_netto: zeileNetto(z),
    }));

    if (posRows.length > 0) {
      const { error: upErr } = await supabase
        .from("auftrag_positionen")
        .upsert(posRows, { onConflict: "id" });
      if (upErr) {
        setSpeichern(false);
        setFehler("Positionen: " + upErr.message);
        return;
      }
    }

    const aktuelleIds = zeilen.map((z) => z.id);
    const zuLoeschen = geladeneIds.filter((gid) => !aktuelleIds.includes(gid));
    if (zuLoeschen.length > 0) {
      const { error: delErr } = await supabase
        .from("auftrag_positionen")
        .delete()
        .in("id", zuLoeschen);
      if (delErr) {
        setSpeichern(false);
        setFehler("Positionen löschen: " + delErr.message);
        return;
      }
    }

    const { error } = await supabase
      .from("auftraege")
      .update({
        titel: titel.trim(),
        status,
        auftragsdatum: auftragsdatum || null,
        lieferdatum: lieferdatum || null,
        waehrung,
        kontakt_id: kontaktId || null,
        firma_id: firmaId || null,
        notizen: notizen || null,
        netto_summe: summen.netto,
        mwst_summe: summen.mwst,
        brutto_summe: summen.brutto,
      })
      .eq("id", id);

    setSpeichern(false);
    if (error) {
      setFehler(error.message);
      return;
    }

    setGeladeneIds(aktuelleIds);
    setDirty(false);
    setGespeichert(true);
    setTimeout(() => setGespeichert(false), 2500);
  }

  // ---------- A7: Auftragsbestätigung als PDF ----------
  async function pdfErstellen() {
    if (dirty) {
      const weiter = window.confirm(
        "Es gibt ungespeicherte Änderungen. Das PDF nutzt den aktuell sichtbaren Stand. Trotzdem erstellen?"
      );
      if (!weiter) return;
    }
    setPdfLaedt(true);
    setFehler(null);

    const gewaehlterKontakt = kontaktOptionen.find((k) => k.id === kontaktId);
    const gewaehlteFirma = firmaOptionen.find((f) => f.id === firmaId);

    const payload = {
      auftrag: {
        auftragsnummer: auftrag?.auftragsnummer || "",
        titel: titel.trim(),
        status,
        auftragsdatum: auftragsdatum || null,
        lieferdatum: lieferdatum || null,
        waehrung,
        netto_summe: summen.netto,
        mwst_summe: summen.mwst,
        brutto_summe: summen.brutto,
        notizen: notizen || "",
      },
      positionen: zeilen.map((z, i) => ({
        position: i + 1,
        bezeichnung: z.bezeichnung,
        menge: parseZahl(z.menge),
        einheit: z.einheit,
        einzelpreis: parseZahl(z.einzelpreis),
        mwst_satz: parseZahl(z.mwst_satz),
        gesamt_netto: zeileNetto(z),
      })),
      kontaktName: gewaehlterKontakt ? kontaktName(gewaehlterKontakt) : "",
      firmaName: gewaehlteFirma ? firmaName(gewaehlteFirma) : "",
    };

    try {
      const resp = await fetch("/api/auftragsbestaetigung-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        let msg = "PDF konnte nicht erstellt werden.";
        try {
          const j = await resp.json();
          if (j?.error) msg = j.error;
        } catch {}
        setFehler(msg);
        setPdfLaedt(false);
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const nr = auftrag?.auftragsnummer || "Auftrag";
      a.download = `Auftragsbestaetigung_${String(nr).replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setFehler("PDF-Fehler: " + (e?.message || "unbekannt"));
    }
    setPdfLaedt(false);
  }

  if (loading) {
    return (
      <Rahmen>
        <div style={{ padding: 60, textAlign: "center", color: C.textDim }}>
          ARGONAUT lädt den Auftrag…
        </div>
      </Rahmen>
    );
  }

  if (nichtGefunden) {
    return (
      <Rahmen>
        <div style={{ padding: 60, textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔍</div>
          <h2 style={{ fontFamily: "'Syne', sans-serif", margin: "0 0 8px" }}>
            Auftrag nicht gefunden
          </h2>
          <p style={{ color: C.textDim, marginBottom: 20 }}>
            Dieser Auftrag existiert nicht oder gehört nicht zu deinem Konto.
          </p>
          <button onClick={() => router.push("/dashboard/auftraege")} style={btnGold}>
            ← Zurück zu den Aufträgen
          </button>
        </div>
      </Rahmen>
    );
  }

  const aktIndex = FLUSS.indexOf(status);
  const istStorniert = status === "storniert";
  const naechster = aktIndex >= 0 && aktIndex < FLUSS.length - 1 ? FLUSS[aktIndex + 1] : null;

  return (
    <Rahmen>
      {/* Kopfzeile */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => {
            if (dirty && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
            router.push("/dashboard/auftraege");
          }}
          style={{
            background: "transparent",
            border: "none",
            color: C.textDim,
            cursor: "pointer",
            fontSize: 14,
            padding: 0,
            marginBottom: 14,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          ← Zurück zu den Aufträgen
        </button>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <div style={{ color: C.textDim, fontSize: 13, fontFamily: "monospace", marginBottom: 4 }}>
              {auftrag?.auftragsnummer || "—"}
            </div>
            <h1
              style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: 28,
                fontWeight: 700,
                margin: 0,
                letterSpacing: "-0.5px",
              }}
            >
              {titel || "Auftrag"}
            </h1>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {gespeichert && (
              <span style={{ color: C.green, fontSize: 13, fontWeight: 600 }}>✓ gespeichert</span>
            )}
            {dirty && (
              <span style={{ color: C.warn, fontSize: 13, fontWeight: 600 }}>● ungespeichert</span>
            )}
            <button
              onClick={pdfErstellen}
              disabled={pdfLaedt}
              style={{
                background: "transparent",
                color: C.cyan,
                border: `1px solid ${C.cyan}77`,
                borderRadius: 10,
                padding: "11px 18px",
                fontSize: 14,
                fontWeight: 700,
                cursor: pdfLaedt ? "not-allowed" : "pointer",
                fontFamily: "'DM Sans', sans-serif",
                opacity: pdfLaedt ? 0.6 : 1,
              }}
            >
              {pdfLaedt ? "ARGONAUT erstellt das PDF…" : "📄 Bestätigung als PDF"}
            </button>
            <button
              onClick={speichernJetzt}
              disabled={speichern || !dirty}
              style={{
                ...btnGold,
                background: speichern || !dirty ? C.border : C.gold,
                color: speichern || !dirty ? C.textDim : C.navy,
                cursor: speichern || !dirty ? "not-allowed" : "pointer",
              }}
            >
              {speichern ? "Speichert…" : "💾 Speichern"}
            </button>
          </div>
        </div>
      </div>

      {/* GEFÜHRTER Status-Workflow */}
      <div
        style={{
          background: C.navy2,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "18px 20px",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div style={{ ...sektionLabel, marginBottom: 0 }}>Status</div>
          {istStorniert ? (
            <button onClick={() => aendern(setStatus, "entwurf")} style={reaktivierBtn}>
              ↺ Reaktivieren
            </button>
          ) : (
            <button onClick={() => aendern(setStatus, "storniert")} style={stornoBtn}>
              ⊘ Stornieren
            </button>
          )}
        </div>

        {istStorniert ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
            <span
              style={{
                background: `${C.danger}22`,
                color: C.danger,
                border: `1px solid ${C.danger}66`,
                borderRadius: 20,
                padding: "6px 16px",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              ⚪ Storniert
            </span>
            <span style={{ color: C.textDim, fontSize: 13.5 }}>
              Zählt nicht zum Auftragswert. Mit „Reaktivieren" zurück in den Entwurf.
            </span>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", paddingBottom: 4 }}>
              {FLUSS.map((s, i) => {
                const info = STATUS[s];
                const erledigt = i < aktIndex;
                const aktuell = i === aktIndex;
                const istNaechster = i === aktIndex + 1;

                let kreisBg = "transparent";
                let kreisBorder = `1px solid ${C.border}`;
                let kreisColor = C.textDim;
                let inhalt: string = info.icon;

                if (erledigt) {
                  kreisBg = C.green;
                  kreisBorder = `1px solid ${C.green}`;
                  kreisColor = C.navy;
                  inhalt = "✓";
                } else if (aktuell) {
                  kreisBg = info.farbe;
                  kreisBorder = `1px solid ${info.farbe}`;
                  kreisColor = C.navy;
                } else if (istNaechster) {
                  kreisBg = "transparent";
                  kreisBorder = `2px solid ${C.gold}`;
                  kreisColor = C.gold;
                }

                const labelColor = erledigt
                  ? C.green
                  : aktuell
                  ? info.farbe
                  : istNaechster
                  ? C.gold
                  : C.textDim;

                return (
                  <React.Fragment key={s}>
                    <button
                      onClick={() => aendern(setStatus, s)}
                      title={aktuell ? "Aktueller Status" : `Auf „${info.label}" setzen`}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 92,
                        padding: 0,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: "50%",
                          background: kreisBg,
                          border: kreisBorder,
                          color: kreisColor,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: erledigt ? 18 : 16,
                          fontWeight: 700,
                          boxShadow: aktuell ? `0 0 0 4px ${info.farbe}22` : "none",
                        }}
                      >
                        {inhalt}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: labelColor, textAlign: "center" }}>
                        {info.label}
                      </span>
                    </button>

                    {i < FLUSS.length - 1 && (
                      <div
                        style={{
                          flex: 1,
                          height: 2,
                          minWidth: 20,
                          marginTop: 18,
                          background: i < aktIndex ? C.green : C.border,
                        }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {naechster && (
              <div style={{ marginTop: 14, fontSize: 13, color: C.textDim }}>
                Nächster Schritt:{" "}
                <span style={{ color: C.gold, fontWeight: 600 }}>
                  {STATUS[naechster].icon} {STATUS[naechster].label}
                </span>{" "}
                — oder frei eine Stufe anklicken.
              </div>
            )}
            {!naechster && aktIndex === FLUSS.length - 1 && (
              <div style={{ marginTop: 14, fontSize: 13, color: C.green, fontWeight: 600 }}>
                ✓ Auftrag abgeschlossen.
              </div>
            )}
          </>
        )}
      </div>

      {/* Stammdaten + Zuordnung */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginBottom: 20,
        }}
      >
        <Karte titel="Stammdaten">
          <label style={labelStyle}>Titel *</label>
          <input value={titel} onChange={(e) => aendern(setTitel, e.target.value)} style={inputStyle} />
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Auftragsdatum</label>
              <input type="date" value={auftragsdatum} onChange={(e) => aendern(setAuftragsdatum, e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Lieferdatum</label>
              <input type="date" value={lieferdatum} onChange={(e) => aendern(setLieferdatum, e.target.value)} style={inputStyle} />
            </div>
          </div>
          <label style={labelStyle}>Währung</label>
          <select value={waehrung} onChange={(e) => aendern(setWaehrung, e.target.value)} style={inputStyle}>
            <option value="EUR" style={{ background: C.navy2 }}>EUR (€)</option>
            <option value="CHF" style={{ background: C.navy2 }}>CHF</option>
            <option value="USD" style={{ background: C.navy2 }}>USD ($)</option>
          </select>
        </Karte>

        <Karte titel="Zuordnung">
          <label style={labelStyle}>Kontakt</label>
          <select value={kontaktId} onChange={(e) => aendern(setKontaktId, e.target.value)} style={inputStyle}>
            <option value="" style={{ background: C.navy2 }}>— kein Kontakt —</option>
            {kontaktOptionen.map((k) => (
              <option key={k.id} value={k.id} style={{ background: C.navy2 }}>{kontaktName(k)}</option>
            ))}
          </select>
          <label style={labelStyle}>Firma</label>
          <select value={firmaId} onChange={(e) => aendern(setFirmaId, e.target.value)} style={inputStyle}>
            <option value="" style={{ background: C.navy2 }}>— keine Firma —</option>
            {firmaOptionen.map((f) => (
              <option key={f.id} value={f.id} style={{ background: C.navy2 }}>{firmaName(f)}</option>
            ))}
          </select>
          <p style={{ color: C.textDim, fontSize: 12, marginTop: 14, lineHeight: 1.5 }}>
            Kontakt & Firma stammen aus deinem CRM. Nicht gefunden? Leg sie zuerst im Vertrieb/CRM an.
          </p>
        </Karte>
      </div>

      {/* POSITIONEN */}
      <div
        style={{
          background: C.navy2,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "20px 22px",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ ...sektionLabel, marginBottom: 0 }}>Positionen</div>
          <button onClick={zeileHinzufuegen} style={btnKlein}>+ Position</button>
        </div>

        {zeilen.length === 0 ? (
          <div style={{ padding: "28px 0", textAlign: "center", color: C.textDim, fontSize: 14 }}>
            Noch keine Positionen. Füg oben rechts die erste hinzu.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div style={posKopf}>
              <div>Bezeichnung</div>
              <div style={{ textAlign: "right" }}>Menge</div>
              <div>Einheit</div>
              <div style={{ textAlign: "right" }}>Einzelpreis</div>
              <div style={{ textAlign: "right" }}>MwSt %</div>
              <div style={{ textAlign: "right" }}>Summe netto</div>
              <div></div>
            </div>

            {zeilen.map((z) => (
              <div key={z.id} style={posZeile}>
                <input value={z.bezeichnung} onChange={(e) => zeileAendern(z.id, "bezeichnung", e.target.value)} placeholder="z. B. Edelstahlgeländer, 2 m" style={zellInput} />
                <input value={z.menge} onChange={(e) => zeileAendern(z.id, "menge", e.target.value)} inputMode="decimal" style={{ ...zellInput, textAlign: "right" }} />
                <select value={z.einheit} onChange={(e) => zeileAendern(z.id, "einheit", e.target.value)} style={zellInput}>
                  {EINHEITEN.map((e) => (
                    <option key={e} value={e} style={{ background: C.navy2 }}>{e}</option>
                  ))}
                </select>
                <input value={z.einzelpreis} onChange={(e) => zeileAendern(z.id, "einzelpreis", e.target.value)} inputMode="decimal" style={{ ...zellInput, textAlign: "right" }} />
                <input value={z.mwst_satz} onChange={(e) => zeileAendern(z.id, "mwst_satz", e.target.value)} inputMode="decimal" style={{ ...zellInput, textAlign: "right" }} />
                <div style={{ textAlign: "right", fontSize: 14, fontWeight: 600, alignSelf: "center", color: C.cyan }}>
                  {geld(zeileNetto(z), waehrung)}
                </div>
                <button onClick={() => zeileLoeschen(z.id)} title="Position löschen" style={{ background: "transparent", border: "none", color: C.textDim, cursor: "pointer", fontSize: 15, alignSelf: "center" }}>
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SUMMEN */}
      <Karte titel="Summen">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <SummeFeld label="Netto" wert={geld(summen.netto, waehrung)} farbe={C.cyan} />
          <SummeFeld label="MwSt" wert={geld(summen.mwst, waehrung)} farbe={C.textDim} />
          <SummeFeld label="Brutto" wert={geld(summen.brutto, waehrung)} farbe={C.gold} />
        </div>
        <p style={{ color: C.textDim, fontSize: 12, marginTop: 14 }}>
          Summen rechnen live aus den Positionen. Mit „💾 Speichern" werden sie festgeschrieben.
        </p>
      </Karte>

      {/* Notizen */}
      <div style={{ marginTop: 20 }}>
        <Karte titel="Notizen">
          <textarea
            value={notizen}
            onChange={(e) => aendern(setNotizen, e.target.value)}
            placeholder="Interne Notizen zum Auftrag…"
            rows={5}
            style={{ ...inputStyle, resize: "vertical", minHeight: 110, lineHeight: 1.5 }}
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
  margin: "12px 0 6px",
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
