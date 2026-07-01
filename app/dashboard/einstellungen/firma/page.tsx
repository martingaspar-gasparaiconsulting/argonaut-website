"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · R6-B — Firmen-Einstellungen
// Absenderdaten für §14-Rechnungen pflegen. Ein Datensatz pro Nutzer.
// Route: /dashboard/einstellungen/firma
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

type Felder = {
  firmenname: string;
  anschrift: string;
  steuernummer: string;
  ust_idnr: string;
  telefon: string;
  email: string;
  bank_name: string;
  bank_iban: string;
  bank_bic: string;
};

const LEER: Felder = {
  firmenname: "",
  anschrift: "",
  steuernummer: "",
  ust_idnr: "",
  telefon: "",
  email: "",
  bank_name: "",
  bank_iban: "",
  bank_bic: "",
};

export default function FirmenEinstellungen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichern, setSpeichern] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [datensatzId, setDatensatzId] = useState<string | null>(null);
  const [f, setF] = useState<Felder>(LEER);

  async function laden() {
    setLoading(true);
    setFehler(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data } = await supabase
        .from("firmen_einstellungen")
        .select("*")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (data) {
        const d = data as any;
        setDatensatzId(d.id);
        setF({
          firmenname: d.firmenname || "",
          anschrift: d.anschrift || "",
          steuernummer: d.steuernummer || "",
          ust_idnr: d.ust_idnr || "",
          telefon: d.telefon || "",
          email: d.email || "",
          bank_name: d.bank_name || "",
          bank_iban: d.bank_iban || "",
          bank_bic: d.bank_bic || "",
        });
      }
      setDirty(false);
    } catch (e: any) {
      setFehler(e?.message || "Fehler beim Laden.");
    }
    setLoading(false);
  }

  useEffect(() => {
    laden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(feld: keyof Felder, wert: string) {
    setF((prev) => ({ ...prev, [feld]: wert }));
    setDirty(true);
    setGespeichert(false);
  }

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

      const datensatz: any = {
        owner_user_id: user.id,
        firmenname: f.firmenname || null,
        anschrift: f.anschrift || null,
        steuernummer: f.steuernummer || null,
        ust_idnr: f.ust_idnr || null,
        telefon: f.telefon || null,
        email: f.email || null,
        bank_name: f.bank_name || null,
        bank_iban: f.bank_iban || null,
        bank_bic: f.bank_bic || null,
      };

      let err;
      if (datensatzId) {
        const { error } = await supabase
          .from("firmen_einstellungen")
          .update(datensatz)
          .eq("id", datensatzId);
        err = error;
      } else {
        const { data, error } = await supabase
          .from("firmen_einstellungen")
          .insert(datensatz)
          .select("id")
          .single();
        err = error;
        if (data) setDatensatzId((data as any).id);
      }

      if (err) {
        setFehler("Speichern fehlgeschlagen: " + err.message);
        setSpeichern(false);
        return;
      }

      setGespeichert(true);
      setDirty(false);
    } catch (e: any) {
      setFehler("Fehler: " + (e?.message || "unbekannt"));
    }
    setSpeichern(false);
  }

  // Für die kleine Vollständigkeits-Anzeige (§14-Pflichtfelder)
  const hatSteuer = !!(f.steuernummer.trim() || f.ust_idnr.trim());
  const pflichtOk = !!(f.firmenname.trim() && f.anschrift.trim() && hatSteuer);

  if (loading) {
    return (
      <Rahmen>
        <div style={{ color: C.textDim, padding: "60px 0", textAlign: "center" }}>
          ARGONAUT lädt die Firmendaten…
        </div>
      </Rahmen>
    );
  }

  return (
    <Rahmen>
      {/* KOPF */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => router.push("/dashboard")}
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
          ← Zurück zum Dashboard
        </button>
        <h1
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 28,
            fontWeight: 800,
            margin: 0,
            letterSpacing: "-0.5px",
          }}
        >
          🏢 Firmendaten
        </h1>
        <p style={{ color: C.textDim, fontSize: 14, margin: "8px 0 0", lineHeight: 1.6 }}>
          Diese Angaben erscheinen als Absender auf deinen Rechnungen (Pflichtangaben nach §14 UStG).
          Sobald sie hinterlegt sind, wird das Rechnungs-PDF vollständig.
        </p>
      </div>

      {/* Vollständigkeits-Hinweis */}
      <div
        style={{
          background: pflichtOk ? "rgba(76,175,125,0.1)" : "rgba(224,162,76,0.1)",
          border: `1px solid ${pflichtOk ? C.green : C.warn}55`,
          borderRadius: 12,
          padding: "12px 16px",
          marginBottom: 20,
          fontSize: 13.5,
          color: pflichtOk ? C.green : C.warn,
        }}
      >
        {pflichtOk
          ? "✓ Pflichtangaben vollständig – deine Rechnungen sind versandfertig."
          : "⚠ Für rechtssichere Rechnungen fehlen noch: Firmenname, Anschrift und Steuernummer oder USt-IdNr."}
      </div>

      {/* FIRMENANGABEN */}
      <div style={{ marginBottom: 20 }}>
        <Karte titel="Firmenangaben (Pflicht)">
          <label style={labelStyle}>Firmenname *</label>
          <input value={f.firmenname} onChange={(e) => set("firmenname", e.target.value)} placeholder="z. B. Schäfer Holzernteservice" style={inputStyle} />

          <label style={labelStyle}>Anschrift * (Straße, PLZ Ort)</label>
          <textarea
            value={f.anschrift}
            onChange={(e) => set("anschrift", e.target.value)}
            placeholder={"Musterstraße 1\n71234 Musterstadt"}
            rows={2}
            style={{ ...inputStyle, resize: "vertical", minHeight: 60, lineHeight: 1.5 }}
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginTop: 4 }}>
            <div>
              <label style={labelStyle}>Steuernummer</label>
              <input value={f.steuernummer} onChange={(e) => set("steuernummer", e.target.value)} placeholder="12/345/67890" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>USt-IdNr.</label>
              <input value={f.ust_idnr} onChange={(e) => set("ust_idnr", e.target.value)} placeholder="DE123456789" style={inputStyle} />
            </div>
          </div>
          <p style={{ color: C.textDim, fontSize: 12, margin: "8px 2px 0", lineHeight: 1.5 }}>
            Es genügt <strong style={{ color: "#fff" }}>eines</strong> von beiden (§14 UStG). USt-IdNr. wird
            bevorzugt angezeigt, falls beide vorhanden sind.
          </p>
        </Karte>
      </div>

      {/* KONTAKT */}
      <div style={{ marginBottom: 20 }}>
        <Karte titel="Kontakt (optional)">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            <div>
              <label style={labelStyle}>Telefon</label>
              <input value={f.telefon} onChange={(e) => set("telefon", e.target.value)} placeholder="+49 …" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>E-Mail</label>
              <input value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="rechnung@…" style={inputStyle} />
            </div>
          </div>
        </Karte>
      </div>

      {/* BANK */}
      <div style={{ marginBottom: 20 }}>
        <Karte titel="Bankverbindung (für Zahlungsangaben)">
          <label style={labelStyle}>Bank</label>
          <input value={f.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="z. B. Volksbank" style={inputStyle} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginTop: 4 }}>
            <div>
              <label style={labelStyle}>IBAN</label>
              <input value={f.bank_iban} onChange={(e) => set("bank_iban", e.target.value)} placeholder="DE00 0000 0000 0000 0000 00" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>BIC</label>
              <input value={f.bank_bic} onChange={(e) => set("bank_bic", e.target.value)} placeholder="GENODE…" style={inputStyle} />
            </div>
          </div>
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
            marginBottom: 20,
            fontSize: 14,
          }}
        >
          ⚠️ {fehler}
        </div>
      )}

      {/* SPEICHERN */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={speichernJetzt}
          disabled={speichern || !dirty}
          style={{
            ...btnGold,
            opacity: speichern || !dirty ? 0.55 : 1,
            cursor: speichern || !dirty ? "default" : "pointer",
          }}
        >
          {speichern ? "Speichert…" : gespeichert ? "✓ Gespeichert" : "💾 Firmendaten speichern"}
        </button>
      </div>

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
      <div style={{ maxWidth: 820, margin: "0 auto" }}>{children}</div>
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
  padding: "12px 22px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
};
