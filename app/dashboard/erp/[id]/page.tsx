"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 8 ERP · E3 Artikel-Detailseite
// Stammdaten (Bearbeiten-Modal) · manuelle Bestand-Buchung · Historie.
// Jede Buchung schreibt in lagerbewegungen (Audit-Trail) UND aktualisiert
// artikel.aktueller_bestand.
// ---------------------------------------------------------------------

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
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};

const EINHEIT_OPTIONEN = ["Stk", "kg", "g", "m", "m²", "m³", "l", "h", "Pauschal"];

interface Artikel {
  id: string;
  artikelnummer: string | null;
  bezeichnung: string;
  beschreibung: string | null;
  kategorie: string | null;
  einheit: string;
  einkaufspreis: number | null;
  verkaufspreis: number | null;
  mindestbestand: number;
  aktueller_bestand: number;
  lagerort: string | null;
  aktiv: boolean;
  created_at: string;
}

interface Bewegung {
  id: string;
  typ: string;
  menge: number;
  grund: string | null;
  referenz: string | null;
  bewegung_am: string;
}

type FormState = {
  artikelnummer: string;
  bezeichnung: string;
  beschreibung: string;
  kategorie: string;
  einheit: string;
  einkaufspreis: string;
  verkaufspreis: string;
  mindestbestand: string;
  lagerort: string;
  aktiv: boolean;
};

type BuchModus = "eingang" | "ausgang" | "inventur";

const TYP_LABEL: Record<string, string> = {
  eingang: "Zugang",
  ausgang: "Abgang",
  inventur: "Inventur",
  korrektur: "Korrektur",
};

function ampel(bestand: number, min: number): { farbe: string; text: string } {
  if (bestand <= 0) return { farbe: C.danger, text: "Leer" };
  if (min > 0 && bestand <= min) return { farbe: C.danger, text: "Kritisch" };
  if (min > 0 && bestand <= min * 1.5) return { farbe: C.warn, text: "Knapp" };
  return { farbe: C.green, text: "OK" };
}

function eur(n: number | null): string {
  return (Number(n) || 0).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}
function num(n: number | null): string {
  return (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 });
}
function datum(s: string): string {
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("de-DE");
}

