"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import AdressBlock from "../../../_components/AdressBlock";

// ---------------------------------------------------------------------
// ARGONAUT OS · MODUL 4 VERTRIEB+CRM · C6a Firmen-Detailseite
// Stammdaten + zugeordnete Kontakte (zuordnen / entfernen)
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

interface Firma {
  id: string;
  name: string;
  branche: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string | null;
  website: string | null;
  telefon: string | null;
  email: string | null;
  notizen: string | null;
  created_at: string | null;
}

interface KontaktMini {
  id: string;
  vorname: string | null;
  nachname: string | null;
  email: string | null;
  telefon: string | null;
  position: string | null;
  firma_id: string | null;
}

interface FormState {
  name: string;
  branche: string;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  website: string;
  telefon: string;
  email: string;
  notizen: string;
}

function webUrl(w: string): string {
  if (!w) return "";
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
}

function kName(k: KontaktMini): string {
  return [k.vorname, k.nachname].filter(Boolean).join(" ") || k.email || "Unbenannt";
}

export default function FirmaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = (params?.id as string) || "";

  const [firma, setFirma] = useState<Firma | null>(null);
  const [kontakte, setKontakte] = useState<KontaktMini[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [bearbeiten, setBearbeiten] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [speichert, setSpeichert] = useState(false);

  const [zuordnenOffen, setZuordnenOffen] = useState(false);
  const [zuordnenWahl, setZuordnenWahl] = useState("");
  const [zuordBusy, setZuordBusy] = useState(false);

  async function laden_() {
    setLaden(true);
    setFehler(null);

    const { data: f, error: e1 } = await supabase
      .from("firmen")
      .select("*")
      .eq("id", id)
      .single();
    if (e1 || !f) {
      setFehler("Firma nicht gefunden.");
      setFirma(null);
      setLaden(false);
      return;
    }
    setFirma(f as Firma);

    // alle Kontakte laden (für Zuordnung + zugeordnete Liste)
    const { data: kdata } = await supabase
      .from("kontakte")
      .select("id, vorname, nachname, email, telefon, position, firma_id")
      .order("nachname", { ascending: true });
    setKontakte((kdata as KontaktMini[]) || []);

    setLaden(false);
  }

  useEffect(() => {
    if (id) laden_();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const zugeordnet = useMemo(
    () => kontakte.filter((k) => k.firma_id === id),
    [kontakte, id]
  );
  const verfuegbar = useMemo(
    () => kontakte.filter((k) => !k.firma_id),
    [kontakte]
  );

  function bearbeitenStart() {
    if (!firma) return;
    setForm({
      name: firma.name || "",
      branche: firma.branche || "",
      strasse: firma.strasse || "",
      plz: firma.plz || "",
      ort: firma.ort || "",
      land: firma.land || "Deutschland",
      website: firma.website || "",
      telefon: firma.telefon || "",
      email: firma.email || "",
      notizen: firma.notizen || "",
    });
    setBearbeiten(true);
  }

  function feld<K extends keyof FormState>(k: K, v: string) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }

  async function stammdatenSpeichern() {
    if (!form || !firma) return;
    if (!form.name.trim()) {
      setFehler("Bitte einen Firmennamen angeben.");
      return;
    }
    setSpeichert(true);
    setFehler(null);
    const nutzlast = {
      name: form.name.trim(),
      branche: form.branche.trim() || null,
      strasse: form.strasse.trim() || null,
      plz: form.plz.trim() || null,
      ort: form.ort.trim() || null,
      land: form.land.trim() || null,
      website: form.website.trim() || null,
      telefon: form.telefon.trim() || null,
      email: form.email.trim() || null,
      notizen: form.notizen.trim() || null,
    };
    const { error } = await supabase
      .from("firmen")
      .update(nutzlast)
      .eq("id", firma.id);
    setSpeichert(false);
    if (error) {
      setFehler(error.message);
      return;
    }
    setBearbeiten(false);
    laden_();
  }

  async function kontaktZuordnen() {
    if (!firma || !zuordnenWahl) return;
    setZuordBusy(true);
    const { error } = await supabase
      .from("kontakte")
      .update({ firma_id: firma.id })
      .eq("id", zuordnenWahl);
    setZuordBusy(false);
    if (error) {
      setFehler(error.message);
      return;
    }
    setZuordnenWahl("");
    setZuordnenOffen(false);
    laden_();
  }

  async function kontaktEntfernen(kontaktId: string) {
    setZuordBusy(true);
    const { error } = await supabase
      .from("kontakte")
      .update({ firma_id: null })
      .eq("id", kontaktId);
    setZuordBusy(false);
    if (error) {
      setFehler(error.message);
      return;
    }
    laden_();
  }

  if (laden) {
    return (
      <div style={{ background: C.navy, minHeight: "100vh", padding: "40px 28px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", color: C.textDim }}>
          Lade Firma…
        </div>
      </div>
    );
  }

  if (!firma) {
    return (
      <div style={{ background: C.navy, minHeight: "100vh", padding: "40px 28px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <button onClick={() => router.push("/dashboard/crm/firmen")} style={zurueckBtn}>
            ← Zurück zur Firmenliste
          </button>
          <div style={{ color: C.danger, marginTop: 20 }}>
            {fehler || "Firma nicht gefunden."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.navy, minHeight: "100vh", padding: "32px 28px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <button onClick={() => router.push("/dashboard/crm/firmen")} style={zurueckBtn}>
          ← Zurück zur Firmenliste
        </button>

        {/* Kopf */}
        <div
          style={{
            background: C.navy2,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: "24px 26px",
            marginTop: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 'clamp(22px, 1.94vw, 31px)' }}>🏢</span>
            <h1
              style={{
                fontFamily: "var(--font-dm-sans), sans-serif",
                color: "#fff",
                fontSize: 'clamp(28px, 2.44vw, 39px)',
                margin: 0,
              }}
            >
              {firma.name}
            </h1>
          </div>
          <div
            style={{
              fontFamily: "'DM Sans', sans-serif",
              color: C.textDim,
              fontSize: 'clamp(14px, 1.25vw, 20px)',
              marginTop: 8,
            }}
          >
            {[firma.branche, [firma.plz, firma.ort].filter(Boolean).join(" ")]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            {firma.telefon && (
              <a href={`tel:${firma.telefon}`} style={aktionBtn(C.green)}>
                📞 Anrufen
              </a>
            )}
            {firma.email && (
              <a href={`mailto:${firma.email}`} style={aktionBtn(C.cyan)}>
                ✉ E-Mail
              </a>
            )}
            {firma.website && (
              <a href={webUrl(firma.website)} target="_blank" rel="noreferrer" style={aktionBtn(C.gold)}>
                🌐 Website
              </a>
            )}
          </div>
        </div>

        {fehler && <div style={fehlerBox}>{fehler}</div>}

        {/* Stammdaten */}
        <div style={karte}>
          <div style={karteKopf}>Stammdaten</div>
          {!bearbeiten ? (
            <div>
              <div style={infoGrid}>
                <Info label="Firmenname" wert={firma.name} />
                <Info label="Branche" wert={firma.branche} />
                <Info label="Straße" wert={firma.strasse} />
                <Info label="PLZ / Ort" wert={[firma.plz, firma.ort].filter(Boolean).join(" ") || null} />
                <Info label="Land" wert={firma.land} />
                <Info
                  label="Telefon"
                  wert={firma.telefon}
                  link={firma.telefon ? `tel:${firma.telefon}` : undefined}
                />
                <Info
                  label="E-Mail"
                  wert={firma.email}
                  link={firma.email ? `mailto:${firma.email}` : undefined}
                />
                <Info
                  label="Website"
                  wert={firma.website}
                  link={firma.website ? webUrl(firma.website) : undefined}
                />
              </div>
              {firma.notizen && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ color: C.textDim, fontSize: 'clamp(12px, 1.06vw, 17px)', marginBottom: 3 }}>
                    Notizen
                  </div>
                  <div style={{ color: "#fff", fontSize: 'clamp(14px, 1.25vw, 20px)', whiteSpace: "pre-wrap" }}>
                    {firma.notizen}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 18 }}>
                <AdressBlock art="firma" id={firma.id} nurVerorten />
                <button onClick={bearbeitenStart} style={goldBtn}>
                  Stammdaten bearbeiten
                </button>
              </div>
            </div>
          ) : (
            form && (
              <div>
                <Feld label="Firmenname *">
                  <input style={inp} value={form.name} onChange={(e) => feld("name", e.target.value)} />
                </Feld>
                <div style={grid2}>
                  <Feld label="Branche">
                    <input style={inp} value={form.branche} onChange={(e) => feld("branche", e.target.value)} />
                  </Feld>
                  <Feld label="Website">
                    <input style={inp} value={form.website} onChange={(e) => feld("website", e.target.value)} />
                  </Feld>
                  <Feld label="Straße">
                    <input style={inp} value={form.strasse} onChange={(e) => feld("strasse", e.target.value)} />
                  </Feld>
                  <Feld label="PLZ / Ort">
                    <div style={{ display: "flex", gap: 8 }}>
                      <input style={{ ...inp, flex: "0 0 90px" }} value={form.plz} onChange={(e) => feld("plz", e.target.value)} placeholder="PLZ" />
                      <input style={inp} value={form.ort} onChange={(e) => feld("ort", e.target.value)} placeholder="Ort" />
                    </div>
                  </Feld>
                  <Feld label="Land">
                    <input style={inp} value={form.land} onChange={(e) => feld("land", e.target.value)} />
                  </Feld>
                  <Feld label="Telefon">
                    <input style={inp} value={form.telefon} onChange={(e) => feld("telefon", e.target.value)} />
                  </Feld>
                  <Feld label="E-Mail">
                    <input style={inp} value={form.email} onChange={(e) => feld("email", e.target.value)} />
                  </Feld>
                </div>
                <Feld label="Notizen">
                  <textarea
                    style={{ ...inp, minHeight: 70, resize: "vertical" }}
                    value={form.notizen}
                    onChange={(e) => feld("notizen", e.target.value)}
                  />
                </Feld>
                <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                  <button onClick={stammdatenSpeichern} disabled={speichert} style={goldBtn}>
                    {speichert ? "Speichert…" : "Speichern"}
                  </button>
                  <button onClick={() => setBearbeiten(false)} disabled={speichert} style={grauBtn}>
                    Abbrechen
                  </button>
                </div>
              </div>
            )
          )}
        </div>

        {/* Zugeordnete Kontakte */}
        <div style={karte}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div style={{ ...karteKopf, marginBottom: 0 }}>
              Kontakte dieser Firma
              <span style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', marginLeft: 8 }}>
                ({zugeordnet.length})
              </span>
            </div>
            <button onClick={() => setZuordnenOffen((v) => !v)} style={goldBtn}>
              + Kontakt zuordnen
            </button>
          </div>

          {zuordnenOffen && (
            <div
              style={{
                background: C.navy,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "14px 16px",
                marginBottom: 16,
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {verfuegbar.length === 0 ? (
                <span style={{ color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
                  Alle Kontakte sind bereits einer Firma zugeordnet. Neue Kontakte legst du im Kontakt-Cockpit an.
                </span>
              ) : (
                <>
                  <select
                    value={zuordnenWahl}
                    onChange={(e) => setZuordnenWahl(e.target.value)}
                    style={{ ...inp, width: "auto", flex: "1 1 240px" }}
                  >
                    <option value="">— Kontakt wählen —</option>
                    {verfuegbar.map((k) => (
                      <option key={k.id} value={k.id}>
                        {kName(k)}
                        {k.position ? ` · ${k.position}` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={kontaktZuordnen}
                    disabled={zuordBusy || !zuordnenWahl}
                    style={{ ...goldBtn, opacity: !zuordnenWahl ? 0.6 : 1 }}
                  >
                    Zuordnen
                  </button>
                </>
              )}
            </div>
          )}

          {zugeordnet.length === 0 ? (
            <div style={{ color: C.textDim, fontFamily: "'DM Sans', sans-serif", padding: "6px 0" }}>
              Noch keine Kontakte zugeordnet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {zugeordnet.map((k) => (
                <div
                  key={k.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 10,
                    background: C.navy,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                  }}
                >
                  <div
                    style={{ cursor: "pointer", flex: 1 }}
                    onClick={() => router.push(`/dashboard/crm/${k.id}`)}
                  >
                    <div style={{ color: "#fff", fontWeight: 600, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
                      {kName(k)}
                    </div>
                    <div style={{ color: C.textDim, fontSize: 'clamp(12px, 1.06vw, 17px)' }}>
                      {[k.position, k.email, k.telefon].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <button
                    onClick={() => kontaktEntfernen(k.id)}
                    disabled={zuordBusy}
                    style={miniBtn}
                  >
                    Zuordnung lösen
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --------------------------- Hilfs-Komponenten ---------------------------

function Info({
  label,
  wert,
  link,
}: {
  label: string;
  wert: string | null;
  link?: string;
}) {
  return (
    <div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.textDim, fontSize: 'clamp(12px, 1.06vw, 17px)', marginBottom: 3 }}>
        {label}
      </div>
      {link && wert ? (
        <a
          href={link}
          target={link.startsWith("http") ? "_blank" : undefined}
          rel="noreferrer"
          style={{ color: C.cyan, textDecoration: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 'clamp(15px, 1.31vw, 21px)' }}
        >
          {wert}
        </a>
      ) : (
        <div style={{ color: wert ? "#fff" : C.textDim, fontFamily: "'DM Sans', sans-serif", fontSize: 'clamp(15px, 1.31vw, 21px)' }}>
          {wert || "—"}
        </div>
      )}
    </div>
  );
}

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label
        style={{
          display: "block",
          fontFamily: "'DM Sans', sans-serif",
          color: C.textDim,
          fontSize: 'clamp(12px, 1.06vw, 17px)',
          marginBottom: 5,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

// --------------------------- Style-Bausteine ---------------------------

function aktionBtn(farbe: string): React.CSSProperties {
  return {
    background: "transparent",
    color: farbe,
    border: `1px solid ${farbe}`,
    borderRadius: 10,
    padding: "10px 16px",
    fontFamily: "var(--font-dm-sans), sans-serif",
    fontWeight: 700,
    fontSize: 'clamp(14px, 1.25vw, 20px)',
    textDecoration: "none",
    display: "inline-block",
  };
}

const zurueckBtn: React.CSSProperties = {
  background: "transparent",
  color: C.textDim,
  border: "none",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 'clamp(14px, 1.25vw, 20px)',
  cursor: "pointer",
  padding: 0,
};

const goldBtn: React.CSSProperties = {
  background: C.gold,
  color: C.navy,
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontFamily: "var(--font-dm-sans), sans-serif",
  fontWeight: 700,
  fontSize: 'clamp(14px, 1.25vw, 20px)',
  cursor: "pointer",
};

const grauBtn: React.CSSProperties = {
  background: "transparent",
  color: C.textDim,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "10px 18px",
  fontFamily: "var(--font-dm-sans), sans-serif",
  fontWeight: 600,
  fontSize: 'clamp(14px, 1.25vw, 20px)',
  cursor: "pointer",
};

const miniBtn: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "6px 12px",
  color: C.cyan,
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 'clamp(13px, 1.13vw, 18px)',
  cursor: "pointer",
};

const inp: React.CSSProperties = {
  background: C.navy,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "11px 13px",
  color: "#fff",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 'clamp(14px, 1.25vw, 20px)',
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

const karte: React.CSSProperties = {
  background: C.navy2,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: "22px 24px",
  marginTop: 16,
};

const karteKopf: React.CSSProperties = {
  fontFamily: "var(--font-dm-sans), sans-serif",
  color: C.gold,
  fontSize: 'clamp(17px, 1.5vw, 24px)',
  marginBottom: 16,
};

const infoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px 24px",
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0 16px",
};

const fehlerBox: React.CSSProperties = {
  background: "rgba(224,102,102,0.12)",
  border: `1px solid ${C.danger}`,
  color: C.danger,
  borderRadius: 10,
  padding: "12px 16px",
  marginTop: 14,
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 'clamp(14px, 1.25vw, 20px)',
};
