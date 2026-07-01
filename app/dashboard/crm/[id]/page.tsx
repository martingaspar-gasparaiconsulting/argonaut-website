"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------
// ARGONAUT OS · MODUL 4 VERTRIEB+CRM · C3 Kontakt-Detailseite
// Reiter: Stammdaten / Timeline / Notizen · tel:/mailto:-Aktionen
// (Aktivitäten ERFASSEN + Wiedervorlage = C4, hier nur Anzeige)
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

const STATUS_OPTIONEN = ["interessent", "aktiv", "kunde", "inaktiv"];
const QUELLE_OPTIONEN = [
  "Empfehlung",
  "Messe",
  "Website",
  "Google-Ads",
  "Meta-Ads",
  "Telefon",
  "Sonstige",
];

interface Kontakt {
  id: string;
  vorname: string | null;
  nachname: string | null;
  email: string | null;
  telefon: string | null;
  position: string | null;
  firma: string | null;
  status: string | null;
  quelle: string | null;
  letzter_kontakt_am: string | null;
  naechster_kontakt_am: string | null;
  betreuungs_intervall_tage: number | null;
  notizen: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface Aktivitaet {
  id: string;
  typ: string | null;
  inhalt: string | null;
  ki_generiert: boolean | null;
  aktivitaet_am: string | null;
}

interface FormState {
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  position: string;
  firma: string;
  status: string;
  quelle: string;
  betreuungs_intervall_tage: string;
}

function tageSeit(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function ampel(k: Kontakt | null): { farbe: string; label: string } {
  if (!k) return { farbe: C.textDim, label: "" };
  const tage = tageSeit(k.letzter_kontakt_am);
  if (tage === null) return { farbe: C.textDim, label: "Noch kein Kontakt" };
  const iv = k.betreuungs_intervall_tage || 30;
  if (tage <= iv) return { farbe: C.green, label: `Im Takt · vor ${tage} T` };
  if (tage <= iv * 2)
    return { farbe: C.warn, label: `Bald fällig · vor ${tage} T` };
  return { farbe: C.danger, label: `Überfällig · vor ${tage} T` };
}

function datumLang(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function datumZeit(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TYP_ICON: Record<string, string> = {
  anruf: "📞",
  email: "✉",
  termin: "📅",
  notiz: "📝",
  voice: "🎙",
};

export default function CrmDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = (params?.id as string) || "";

  const [kontakt, setKontakt] = useState<Kontakt | null>(null);
  const [aktivitaeten, setAktivitaeten] = useState<Aktivitaet[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [reiter, setReiter] = useState<"stammdaten" | "timeline" | "notizen">(
    "stammdaten"
  );

  const [bearbeiten, setBearbeiten] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [speichert, setSpeichert] = useState(false);

  const [notizEntwurf, setNotizEntwurf] = useState("");
  const [notizSpeichert, setNotizSpeichert] = useState(false);
  const [notizGespeichert, setNotizGespeichert] = useState(false);

  async function laden_() {
    setLaden(true);
    setFehler(null);
    const { data: k, error: e1 } = await supabase
      .from("kontakte")
      .select("*")
      .eq("id", id)
      .single();
    if (e1 || !k) {
      setFehler("Kontakt nicht gefunden.");
      setKontakt(null);
      setLaden(false);
      return;
    }
    setKontakt(k as Kontakt);
    setNotizEntwurf((k as Kontakt).notizen || "");

    const { data: akt } = await supabase
      .from("kontakt_aktivitaeten")
      .select("*")
      .eq("kontakt_id", id)
      .order("aktivitaet_am", { ascending: false });
    setAktivitaeten((akt as Aktivitaet[]) || []);
    setLaden(false);
  }

  useEffect(() => {
    if (id) laden_();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const a = useMemo(() => ampel(kontakt), [kontakt]);
  const anzeigeName = kontakt
    ? [kontakt.vorname, kontakt.nachname].filter(Boolean).join(" ") ||
      kontakt.firma ||
      "Unbenannter Kontakt"
    : "";

  function bearbeitenStart() {
    if (!kontakt) return;
    setForm({
      vorname: kontakt.vorname || "",
      nachname: kontakt.nachname || "",
      email: kontakt.email || "",
      telefon: kontakt.telefon || "",
      position: kontakt.position || "",
      firma: kontakt.firma || "",
      status: kontakt.status || "interessent",
      quelle: kontakt.quelle || "",
      betreuungs_intervall_tage: String(kontakt.betreuungs_intervall_tage || 30),
    });
    setBearbeiten(true);
  }

  function feld<K extends keyof FormState>(k: K, v: string) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }

  async function stammdatenSpeichern() {
    if (!form || !kontakt) return;
    setSpeichert(true);
    setFehler(null);
    const nutzlast = {
      vorname: form.vorname.trim() || null,
      nachname: form.nachname.trim() || null,
      email: form.email.trim() || null,
      telefon: form.telefon.trim() || null,
      position: form.position.trim() || null,
      firma: form.firma.trim() || null,
      status: form.status,
      quelle: form.quelle || null,
      betreuungs_intervall_tage:
        parseInt(form.betreuungs_intervall_tage, 10) || 30,
    };
    const { error } = await supabase
      .from("kontakte")
      .update(nutzlast)
      .eq("id", kontakt.id);
    setSpeichert(false);
    if (error) {
      setFehler(error.message);
      return;
    }
    setBearbeiten(false);
    laden_();
  }

  async function notizSpeichern() {
    if (!kontakt) return;
    setNotizSpeichert(true);
    setNotizGespeichert(false);
    const { error } = await supabase
      .from("kontakte")
      .update({ notizen: notizEntwurf.trim() || null })
      .eq("id", kontakt.id);
    setNotizSpeichert(false);
    if (error) {
      setFehler(error.message);
      return;
    }
    setNotizGespeichert(true);
    setKontakt((prev) =>
      prev ? { ...prev, notizen: notizEntwurf.trim() || null } : prev
    );
  }

  if (laden) {
    return (
      <div style={{ background: C.navy, minHeight: "100vh", padding: "40px 28px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", color: C.textDim }}>
          Lade Kontakt…
        </div>
      </div>
    );
  }

  if (!kontakt) {
    return (
      <div style={{ background: C.navy, minHeight: "100vh", padding: "40px 28px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <button onClick={() => router.push("/dashboard/crm")} style={zurueckBtn}>
            ← Zurück zur Kontaktliste
          </button>
          <div style={{ color: C.danger, marginTop: 20 }}>
            {fehler || "Kontakt nicht gefunden."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.navy, minHeight: "100vh", padding: "32px 28px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <button onClick={() => router.push("/dashboard/crm")} style={zurueckBtn}>
          ← Zurück zur Kontaktliste
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
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  title={a.label}
                  style={{
                    display: "inline-block",
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: a.farbe,
                    boxShadow: `0 0 10px ${a.farbe}`,
                  }}
                />
                <h1
                  style={{
                    fontFamily: "Syne, sans-serif",
                    color: "#fff",
                    fontSize: 28,
                    margin: 0,
                  }}
                >
                  {anzeigeName}
                </h1>
                <StatusBadge status={kontakt.status} />
              </div>
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: C.textDim,
                  fontSize: 14,
                  marginTop: 8,
                  marginLeft: 26,
                }}
              >
                {[kontakt.position, kontakt.firma].filter(Boolean).join(" · ") ||
                  "—"}
                {a.label && (
                  <span style={{ color: a.farbe, marginLeft: 10 }}>· {a.label}</span>
                )}
              </div>
            </div>

            {/* Aktions-Buttons */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {kontakt.telefon && (
                <a href={`tel:${kontakt.telefon}`} style={aktionBtn(C.green)}>
                  📞 Anrufen
                </a>
              )}
              {kontakt.email && (
                <a href={`mailto:${kontakt.email}`} style={aktionBtn(C.cyan)}>
                  ✉ E-Mail
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Reiter */}
        <div style={{ display: "flex", gap: 8, marginTop: 22, flexWrap: "wrap" }}>
          <ReiterBtn
            aktiv={reiter === "stammdaten"}
            onClick={() => setReiter("stammdaten")}
          >
            Stammdaten
          </ReiterBtn>
          <ReiterBtn
            aktiv={reiter === "timeline"}
            onClick={() => setReiter("timeline")}
          >
            Timeline
            {aktivitaeten.length > 0 && (
              <span style={badgeZahl}>{aktivitaeten.length}</span>
            )}
          </ReiterBtn>
          <ReiterBtn
            aktiv={reiter === "notizen"}
            onClick={() => setReiter("notizen")}
          >
            Notizen
          </ReiterBtn>
        </div>

        {fehler && (
          <div style={fehlerBox}>{fehler}</div>
        )}

        {/* Reiter-Inhalt */}
        <div
          style={{
            background: C.navy2,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: "22px 24px",
            marginTop: 14,
          }}
        >
          {/* --- STAMMDATEN --- */}
          {reiter === "stammdaten" && !bearbeiten && (
            <div>
              <div style={infoGrid}>
                <Info label="Vorname" wert={kontakt.vorname} />
                <Info label="Nachname" wert={kontakt.nachname} />
                <Info
                  label="E-Mail"
                  wert={kontakt.email}
                  link={kontakt.email ? `mailto:${kontakt.email}` : undefined}
                />
                <Info
                  label="Telefon"
                  wert={kontakt.telefon}
                  link={kontakt.telefon ? `tel:${kontakt.telefon}` : undefined}
                />
                <Info label="Firma" wert={kontakt.firma} />
                <Info label="Position / Rolle" wert={kontakt.position} />
                <Info label="Status" wert={kontakt.status} />
                <Info label="Quelle" wert={kontakt.quelle} />
                <Info
                  label="Betreuungs-Intervall"
                  wert={
                    kontakt.betreuungs_intervall_tage
                      ? `${kontakt.betreuungs_intervall_tage} Tage`
                      : "—"
                  }
                />
                <Info
                  label="Letzter Kontakt"
                  wert={datumLang(kontakt.letzter_kontakt_am)}
                />
                <Info
                  label="Nächster Kontakt (Wiedervorlage)"
                  wert={datumLang(kontakt.naechster_kontakt_am)}
                />
                <Info label="Angelegt am" wert={datumLang(kontakt.created_at)} />
              </div>
              <div style={{ marginTop: 20 }}>
                <button onClick={bearbeitenStart} style={goldBtn}>
                  Stammdaten bearbeiten
                </button>
              </div>
            </div>
          )}

          {/* --- STAMMDATEN BEARBEITEN --- */}
          {reiter === "stammdaten" && bearbeiten && form && (
            <div>
              <div style={grid2}>
                <Feld label="Vorname">
                  <input style={inp} value={form.vorname} onChange={(e) => feld("vorname", e.target.value)} />
                </Feld>
                <Feld label="Nachname">
                  <input style={inp} value={form.nachname} onChange={(e) => feld("nachname", e.target.value)} />
                </Feld>
                <Feld label="E-Mail">
                  <input style={inp} value={form.email} onChange={(e) => feld("email", e.target.value)} />
                </Feld>
                <Feld label="Telefon">
                  <input style={inp} value={form.telefon} onChange={(e) => feld("telefon", e.target.value)} />
                </Feld>
                <Feld label="Firma">
                  <input style={inp} value={form.firma} onChange={(e) => feld("firma", e.target.value)} />
                </Feld>
                <Feld label="Position / Rolle">
                  <input style={inp} value={form.position} onChange={(e) => feld("position", e.target.value)} />
                </Feld>
                <Feld label="Status">
                  <select style={inp} value={form.status} onChange={(e) => feld("status", e.target.value)}>
                    {STATUS_OPTIONEN.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Feld>
                <Feld label="Quelle">
                  <select style={inp} value={form.quelle} onChange={(e) => feld("quelle", e.target.value)}>
                    <option value="">— wählen —</option>
                    {QUELLE_OPTIONEN.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </Feld>
                <Feld label="Betreuungs-Intervall (Tage)">
                  <input
                    style={inp}
                    type="number"
                    value={form.betreuungs_intervall_tage}
                    onChange={(e) => feld("betreuungs_intervall_tage", e.target.value)}
                  />
                </Feld>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <button onClick={stammdatenSpeichern} disabled={speichert} style={goldBtn}>
                  {speichert ? "Speichert…" : "Speichern"}
                </button>
                <button
                  onClick={() => setBearbeiten(false)}
                  disabled={speichert}
                  style={grauBtn}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {/* --- TIMELINE --- */}
          {reiter === "timeline" && (
            <div>
              <div
                style={{
                  background: "rgba(0,229,255,0.06)",
                  border: `1px dashed ${C.border}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  color: C.textDim,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                  marginBottom: 18,
                }}
              >
                ℹ Aktivitäten erfassen (Anruf/E-Mail/Termin/Notiz) und die
                Wiedervorlage kommen im nächsten Schritt dazu. Hier siehst du bereits
                die vollständige Historie.
              </div>

              {aktivitaeten.length === 0 ? (
                <div style={{ color: C.textDim, fontFamily: "'DM Sans', sans-serif", padding: "12px 0" }}>
                  Noch keine Aktivitäten erfasst.
                </div>
              ) : (
                <div style={{ position: "relative", paddingLeft: 8 }}>
                  {aktivitaeten.map((akt) => (
                    <div
                      key={akt.id}
                      style={{
                        display: "flex",
                        gap: 14,
                        paddingBottom: 18,
                        borderLeft: `2px solid ${C.border}`,
                        marginLeft: 8,
                        paddingLeft: 18,
                        position: "relative",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          left: -11,
                          top: 0,
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: C.navy,
                          border: `2px solid ${C.gold}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                        }}
                      >
                        {TYP_ICON[akt.typ || "notiz"] || "📝"}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "Syne, sans-serif",
                              color: C.gold,
                              fontSize: 14,
                              textTransform: "capitalize",
                            }}
                          >
                            {akt.typ || "Notiz"}
                          </span>
                          <span style={{ color: C.textDim, fontSize: 12 }}>
                            {datumZeit(akt.aktivitaet_am)}
                          </span>
                          {akt.ki_generiert && (
                            <span
                              style={{
                                fontSize: 11,
                                color: C.cyan,
                                border: `1px solid ${C.cyan}`,
                                borderRadius: 10,
                                padding: "1px 8px",
                              }}
                            >
                              KI
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            color: "#fff",
                            fontFamily: "'DM Sans', sans-serif",
                            fontSize: 14,
                            marginTop: 4,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {akt.inhalt || "—"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* --- NOTIZEN --- */}
          {reiter === "notizen" && (
            <div>
              <textarea
                style={{ ...inp, minHeight: 180, resize: "vertical" }}
                value={notizEntwurf}
                onChange={(e) => {
                  setNotizEntwurf(e.target.value);
                  setNotizGespeichert(false);
                }}
                placeholder="Freie Notizen zu diesem Kontakt…"
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  marginTop: 12,
                }}
              >
                <button onClick={notizSpeichern} disabled={notizSpeichert} style={goldBtn}>
                  {notizSpeichert ? "Speichert…" : "Notiz speichern"}
                </button>
                {notizGespeichert && (
                  <span style={{ color: C.green, fontSize: 13 }}>✓ Gespeichert</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --------------------------- Hilfs-Komponenten ---------------------------

function ReiterBtn({
  aktiv,
  onClick,
  children,
}: {
  aktiv: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: aktiv ? C.gold : "transparent",
        color: aktiv ? C.navy : C.textDim,
        border: `1px solid ${aktiv ? C.gold : C.border}`,
        borderRadius: 10,
        padding: "9px 18px",
        fontFamily: "Syne, sans-serif",
        fontWeight: 700,
        fontSize: 14,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    kunde: C.green,
    aktiv: C.cyan,
    interessent: C.gold,
    inaktiv: C.textDim,
  };
  const farbe = map[status || ""] || C.textDim;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        color: farbe,
        border: `1px solid ${farbe}`,
      }}
    >
      {status || "—"}
    </span>
  );
}

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
      <div
        style={{
          fontFamily: "'DM Sans', sans-serif",
          color: C.textDim,
          fontSize: 12,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      {link && wert ? (
        <a
          href={link}
          style={{
            color: C.cyan,
            textDecoration: "none",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 15,
          }}
        >
          {wert}
        </a>
      ) : (
        <div
          style={{
            color: wert ? "#fff" : C.textDim,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 15,
          }}
        >
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
          fontSize: 12,
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
    padding: "11px 18px",
    fontFamily: "Syne, sans-serif",
    fontWeight: 700,
    fontSize: 14,
    textDecoration: "none",
    display: "inline-block",
  };
}

const zurueckBtn: React.CSSProperties = {
  background: "transparent",
  color: C.textDim,
  border: "none",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14,
  cursor: "pointer",
  padding: 0,
};

const goldBtn: React.CSSProperties = {
  background: C.gold,
  color: C.navy,
  border: "none",
  borderRadius: 10,
  padding: "11px 22px",
  fontFamily: "Syne, sans-serif",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

const grauBtn: React.CSSProperties = {
  background: "transparent",
  color: C.textDim,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "11px 22px",
  fontFamily: "Syne, sans-serif",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};

const inp: React.CSSProperties = {
  background: C.navy,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "11px 13px",
  color: "#fff",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
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

const badgeZahl: React.CSSProperties = {
  background: C.navy,
  color: C.cyan,
  borderRadius: 10,
  padding: "0 7px",
  fontSize: 12,
  fontWeight: 700,
};

const fehlerBox: React.CSSProperties = {
  background: "rgba(224,102,102,0.12)",
  border: `1px solid ${C.danger}`,
  color: C.danger,
  borderRadius: 10,
  padding: "12px 16px",
  marginTop: 14,
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14,
};
