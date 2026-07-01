"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ============================================================
// ARGONAUT OS · Modul 5 (Vertrag/Auftrag) · Block A3: Auftrag-Detailseite
// Route: /dashboard/auftraege/[id]
// ============================================================

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---------- Brand-Farben ----------
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

// ---------- Status-Definitionen (Ampel) ----------
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

const STATUS_REIHENFOLGE: StatusKey[] = [
  "entwurf",
  "beauftragt",
  "in_bearbeitung",
  "abgeschlossen",
  "storniert",
];

// ---------- Geld formatieren ----------
function geld(n: number | null | undefined, waehrung = "EUR"): string {
  const wert = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: waehrung || "EUR",
  }).format(wert);
}

// ---------- Anzeigename Kontakt/Firma robust bauen ----------
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

  // Auftrag-Rohdaten (für Summen-Anzeige)
  const [auftrag, setAuftrag] = useState<any>(null);

  // Bearbeitbare Felder
  const [titel, setTitel] = useState("");
  const [status, setStatus] = useState<StatusKey>("entwurf");
  const [auftragsdatum, setAuftragsdatum] = useState<string>("");
  const [lieferdatum, setLieferdatum] = useState<string>("");
  const [waehrung, setWaehrung] = useState("EUR");
  const [kontaktId, setKontaktId] = useState<string>("");
  const [firmaId, setFirmaId] = useState<string>("");
  const [notizen, setNotizen] = useState("");

  const [dirty, setDirty] = useState(false);
  const [speichern, setSpeichern] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);

  // Auswahl-Listen
  const [kontakte, setKontakte] = useState<any[]>([]);
  const [firmen, setFirmen] = useState<any[]>([]);

  // ---------- Laden ----------
  async function laden() {
    setLoading(true);
    setFehler(null);

    const [aRes, kRes, fRes] = await Promise.all([
      supabase.from("auftraege").select("*").eq("id", id).single(),
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

    if (!kRes.error && kRes.data) setKontakte(kRes.data as any[]);
    if (!fRes.error && fRes.data) setFirmen(fRes.data as any[]);

    setDirty(false);
    setLoading(false);
  }

  useEffect(() => {
    if (id) laden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // kleiner Helper: Feld ändern + dirty setzen
  function aendern<T>(setter: (v: T) => void, v: T) {
    setter(v);
    setDirty(true);
    setGespeichert(false);
  }

  // sortierte Auswahl-Listen
  const kontaktOptionen = useMemo(
    () =>
      [...kontakte].sort((a, b) =>
        kontaktName(a).localeCompare(kontaktName(b), "de")
      ),
    [kontakte]
  );
  const firmaOptionen = useMemo(
    () =>
      [...firmen].sort((a, b) =>
        firmaName(a).localeCompare(firmaName(b), "de")
      ),
    [firmen]
  );

  // ---------- Speichern ----------
  async function speichernJetzt() {
    if (!titel.trim()) {
      setFehler("Bitte einen Titel eingeben.");
      return;
    }
    setSpeichern(true);
    setFehler(null);
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
      })
      .eq("id", id);
    setSpeichern(false);

    if (error) {
      setFehler(error.message);
      return;
    }
    setDirty(false);
    setGespeichert(true);
    setTimeout(() => setGespeichert(false), 2500);
  }

  // ============================================================
  // Render: Ladezustand / Nicht gefunden
  // ============================================================
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
          <h2
            style={{
              fontFamily: "'Syne', sans-serif",
              margin: "0 0 8px",
            }}
          >
            Auftrag nicht gefunden
          </h2>
          <p style={{ color: C.textDim, marginBottom: 20 }}>
            Dieser Auftrag existiert nicht oder gehört nicht zu deinem Konto.
          </p>
          <button
            onClick={() => router.push("/dashboard/auftraege")}
            style={btnGold}
          >
            ← Zurück zu den Aufträgen
          </button>
        </div>
      </Rahmen>
    );
  }

  const st = STATUS[status] || STATUS.entwurf;

  return (
    <Rahmen>
      {/* Kopfzeile */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => {
            if (
              dirty &&
              !window.confirm("Ungespeicherte Änderungen verwerfen?")
            )
              return;
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
            <div
              style={{
                color: C.textDim,
                fontSize: 13,
                fontFamily: "monospace",
                marginBottom: 4,
              }}
            >
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

          <div
            style={{ display: "flex", gap: 10, alignItems: "center" }}
          >
            {gespeichert && (
              <span style={{ color: C.green, fontSize: 13, fontWeight: 600 }}>
                ✓ gespeichert
              </span>
            )}
            {dirty && (
              <span style={{ color: C.warn, fontSize: 13, fontWeight: 600 }}>
                ● ungespeichert
              </span>
            )}
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

      {/* Status-Leiste */}
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
            color: C.textDim,
            fontSize: 12.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: 12,
          }}
        >
          Status
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STATUS_REIHENFOLGE.map((s) => {
            const aktiv = status === s;
            const info = STATUS[s];
            return (
              <button
                key={s}
                onClick={() => aendern(setStatus, s)}
                style={{
                  background: aktiv ? `${info.farbe}22` : "transparent",
                  color: aktiv ? info.farbe : C.textDim,
                  border: `1px solid ${aktiv ? `${info.farbe}88` : C.border}`,
                  borderRadius: 22,
                  padding: "8px 16px",
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {info.icon} {info.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Zwei-Spalten-Layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginBottom: 20,
        }}
      >
        {/* Stammdaten */}
        <Karte titel="Stammdaten">
          <label style={labelStyle}>Titel *</label>
          <input
            value={titel}
            onChange={(e) => aendern(setTitel, e.target.value)}
            style={inputStyle}
          />

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Auftragsdatum</label>
              <input
                type="date"
                value={auftragsdatum}
                onChange={(e) => aendern(setAuftragsdatum, e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Lieferdatum</label>
              <input
                type="date"
                value={lieferdatum}
                onChange={(e) => aendern(setLieferdatum, e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <label style={labelStyle}>Währung</label>
          <select
            value={waehrung}
            onChange={(e) => aendern(setWaehrung, e.target.value)}
            style={inputStyle}
          >
            <option value="EUR" style={{ background: C.navy2 }}>
              EUR (€)
            </option>
            <option value="CHF" style={{ background: C.navy2 }}>
              CHF
            </option>
            <option value="USD" style={{ background: C.navy2 }}>
              USD ($)
            </option>
          </select>
        </Karte>

        {/* Zuordnung */}
        <Karte titel="Zuordnung">
          <label style={labelStyle}>Kontakt</label>
          <select
            value={kontaktId}
            onChange={(e) => aendern(setKontaktId, e.target.value)}
            style={inputStyle}
          >
            <option value="" style={{ background: C.navy2 }}>
              — kein Kontakt —
            </option>
            {kontaktOptionen.map((k) => (
              <option key={k.id} value={k.id} style={{ background: C.navy2 }}>
                {kontaktName(k)}
              </option>
            ))}
          </select>

          <label style={labelStyle}>Firma</label>
          <select
            value={firmaId}
            onChange={(e) => aendern(setFirmaId, e.target.value)}
            style={inputStyle}
          >
            <option value="" style={{ background: C.navy2 }}>
              — keine Firma —
            </option>
            {firmaOptionen.map((f) => (
              <option key={f.id} value={f.id} style={{ background: C.navy2 }}>
                {firmaName(f)}
              </option>
            ))}
          </select>

          <p
            style={{
              color: C.textDim,
              fontSize: 12,
              marginTop: 14,
              lineHeight: 1.5,
            }}
          >
            Kontakt & Firma stammen aus deinem CRM. Nicht gefunden? Leg sie
            zuerst im Vertrieb/CRM an.
          </p>
        </Karte>
      </div>

      {/* Summen (read-only, kommen aus den Positionen in A4) */}
      <Karte titel="Summen">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          <SummeFeld
            label="Netto"
            wert={geld(auftrag?.netto_summe, waehrung)}
            farbe={C.cyan}
          />
          <SummeFeld
            label="MwSt"
            wert={geld(auftrag?.mwst_summe, waehrung)}
            farbe={C.textDim}
          />
          <SummeFeld
            label="Brutto"
            wert={geld(auftrag?.brutto_summe, waehrung)}
            farbe={C.gold}
          />
        </div>
        <p style={{ color: C.textDim, fontSize: 12, marginTop: 14 }}>
          Die Summen berechnen sich automatisch aus den Positionen — der
          Positions-Editor kommt im nächsten Bau-Schritt.
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
            style={{
              ...inputStyle,
              resize: "vertical",
              minHeight: 110,
              lineHeight: 1.5,
            }}
          />
        </Karte>
      </div>

      {/* Fehler */}
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

// ============================================================
// Layout-Bausteine
// ============================================================
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
      <div style={{ maxWidth: 900, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

function Karte({
  titel,
  children,
}: {
  titel: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: C.navy2,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "20px 22px",
      }}
    >
      <div
        style={{
          color: C.textDim,
          fontSize: 12.5,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginBottom: 14,
        }}
      >
        {titel}
      </div>
      {children}
    </div>
  );
}

function SummeFeld({
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
        background: C.navy,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <div style={{ color: C.textDim, fontSize: 12, marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 20,
          fontWeight: 700,
          color: farbe,
        }}
      >
        {wert}
      </div>
    </div>
  );
}

// ============================================================
// Styles
// ============================================================
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
