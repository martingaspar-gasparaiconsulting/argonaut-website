"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------
// ARGONAUT OS · MODUL 4 VERTRIEB+CRM · C2+C5 Kontakt-Cockpit
// C5: Tag-Chips pro Zeile + Tag-Filter
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
  updated_at: string | null;
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
  notizen: string;
}

const LEER_FORM: FormState = {
  vorname: "",
  nachname: "",
  email: "",
  telefon: "",
  position: "",
  firma: "",
  status: "interessent",
  quelle: "",
  betreuungs_intervall_tage: "30",
  notizen: "",
};

function tageSeit(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function ampel(k: Kontakt): { farbe: string; label: string } {
  const tage = tageSeit(k.letzter_kontakt_am);
  if (tage === null) return { farbe: C.textDim, label: "Noch kein Kontakt" };
  const iv = k.betreuungs_intervall_tage || 30;
  if (tage <= iv) return { farbe: C.green, label: `Im Takt · vor ${tage} T` };
  if (tage <= iv * 2)
    return { farbe: C.warn, label: `Bald fällig · vor ${tage} T` };
  return { farbe: C.danger, label: `Überfällig · vor ${tage} T` };
}

function datumKurz(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function CrmCockpitPage() {
  const router = useRouter();

  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagMap, setTagMap] = useState<Record<string, string[]>>({}); // kontakt_id -> tag_ids
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [suche, setSuche] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [quelleFilter, setQuelleFilter] = useState("alle");
  const [tagFilter, setTagFilter] = useState("alle");

  const [dialogOffen, setDialogOffen] = useState(false);
  const [bearbeite, setBearbeite] = useState<Kontakt | null>(null);
  const [form, setForm] = useState<FormState>(LEER_FORM);
  const [speichert, setSpeichert] = useState(false);
  const [dublette, setDublette] = useState<string | null>(null);
  const [dubletteBestaetigt, setDubletteBestaetigt] = useState(false);

  const [loeschId, setLoeschId] = useState<string | null>(null);

  async function laden_() {
    setLaden(true);
    setFehler(null);

    const { data, error } = await supabase
      .from("kontakte")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      setFehler(error.message);
      setKontakte([]);
      setLaden(false);
      return;
    }
    setKontakte((data as Kontakt[]) || []);

    const { data: tagData } = await supabase
      .from("kontakt_tags")
      .select("*")
      .order("name", { ascending: true });
    setTags((tagData as Tag[]) || []);

    const { data: zuord } = await supabase
      .from("kontakt_tag_zuordnung")
      .select("kontakt_id, tag_id");
    const map: Record<string, string[]> = {};
    ((zuord as { kontakt_id: string; tag_id: string }[]) || []).forEach((z) => {
      if (!map[z.kontakt_id]) map[z.kontakt_id] = [];
      map[z.kontakt_id].push(z.tag_id);
    });
    setTagMap(map);

    setLaden(false);
  }

  useEffect(() => {
    laden_();
  }, []);

  const tagById = useMemo(() => {
    const m: Record<string, Tag> = {};
    tags.forEach((t) => (m[t.id] = t));
    return m;
  }, [tags]);

  const quellen = useMemo(() => {
    const s = new Set<string>();
    kontakte.forEach((k) => {
      if (k.quelle) s.add(k.quelle);
    });
    return Array.from(s).sort();
  }, [kontakte]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return kontakte.filter((k) => {
      if (statusFilter !== "alle" && (k.status || "") !== statusFilter)
        return false;
      if (quelleFilter !== "alle" && (k.quelle || "") !== quelleFilter)
        return false;
      if (tagFilter !== "alle") {
        const ids = tagMap[k.id] || [];
        if (!ids.includes(tagFilter)) return false;
      }
      if (!q) return true;
      const heu = [k.vorname, k.nachname, k.email, k.firma, k.telefon, k.position]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return heu.includes(q);
    });
  }, [kontakte, suche, statusFilter, quelleFilter, tagFilter, tagMap]);

  const kpi = useMemo(() => {
    const gesamt = kontakte.length;
    const kunden = kontakte.filter((k) => k.status === "kunde").length;
    const heute = Date.now();
    const wiedervorlage = kontakte.filter(
      (k) =>
        k.naechster_kontakt_am &&
        new Date(k.naechster_kontakt_am).getTime() <= heute
    ).length;
    const einschlafend = kontakte.filter(
      (k) => ampel(k).farbe === C.danger
    ).length;
    return { gesamt, kunden, wiedervorlage, einschlafend };
  }, [kontakte]);

  function dialogNeu() {
    setBearbeite(null);
    setForm(LEER_FORM);
    setDublette(null);
    setDubletteBestaetigt(false);
    setDialogOffen(true);
  }

  function dialogBearbeiten(k: Kontakt) {
    setBearbeite(k);
    setForm({
      vorname: k.vorname || "",
      nachname: k.nachname || "",
      email: k.email || "",
      telefon: k.telefon || "",
      position: k.position || "",
      firma: k.firma || "",
      status: k.status || "interessent",
      quelle: k.quelle || "",
      betreuungs_intervall_tage: String(k.betreuungs_intervall_tage || 30),
      notizen: k.notizen || "",
    });
    setDublette(null);
    setDubletteBestaetigt(false);
    setDialogOffen(true);
  }

  function feld<K extends keyof FormState>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    if (k === "email") {
      setDublette(null);
      setDubletteBestaetigt(false);
    }
  }

  async function speichern() {
    if (!form.vorname.trim() && !form.nachname.trim() && !form.firma.trim()) {
      setFehler("Bitte mindestens Name oder Firma angeben.");
      return;
    }
    setSpeichert(true);
    setFehler(null);

    if (!bearbeite && form.email.trim() && !dubletteBestaetigt) {
      const { data: treffer } = await supabase
        .from("kontakte")
        .select("id, vorname, nachname")
        .ilike("email", form.email.trim());
      if (treffer && treffer.length > 0) {
        const t = treffer[0] as {
          vorname: string | null;
          nachname: string | null;
        };
        const name =
          [t.vorname, t.nachname].filter(Boolean).join(" ") || "ein Kontakt";
        setDublette(
          `Diese E-Mail existiert bereits (${name}). Trotzdem als neuen Kontakt anlegen?`
        );
        setSpeichert(false);
        return;
      }
    }

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
      notizen: form.notizen.trim() || null,
    };

    let error;
    if (bearbeite) {
      const res = await supabase
        .from("kontakte")
        .update(nutzlast)
        .eq("id", bearbeite.id);
      error = res.error;
    } else {
      const res = await supabase.from("kontakte").insert(nutzlast);
      error = res.error;
    }

    setSpeichert(false);
    if (error) {
      setFehler(error.message);
      return;
    }
    setDialogOffen(false);
    laden_();
  }

  async function loeschen(id: string) {
    const { error } = await supabase.from("kontakte").delete().eq("id", id);
    setLoeschId(null);
    if (error) {
      setFehler(error.message);
      return;
    }
    laden_();
  }

  return (
    <div style={{ background: C.navy, minHeight: "100vh", padding: "32px 28px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Kopf */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "Syne, sans-serif",
                color: C.gold,
                fontSize: 30,
                margin: 0,
                letterSpacing: 0.5,
              }}
            >
              🤝 Vertrieb / CRM
            </h1>
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: C.textDim,
                margin: "6px 0 0",
                fontSize: 14,
              }}
            >
              Deine Kontakte, Beziehungen und Wiedervorlagen auf einen Blick.
            </p>
          </div>
          <button
            onClick={dialogNeu}
            style={{
              background: C.gold,
              color: C.navy,
              border: "none",
              borderRadius: 10,
              padding: "12px 20px",
              fontFamily: "Syne, sans-serif",
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            + Neuer Kontakt
          </button>
        </div>

        {/* KPI-Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}
        >
          <KpiKarte label="Kontakte gesamt" wert={kpi.gesamt} farbe={C.cyan} />
          <KpiKarte label="Kunden" wert={kpi.kunden} farbe={C.green} />
          <KpiKarte
            label="Wiedervorlage fällig"
            wert={kpi.wiedervorlage}
            farbe={C.warn}
          />
          <KpiKarte
            label="Einschlafende"
            wert={kpi.einschlafend}
            farbe={C.danger}
          />
        </div>

        {/* Filterleiste */}
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Suche: Name, Firma, E-Mail, Telefon…"
            style={{ ...inp, flex: "1 1 240px" }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...inp, flex: "0 0 auto" }}
          >
            <option value="alle">Status: alle</option>
            {STATUS_OPTIONEN.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={quelleFilter}
            onChange={(e) => setQuelleFilter(e.target.value)}
            style={{ ...inp, flex: "0 0 auto" }}
          >
            <option value="alle">Quelle: alle</option>
            {quellen.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            style={{ ...inp, flex: "0 0 auto" }}
          >
            <option value="alle">Tag: alle</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {fehler && (
          <div
            style={{
              background: "rgba(224,102,102,0.12)",
              border: `1px solid ${C.danger}`,
              color: C.danger,
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 16,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14,
            }}
          >
            {fehler}
          </div>
        )}

        {/* Tabelle */}
        <div
          style={{
            background: C.navy2,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {laden ? (
            <div style={leerBox}>Lade Kontakte…</div>
          ) : gefiltert.length === 0 ? (
            <div style={leerBox}>
              {kontakte.length === 0
                ? "Noch keine Kontakte. Leg deinen ersten Kontakt an."
                : "Keine Treffer für diese Filter."}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                <thead>
                  <tr>
                    {["", "Name", "Firma", "Kontakt", "Status", "Letzter Kontakt", ""].map(
                      (h, i) => (
                        <th key={i} style={th}>
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {gefiltert.map((k) => {
                    const a = ampel(k);
                    const kTagIds = tagMap[k.id] || [];
                    return (
                      <tr
                        key={k.id}
                        style={{
                          borderTop: `1px solid ${C.border}`,
                          cursor: "pointer",
                        }}
                        onClick={() => router.push(`/dashboard/crm/${k.id}`)}
                      >
                        <td style={{ ...td, width: 40 }}>
                          <span
                            title={a.label}
                            style={{
                              display: "inline-block",
                              width: 12,
                              height: 12,
                              borderRadius: "50%",
                              background: a.farbe,
                              boxShadow: `0 0 8px ${a.farbe}`,
                            }}
                          />
                        </td>
                        <td style={td}>
                          <div style={{ color: "#fff", fontWeight: 600 }}>
                            {[k.vorname, k.nachname].filter(Boolean).join(" ") ||
                              "—"}
                          </div>
                          {k.position && (
                            <div style={{ color: C.textDim, fontSize: 12 }}>
                              {k.position}
                            </div>
                          )}
                          {kTagIds.length > 0 && (
                            <div
                              style={{
                                display: "flex",
                                gap: 5,
                                flexWrap: "wrap",
                                marginTop: 5,
                              }}
                            >
                              {kTagIds.map((tid) => {
                                const t = tagById[tid];
                                if (!t) return null;
                                return <TagChip key={tid} tag={t} klein />;
                              })}
                            </div>
                          )}
                        </td>
                        <td style={{ ...td, color: C.textDim }}>
                          {k.firma || "—"}
                        </td>
                        <td style={td}>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                            }}
                          >
                            {k.email && (
                              <a
                                href={`mailto:${k.email}`}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  color: C.cyan,
                                  textDecoration: "none",
                                  fontSize: 13,
                                }}
                              >
                                {k.email}
                              </a>
                            )}
                            {k.telefon && (
                              <a
                                href={`tel:${k.telefon}`}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  color: C.cyan,
                                  textDecoration: "none",
                                  fontSize: 13,
                                }}
                              >
                                {k.telefon}
                              </a>
                            )}
                            {!k.email && !k.telefon && (
                              <span style={{ color: C.textDim }}>—</span>
                            )}
                          </div>
                        </td>
                        <td style={td}>
                          <StatusBadge status={k.status} />
                        </td>
                        <td style={{ ...td, color: C.textDim, fontSize: 13 }}>
                          {datumKurz(k.letzter_kontakt_am)}
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              dialogBearbeiten(k);
                            }}
                            style={miniBtn}
                          >
                            Bearbeiten
                          </button>
                          {loeschId === k.id ? (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  loeschen(k.id);
                                }}
                                style={{
                                  ...miniBtn,
                                  color: C.danger,
                                  borderColor: C.danger,
                                }}
                              >
                                Wirklich?
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLoeschId(null);
                                }}
                                style={miniBtn}
                              >
                                Abbrechen
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setLoeschId(k.id);
                              }}
                              style={{ ...miniBtn, color: C.textDim }}
                            >
                              Löschen
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Dialog */}
      {dialogOffen && (
        <div style={overlay} onClick={() => !speichert && setDialogOffen(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h2
              style={{
                fontFamily: "Syne, sans-serif",
                color: C.gold,
                fontSize: 22,
                margin: "0 0 18px",
              }}
            >
              {bearbeite ? "Kontakt bearbeiten" : "Neuer Kontakt"}
            </h2>

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
              <Feld label="Betreuungs-Intervall (Tage, für Ampel)">
                <input
                  style={inp}
                  type="number"
                  value={form.betreuungs_intervall_tage}
                  onChange={(e) => feld("betreuungs_intervall_tage", e.target.value)}
                />
              </Feld>
            </div>

            <Feld label="Notizen">
              <textarea
                style={{ ...inp, minHeight: 80, resize: "vertical" }}
                value={form.notizen}
                onChange={(e) => feld("notizen", e.target.value)}
              />
            </Feld>

            {!bearbeite && (
              <div style={{ color: C.textDim, fontSize: 12, marginTop: 4 }}>
                Tags kannst du nach dem Anlegen auf der Kontakt-Detailseite vergeben.
              </div>
            )}

            {dublette && (
              <div
                style={{
                  background: "rgba(224,162,76,0.12)",
                  border: `1px solid ${C.warn}`,
                  color: C.warn,
                  borderRadius: 10,
                  padding: "12px 14px",
                  margin: "12px 0",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                }}
              >
                ⚠ {dublette}
                <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                  <button
                    style={{ ...miniBtn, color: C.warn, borderColor: C.warn }}
                    onClick={() => {
                      setDubletteBestaetigt(true);
                      setDublette(null);
                      speichern();
                    }}
                  >
                    Trotzdem anlegen
                  </button>
                  <button style={miniBtn} onClick={() => setDublette(null)}>
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                marginTop: 20,
              }}
            >
              <button
                onClick={() => setDialogOffen(false)}
                disabled={speichert}
                style={{
                  background: "transparent",
                  color: C.textDim,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: "11px 20px",
                  fontFamily: "Syne, sans-serif",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={speichern}
                disabled={speichert}
                style={{
                  background: C.gold,
                  color: C.navy,
                  border: "none",
                  borderRadius: 10,
                  padding: "11px 24px",
                  fontFamily: "Syne, sans-serif",
                  fontWeight: 700,
                  cursor: "pointer",
                  opacity: speichert ? 0.6 : 1,
                }}
              >
                {speichert ? "Speichert…" : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --------------------------- Hilfs-Komponenten ---------------------------

function KpiKarte({
  label,
  wert,
  farbe,
}: {
  label: string;
  wert: number;
  farbe: string;
}) {
  return (
    <div
      style={{
        background: C.navy2,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontFamily: "Syne, sans-serif",
          color: farbe,
          fontSize: 30,
          fontWeight: 800,
          lineHeight: 1,
        }}
      >
        {wert}
      </div>
      <div
        style={{
          fontFamily: "'DM Sans', sans-serif",
          color: C.textDim,
          fontSize: 13,
          marginTop: 6,
        }}
      >
        {label}
      </div>
    </div>
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
        background: "transparent",
      }}
    >
      {status || "—"}
    </span>
  );
}

function TagChip({ tag, klein }: { tag: Tag; klein?: boolean }) {
  const farbe = tag.farbe || C.gold;
  return (
    <span
      style={{
        display: "inline-block",
        padding: klein ? "1px 8px" : "3px 10px",
        borderRadius: 20,
        fontSize: klein ? 11 : 12,
        fontWeight: 600,
        color: farbe,
        border: `1px solid ${farbe}`,
      }}
    >
      {tag.name}
    </span>
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

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 16px",
  color: C.textDim,
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const td: React.CSSProperties = {
  padding: "14px 16px",
  verticalAlign: "middle",
  color: "#fff",
  fontSize: 14,
};

const miniBtn: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "6px 12px",
  color: C.cyan,
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 13,
  cursor: "pointer",
  marginLeft: 6,
};

const leerBox: React.CSSProperties = {
  padding: "48px 24px",
  textAlign: "center",
  color: C.textDim,
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 15,
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "40px 16px",
  overflowY: "auto",
  zIndex: 1000,
};

const modal: React.CSSProperties = {
  background: C.navy2,
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  padding: "26px 26px 22px",
  width: "100%",
  maxWidth: 620,
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0 16px",
};
