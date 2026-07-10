"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { steuerGruppen, cent, satzText, type SteuerPosten } from "../../_components/steuerLogik";

// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · R4 — Rechnungs-Detailseite
// Positionen-Editor (Live-Summen), Zahlungsstatus-Workflow,
// Daten (Rechnungs-/Leistungs-/Faelligkeitsdatum), §19-Kleinunternehmer.
// Route: /dashboard/rechnungen/[id]
//
// R4.1 — Drei Korrekturen:
//   (1) Neue Positionen bekommen wieder das Praefix "neu-". Ohne das lief
//       jede neu angelegte Zeile in den UPDATE-Zweig, traf null Datensaetze
//       und ging OHNE FEHLERMELDUNG verloren — waehrend der Rechnungskopf
//       ihre Summe trotzdem speicherte.
//   (2) Positionen-Schreibvorgaenge melden Fehler UND stille Nulltreffer.
//   (3) Summen laufen ueber steuerLogik.ts: je Zeile runden, dann je
//       Steuersatz auf die Gruppensumme rechnen (§14 Abs. 4 Nr. 7+8 UStG).
//       Damit sind Kopf, Positionen und PDF auf denselben Cent einig.
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

type StatusKey = "offen" | "teilbezahlt" | "bezahlt" | "ueberfaellig" | "storniert";

const STATUS: Record<StatusKey, { label: string; farbe: string; icon: string }> = {
  offen: { label: "Offen", farbe: C.cyan, icon: "📨" },
  teilbezahlt: { label: "Teilbezahlt", farbe: C.lila, icon: "◐" },
  bezahlt: { label: "Bezahlt", farbe: C.green, icon: "✅" },
  ueberfaellig: { label: "Überfällig", farbe: C.danger, icon: "⏰" },
  storniert: { label: "Storniert", farbe: C.textDim, icon: "⚪" },
};

const EINHEITEN = ["Stk", "Std", "Tag", "m", "m²", "m³", "kg", "t", "lfm", "Psch"];

type Zeile = {
  id: string;
  bezeichnung: string;
  menge: string;
  einheit: string;
  einzelpreis: string;
  mwst_satz: string;
};

// Einzelne Zahlung (Quelle der Wahrheit für Zahlungsstatus + Block D)
type Zahlung = {
  id: string;
  betrag: number;
  zahlungsdatum: string;
  zahlungsart: string;
  referenz: string | null;
  notiz: string | null;
};

const ZAHLUNGSARTEN = ["Überweisung", "Bar", "Karte", "Lastschrift", "PayPal", "Sonstige"];

function parseZahl(s: string): number {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function ladeStr(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return String(n).replace(".", ",");
}
// Kaufmaennisch, symmetrisch um die Null — eine einzige Rundungsregel im ganzen Modul.
function r2(n: number): number {
  return cent(n);
}
function geld(n: number | null | undefined, waehrung = "EUR"): string {
  const wert = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: waehrung || "EUR",
  }).format(wert);
}
function datumDe(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return d;
  }
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
// Tage bis Fälligkeit (negativ = überfällig)
function tageBisFaellig(faellig: string | null | undefined): number | null {
  if (!faellig) return null;
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const f = new Date(faellig);
  f.setHours(0, 0, 0, 0);
  return Math.round((f.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));
}

