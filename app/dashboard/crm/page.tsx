"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import KiKlartext from "../_components/KiKlartext";
import CrmAuge from "./CrmAuge";
import KundenAuge from "./KundenAuge";

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

  // C12: Visitenkarte
  const [vkOffen, setVkOffen] = useState(false);
  const [vkBase64, setVkBase64] = useState("");
  const [vkMedia, setVkMedia] = useState("");
  const [vkVorschau, setVkVorschau] = useState("");
  const [vkLaden, setVkLaden] = useState(false);
  const [vkFelder, setVkFelder] = useState<{
    vorname: string;
    nachname: string;
    email: string;
    telefon: string;
    position: string;
    firma: string;
    website: string;
  } | null>(null);
  const [vkFehler, setVkFehler] = useState<string | null>(null);
  const [vkSpeichert, setVkSpeichert] = useState(false);
  const [vkDublette, setVkDublette] = useState<string | null>(null);
  const [vkDubletteBestaetigt, setVkDubletteBestaetigt] = useState(false);

  // C13: CSV-Import
  const [impOffen, setImpOffen] = useState(false);
  const [impAlleZeilen, setImpAlleZeilen] = useState<string[][]>([]);
  const [impHatHeader, setImpHatHeader] = useState(true);
  const [impMapping, setImpMapping] = useState<Record<string, number>>({
    vorname: -1,
    nachname: -1,
    email: -1,
    telefon: -1,
    firma: -1,
    position: -1,
  });
  const [impFehler, setImpFehler] = useState<string | null>(null);
  const [impSpeichert, setImpSpeichert] = useState(false);
  const [impImportiert, setImpImportiert] = useState(0);
  const [impUebersprungen, setImpUebersprungen] = useState(0);

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

  // Kompakter, stabiler Kontext für die KI-Klartext-Box: priorisiert vernachlässigte Kunden
  const crmKiKontext = useMemo(() => {
    const bewertet = kontakte
      .map((k) => ({ k, a: ampel(k), tage: tageSeit(k.letzter_kontakt_am) }))
      .filter((x) => x.a.farbe === C.danger || x.a.farbe === C.warn);
    if (bewertet.length === 0) return "";
    const rot = bewertet.filter((x) => x.a.farbe === C.danger).length;
    const gelb = bewertet.filter((x) => x.a.farbe === C.warn).length;
    const name = (k: Kontakt) =>
      [k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma || "Unbenannt";
    const zeile = (x: { k: Kontakt; tage: number | null }) => {
      const firma = x.k.firma ? ` (${x.k.firma})` : "";
      const status = x.k.status ? `, Status: ${x.k.status}` : "";
      const dauer = x.tage !== null ? `${x.tage} Tage kein Kontakt` : "noch kein Kontakt";
      return `- ${name(x.k)}${firma}: ${dauer}${status}`;
    };
    const top = bewertet
      .slice()
      .sort((a, b) => (b.tage ?? 0) - (a.tage ?? 0))
      .slice(0, 3)
      .map(zeile)
      .join("\n");
    return `${rot} Kunde(n) überfällig, ${gelb} bald fällig für Betreuung.\nAm längsten vernachlässigt:\n${top}`;
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

  // ---------------- C13: CSV-Import ----------------
  function csvParse(text: string, delim: string): string[][] {
    const zeilen: string[][] = [];
    let feld = "";
    let zeile: string[] = [];
    let inQuote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuote) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            feld += '"';
            i++;
          } else {
            inQuote = false;
          }
        } else {
          feld += c;
        }
      } else {
        if (c === '"') {
          inQuote = true;
        } else if (c === delim) {
          zeile.push(feld);
          feld = "";
        } else if (c === "\n") {
          zeile.push(feld);
          zeilen.push(zeile);
          zeile = [];
          feld = "";
        } else if (c === "\r") {
          // ignorieren (CRLF)
        } else {
          feld += c;
        }
      }
    }
    if (feld.length > 0 || zeile.length > 0) {
      zeile.push(feld);
      zeilen.push(zeile);
    }
    // komplett leere Zeilen entfernen
    return zeilen.filter((z) => z.some((f) => f.trim() !== ""));
  }

  function rateMapping(header: string[]): Record<string, number> {
    const m: Record<string, number> = {
      vorname: -1,
      nachname: -1,
      email: -1,
      telefon: -1,
      firma: -1,
      position: -1,
    };
    header.forEach((h, i) => {
      const t = h.toLowerCase();
      if (m.vorname === -1 && (t.includes("vorname") || t.includes("first")))
        m.vorname = i;
      else if (
        m.nachname === -1 &&
        (t.includes("nachname") || t.includes("last") || t.includes("surname"))
      )
        m.nachname = i;
      else if (m.email === -1 && (t.includes("mail")))
        m.email = i;
      else if (
        m.telefon === -1 &&
        (t.includes("telefon") ||
          t.includes("phone") ||
          t.includes("tel") ||
          t.includes("mobil") ||
          t.includes("handy"))
      )
        m.telefon = i;
      else if (
        m.firma === -1 &&
        (t.includes("firma") ||
          t.includes("company") ||
          t.includes("unternehmen") ||
          t.includes("organis"))
      )
        m.firma = i;
      else if (
        m.position === -1 &&
        (t.includes("position") ||
          t.includes("rolle") ||
          t.includes("funktion") ||
          t.includes("title") ||
          t.includes("titel"))
      )
        m.position = i;
      else if (m.nachname === -1 && t === "name") m.nachname = i;
    });
    return m;
  }

  function impOeffnen() {
    setImpOffen(true);
    setImpAlleZeilen([]);
    setImpHatHeader(true);
    setImpMapping({
      vorname: -1,
      nachname: -1,
      email: -1,
      telefon: -1,
      firma: -1,
      position: -1,
    });
    setImpFehler(null);
    setImpImportiert(0);
    setImpUebersprungen(0);
  }

  function impDateiGewaehlt(datei: File | null) {
    if (!datei) return;
    setImpFehler(null);
    setImpImportiert(0);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const ersteZeile = text.split("\n")[0] || "";
      const semi = (ersteZeile.match(/;/g) || []).length;
      const komma = (ersteZeile.match(/,/g) || []).length;
      const delim = semi > komma ? ";" : ",";
      const zeilen = csvParse(text, delim);
      if (zeilen.length === 0) {
        setImpFehler("Die Datei enthält keine lesbaren Zeilen.");
        return;
      }
      setImpAlleZeilen(zeilen);
      setImpHatHeader(true);
      setImpMapping(rateMapping(zeilen[0]));
    };
    reader.onerror = () => setImpFehler("Datei konnte nicht gelesen werden.");
    reader.readAsText(datei, "UTF-8");
  }

  async function impStart(header: string[], datenZeilen: string[][]) {
    setImpSpeichert(true);
    setImpFehler(null);

    const { data: best } = await supabase.from("kontakte").select("email");
    const vorhanden = new Set(
      ((best as { email: string | null }[]) || [])
        .map((r) => (r.email || "").toLowerCase())
        .filter(Boolean)
    );
    const gesehen = new Set<string>();
    const neu: any[] = [];
    let uebersprungen = 0;

    const val = (row: string[], i: number) =>
      i >= 0 && i < row.length ? (row[i] || "").trim() : "";

    for (const row of datenZeilen) {
      const vorname = val(row, impMapping.vorname);
      const nachname = val(row, impMapping.nachname);
      const email = val(row, impMapping.email);
      const telefon = val(row, impMapping.telefon);
      const firma = val(row, impMapping.firma);
      const position = val(row, impMapping.position);
      if (!vorname && !nachname && !email && !firma) continue;
      const key = email.toLowerCase();
      if (key && (vorhanden.has(key) || gesehen.has(key))) {
        uebersprungen++;
        continue;
      }
      if (key) gesehen.add(key);
      neu.push({
        vorname: vorname || null,
        nachname: nachname || null,
        email: email || null,
        telefon: telefon || null,
        firma: firma || null,
        position: position || null,
        status: "interessent",
        quelle: "CSV-Import",
        betreuungs_intervall_tage: 30,
      });
    }

    if (neu.length === 0) {
      setImpSpeichert(false);
      setImpFehler(
        "Keine neuen Kontakte zum Importieren – bitte Spalten-Zuordnung prüfen (mind. Name oder Firma)."
      );
      return;
    }

    let done = 0;
    for (let i = 0; i < neu.length; i += 500) {
      const chunk = neu.slice(i, i + 500);
      const { error } = await supabase.from("kontakte").insert(chunk);
      if (error) {
        setImpSpeichert(false);
        setImpFehler(error.message);
        return;
      }
      done += chunk.length;
    }
    setImpSpeichert(false);
    setImpImportiert(done);
    setImpUebersprungen(uebersprungen);
    laden_();
  }
  function vkOeffnen() {
    setVkOffen(true);
    setVkBase64("");
    setVkMedia("");
    setVkVorschau("");
    setVkFelder(null);
    setVkFehler(null);
    setVkDublette(null);
    setVkDubletteBestaetigt(false);
  }

  function vkDateiGewaehlt(datei: File | null) {
    if (!datei) return;
    setVkFehler(null);
    setVkFelder(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      setVkVorschau(result);
      const komma = result.indexOf(",");
      const daten = komma !== -1 ? result.slice(komma + 1) : "";
      const media =
        (result.match(/^data:(.*?);base64,/) || [])[1] || datei.type || "image/jpeg";
      setVkBase64(daten);
      setVkMedia(media);
    };
    reader.onerror = () => setVkFehler("Bild konnte nicht gelesen werden.");
    reader.readAsDataURL(datei);
  }

  async function vkAuslesen() {
    if (!vkBase64) {
      setVkFehler("Bitte zuerst ein Foto der Visitenkarte wählen.");
      return;
    }
    setVkLaden(true);
    setVkFehler(null);
    setVkFelder(null);
    try {
      const res = await fetch("/api/crm-visitenkarte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_type: vkMedia, base64: vkBase64 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVkFehler(data?.error || "Auslesen fehlgeschlagen.");
      } else if (data.leer) {
        setVkFehler(
          "Keine Kontaktdaten erkennbar. Bitte ein schärferes Foto versuchen – oder Kontakt manuell anlegen."
        );
      } else {
        setVkFelder(data.felder);
        setVkDublette(null);
        setVkDubletteBestaetigt(false);
      }
    } catch (e) {
      setVkFehler("Netzwerkfehler. Bitte erneut versuchen.");
    }
    setVkLaden(false);
  }

  function vkFeld(k: string, v: string) {
    setVkFelder((f) => (f ? { ...f, [k]: v } : f));
    if (k === "email") {
      setVkDublette(null);
      setVkDubletteBestaetigt(false);
    }
  }

  async function vkAnlegen() {
    if (!vkFelder) return;
    if (!vkFelder.vorname.trim() && !vkFelder.nachname.trim() && !vkFelder.firma.trim()) {
      setVkFehler("Bitte mindestens Name oder Firma angeben.");
      return;
    }
    setVkSpeichert(true);
    setVkFehler(null);

    if (vkFelder.email.trim() && !vkDubletteBestaetigt) {
      const { data: treffer } = await supabase
        .from("kontakte")
        .select("id, vorname, nachname")
        .ilike("email", vkFelder.email.trim());
      if (treffer && treffer.length > 0) {
        const t = treffer[0] as { vorname: string | null; nachname: string | null };
        const nm = [t.vorname, t.nachname].filter(Boolean).join(" ") || "ein Kontakt";
        setVkDublette(
          `Diese E-Mail existiert bereits (${nm}). Trotzdem als neuen Kontakt anlegen?`
        );
        setVkSpeichert(false);
        return;
      }
    }

    const notiz = vkFelder.website.trim()
      ? "Website: " + vkFelder.website.trim()
      : null;

    const { error } = await supabase.from("kontakte").insert({
      vorname: vkFelder.vorname.trim() || null,
      nachname: vkFelder.nachname.trim() || null,
      email: vkFelder.email.trim() || null,
      telefon: vkFelder.telefon.trim() || null,
      position: vkFelder.position.trim() || null,
      firma: vkFelder.firma.trim() || null,
      status: "interessent",
      quelle: "Visitenkarte",
      betreuungs_intervall_tage: 30,
      notizen: notiz,
    });
    setVkSpeichert(false);
    if (error) {
      setVkFehler(error.message);
      return;
    }
    setVkOffen(false);
    laden_();
  }

  // C13: abgeleitete Import-Ansicht
  const impHeader: string[] = impAlleZeilen.length
    ? impHatHeader
      ? impAlleZeilen[0]
      : impAlleZeilen[0].map((_, i) => "Spalte " + (i + 1))
    : [];
  const impDaten: string[][] = impAlleZeilen.length
    ? impHatHeader
      ? impAlleZeilen.slice(1)
      : impAlleZeilen
    : [];

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
                fontFamily: "var(--font-dm-sans), sans-serif",
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
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={vkOeffnen}
              style={{
                background: "transparent",
                color: C.green,
                border: `1px solid ${C.green}`,
                borderRadius: 10,
                padding: "12px 18px",
                fontFamily: "var(--font-dm-sans), sans-serif",
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              📇 Visitenkarte
            </button>
            <button
              onClick={impOeffnen}
              style={{
                background: "transparent",
                color: C.cyan,
                border: `1px solid ${C.cyan}`,
                borderRadius: 10,
                padding: "12px 18px",
                fontFamily: "var(--font-dm-sans), sans-serif",
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              📥 Import
            </button>
            <button
              onClick={() => router.push("/dashboard/crm/wochenfokus")}
              style={{
                background: "transparent",
                color: C.warn,
                border: `1px solid ${C.warn}`,
                borderRadius: 10,
                padding: "12px 18px",
                fontFamily: "var(--font-dm-sans), sans-serif",
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              🎯 Wochenfokus
            </button>
            <button
              onClick={() => router.push("/dashboard/crm/pipeline")}
              style={{
                background: "transparent",
                color: C.cyan,
                border: `1px solid ${C.cyan}`,
                borderRadius: 10,
                padding: "12px 18px",
                fontFamily: "var(--font-dm-sans), sans-serif",
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              📊 Pipeline
            </button>
            <button
              onClick={() => router.push("/dashboard/crm/firmen")}
              style={{
                background: "transparent",
                color: C.gold,
                border: `1px solid ${C.gold}`,
                borderRadius: 10,
                padding: "12px 18px",
                fontFamily: "var(--font-dm-sans), sans-serif",
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              🏢 Firmen
            </button>
            <button
              onClick={dialogNeu}
              style={{
                background: C.gold,
                color: C.navy,
                border: "none",
                borderRadius: 10,
                padding: "12px 20px",
                fontFamily: "var(--font-dm-sans), sans-serif",
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              + Neuer Kontakt
            </button>
          </div>
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

        {/* KI-Auge: was heißt die CRM-Lage gerade für mich? */}
      <CrmAuge />
      <KundenAuge kontakte={kontakte} />

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
                fontFamily: "var(--font-dm-sans), sans-serif",
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
                  fontFamily: "var(--font-dm-sans), sans-serif",
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
                  fontFamily: "var(--font-dm-sans), sans-serif",
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

      {/* C12: Visitenkarte-Modal */}
      {vkOffen && (
        <div
          style={overlay}
          onClick={() => !vkSpeichert && !vkLaden && setVkOffen(false)}
        >
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-dm-sans), sans-serif",
                  color: C.green,
                  fontSize: 22,
                  margin: 0,
                }}
              >
                📇 Visitenkarte auslesen
              </h2>
              <button
                onClick={() => setVkOffen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: C.textDim,
                  fontSize: 20,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ color: C.textDim, fontSize: 13, marginBottom: 12 }}>
              Foto wählen oder (am Handy) direkt aufnehmen – ARGONAUT liest die Kontaktdaten aus.
            </div>

            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => vkDateiGewaehlt(e.target.files ? e.target.files[0] : null)}
              style={{
                color: C.textDim,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                marginBottom: 12,
                width: "100%",
              }}
            />

            {vkVorschau && (
              <img
                src={vkVorschau}
                alt="Visitenkarte"
                style={{
                  maxWidth: "100%",
                  maxHeight: 200,
                  borderRadius: 10,
                  border: `1px solid ${C.border}`,
                  marginBottom: 12,
                  display: "block",
                }}
              />
            )}

            {!vkFelder && (
              <button
                onClick={vkAuslesen}
                disabled={vkLaden || !vkBase64}
                style={{
                  background: C.green,
                  color: C.navy,
                  border: "none",
                  borderRadius: 10,
                  padding: "11px 22px",
                  fontFamily: "var(--font-dm-sans), sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  opacity: !vkBase64 ? 0.6 : 1,
                }}
              >
                {vkLaden ? "ARGONAUT liest…" : "✨ Auslesen"}
              </button>
            )}

            {vkFehler && (
              <div
                style={{
                  background: "rgba(224,102,102,0.12)",
                  border: `1px solid ${C.danger}`,
                  color: C.danger,
                  borderRadius: 10,
                  padding: "12px 16px",
                  marginTop: 12,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                }}
              >
                {vkFehler}
              </div>
            )}

            {vkFelder && (
              <div style={{ marginTop: 16 }}>
                <div style={{ color: C.green, fontSize: 12, marginBottom: 12 }}>
                  Erkannt – bitte prüfen &amp; anlegen
                </div>
                <div style={grid2}>
                  <Feld label="Vorname">
                    <input style={inp} value={vkFelder.vorname} onChange={(e) => vkFeld("vorname", e.target.value)} />
                  </Feld>
                  <Feld label="Nachname">
                    <input style={inp} value={vkFelder.nachname} onChange={(e) => vkFeld("nachname", e.target.value)} />
                  </Feld>
                  <Feld label="E-Mail">
                    <input style={inp} value={vkFelder.email} onChange={(e) => vkFeld("email", e.target.value)} />
                  </Feld>
                  <Feld label="Telefon">
                    <input style={inp} value={vkFelder.telefon} onChange={(e) => vkFeld("telefon", e.target.value)} />
                  </Feld>
                  <Feld label="Firma">
                    <input style={inp} value={vkFelder.firma} onChange={(e) => vkFeld("firma", e.target.value)} />
                  </Feld>
                  <Feld label="Position / Rolle">
                    <input style={inp} value={vkFelder.position} onChange={(e) => vkFeld("position", e.target.value)} />
                  </Feld>
                  <Feld label="Website">
                    <input style={inp} value={vkFelder.website} onChange={(e) => vkFeld("website", e.target.value)} />
                  </Feld>
                </div>

                {vkDublette && (
                  <div
                    style={{
                      background: "rgba(224,162,76,0.12)",
                      border: `1px solid ${C.warn}`,
                      color: C.warn,
                      borderRadius: 10,
                      padding: "12px 14px",
                      margin: "8px 0",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 14,
                    }}
                  >
                    ⚠ {vkDublette}
                    <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                      <button
                        style={{ ...miniBtn, color: C.warn, borderColor: C.warn }}
                        onClick={() => {
                          setVkDubletteBestaetigt(true);
                          setVkDublette(null);
                          vkAnlegen();
                        }}
                      >
                        Trotzdem anlegen
                      </button>
                      <button style={miniBtn} onClick={() => setVkDublette(null)}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                  <button
                    onClick={vkAnlegen}
                    disabled={vkSpeichert}
                    style={{
                      background: C.gold,
                      color: C.navy,
                      border: "none",
                      borderRadius: 10,
                      padding: "11px 24px",
                      fontFamily: "var(--font-dm-sans), sans-serif",
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: "pointer",
                      opacity: vkSpeichert ? 0.6 : 1,
                    }}
                  >
                    {vkSpeichert ? "Legt an…" : "Kontakt anlegen"}
                  </button>
                  <button
                    onClick={() => {
                      setVkFelder(null);
                      setVkVorschau("");
                      setVkBase64("");
                    }}
                    style={{
                      background: "transparent",
                      color: C.textDim,
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      padding: "11px 20px",
                      fontFamily: "var(--font-dm-sans), sans-serif",
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    Anderes Foto
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* C13: CSV-Import-Modal */}
      {impOffen && (
        <div
          style={overlay}
          onClick={() => !impSpeichert && setImpOffen(false)}
        >
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-dm-sans), sans-serif",
                  color: C.cyan,
                  fontSize: 22,
                  margin: 0,
                }}
              >
                📥 Kontakte importieren (CSV)
              </h2>
              <button
                onClick={() => setImpOffen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: C.textDim,
                  fontSize: 20,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {impImportiert > 0 ? (
              <div>
                <div
                  style={{
                    background: "rgba(76,175,125,0.12)",
                    border: `1px solid ${C.green}`,
                    color: C.green,
                    borderRadius: 10,
                    padding: "16px 18px",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 15,
                    marginBottom: 16,
                  }}
                >
                  ✅ {impImportiert} Kontakt(e) importiert
                  {impUebersprungen > 0
                    ? ` · ${impUebersprungen} Dublette(n) übersprungen`
                    : ""}
                  .
                </div>
                <button
                  onClick={() => setImpOffen(false)}
                  style={{
                    background: C.gold,
                    color: C.navy,
                    border: "none",
                    borderRadius: 10,
                    padding: "11px 24px",
                    fontFamily: "var(--font-dm-sans), sans-serif",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Fertig
                </button>
              </div>
            ) : (
              <div>
                <div style={{ color: C.textDim, fontSize: 13, marginBottom: 12 }}>
                  CSV-Datei wählen (z. B. Export aus Excel/Outlook). Komma und Semikolon werden erkannt.
                </div>

                <input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  onChange={(e) =>
                    impDateiGewaehlt(e.target.files ? e.target.files[0] : null)
                  }
                  style={{
                    color: C.textDim,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    marginBottom: 14,
                    width: "100%",
                  }}
                />

                {impFehler && (
                  <div
                    style={{
                      background: "rgba(224,102,102,0.12)",
                      border: `1px solid ${C.danger}`,
                      color: C.danger,
                      borderRadius: 10,
                      padding: "12px 16px",
                      marginBottom: 14,
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 14,
                    }}
                  >
                    {impFehler}
                  </div>
                )}

                {impAlleZeilen.length > 0 && (
                  <div>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        color: C.textDim,
                        fontSize: 13,
                        marginBottom: 16,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={impHatHeader}
                        onChange={(e) => {
                          setImpHatHeader(e.target.checked);
                          if (e.target.checked) {
                            setImpMapping(rateMapping(impAlleZeilen[0]));
                          }
                        }}
                      />
                      Erste Zeile enthält Spaltenüberschriften
                    </label>

                    {/* Spalten-Zuordnung */}
                    <div style={{ color: C.cyan, fontSize: 12, marginBottom: 10 }}>
                      Spalten zuordnen
                    </div>
                    <div style={grid2}>
                      {[
                        ["vorname", "Vorname"],
                        ["nachname", "Nachname"],
                        ["email", "E-Mail"],
                        ["telefon", "Telefon"],
                        ["firma", "Firma"],
                        ["position", "Position / Rolle"],
                      ].map(([feld, label]) => (
                        <Feld key={feld} label={label}>
                          <select
                            style={inp}
                            value={impMapping[feld]}
                            onChange={(e) =>
                              setImpMapping((m) => ({
                                ...m,
                                [feld]: Number(e.target.value),
                              }))
                            }
                          >
                            <option value={-1}>— ignorieren —</option>
                            {impHeader.map((h, i) => (
                              <option key={i} value={i}>
                                {h || "Spalte " + (i + 1)}
                              </option>
                            ))}
                          </select>
                        </Feld>
                      ))}
                    </div>

                    {/* Vorschau */}
                    <div style={{ color: C.cyan, fontSize: 12, margin: "16px 0 8px" }}>
                      Vorschau ({impDaten.length} Datenzeile
                      {impDaten.length === 1 ? "" : "n"})
                    </div>
                    <div style={{ overflowX: "auto", marginBottom: 16 }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontFamily: "'DM Sans', sans-serif",
                          fontSize: 12,
                        }}
                      >
                        <thead>
                          <tr>
                            {impHeader.map((h, i) => (
                              <th
                                key={i}
                                style={{
                                  textAlign: "left",
                                  color: C.textDim,
                                  borderBottom: `1px solid ${C.border}`,
                                  padding: "6px 10px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {h || "Spalte " + (i + 1)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {impDaten.slice(0, 5).map((row, ri) => (
                            <tr key={ri}>
                              {impHeader.map((_, ci) => (
                                <td
                                  key={ci}
                                  style={{
                                    color: "#fff",
                                    borderBottom: `1px solid ${C.border}`,
                                    padding: "6px 10px",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {row[ci] || ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ color: C.textDim, fontSize: 12, marginBottom: 14 }}>
                      Dubletten (gleiche E-Mail wie bestehende Kontakte) werden automatisch übersprungen. Quelle wird „CSV-Import".
                    </div>

                    <button
                      onClick={() => impStart(impHeader, impDaten)}
                      disabled={impSpeichert || impDaten.length === 0}
                      style={{
                        background: C.gold,
                        color: C.navy,
                        border: "none",
                        borderRadius: 10,
                        padding: "11px 24px",
                        fontFamily: "var(--font-dm-sans), sans-serif",
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: "pointer",
                        opacity: impSpeichert || impDaten.length === 0 ? 0.6 : 1,
                      }}
                    >
                      {impSpeichert
                        ? "Importiert…"
                        : impDaten.length + " Kontakt(e) importieren"}
                    </button>
                  </div>
                )}
              </div>
            )}
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
          fontFamily: "var(--font-dm-sans), sans-serif",
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