export default function ArtikelDetail() {
  const params = useParams();
  const artikelId = Array.isArray(params.id)
    ? params.id[0]
    : (params.id as string);

  const [artikel, setArtikel] = useState<Artikel | null>(null);
  const [bewegungen, setBewegungen] = useState<Bewegung[]>([]);
  const [laden, setLaden] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Buchung
  const [modus, setModus] = useState<BuchModus>("eingang");
  const [buchMenge, setBuchMenge] = useState("");
  const [buchGrund, setBuchGrund] = useState("");
  const [buchen, setBuchen] = useState(false);
  const [buchFehler, setBuchFehler] = useState<string | null>(null);

  // Stammdaten-Modal
  const [modalOffen, setModalOffen] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [speichern, setSpeichern] = useState(false);
  const [formFehler, setFormFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      setUserId(userData.user?.id ?? null);
      await ladeAlles();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artikelId]);

  async function ladeAlles() {
    setLaden(true);
    const { data: art } = await supabase
      .from("artikel")
      .select("*")
      .eq("id", artikelId)
      .maybeSingle();
    setArtikel((art as Artikel) ?? null);

    const { data: bew } = await supabase
      .from("lagerbewegungen")
      .select("*")
      .eq("artikel_id", artikelId)
      .order("bewegung_am", { ascending: false });
    setBewegungen((bew as Bewegung[]) ?? []);
    setLaden(false);
  }

  const bestand = Number(artikel?.aktueller_bestand) || 0;
  const min = Number(artikel?.mindestbestand) || 0;
  const am = ampel(bestand, min);

  // Vorschau des neuen Bestands
  const vorschau = useMemo(() => {
    const m = buchMenge.trim() === "" ? 0 : Number(buchMenge.replace(",", "."));
    if (isNaN(m)) return null;
    if (modus === "eingang") return bestand + m;
    if (modus === "ausgang") return bestand - m;
    return m; // inventur: absoluter Zielwert
  }, [buchMenge, modus, bestand]);

  async function bucheBestand() {
    setBuchFehler(null);
    const m = buchMenge.trim() === "" ? NaN : Number(buchMenge.replace(",", "."));
    if (isNaN(m) || m < 0) {
      setBuchFehler("Bitte eine gültige Menge eingeben.");
      return;
    }
    if (!artikel) return;

    let delta: number;
    let neuerBestand: number;
    if (modus === "eingang") {
      delta = m;
      neuerBestand = bestand + m;
    } else if (modus === "ausgang") {
      delta = -m;
      neuerBestand = bestand - m;
    } else {
      // inventur: m ist der gezählte Zielbestand
      neuerBestand = m;
      delta = m - bestand;
    }

    setBuchen(true);

    const bewegung = {
      artikel_id: artikel.id,
      typ: modus,
      menge: delta,
      grund: buchGrund.trim() || null,
      referenz: "manuell",
      ...(userId ? { owner_user_id: userId } : {}),
    };

    const { error: e1 } = await supabase
      .from("lagerbewegungen")
      .insert(bewegung);
    if (e1) {
      setBuchen(false);
      setBuchFehler("Buchung fehlgeschlagen: " + e1.message);
      return;
    }

    const { error: e2 } = await supabase
      .from("artikel")
      .update({ aktueller_bestand: neuerBestand })
      .eq("id", artikel.id);
    if (e2) {
      setBuchen(false);
      setBuchFehler(
        "Bestand-Update fehlgeschlagen: " + e2.message + " (Buchung wurde gespeichert)"
      );
      return;
    }

    setBuchen(false);
    setBuchMenge("");
    setBuchGrund("");
    await ladeAlles();
  }

  function oeffneBearbeiten() {
    if (!artikel) return;
    setForm({
      artikelnummer: artikel.artikelnummer ?? "",
      bezeichnung: artikel.bezeichnung ?? "",
      beschreibung: artikel.beschreibung ?? "",
      kategorie: artikel.kategorie ?? "",
      einheit: artikel.einheit ?? "Stk",
      einkaufspreis:
        artikel.einkaufspreis != null ? String(artikel.einkaufspreis) : "",
      verkaufspreis:
        artikel.verkaufspreis != null ? String(artikel.verkaufspreis) : "",
      mindestbestand:
        artikel.mindestbestand != null ? String(artikel.mindestbestand) : "",
      lagerort: artikel.lagerort ?? "",
      aktiv: artikel.aktiv,
    });
    setFormFehler(null);
    setModalOffen(true);
  }

  function setF<K extends keyof FormState>(key: K, wert: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: wert } : f));
  }

  async function speichereStammdaten() {
    if (!form || !artikel) return;
    if (!form.bezeichnung.trim()) {
      setFormFehler("Bezeichnung ist ein Pflichtfeld.");
      return;
    }
    setSpeichern(true);
    setFormFehler(null);
    const zahl = (s: string) => (s.trim() === "" ? 0 : Number(s.replace(",", ".")));
    const payload = {
      artikelnummer: form.artikelnummer.trim() || null,
      bezeichnung: form.bezeichnung.trim(),
      beschreibung: form.beschreibung.trim() || null,
      kategorie: form.kategorie.trim() || null,
      einheit: form.einheit || "Stk",
      einkaufspreis: zahl(form.einkaufspreis),
      verkaufspreis: zahl(form.verkaufspreis),
      mindestbestand: zahl(form.mindestbestand),
      lagerort: form.lagerort.trim() || null,
      aktiv: form.aktiv,
    };
    const { error } = await supabase
      .from("artikel")
      .update(payload)
      .eq("id", artikel.id);
    setSpeichern(false);
    if (error) {
      setFormFehler("Speichern fehlgeschlagen: " + error.message);
      return;
    }
    setModalOffen(false);
    await ladeAlles();
  }

  // ---------- Styles ----------
  const card: React.CSSProperties = {
    background: C.navy2,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: "18px 20px",
  };
  const inputStil: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    fontSize: 14,
    boxSizing: "border-box",
  };
  const labelStil: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    color: C.textDim,
    marginBottom: 6,
    fontWeight: 600,
  };
  const btnGold: React.CSSProperties = {
    padding: "10px 18px",
    borderRadius: 8,
    border: "none",
    background: C.gold,
    color: C.navy,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  };
  const btnGhost: React.CSSProperties = {
    padding: "9px 14px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
    fontSize: 13,
    cursor: "pointer",
  };
  const infoZeile = (label: string, wert: React.ReactNode): React.ReactElement => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <span style={{ color: C.textDim, fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, textAlign: "right" }}>
        {wert}
      </span>
    </div>
  );
  const thStil: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: C.textDim,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap",
  };
  const tdStil: React.CSSProperties = {
    padding: "12px",
    fontSize: 14,
    color: "#fff",
    borderBottom: `1px solid ${C.border}`,
  };

  const modusBtn = (m: BuchModus, label: string): React.ReactElement => {
    const aktiv = modus === m;
    return (
      <button
        onClick={() => setModus(m)}
        style={{
          flex: 1,
          padding: "9px 0",
          borderRadius: 8,
          border: aktiv ? `1px solid ${C.gold}` : `1px solid ${C.border}`,
          background: aktiv ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.04)",
          color: aktiv ? C.gold : "#fff",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  };

  if (laden) {
    return (
      <div style={{ color: C.textDim, padding: 30 }}>Lade Artikel…</div>
    );
  }

  if (!artikel) {
    return (
      <div style={{ color: "#fff", maxWidth: 700, margin: "0 auto" }}>
        <a href="/dashboard/erp" style={{ color: C.cyan, fontSize: 14 }}>
          ← Zurück zum Lager
        </a>
        <div style={{ ...card, marginTop: 16, color: C.textDim }}>
          Artikel nicht gefunden.
        </div>
      </div>
    );
  }

  return (
    <div style={{ color: "#fff", maxWidth: 1100, margin: "0 auto" }}>
      <a href="/dashboard/erp" style={{ color: C.cyan, fontSize: 14 }}>
        ← Zurück zum Lager
      </a>

      {/* Kopf */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
          margin: "14px 0 20px",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 26,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              title={am.text}
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: am.farbe,
                boxShadow: `0 0 10px ${am.farbe}`,
              }}
            />
            {artikel.bezeichnung}
          </h1>
          <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: 14 }}>
            {artikel.artikelnummer ? `Nr. ${artikel.artikelnummer} · ` : ""}
            {artikel.kategorie || "Ohne Kategorie"}
          </p>
        </div>
        <button style={btnGhost} onClick={oeffneBearbeiten}>
          Stammdaten bearbeiten
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {/* Stammdaten */}
        <div style={card}>
          <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Stammdaten</h3>
          {infoZeile(
            "Aktueller Bestand",
            <span style={{ color: am.farbe }}>
              {num(bestand)} {artikel.einheit}
            </span>
          )}
          {infoZeile("Mindestbestand", `${num(min)} ${artikel.einheit}`)}
          {infoZeile("Einheit", artikel.einheit)}
          {infoZeile("Lagerort", artikel.lagerort || "—")}
          {infoZeile("Einkaufspreis", eur(artikel.einkaufspreis))}
          {infoZeile("Verkaufspreis", eur(artikel.verkaufspreis))}
          {infoZeile(
            "Lagerwert (EK)",
            <span style={{ color: C.gold }}>
              {eur(bestand * (Number(artikel.einkaufspreis) || 0))}
            </span>
          )}
          {infoZeile("Status", artikel.aktiv ? "Aktiv" : "Inaktiv")}
          {artikel.beschreibung && (
            <div style={{ marginTop: 12 }}>
              <div style={{ color: C.textDim, fontSize: 12, marginBottom: 4 }}>
                Beschreibung
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                {artikel.beschreibung}
              </div>
            </div>
          )}
        </div>

        {/* Bestand buchen */}
        <div style={card}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Bestand buchen</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {modusBtn("eingang", "Zugang")}
            {modusBtn("ausgang", "Abgang")}
            {modusBtn("inventur", "Inventur")}
          </div>

          <label style={labelStil}>
            {modus === "inventur"
              ? "Gezählter Bestand (Zielwert)"
              : "Menge"}
          </label>
          <input
            style={inputStil}
            value={buchMenge}
            onChange={(e) => setBuchMenge(e.target.value)}
            inputMode="decimal"
            placeholder="0"
          />

          <div style={{ marginTop: 12 }}>
            <label style={labelStil}>Grund / Notiz (optional)</label>
            <input
              style={inputStil}
              value={buchGrund}
              onChange={(e) => setBuchGrund(e.target.value)}
              placeholder={
                modus === "eingang"
                  ? "z.B. Wareneingang Lieferant X"
                  : modus === "ausgang"
                  ? "z.B. Entnahme Baustelle"
                  : "z.B. Jahresinventur"
              }
            />
          </div>

          {vorschau != null && buchMenge.trim() !== "" && (
            <div
              style={{
                marginTop: 12,
                fontSize: 13,
                color: C.textDim,
              }}
            >
              Neuer Bestand:{" "}
              <span
                style={{
                  color: vorschau < 0 ? C.danger : C.cyan,
                  fontWeight: 700,
                }}
              >
                {num(vorschau)} {artikel.einheit}
              </span>
              {vorschau < 0 && " (negativ!)"}
            </div>
          )}

          {buchFehler && (
            <div
              style={{
                marginTop: 12,
                color: C.danger,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {buchFehler}
            </div>
          )}

          <button
            style={{ ...btnGold, marginTop: 16, width: "100%", opacity: buchen ? 0.6 : 1 }}
            onClick={bucheBestand}
            disabled={buchen}
          >
            {buchen ? "Buche…" : "Buchen"}
          </button>
        </div>
      </div>

      {/* Historie */}
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <h3 style={{ margin: 0, padding: "16px 20px", fontSize: 16 }}>
          Bestandshistorie
        </h3>
        {bewegungen.length === 0 ? (
          <div style={{ padding: "0 20px 20px", color: C.textDim }}>
            Noch keine Buchungen. Nutze oben „Bestand buchen".
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStil}>Datum</th>
                <th style={thStil}>Art</th>
                <th style={{ ...thStil, textAlign: "right" }}>Menge</th>
                <th style={thStil}>Grund</th>
              </tr>
            </thead>
            <tbody>
              {bewegungen.map((b) => {
                const positiv = Number(b.menge) >= 0;
                return (
                  <tr key={b.id}>
                    <td style={{ ...tdStil, color: C.textDim, whiteSpace: "nowrap" }}>
                      {datum(b.bewegung_am)}
                    </td>
                    <td style={tdStil}>{TYP_LABEL[b.typ] || b.typ}</td>
                    <td
                      style={{
                        ...tdStil,
                        textAlign: "right",
                        fontWeight: 700,
                        color: positiv ? C.green : C.danger,
                      }}
                    >
                      {positiv ? "+" : ""}
                      {num(b.menge)} {artikel.einheit}
                    </td>
                    <td style={{ ...tdStil, color: C.textDim }}>
                      {b.grund || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Stammdaten-Modal */}
      {modalOffen && form && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "40px 16px",
            zIndex: 1000,
            overflowY: "auto",
          }}
          onClick={() => setModalOffen(false)}
        >
          <div
            style={{ ...card, width: "100%", maxWidth: 560, background: C.navy }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 800 }}>
              Stammdaten bearbeiten
            </h2>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
            >
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Bezeichnung *</label>
                <input
                  style={inputStil}
                  value={form.bezeichnung}
                  onChange={(e) => setF("bezeichnung", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Artikelnummer</label>
                <input
                  style={inputStil}
                  value={form.artikelnummer}
                  onChange={(e) => setF("artikelnummer", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Kategorie</label>
                <input
                  style={inputStil}
                  value={form.kategorie}
                  onChange={(e) => setF("kategorie", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Mindestbestand</label>
                <input
                  style={inputStil}
                  value={form.mindestbestand}
                  onChange={(e) => setF("mindestbestand", e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div>
                <label style={labelStil}>Einheit</label>
                <select
                  style={inputStil}
                  value={form.einheit}
                  onChange={(e) => setF("einheit", e.target.value)}
                >
                  {EINHEIT_OPTIONEN.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStil}>Einkaufspreis (€)</label>
                <input
                  style={inputStil}
                  value={form.einkaufspreis}
                  onChange={(e) => setF("einkaufspreis", e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div>
                <label style={labelStil}>Verkaufspreis (€)</label>
                <input
                  style={inputStil}
                  value={form.verkaufspreis}
                  onChange={(e) => setF("verkaufspreis", e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Lagerort</label>
                <input
                  style={inputStil}
                  value={form.lagerort}
                  onChange={(e) => setF("lagerort", e.target.value)}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Beschreibung</label>
                <textarea
                  style={{ ...inputStil, minHeight: 70, resize: "vertical" }}
                  value={form.beschreibung}
                  onChange={(e) => setF("beschreibung", e.target.value)}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 14,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.aktiv}
                    onChange={(e) => setF("aktiv", e.target.checked)}
                  />
                  Artikel aktiv
                </label>
              </div>
            </div>

            {formFehler && (
              <div
                style={{
                  marginTop: 14,
                  color: C.danger,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {formFehler}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 20,
              }}
            >
              <button style={btnGhost} onClick={() => setModalOffen(false)}>
                Abbrechen
              </button>
              <button
                style={{ ...btnGold, opacity: speichern ? 0.6 : 1 }}
                onClick={speichereStammdaten}
                disabled={speichern}
              >
                {speichern ? "Speichere…" : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