export default function RechnungDetail() {
  const router = useRouter();
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);

  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [nichtGefunden, setNichtGefunden] = useState(false);

  const [rechnung, setRechnung] = useState<any>(null);
  const [kontakt, setKontakt] = useState<any>(null);
  const [firma, setFirma] = useState<any>(null);
  const [firmenprofil, setFirmenprofil] = useState<any>(null);

  const [titel, setTitel] = useState("");
  const [status, setStatus] = useState<StatusKey>("offen");
  const [rechnungsdatum, setRechnungsdatum] = useState<string>("");
  const [leistungsdatum, setLeistungsdatum] = useState<string>("");
  const [faelligkeitsdatum, setFaelligkeitsdatum] = useState<string>("");
  const [zahlungszielTage, setZahlungszielTage] = useState<string>("14");
  const [waehrung, setWaehrung] = useState("EUR");
  const [notizen, setNotizen] = useState("");
  const [kleinunternehmer, setKleinunternehmer] = useState(false);
  // Zahlungen (Block C) – einzelne Geldeingänge dieser Rechnung
  const [zahlungen, setZahlungen] = useState<Zahlung[]>([]);
  const [zBetrag, setZBetrag] = useState<string>("");
  const [zDatum, setZDatum] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [zArt, setZArt] = useState<string>("Überweisung");
  const [zReferenz, setZReferenz] = useState<string>("");
  const [zBusy, setZBusy] = useState(false);

  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [geladeneIds, setGeladeneIds] = useState<string[]>([]);

  const [dirty, setDirty] = useState(false);
  const [speichern, setSpeichern] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);
  const [pdfLaedt, setPdfLaedt] = useState(false);

  // Bezahlte Rechnungen sind schreibgeschützt (Storno+Neu ist der korrekte Weg)
  const gesperrt = status === "bezahlt" || status === "storniert";

  async function laden() {
    setLoading(true);
    setFehler(null);

    const [rRes, pRes] = await Promise.all([
      supabase.from("rechnungen").select("*").eq("id", id).single(),
      supabase
        .from("rechnung_positionen")
        .select("*")
        .eq("rechnung_id", id)
        .order("position", { ascending: true }),
    ]);

    if (rRes.error || !rRes.data) {
      setNichtGefunden(true);
      setLoading(false);
      return;
    }

    const r = rRes.data as any;
    setRechnung(r);
    setTitel(r.titel || "");
    setStatus((r.zahlungsstatus as StatusKey) || "offen");
    setRechnungsdatum(r.rechnungsdatum || "");
    setLeistungsdatum(r.leistungsdatum || "");
    setFaelligkeitsdatum(r.faelligkeitsdatum || "");
    setZahlungszielTage(r.zahlungsziel_tage != null ? String(r.zahlungsziel_tage) : "14");
    setWaehrung(r.waehrung || "EUR");
    setNotizen(r.notizen || "");
    setKleinunternehmer(!!r.kleinunternehmer);
    // Einzel-Zahlungen dieser Rechnung laden (Quelle der Wahrheit für Block C/D)
    const { data: zData } = await supabase
      .from("zahlungen")
      .select("*")
      .eq("rechnung_id", id)
      .order("zahlungsdatum", { ascending: false })
      .order("created_at", { ascending: false });
    setZahlungen(
      ((zData as any[]) || []).map((z) => ({
        id: z.id,
        betrag: Number(z.betrag) || 0,
        zahlungsdatum: z.zahlungsdatum,
        zahlungsart: z.zahlungsart || "Überweisung",
        referenz: z.referenz,
        notiz: z.notiz,
      }))
    );

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

    // Kontakt + Firma defensiv nachladen
    if (r.kontakt_id) {
      const { data: k } = await supabase.from("kontakte").select("*").eq("id", r.kontakt_id).single();
      if (k) setKontakt(k);
    }
    if (r.firma_id) {
      const { data: f } = await supabase.from("firmen").select("*").eq("id", r.firma_id).single();
      if (f) setFirma(f);
    }

    // Firmenprofil (Absenderdaten §14) aus profiles laden – dieselbe Quelle wie Einstellungen
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select(
          "firma_name, firma_strasse, firma_plz, firma_ort, firma_telefon, firma_email, firma_ust_id, firma_steuernummer, firma_iban, firma_bank, firma_bic"
        )
        .eq("id", user.id)
        .single();
      if (prof) setFirmenprofil(prof);
    }

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

  // ACHTUNG: Das Praefix "neu-" ist keine Kosmetik. speichernJetzt() unterscheidet
  // daran INSERT von UPDATE. Ohne Praefix liefe eine neue Zeile in den UPDATE-Zweig,
  // traefe null Datensaetze und ginge kommentarlos verloren.
  function neueId(): string {
    let roh: string;
    try {
      roh = crypto.randomUUID();
    } catch {
      roh = Math.random().toString(36).slice(2) + Date.now();
    }
    return "neu-" + roh;
  }
  function zeileHinzufuegen() {
    if (gesperrt) return;
    setZeilen((prev) => [
      ...prev,
      { id: neueId(), bezeichnung: "", menge: "1", einheit: "Stk", einzelpreis: "0", mwst_satz: kleinunternehmer ? "0" : "19" },
    ]);
    markDirty();
  }
  function zeileAendern(zid: string, feld: keyof Zeile, wert: string) {
    setZeilen((prev) => prev.map((z) => (z.id === zid ? { ...z, [feld]: wert } : z)));
    markDirty();
  }
  function zeileLoeschen(zid: string) {
    if (gesperrt) return;
    setZeilen((prev) => prev.filter((z) => z.id !== zid));
    markDirty();
  }

  // Nettobetrag einer Zeile — EINE Rundungsstelle fuer Anzeige, Speicherung und PDF.
  function zeileNetto(z: Zeile): number {
    return cent(parseZahl(z.menge) * parseZahl(z.einzelpreis));
  }

  // Summen nach § 14 Abs. 4 Nr. 7 + 8 UStG:
  // je Zeile runden -> nach Steuersatz gruppieren -> Steuer auf die Gruppensumme.
  const summen = useMemo(() => {
    const posten: SteuerPosten[] = zeilen.map((z) => ({
      netto: zeileNetto(z),
      satz: kleinunternehmer ? 0 : parseZahl(z.mwst_satz),
    }));
    const s = steuerGruppen(posten);
    if (kleinunternehmer) {
      return { netto: s.netto, mwst: 0, brutto: s.netto, gruppen: [] as typeof s.gruppen };
    }
    return { netto: s.netto, mwst: s.steuer, brutto: s.brutto, gruppen: s.gruppen };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zeilen, kleinunternehmer]);

  // ---------- Speichern ----------
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

      // Fälligkeit automatisch aus Rechnungsdatum + Zahlungsziel, falls Ziel gesetzt
      let faellig = faelligkeitsdatum || null;
      const ziel = parseInt(zahlungszielTage, 10);
      if (rechnungsdatum && !isNaN(ziel)) {
        const f = new Date(rechnungsdatum);
        f.setDate(f.getDate() + ziel);
        faellig = f.toISOString().slice(0, 10);
      }

      // 1) Positionen ZUERST — der Kopf darf keine Summe tragen, deren
      //    Positionen nicht in der Datenbank stehen.
      const aktuelleIds = zeilen.map((z) => z.id).filter((zid) => !zid.startsWith("neu-"));
      const zuLoeschen = geladeneIds.filter((gid) => !aktuelleIds.includes(gid));
      if (zuLoeschen.length > 0) {
        const { error: delErr } = await supabase.from("rechnung_positionen").delete().in("id", zuLoeschen);
        if (delErr) {
          setFehler("Positionen löschen fehlgeschlagen: " + delErr.message);
          setSpeichern(false);
          return;
        }
      }

      const posFehler: string[] = [];
      let pos = 1;
      for (const z of zeilen) {
        const datensatz: any = {
          owner_user_id: user.id,
          rechnung_id: id,
          position: pos,
          bezeichnung: z.bezeichnung || null,
          menge: parseZahl(z.menge),
          einheit: z.einheit || "Stk",
          einzelpreis: parseZahl(z.einzelpreis),
          mwst_satz: kleinunternehmer ? 0 : parseZahl(z.mwst_satz),
          gesamt_netto: zeileNetto(z),
        };
        const bez = z.bezeichnung?.trim() || `Position ${pos}`;

        if (z.id.startsWith("neu-")) {
          const { error } = await supabase.from("rechnung_positionen").insert(datensatz);
          if (error) posFehler.push(`${bez}: ${error.message}`);
        } else {
          // .select() zurueckfordern: ein Treffer von null Zeilen liefert KEINEN
          // Fehler. Ohne diese Pruefung verschwaende ein Datensatz lautlos.
          const { data: getroffen, error } = await supabase
            .from("rechnung_positionen")
            .update(datensatz)
            .eq("id", z.id)
            .select("id");
          if (error) posFehler.push(`${bez}: ${error.message}`);
          else if (!getroffen || getroffen.length === 0) posFehler.push(`${bez}: nicht gefunden, nicht gespeichert`);
        }
        pos++;
      }

      if (posFehler.length > 0) {
        setFehler("Positionen konnten nicht vollständig gespeichert werden — der Rechnungskopf wurde NICHT verändert. " + posFehler.join(" · "));
        setSpeichern(false);
        await laden();
        return;
      }

      // 2) Kopf aktualisieren — erst jetzt, wenn die Positionen sicher stehen.
      const { error: rErr } = await supabase
        .from("rechnungen")
        .update({
          // zahlungsstatus, bezahlt_am, bezahlter_betrag werden NICHT hier gesetzt –
          // sie werden automatisch aus der Tabelle "zahlungen" berechnet (Block C).
          titel: titel || null,
          rechnungsdatum: rechnungsdatum || null,
          leistungsdatum: leistungsdatum || null,
          faelligkeitsdatum: faellig,
          zahlungsziel_tage: isNaN(ziel) ? 14 : ziel,
          waehrung,
          kleinunternehmer,
          notizen: notizen || null,
          netto_summe: summen.netto,
          mwst_summe: summen.mwst,
          brutto_summe: summen.brutto,
        })
        .eq("id", id);

      if (rErr) {
        setFehler("Speichern fehlgeschlagen: " + rErr.message);
        setSpeichern(false);
        return;
      }

      // Zahlungsstatus/Bezahlt aus den Zahlungen neu berechnen (Brutto kann sich geändert haben)
      await supabase.rpc("rechnung_zahlbetrag_neu_berechnen", { p_rechnung_id: id });

      setGespeichert(true);
      setDirty(false);
      await laden();
    } catch (e: any) {
      setFehler("Fehler: " + (e?.message || "unbekannt"));
    }
    setSpeichern(false);
  }

  // ---------- PDF erzeugen (§14-konform, Gotenberg) ----------
  async function pdfErstellen() {
    if (pdfLaedt) return;
    if (dirty) {
      const weiter = window.confirm(
        "Es gibt ungespeicherte Änderungen. Für ein korrektes PDF sollten die Daten erst gespeichert werden. Trotzdem fortfahren?"
      );
      if (!weiter) return;
    }
    setPdfLaedt(true);
    setFehler(null);
    try {
      // Positionen im Format der Route (mit gesamt_netto)
      const posDaten = zeilen.map((z) => ({
        bezeichnung: z.bezeichnung,
        menge: parseZahl(z.menge),
        einheit: z.einheit,
        einzelpreis: parseZahl(z.einzelpreis),
        mwst_satz: kleinunternehmer ? 0 : parseZahl(z.mwst_satz),
        gesamt_netto: zeileNetto(z),
      }));

      const rechnungDaten = {
        rechnungsnummer: rechnung?.rechnungsnummer || "",
        titel: titel,
        rechnungsdatum,
        leistungsdatum,
        faelligkeitsdatum,
        waehrung,
        kleinunternehmer,
        netto_summe: summen.netto,
        mwst_summe: summen.mwst,
        brutto_summe: summen.brutto,
        notizen,
      };

      // Absenderdaten (§14) aus dem Firmenprofil (profiles). Anschrift = Straße + PLZ Ort.
      const p = firmenprofil || {};
      const anschriftTeile = [
        p.firma_strasse,
        [p.firma_plz, p.firma_ort].filter(Boolean).join(" "),
      ].filter((s: any) => s && String(s).trim());
      const aussteller = {
        name: p.firma_name || "",
        anschrift: anschriftTeile.join("\n"),
        steuernummer: p.firma_steuernummer || "",
        ust_idnr: p.firma_ust_id || "",
        telefon: p.firma_telefon || "",
        email: p.firma_email || "",
        bank_iban: p.firma_iban || "",
        bank_bic: p.firma_bic || "",
        bank_name: p.firma_bank || "",
      };

      const res = await fetch("/api/rechnung-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rechnung: rechnungDaten,
          positionen: posDaten,
          kontaktName: kontakt ? kontaktName(kontakt) : (rechnung?.empfaenger_name || ""),
          firmaName: firma ? firmaName(firma) : "",
          aussteller,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFehler(d?.error || "PDF konnte nicht erstellt werden.");
        setPdfLaedt(false);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Rechnung_" + (rechnung?.rechnungsnummer || "Dokument") + ".pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setFehler("PDF-Fehler: " + (e?.message || "unbekannt"));
    }
    setPdfLaedt(false);
  }

  // ---------- Zahlung erfassen (Block C) ----------
  async function zahlungHinzufuegen() {
    if (zBusy) return;
    const betragNum = parseZahl(zBetrag);
    if (betragNum <= 0) {
      setFehler("Bitte einen Betrag größer als 0 eingeben.");
      return;
    }
    if (!zDatum) {
      setFehler("Bitte ein Zahlungsdatum wählen.");
      return;
    }
    setZBusy(true);
    setFehler(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setFehler("Nicht eingeloggt.");
        setZBusy(false);
        return;
      }
      const { error } = await supabase.from("zahlungen").insert({
        owner_user_id: user.id,
        rechnung_id: id,
        betrag: betragNum,
        zahlungsdatum: zDatum,
        zahlungsart: zArt,
        referenz: zReferenz || null,
      });
      if (error) {
        setFehler("Zahlung speichern fehlgeschlagen: " + error.message);
        setZBusy(false);
        return;
      }
      // Eingabefelder zurücksetzen
      setZBetrag("");
      setZReferenz("");
      setZArt("Überweisung");
      setZDatum(new Date().toISOString().slice(0, 10));
      // Trigger hat die Rechnung bereits aktualisiert – frisch laden
      await laden();
    } catch (e: any) {
      setFehler("Fehler: " + (e?.message || "unbekannt"));
    }
    setZBusy(false);
  }

  async function zahlungLoeschen(zid: string) {
    if (!window.confirm("Diese Zahlung wirklich löschen? Der Rechnungsstatus wird neu berechnet.")) return;
    setFehler(null);
    const { error } = await supabase.from("zahlungen").delete().eq("id", zid);
    if (error) {
      setFehler("Löschen fehlgeschlagen: " + error.message);
      return;
    }
    await laden();
  }

  // ---------- Stornieren / Reaktivieren (manueller Status) ----------
  async function stornoUmschalten(neu: "storniert" | "offen") {
    setFehler(null);
    const { error } = await supabase
      .from("rechnungen")
      .update({ zahlungsstatus: neu, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setFehler("Status ändern fehlgeschlagen: " + error.message);
      return;
    }
    // Nach Reaktivierung den korrekten Status aus den Zahlungen ableiten
    if (neu === "offen") {
      await supabase.rpc("rechnung_zahlbetrag_neu_berechnen", { p_rechnung_id: id });
    }
    await laden();
  }

  const empfaengerName = useMemo(() => {
    if (kontakt) return kontaktName(kontakt);
    if (firma) return firmaName(firma);
    if (rechnung?.empfaenger_name) return rechnung.empfaenger_name as string;
    return titel || "—";
  }, [kontakt, firma, titel, rechnung]);

  const zahlungInfo = useMemo(() => {
    const brutto = Number(rechnung?.brutto_summe) || 0;
    const bezahlt = Number(rechnung?.bezahlter_betrag) || 0;
    return { brutto, bezahlt, offen: r2(brutto - bezahlt) };
  }, [rechnung]);

  const faelligInfo = useMemo(() => {
    if (status === "bezahlt" || status === "storniert") return null;
    const t = tageBisFaellig(faelligkeitsdatum);
    if (t === null) return null;
    if (t < 0) return { text: Math.abs(t) + " Tage überfällig", farbe: C.danger };
    if (t === 0) return { text: "heute fällig", farbe: C.warn };
    if (t <= 5) return { text: "in " + t + " Tagen fällig", farbe: C.warn };
    return { text: "in " + t + " Tagen fällig", farbe: C.green };
  }, [faelligkeitsdatum, status]);

  if (loading) {
    return (
      <Rahmen>
        <div style={{ color: C.textDim, padding: "60px 0", textAlign: "center" }}>
          ARGONAUT lädt die Rechnung…
        </div>
      </Rahmen>
    );
  }

  if (nichtGefunden) {
    return (
      <Rahmen>
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
          <h2 style={{ fontFamily: "'Syne', sans-serif", marginBottom: 10 }}>Rechnung nicht gefunden</h2>
          <p style={{ color: C.textDim, marginBottom: 24 }}>
            Diese Rechnung existiert nicht oder gehört nicht zu deinem Konto.
          </p>
          <button onClick={() => router.push("/dashboard/rechnungen")} style={btnGold}>
            Zurück zur Übersicht
          </button>
        </div>
      </Rahmen>
    );
  }

  const stCfg = STATUS[status] || STATUS.offen;

  // Anzeige der dritten Kachel: offener Rest ODER Guthaben (bei Überzahlung)
  const restIstGuthaben = zahlungInfo.offen < 0;
  const restLabel = restIstGuthaben ? "Guthaben" : "Offener Rest";
  const restWert = geld(Math.abs(zahlungInfo.offen), waehrung);
  const restFarbe = restIstGuthaben ? C.cyan : zahlungInfo.offen > 0 ? C.warn : C.green;

  return (
    <Rahmen>
      {/* KOPFZEILE */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <button
            onClick={() => router.push("/dashboard/rechnungen")}
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
            ← Zurück zu Rechnungen
          </button>
          <h1
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 28,
              fontWeight: 800,
              margin: 0,
              letterSpacing: "-0.5px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: C.gold }}>{rechnung?.rechnungsnummer || "Rechnung"}</span>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                fontWeight: 700,
                background: `${stCfg.farbe}22`,
                color: stCfg.farbe,
                border: `1px solid ${stCfg.farbe}55`,
                borderRadius: 999,
                padding: "4px 12px",
              }}
            >
              {stCfg.icon} {stCfg.label}
            </span>
          </h1>
          <p style={{ color: C.textDim, fontSize: 14, margin: "8px 0 0" }}>
            {empfaengerName}
            {rechnung?.auftrag_id && (
              <>
                {" · "}
                <button
                  onClick={() => router.push("/dashboard/auftraege/" + rechnung.auftrag_id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: C.cyan,
                    cursor: "pointer",
                    fontSize: 14,
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  zum Auftrag
                </button>
              </>
            )}
          </p>
          {faelligInfo && (
            <p style={{ color: faelligInfo.farbe, fontSize: 13, fontWeight: 600, margin: "6px 0 0" }}>
              ⏱ {faelligInfo.text}
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={pdfErstellen}
            disabled={pdfLaedt}
            style={{
              background: "transparent",
              color: C.gold,
              border: `1px solid ${C.gold}77`,
              borderRadius: 10,
              padding: "11px 18px",
              fontSize: 14,
              fontWeight: 700,
              cursor: pdfLaedt ? "wait" : "pointer",
              fontFamily: "'DM Sans', sans-serif",
              opacity: pdfLaedt ? 0.6 : 1,
            }}
          >
            {pdfLaedt ? "ARGONAUT erstellt das PDF…" : "📄 Rechnung als PDF"}
          </button>
          <button
            onClick={speichernJetzt}
            disabled={speichern || !dirty}
            style={{
              ...btnGold,
              opacity: speichern || !dirty ? 0.55 : 1,
              cursor: speichern || !dirty ? "default" : "pointer",
            }}
          >
            {speichern ? "Speichert…" : gespeichert ? "✓ Gespeichert" : "💾 Speichern"}
          </button>
        </div>
      </div>

      {/* ZAHLUNGSSTATUS (automatisch aus erfassten Zahlungen) */}
      <div style={{ marginBottom: 20 }}>
        <Karte titel="Zahlungsstatus">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                background: `${stCfg.farbe}22`,
                color: stCfg.farbe,
                border: `1px solid ${stCfg.farbe}55`,
                borderRadius: 999,
                padding: "6px 14px",
              }}
            >
              {stCfg.icon} {stCfg.label}
            </span>
            <span style={{ color: C.textDim, fontSize: 12.5 }}>
              wird automatisch aus den erfassten Zahlungen berechnet
            </span>
            <div style={{ flex: 1 }} />
            {status !== "storniert" ? (
              <button onClick={() => stornoUmschalten("storniert")} style={stornoBtn}>
                Stornieren
              </button>
            ) : (
              <button onClick={() => stornoUmschalten("offen")} style={reaktivierBtn}>
                Reaktivieren
              </button>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
            <SummeFeld label="Rechnungsbetrag" wert={geld(zahlungInfo.brutto, waehrung)} farbe={C.gold} />
            <SummeFeld label="Bereits bezahlt" wert={geld(zahlungInfo.bezahlt, waehrung)} farbe={C.green} />
            <SummeFeld label={restLabel} wert={restWert} farbe={restFarbe} />
          </div>
        </Karte>
      </div>

      {/* ZAHLUNGEN ERFASSEN (Block C) */}
      <div style={{ marginBottom: 20 }}>
        <Karte titel="Zahlungen">
          {/* Liste vorhandener Zahlungen */}
          {zahlungen.length === 0 ? (
            <p style={{ color: C.textDim, fontSize: 14, margin: "0 0 16px" }}>
              Noch keine Zahlung erfasst.
            </p>
          ) : (
            <div style={{ marginBottom: 18, overflowX: "auto" }}>
              {zahlungen.map((z) => (
                <div
                  key={z.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "110px 130px 1fr 120px 36px",
                    gap: 10,
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom: `1px solid ${C.border}`,
                    fontSize: 13.5,
                    minWidth: 520,
                  }}
                >
                  <div style={{ color: C.textDim }}>{datumDe(z.zahlungsdatum)}</div>
                  <div>{z.zahlungsart}</div>
                  <div
                    style={{
                      color: C.textDim,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {z.referenz || "—"}
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 700, color: C.green }}>
                    {geld(z.betrag, waehrung)}
                  </div>
                  <button
                    onClick={() => zahlungLoeschen(z.id)}
                    title="Zahlung löschen"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: C.textDim,
                      cursor: "pointer",
                      fontSize: 15,
                    }}
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Neue Zahlung erfassen */}
          <div style={{ background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
            <div style={{ ...sektionLabel, marginBottom: 12 }}>Neue Zahlung erfassen</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <div>
                <label style={labelStyle}>Betrag ({waehrung})</label>
                <input
                  value={zBetrag}
                  onChange={(e) => setZBetrag(e.target.value)}
                  inputMode="decimal"
                  placeholder={ladeStr(zahlungInfo.offen > 0 ? zahlungInfo.offen : 0)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Zahlungsdatum</label>
                <input type="date" value={zDatum} onChange={(e) => setZDatum(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Zahlungsart</label>
                <select value={zArt} onChange={(e) => setZArt(e.target.value)} style={inputStyle}>
                  {ZAHLUNGSARTEN.map((a) => (
                    <option key={a} value={a} style={{ background: C.navy2 }}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Referenz (optional)</label>
                <input
                  value={zReferenz}
                  onChange={(e) => setZReferenz(e.target.value)}
                  placeholder="z. B. Verwendungszweck"
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button
                onClick={zahlungHinzufuegen}
                disabled={zBusy}
                style={{ ...btnGold, opacity: zBusy ? 0.6 : 1, cursor: zBusy ? "wait" : "pointer" }}
              >
                {zBusy ? "Speichert…" : "＋ Zahlung buchen"}
              </button>
            </div>
            {zahlungInfo.offen > 0 && (
              <p style={{ color: C.textDim, fontSize: 12, margin: "10px 2px 0" }}>
                Tipp: Für die vollständige Bezahlung {geld(zahlungInfo.offen, waehrung)} eintragen.
              </p>
            )}
          </div>
        </Karte>
      </div>

      {/* DATEN */}
      <div style={{ marginBottom: 20 }}>
        <Karte titel="Rechnungsdaten">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            <div>
              <label style={labelStyle}>Titel / Betreff</label>
              <input value={titel} onChange={(e) => aendern(setTitel, e.target.value)} placeholder="z. B. Leistungen Mai" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Rechnungsdatum</label>
              <input type="date" value={rechnungsdatum} onChange={(e) => aendern(setRechnungsdatum, e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Leistungsdatum</label>
              <input type="date" value={leistungsdatum} onChange={(e) => aendern(setLeistungsdatum, e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Zahlungsziel (Tage)</label>
              <input value={zahlungszielTage} onChange={(e) => aendern(setZahlungszielTage, e.target.value)} inputMode="numeric" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Fälligkeit</label>
              <div style={{ ...inputStyle, display: "flex", alignItems: "center", color: C.textDim }}>
                {datumDe(faelligkeitsdatum) || "wird berechnet"}
              </div>
            </div>
          </div>

          {/* Kleinunternehmer-Umschalter */}
          <div
            style={{
              marginTop: 18,
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: C.navy,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "12px 16px",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1 }}>
              <input
                type="checkbox"
                checked={kleinunternehmer}
                onChange={(e) => aendern(setKleinunternehmer, e.target.checked)}
                style={{ width: 18, height: 18, accentColor: C.gold, cursor: "pointer" }}
              />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Kleinunternehmer nach §19 UStG</span>
            </label>
          </div>
          {kleinunternehmer && (
            <p style={{ color: C.textDim, fontSize: 12.5, margin: "10px 2px 0", lineHeight: 1.5 }}>
              Auf der Rechnung wird keine Umsatzsteuer ausgewiesen. Es erscheint der Hinweis:
              „Gemäß §19 UStG wird keine Umsatzsteuer berechnet."
            </p>
          )}
        </Karte>
      </div>

      {/* POSITIONEN */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            background: C.navy2,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: "20px 22px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div style={sektionLabel}>Positionen</div>
            {!gesperrt && (
              <button onClick={zeileHinzufuegen} style={btnKlein}>
                + Position
              </button>
            )}
          </div>

          {gesperrt && (
            <p style={{ color: C.warn, fontSize: 12.5, margin: "0 0 14px" }}>
              {status === "bezahlt"
                ? "Diese Rechnung ist als bezahlt markiert und schreibgeschützt. Für Änderungen bitte stornieren und neu erstellen."
                : "Stornierte Rechnung – schreibgeschützt. Zum Bearbeiten reaktivieren."}
            </p>
          )}

          {zeilen.length === 0 ? (
            <p style={{ color: C.textDim, fontSize: 14, padding: "16px 0" }}>
              Noch keine Positionen. {!gesperrt && "Füge oben eine hinzu."}
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <div style={posKopf}>
                <div>Bezeichnung</div>
                <div>Menge</div>
                <div>Einheit</div>
                <div style={{ textAlign: "right" }}>Einzelpreis</div>
                <div style={{ textAlign: "right" }}>MwSt %</div>
                <div style={{ textAlign: "right" }}>Netto</div>
                <div />
              </div>
              {zeilen.map((z) => (
                <div key={z.id} style={posZeile}>
                  <input value={z.bezeichnung} disabled={gesperrt} onChange={(e) => zeileAendern(z.id, "bezeichnung", e.target.value)} placeholder="Leistung / Artikel" style={zellInput} />
                  <input value={z.menge} disabled={gesperrt} onChange={(e) => zeileAendern(z.id, "menge", e.target.value)} inputMode="decimal" style={{ ...zellInput, textAlign: "right" }} />
                  <select value={z.einheit} disabled={gesperrt} onChange={(e) => zeileAendern(z.id, "einheit", e.target.value)} style={zellInput}>
                    {EINHEITEN.map((e) => (
                      <option key={e} value={e} style={{ background: C.navy2 }}>{e}</option>
                    ))}
                  </select>
                  <input value={z.einzelpreis} disabled={gesperrt} onChange={(e) => zeileAendern(z.id, "einzelpreis", e.target.value)} inputMode="decimal" style={{ ...zellInput, textAlign: "right" }} />
                  <input value={kleinunternehmer ? "0" : z.mwst_satz} disabled={gesperrt || kleinunternehmer} onChange={(e) => zeileAendern(z.id, "mwst_satz", e.target.value)} inputMode="decimal" style={{ ...zellInput, textAlign: "right", opacity: kleinunternehmer ? 0.5 : 1 }} />
                  <div style={{ textAlign: "right", fontSize: 14, fontWeight: 600, alignSelf: "center", color: C.cyan }}>
                    {geld(zeileNetto(z), waehrung)}
                  </div>
                  {!gesperrt ? (
                    <button onClick={() => zeileLoeschen(z.id)} title="Position löschen" style={{ background: "transparent", border: "none", color: C.textDim, cursor: "pointer", fontSize: 15, alignSelf: "center" }}>
                      🗑
                    </button>
                  ) : (
                    <div />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SUMMEN */}
      <Karte titel="Summen">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <SummeFeld label="Netto" wert={geld(summen.netto, waehrung)} farbe={C.cyan} />
          <SummeFeld label={kleinunternehmer ? "MwSt (§19: keine)" : "Umsatzsteuer"} wert={geld(summen.mwst, waehrung)} farbe={C.textDim} />
          <SummeFeld label="Brutto" wert={geld(summen.brutto, waehrung)} farbe={C.gold} />
        </div>

        {/* Aufschluesselung nach Steuersaetzen — genau diese Aufstellung erscheint im PDF */}
        {!kleinunternehmer && summen.gruppen.length > 0 && (
          <div
            style={{
              marginTop: 16,
              background: C.navy,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "14px 16px",
            }}
          >
            <div style={{ ...sektionLabel, marginBottom: 10 }}>Umsatzsteuer nach Steuersätzen</div>
            {summen.gruppen.map((g) => (
              <div
                key={g.satz}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  padding: "6px 0",
                  fontSize: 13.5,
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <span style={{ color: C.textDim }}>
                  <strong style={{ color: "#fff", fontWeight: 600 }}>{satzText(g.satz)} %</strong> auf {geld(g.netto, waehrung)}
                </span>
                <span style={{ fontWeight: 700, color: C.cyan }}>{geld(g.steuer, waehrung)}</span>
              </div>
            ))}
            <p style={{ color: C.textDim, fontSize: 11.5, margin: "12px 2px 0", lineHeight: 1.55 }}>
              Die Steuer wird je Steuersatz auf die Gruppensumme gerechnet — so verlangt es § 14 Abs. 4 Nr. 7 und 8 UStG.
              {summen.gruppen.length > 1 && " Diese Aufstellung erscheint unverändert auf dem Rechnungs-PDF."}
            </p>
          </div>
        )}

        <p style={{ color: C.textDim, fontSize: 12, marginTop: 14 }}>
          Summen rechnen live aus den Positionen. Mit „💾 Speichern" werden sie festgeschrieben.
        </p>
      </Karte>

      {/* NOTIZEN */}
      <div style={{ marginTop: 20 }}>
        <Karte titel="Notizen">
          <textarea
            value={notizen}
            onChange={(e) => aendern(setNotizen, e.target.value)}
            placeholder="Interne Notizen zur Rechnung…"
            rows={4}
            style={{ ...inputStyle, resize: "vertical", minHeight: 100, lineHeight: 1.5 }}
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
  margin: "0 0 6px",
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
