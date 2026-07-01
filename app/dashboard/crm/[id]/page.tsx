"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------
// ARGONAUT OS · MODUL 4 VERTRIEB+CRM · C3+C4+C5 Kontakt-Detailseite
// C5: Tags-Bereich (zuweisen/entfernen + neuen Tag anlegen)
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

const AKT_TYPEN: { wert: string; label: string; icon: string }[] = [
  { wert: "anruf", label: "Anruf", icon: "📞" },
  { wert: "email", label: "E-Mail", icon: "✉" },
  { wert: "termin", label: "Termin", icon: "📅" },
  { wert: "notiz", label: "Notiz", icon: "📝" },
];

const TYP_ICON: Record<string, string> = {
  anruf: "📞",
  email: "✉",
  termin: "📅",
  notiz: "📝",
  voice: "🎙",
};

const TAG_FARBEN = [
  "#C9A84C",
  "#00e5ff",
  "#4CAF7D",
  "#E0A24C",
  "#E06666",
  "#5B8FF9",
  "#A98CE0",
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

interface Tag {
  id: string;
  name: string;
  farbe: string | null;
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

function jetztLokalInput(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const lokal = new Date(d.getTime() - off * 60000);
  return lokal.toISOString().slice(0, 16);
}

function heuteDatumInput(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const lokal = new Date(d.getTime() - off * 60000);
  return lokal.toISOString().slice(0, 10);
}

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

  // Stammdaten bearbeiten
  const [bearbeiten, setBearbeiten] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [speichert, setSpeichert] = useState(false);

  // Notizen
  const [notizEntwurf, setNotizEntwurf] = useState("");
  const [notizSpeichert, setNotizSpeichert] = useState(false);
  const [notizGespeichert, setNotizGespeichert] = useState(false);

  // C4: Aktivität erfassen
  const [aktTyp, setAktTyp] = useState("anruf");
  const [aktInhalt, setAktInhalt] = useState("");
  const [aktDatum, setAktDatum] = useState(jetztLokalInput());
  const [aktSpeichert, setAktSpeichert] = useState(false);
  const [aktLoeschId, setAktLoeschId] = useState<string | null>(null);

  // C4: Wiedervorlage
  const [wvDatum, setWvDatum] = useState("");
  const [wvSpeichert, setWvSpeichert] = useState(false);

  // C5: Tags
  const [alleTags, setAlleTags] = useState<Tag[]>([]);
  const [meineTagIds, setMeineTagIds] = useState<string[]>([]);
  const [tagAddOffen, setTagAddOffen] = useState(false);
  const [neuTagName, setNeuTagName] = useState("");
  const [neuTagFarbe, setNeuTagFarbe] = useState(TAG_FARBEN[0]);
  const [tagBusy, setTagBusy] = useState(false);

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
    const kk = k as Kontakt;
    setKontakt(kk);
    setNotizEntwurf(kk.notizen || "");
    setWvDatum(
      kk.naechster_kontakt_am
        ? new Date(kk.naechster_kontakt_am).toISOString().slice(0, 10)
        : ""
    );

    const { data: akt } = await supabase
      .from("kontakt_aktivitaeten")
      .select("*")
      .eq("kontakt_id", id)
      .order("aktivitaet_am", { ascending: false });
    setAktivitaeten((akt as Aktivitaet[]) || []);

    // Tags laden
    const { data: tagData } = await supabase
      .from("kontakt_tags")
      .select("*")
      .order("name", { ascending: true });
    setAlleTags((tagData as Tag[]) || []);

    const { data: zuord } = await supabase
      .from("kontakt_tag_zuordnung")
      .select("tag_id")
      .eq("kontakt_id", id);
    setMeineTagIds(
      ((zuord as { tag_id: string }[]) || []).map((z) => z.tag_id)
    );

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

  const wvFaellig = useMemo(() => {
    if (!kontakt?.naechster_kontakt_am) return false;
    return new Date(kontakt.naechster_kontakt_am).getTime() <= Date.now();
  }, [kontakt]);

  const meineTags = useMemo(
    () => alleTags.filter((t) => meineTagIds.includes(t.id)),
    [alleTags, meineTagIds]
  );
  const verfuegbareTags = useMemo(
    () => alleTags.filter((t) => !meineTagIds.includes(t.id)),
    [alleTags, meineTagIds]
  );

  // ---------------- Stammdaten ----------------
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

  // ---------------- Notizen ----------------
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

  // ---------------- C4: Aktivität ----------------
  async function aktivitaetEintragen() {
    if (!kontakt) return;
    if (!aktInhalt.trim()) {
      setFehler("Bitte einen kurzen Text zur Aktivität eingeben.");
      return;
    }
    setAktSpeichert(true);
    setFehler(null);

    const wannIso = aktDatum
      ? new Date(aktDatum).toISOString()
      : new Date().toISOString();

    const { error: e1 } = await supabase.from("kontakt_aktivitaeten").insert({
      kontakt_id: kontakt.id,
      typ: aktTyp,
      inhalt: aktInhalt.trim(),
      ki_generiert: false,
      aktivitaet_am: wannIso,
    });
    if (e1) {
      setAktSpeichert(false);
      setFehler(e1.message);
      return;
    }

    const bisher = kontakt.letzter_kontakt_am
      ? new Date(kontakt.letzter_kontakt_am).getTime()
      : 0;
    if (new Date(wannIso).getTime() >= bisher) {
      await supabase
        .from("kontakte")
        .update({ letzter_kontakt_am: wannIso })
        .eq("id", kontakt.id);
    }

    setAktInhalt("");
    setAktTyp("anruf");
    setAktDatum(jetztLokalInput());
    setAktSpeichert(false);
    laden_();
  }

  async function aktivitaetLoeschen(aid: string) {
    const { error } = await supabase
      .from("kontakt_aktivitaeten")
      .delete()
      .eq("id", aid);
    setAktLoeschId(null);
    if (error) {
      setFehler(error.message);
      return;
    }
    laden_();
  }

  // ---------------- C4: Wiedervorlage ----------------
  async function wiedervorlageSetzen() {
    if (!kontakt || !wvDatum) return;
    setWvSpeichert(true);
    setFehler(null);
    const iso = new Date(wvDatum + "T09:00:00").toISOString();
    const { error } = await supabase
      .from("kontakte")
      .update({ naechster_kontakt_am: iso })
      .eq("id", kontakt.id);
    setWvSpeichert(false);
    if (error) {
      setFehler(error.message);
      return;
    }
    setKontakt((prev) => (prev ? { ...prev, naechster_kontakt_am: iso } : prev));
  }

  async function wiedervorlageLoeschen() {
    if (!kontakt) return;
    setWvSpeichert(true);
    const { error } = await supabase
      .from("kontakte")
      .update({ naechster_kontakt_am: null })
      .eq("id", kontakt.id);
    setWvSpeichert(false);
    if (error) {
      setFehler(error.message);
      return;
    }
    setWvDatum("");
    setKontakt((prev) => (prev ? { ...prev, naechster_kontakt_am: null } : prev));
  }

  // ---------------- C5: Tags ----------------
  async function tagZuweisen(tagId: string) {
    if (!kontakt) return;
    setTagBusy(true);
    const { error } = await supabase.from("kontakt_tag_zuordnung").insert({
      kontakt_id: kontakt.id,
      tag_id: tagId,
    });
    setTagBusy(false);
    if (error) {
      setFehler(error.message);
      return;
    }
    setMeineTagIds((prev) => [...prev, tagId]);
    setTagAddOffen(false);
  }

  async function tagEntfernen(tagId: string) {
    if (!kontakt) return;
    setTagBusy(true);
    const { error } = await supabase
      .from("kontakt_tag_zuordnung")
      .delete()
      .eq("kontakt_id", kontakt.id)
      .eq("tag_id", tagId);
    setTagBusy(false);
    if (error) {
      setFehler(error.message);
      return;
    }
    setMeineTagIds((prev) => prev.filter((x) => x !== tagId));
  }

  async function neuenTagAnlegen() {
    if (!kontakt || !neuTagName.trim()) return;
    setTagBusy(true);
    setFehler(null);
    const { data, error } = await supabase
      .from("kontakt_tags")
      .insert({ name: neuTagName.trim(), farbe: neuTagFarbe })
      .select("id, name, farbe")
      .single();
    if (error || !data) {
      setTagBusy(false);
      setFehler(error ? error.message : "Tag konnte nicht angelegt werden.");
      return;
    }
    const neuerTag = data as Tag;
    setAlleTags((prev) =>
      [...prev, neuerTag].sort((x, y) => x.name.localeCompare(y.name))
    );
    // direkt zuweisen
    const { error: e2 } = await supabase.from("kontakt_tag_zuordnung").insert({
      kontakt_id: kontakt.id,
      tag_id: neuerTag.id,
    });
    setTagBusy(false);
    if (e2) {
      setFehler(e2.message);
      return;
    }
    setMeineTagIds((prev) => [...prev, neuerTag.id]);
    setNeuTagName("");
    setNeuTagFarbe(TAG_FARBEN[0]);
    setTagAddOffen(false);
  }

  // ---------------- Render ----------------
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
              {kontakt.naechster_kontakt_am && (
                <div
                  style={{
                    marginLeft: 26,
                    marginTop: 8,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    color: wvFaellig ? C.warn : C.textDim,
                  }}
                >
                  🔔 Wiedervorlage: {datumLang(kontakt.naechster_kontakt_am)}
                  {wvFaellig && " · fällig"}
                </div>
              )}
            </div>

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

          {/* C5: Tags */}
          <div
            style={{
              marginTop: 18,
              marginLeft: 26,
              paddingTop: 16,
              borderTop: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: C.textDim,
                  fontSize: 13,
                }}
              >
                🏷 Tags:
              </span>
              {meineTags.length === 0 && (
                <span style={{ color: C.textDim, fontSize: 13 }}>keine</span>
              )}
              {meineTags.map((t) => (
                <span
                  key={t.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 8px 3px 10px",
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    color: t.farbe || C.gold,
                    border: `1px solid ${t.farbe || C.gold}`,
                  }}
                >
                  {t.name}
                  <button
                    onClick={() => tagEntfernen(t.id)}
                    disabled={tagBusy}
                    title="Entfernen"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: t.farbe || C.gold,
                      cursor: "pointer",
                      fontSize: 13,
                      lineHeight: 1,
                      padding: 0,
                    }}
                  >
                    ✕
                  </button>
                </span>
              ))}
              <button
                onClick={() => setTagAddOffen((v) => !v)}
                style={{
                  background: "transparent",
                  border: `1px dashed ${C.border}`,
                  borderRadius: 20,
                  padding: "3px 12px",
                  color: C.textDim,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                + Tag
              </button>
            </div>

            {tagAddOffen && (
              <div
                style={{
                  marginTop: 12,
                  background: C.navy,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding: "14px 16px",
                }}
              >
                {verfuegbareTags.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ color: C.textDim, fontSize: 12, marginBottom: 8 }}>
                      Vorhandene Tags
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {verfuegbareTags.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => tagZuweisen(t.id)}
                          disabled={tagBusy}
                          style={{
                            background: "transparent",
                            border: `1px solid ${t.farbe || C.gold}`,
                            borderRadius: 20,
                            padding: "3px 12px",
                            color: t.farbe || C.gold,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          + {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ color: C.textDim, fontSize: 12, marginBottom: 8 }}>
                  Neuen Tag anlegen
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    value={neuTagName}
                    onChange={(e) => setNeuTagName(e.target.value)}
                    placeholder="z. B. Stammkunde"
                    style={{ ...inp, width: "auto", flex: "1 1 160px" }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    {TAG_FARBEN.map((f) => (
                      <button
                        key={f}
                        onClick={() => setNeuTagFarbe(f)}
                        title={f}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: f,
                          border:
                            neuTagFarbe === f
                              ? "2px solid #fff"
                              : "2px solid transparent",
                          cursor: "pointer",
                        }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={neuenTagAnlegen}
                    disabled={tagBusy || !neuTagName.trim()}
                    style={{ ...goldBtn, opacity: !neuTagName.trim() ? 0.6 : 1 }}
                  >
                    Anlegen
                  </button>
                </div>
              </div>
            )}
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

        {fehler && <div style={fehlerBox}>{fehler}</div>}

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

          {/* --- TIMELINE (C4) --- */}
          {reiter === "timeline" && (
            <div>
              <div
                style={{
                  background: C.navy,
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding: "16px 18px",
                  marginBottom: 22,
                }}
              >
                <div
                  style={{
                    fontFamily: "Syne, sans-serif",
                    color: C.gold,
                    fontSize: 15,
                    marginBottom: 12,
                  }}
                >
                  Neue Aktivität erfassen
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {AKT_TYPEN.map((t) => (
                    <button
                      key={t.wert}
                      onClick={() => setAktTyp(t.wert)}
                      style={{
                        background: aktTyp === t.wert ? C.gold : "transparent",
                        color: aktTyp === t.wert ? C.navy : C.textDim,
                        border: `1px solid ${aktTyp === t.wert ? C.gold : C.border}`,
                        borderRadius: 20,
                        padding: "6px 14px",
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
                <textarea
                  style={{ ...inp, minHeight: 70, resize: "vertical", marginBottom: 10 }}
                  value={aktInhalt}
                  onChange={(e) => setAktInhalt(e.target.value)}
                  placeholder="Was ist passiert? (z. B. Angebot besprochen, Rückruf vereinbart …)"
                />
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: "0 0 auto" }}>
                    <label style={{ color: C.textDim, fontSize: 12, marginRight: 8 }}>
                      Wann
                    </label>
                    <input
                      type="datetime-local"
                      style={{ ...inp, width: "auto", display: "inline-block" }}
                      value={aktDatum}
                      onChange={(e) => setAktDatum(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={aktivitaetEintragen}
                    disabled={aktSpeichert}
                    style={goldBtn}
                  >
                    {aktSpeichert ? "Trägt ein…" : "Eintragen"}
                  </button>
                </div>
                <div style={{ color: C.textDim, fontSize: 12, marginTop: 8 }}>
                  Setzt automatisch „Letzter Kontakt" → aktualisiert die Ampel.
                </div>
              </div>

              <div
                style={{
                  background: "rgba(224,162,76,0.06)",
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding: "14px 18px",
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    fontFamily: "Syne, sans-serif",
                    color: C.warn,
                    fontSize: 15,
                    marginBottom: 10,
                  }}
                >
                  🔔 Wiedervorlage
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="date"
                    min={heuteDatumInput()}
                    style={{ ...inp, width: "auto" }}
                    value={wvDatum}
                    onChange={(e) => setWvDatum(e.target.value)}
                  />
                  <button
                    onClick={wiedervorlageSetzen}
                    disabled={wvSpeichert || !wvDatum}
                    style={{ ...goldBtn, opacity: !wvDatum ? 0.6 : 1 }}
                  >
                    {wvSpeichert ? "Speichert…" : "Wiedervorlage setzen"}
                  </button>
                  {kontakt.naechster_kontakt_am && (
                    <button onClick={wiedervorlageLoeschen} disabled={wvSpeichert} style={grauBtn}>
                      Entfernen
                    </button>
                  )}
                </div>
                {kontakt.naechster_kontakt_am && (
                  <div style={{ color: C.textDim, fontSize: 13, marginTop: 8 }}>
                    Aktuell gesetzt auf {datumLang(kontakt.naechster_kontakt_am)}
                    {wvFaellig && <span style={{ color: C.warn }}> · fällig</span>}.
                  </div>
                )}
              </div>

              <div
                style={{
                  fontFamily: "Syne, sans-serif",
                  color: C.textDim,
                  fontSize: 13,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 14,
                }}
              >
                Verlauf
              </div>

              {aktivitaeten.length === 0 ? (
                <div style={{ color: C.textDim, fontFamily: "'DM Sans', sans-serif", padding: "6px 0" }}>
                  Noch keine Aktivitäten erfasst.
                </div>
              ) : (
                <div style={{ position: "relative" }}>
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
                          {aktLoeschId === akt.id ? (
                            <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                              <button
                                onClick={() => aktivitaetLoeschen(akt.id)}
                                style={{ ...linkBtn, color: C.danger }}
                              >
                                Wirklich löschen?
                              </button>
                              <button onClick={() => setAktLoeschId(null)} style={linkBtn}>
                                Abbrechen
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setAktLoeschId(akt.id)}
                              style={{ ...linkBtn, marginLeft: "auto" }}
                            >
                              Löschen
                            </button>
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

const linkBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: C.textDim,
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 12,
  cursor: "pointer",
  padding: 0,
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
