"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 8 ERP · E4 Lieferanten-Detailseite
// Kontaktdaten (tel:/mailto:/Website) · Bearbeiten · Artikel dieses Lieferanten.
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

interface Lieferant {
  id: string;
  name: string;
  ansprechpartner: string | null;
  email: string | null;
  telefon: string | null;
  adresse: string | null;
  website: string | null;
  kundennummer: string | null;
  notizen: string | null;
  aktiv: boolean;
  created_at: string;
}

interface ArtikelKurz {
  id: string;
  bezeichnung: string;
  artikelnummer: string | null;
  einheit: string;
  aktueller_bestand: number;
  mindestbestand: number;
}

type FormState = {
  name: string;
  ansprechpartner: string;
  email: string;
  telefon: string;
  adresse: string;
  website: string;
  kundennummer: string;
  notizen: string;
  aktiv: boolean;
};

function webUrl(w: string): string {
  const t = w.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : "https://" + t;
}
function num(n: number | null): string {
  return (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

export default function LieferantDetail() {
  const params = useParams();
  const lieferantId = Array.isArray(params.id)
    ? params.id[0]
    : (params.id as string);

  const [lieferant, setLieferant] = useState<Lieferant | null>(null);
  const [artikel, setArtikel] = useState<ArtikelKurz[]>([]);
  const [laden, setLaden] = useState(true);

  const [modalOffen, setModalOffen] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [speichern, setSpeichern] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    lade();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lieferantId]);

  async function lade() {
    setLaden(true);
    const { data: lief } = await supabase
      .from("lieferanten")
      .select("*")
      .eq("id", lieferantId)
      .maybeSingle();
    setLieferant((lief as Lieferant) ?? null);

    const { data: art } = await supabase
      .from("artikel")
      .select("id, bezeichnung, artikelnummer, einheit, aktueller_bestand, mindestbestand")
      .eq("lieferant_id", lieferantId)
      .order("bezeichnung", { ascending: true });
    setArtikel((art as ArtikelKurz[]) ?? []);
    setLaden(false);
  }

  function oeffneBearbeiten() {
    if (!lieferant) return;
    setForm({
      name: lieferant.name ?? "",
      ansprechpartner: lieferant.ansprechpartner ?? "",
      email: lieferant.email ?? "",
      telefon: lieferant.telefon ?? "",
      adresse: lieferant.adresse ?? "",
      website: lieferant.website ?? "",
      kundennummer: lieferant.kundennummer ?? "",
      notizen: lieferant.notizen ?? "",
      aktiv: lieferant.aktiv,
    });
    setFehler(null);
    setModalOffen(true);
  }

  function setF<K extends keyof FormState>(key: K, wert: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: wert } : f));
  }

  async function speichere() {
    if (!form || !lieferant) return;
    if (!form.name.trim()) {
      setFehler("Name ist ein Pflichtfeld.");
      return;
    }
    setSpeichern(true);
    setFehler(null);
    const payload = {
      name: form.name.trim(),
      ansprechpartner: form.ansprechpartner.trim() || null,
      email: form.email.trim() || null,
      telefon: form.telefon.trim() || null,
      adresse: form.adresse.trim() || null,
      website: form.website.trim() || null,
      kundennummer: form.kundennummer.trim() || null,
      notizen: form.notizen.trim() || null,
      aktiv: form.aktiv,
    };
    const { error } = await supabase
      .from("lieferanten")
      .update(payload)
      .eq("id", lieferant.id);
    setSpeichern(false);
    if (error) {
      setFehler("Speichern fehlgeschlagen: " + error.message);
      return;
    }
    setModalOffen(false);
    await lade();
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
  const linkStil: React.CSSProperties = { color: C.cyan, textDecoration: "none" };
  const infoZeile = (
    label: string,
    wert: React.ReactNode
  ): React.ReactElement => (
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

  if (laden) {
    return <div style={{ color: C.textDim, padding: 30 }}>Lade Lieferant…</div>;
  }

  if (!lieferant) {
    return (
      <div style={{ color: "#fff", maxWidth: 700, margin: "0 auto" }}>
        <a href="/dashboard/erp/lieferanten" style={{ color: C.cyan, fontSize: 14 }}>
          ← Zurück zu Lieferanten
        </a>
        <div style={{ ...card, marginTop: 16, color: C.textDim }}>
          Lieferant nicht gefunden.
        </div>
      </div>
    );
  }

  return (
    <div style={{ color: "#fff", maxWidth: 1000, margin: "0 auto" }}>
      <a href="/dashboard/erp/lieferanten" style={{ color: C.cyan, fontSize: 14 }}>
        ← Zurück zu Lieferanten
      </a>

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
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>
            {lieferant.name}
            {!lieferant.aktiv && (
              <span
                style={{
                  marginLeft: 10,
                  fontSize: 12,
                  color: C.textDim,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: "2px 8px",
                  verticalAlign: "middle",
                }}
              >
                inaktiv
              </span>
            )}
          </h1>
          {lieferant.kundennummer && (
            <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: 14 }}>
              Kundennr. {lieferant.kundennummer}
            </p>
          )}
        </div>
        <button style={btnGhost} onClick={oeffneBearbeiten}>
          Bearbeiten
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
        {/* Kontakt */}
        <div style={card}>
          <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Kontakt</h3>
          {infoZeile("Ansprechpartner", lieferant.ansprechpartner || "—")}
          {infoZeile(
            "Telefon",
            lieferant.telefon ? (
              <a href={`tel:${lieferant.telefon}`} style={linkStil}>
                {lieferant.telefon}
              </a>
            ) : (
              "—"
            )
          )}
          {infoZeile(
            "E-Mail",
            lieferant.email ? (
              <a href={`mailto:${lieferant.email}`} style={linkStil}>
                {lieferant.email}
              </a>
            ) : (
              "—"
            )
          )}
          {infoZeile(
            "Website",
            lieferant.website ? (
              <a
                href={webUrl(lieferant.website)}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStil}
              >
                {lieferant.website}
              </a>
            ) : (
              "—"
            )
          )}
          {infoZeile("Adresse", lieferant.adresse || "—")}
        </div>

        {/* Notizen */}
        <div style={card}>
          <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Notizen</h3>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: lieferant.notizen ? "#fff" : C.textDim,
              whiteSpace: "pre-wrap",
            }}
          >
            {lieferant.notizen || "Keine Notizen hinterlegt."}
          </div>
        </div>
      </div>

      {/* Artikel dieses Lieferanten */}
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <h3 style={{ margin: 0, padding: "16px 20px", fontSize: 16 }}>
          Artikel von diesem Lieferanten
        </h3>
        {artikel.length === 0 ? (
          <div style={{ padding: "0 20px 20px", color: C.textDim }}>
            Diesem Lieferanten sind noch keine Artikel zugeordnet. Die Zuordnung
            erfolgt im Artikel (Feld „Lieferant").
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStil}>Artikel</th>
                <th style={{ ...thStil, textAlign: "right" }}>Bestand</th>
                <th style={{ ...thStil, textAlign: "right" }}>Mindest</th>
              </tr>
            </thead>
            <tbody>
              {artikel.map((a) => {
                const bst = Number(a.aktueller_bestand) || 0;
                const mn = Number(a.mindestbestand) || 0;
                const unter = bst <= 0 || (mn > 0 && bst <= mn);
                return (
                  <tr key={a.id}>
                    <td style={tdStil}>
                      <a
                        href={`/dashboard/erp/${a.id}`}
                        style={{ ...linkStil, fontWeight: 600 }}
                      >
                        {a.bezeichnung}
                      </a>
                      {a.artikelnummer && (
                        <div style={{ fontSize: 12, color: C.textDim }}>
                          Nr. {a.artikelnummer}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        ...tdStil,
                        textAlign: "right",
                        fontWeight: 700,
                        color: unter ? C.danger : C.green,
                      }}
                    >
                      {num(a.aktueller_bestand)} {a.einheit}
                    </td>
                    <td
                      style={{ ...tdStil, textAlign: "right", color: C.textDim }}
                    >
                      {num(a.mindestbestand)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Bearbeiten-Modal */}
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
              Lieferant bearbeiten
            </h2>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
            >
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Name *</label>
                <input
                  style={inputStil}
                  value={form.name}
                  onChange={(e) => setF("name", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Ansprechpartner</label>
                <input
                  style={inputStil}
                  value={form.ansprechpartner}
                  onChange={(e) => setF("ansprechpartner", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Kundennummer (bei uns)</label>
                <input
                  style={inputStil}
                  value={form.kundennummer}
                  onChange={(e) => setF("kundennummer", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Telefon</label>
                <input
                  style={inputStil}
                  value={form.telefon}
                  onChange={(e) => setF("telefon", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>E-Mail</label>
                <input
                  style={inputStil}
                  value={form.email}
                  onChange={(e) => setF("email", e.target.value)}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Website</label>
                <input
                  style={inputStil}
                  value={form.website}
                  onChange={(e) => setF("website", e.target.value)}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Adresse</label>
                <input
                  style={inputStil}
                  value={form.adresse}
                  onChange={(e) => setF("adresse", e.target.value)}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Notizen</label>
                <textarea
                  style={{ ...inputStil, minHeight: 70, resize: "vertical" }}
                  value={form.notizen}
                  onChange={(e) => setF("notizen", e.target.value)}
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
                  Lieferant aktiv
                </label>
              </div>
            </div>

            {fehler && (
              <div
                style={{
                  marginTop: 14,
                  color: C.danger,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {fehler}
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
                onClick={speichere}
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
