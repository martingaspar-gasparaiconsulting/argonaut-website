"use client";

// ============================================================================
// app/dashboard/_components/AbschlagsKarten.tsx
//
// PUNKT 54 / R5 — PAKET 3: die Oberflaeche fuer Abschlags- und
// Schlussrechnung (21.09.2026)
//
// ▄▄▄ WARUM EINE EIGENE DATEI ▄▄▄
// app/dashboard/rechnungen/[id]/page.tsx ist ein KERN-GELD-FORMULAR mit
// 1.400 Zeilen. Je weniger davon angefasst wird, desto kleiner die Gefahr.
// Die gesamte neue Oberflaeche liegt deshalb hier; die Seite bekommt nur
// einen Zustand, drei Bausteine und zwei Zeilen im Speichern-Zweig dazu.
//
// ▄▄▄ WAS SICH AUF EINER NORMALEN RECHNUNG AENDERT ▄▄▄
// Nichts an den Zahlen. Das `summen`-useMemo der Seite (Z.318-330) bleibt
// Zeichen fuer Zeichen unveraendert — dasselbe Vorgehen wie bei Punkt 62.
// Sichtbar sind zwei neue Karten; solange "Normale Rechnung" steht und die
// Felder leer sind, rechnet nichts anders als vorher.
//
// ▄▄▄ DIE DREI SCHUTZGELAENDER ▄▄▄
//  1. `gesperrt` (bezahlt oder storniert) sperrt auch die neuen Felder.
//     Sonst koennte aus einer bezahlten Rechnung nachtraeglich eine
//     Abschlagsrechnung werden — und die Absetzung in einer laengst
//     geschriebenen Schlussrechnung stimmte nicht mehr.
//  2. Traegt die Rechnung eine Nummer aus dem Abschlagskreis, laesst sich
//     die Rechnungsart nicht mehr frei wechseln. Sonst truege eine
//     "normale" Rechnung eine AR-Nummer.
//  3. Ohne verknuepften Auftrag gibt es keine Abschlagsliste, sondern
//     einen Klartext-Hinweis. Eine leere Liste saehe aus wie "es gibt
//     keine Abschlaege" — und genau das ist der § 14c-Fall.
// ============================================================================

import React, { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { satzText } from "./steuerLogik";
import {
  baueSchlussrechnung,
  rechneAbschlag,
  pruefeAuswahl,
  type AbschlagPosten,
  type LeistungsZeile,
  type Vertragsart,
  type SkontoBasis,
  satzAusBetraegen,
} from "@/lib/abschlagsrechnung";
import { pruefeUstIdNr } from "@/lib/ustIdNr";
import { leseZahl, zahlText } from '@/lib/zahlen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Dieselben Farben wie die Rechnungsseite.
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

export type Rechnungsart = "normal" | "abschlag" | "schluss";

/** Alles, was Punkt 54 an einer Rechnung zusaetzlich speichert. */
export type RechnungsZusatz = {
  rechnungsart: Rechnungsart;
  vertragsart: Vertragsart;
  /** Vereinbarte Gesamtverguetung netto, nur fuer den 90-%-Deckel. */
  gesamtNetto: string;
  skontoProzent: string;
  skontoTage: string;
  /** Leer heisst: nicht festgelegt. Wird dann benannt, nicht geraten. */
  skontoBasis: "" | SkontoBasis;
  einbehaltProzent: string;
  einbehaltBasis: "brutto" | "netto";
  einbehaltBis: string;
  reverseCharge: boolean;
  ustIdKunde: string;
};

export const ZUSATZ_LEER: RechnungsZusatz = {
  rechnungsart: "normal",
  vertragsart: "offen",
  gesamtNetto: "",
  skontoProzent: "",
  skontoTage: "",
  skontoBasis: "",
  einbehaltProzent: "",
  einbehaltBasis: "brutto",
  einbehaltBis: "",
  reverseCharge: false,
  ustIdKunde: "",
};

/** Liest die neuen Spalten aus der rechnungen-Zeile. Fehlt eine, bleibt sie leer. */
export function zusatzAusZeile(r: any): RechnungsZusatz {
  const art = String(r?.rechnungsart ?? "normal");
  const vert = String(r?.vertragsart ?? "offen");
  return {
    rechnungsart: (art === "abschlag" || art === "schluss" ? art : "normal") as Rechnungsart,
    vertragsart: (vert === "verbraucher" || vert === "unternehmer" ? vert : "offen") as Vertragsart,
    gesamtNetto: r?.gesamt_netto_vereinbart != null ? String(r.gesamt_netto_vereinbart) : "",
    skontoProzent: r?.skonto_prozent != null ? String(r.skonto_prozent) : "",
    skontoTage: r?.skonto_tage != null ? String(r.skonto_tage) : "",
    skontoBasis: (r?.skonto_basis === "gesamtleistung" || r?.skonto_basis === "restbetrag")
      ? r.skonto_basis : "",
    einbehaltProzent: r?.einbehalt_prozent != null ? String(r.einbehalt_prozent) : "",
    einbehaltBasis: r?.einbehalt_basis === "netto" ? "netto" : "brutto",
    einbehaltBis: r?.einbehalt_bis || "",
    reverseCharge: !!r?.reverse_charge,
    ustIdKunde: r?.ust_id_kunde || "",
  };
}

function zahlOderNull(s: string): number | null { return leseZahl(s); }

/** Was in den UPDATE der Seite wandert. */
export function zusatzFuerSpeichern(z: RechnungsZusatz): Record<string, unknown> {
  return {
    rechnungsart: z.rechnungsart,
    vertragsart: z.vertragsart,
    gesamt_netto_vereinbart: zahlOderNull(z.gesamtNetto),
    skonto_prozent: zahlOderNull(z.skontoProzent),
    skonto_tage: zahlOderNull(z.skontoTage),
    skonto_basis: z.skontoBasis === "" ? null : z.skontoBasis,
    einbehalt_prozent: zahlOderNull(z.einbehaltProzent),
    einbehalt_basis: z.einbehaltProzent.trim() === "" ? null : z.einbehaltBasis,
    einbehalt_bis: z.einbehaltBis || null,
    reverse_charge: z.reverseCharge,
    ust_id_kunde: z.ustIdKunde.trim() || null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// KLEINE BAUSTEINE
// ───────────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block",
  color: C.textDim,
  fontSize: "clamp(11.5px, 1vw, 16px)",
  fontWeight: 600,
  letterSpacing: 0.3,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: C.navy,
  border: `1px solid ${C.border}`,
  borderRadius: 9,
  padding: "10px 12px",
  color: "#fff",
  fontSize: "clamp(13.5px, 1.19vw, 19px)",
  outline: "none",
};

function Karte({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: C.navy2,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "20px 22px",
        marginBottom: 20,
      }}
    >
      <div
        style={{
          color: C.gold,
          fontSize: "clamp(11.5px, 1vw, 16px)",
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: "uppercase",
          marginBottom: 14,
        }}
      >
        {titel}
      </div>
      {children}
    </div>
  );
}

function Merkzettel({ art, text }: { art: "warn" | "info" | "gefahr"; text: string }) {
  const farbe = art === "gefahr" ? C.danger : art === "warn" ? C.warn : C.textDim;
  return (
    <div
      style={{
        marginTop: 10,
        borderLeft: `3px solid ${farbe}`,
        background: C.navy,
        borderRadius: "0 8px 8px 0",
        padding: "10px 14px",
        color: art === "info" ? C.textDim : "#fff",
        fontSize: "clamp(12.5px, 1.06vw, 17px)",
        lineHeight: 1.55,
      }}
    >
      {text}
    </div>
  );
}

function geld(n: number, waehrung = "EUR"): string {
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: waehrung || "EUR" }).format(n);
  } catch {
    return zahlText(n, 2) + " " + waehrung;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// KARTE 1 — RECHNUNGSART
// ───────────────────────────────────────────────────────────────────────────

const ARTEN: { wert: Rechnungsart; label: string; erklaerung: string }[] = [
  { wert: "normal", label: "Normale Rechnung", erklaerung: "Eine Leistung, eine Rechnung." },
  { wert: "abschlag", label: "Abschlagsrechnung", erklaerung: "Teilbetrag fuer bereits erbrachte Leistung (§ 632a BGB)." },
  { wert: "schluss", label: "Schlussrechnung", erklaerung: "Gesamtleistung abzueglich aller Abschlaege (§ 14 Abs. 5 UStG)." },
];

export function RechnungsartKarte({
  zusatz,
  setZusatz,
  gesperrt,
  rechnungsnummer,
  nettoSumme,
  steuersatz,
}: {
  zusatz: RechnungsZusatz;
  setZusatz: (z: RechnungsZusatz) => void;
  gesperrt: boolean;
  rechnungsnummer: string;
  nettoSumme: number;
  steuersatz: number;
}) {
  // Schutzgelaender 2: eine Nummer aus dem Abschlagskreis nagelt die Art fest.
  const ausAbschlagskreis = /^AR[-_]/i.test(String(rechnungsnummer || ""));
  const artGesperrt = gesperrt || (ausAbschlagskreis && zusatz.rechnungsart === "abschlag");

  const abschlag = useMemo(() => {
    if (zusatz.rechnungsart !== "abschlag") return null;
    return rechneAbschlag({
      erbrachtNetto: nettoSumme,
      steuersatz,
      gesamtNetto: zusatz.gesamtNetto,
      vertragsart: zusatz.vertragsart,
      nr: 1,
    });
  }, [zusatz.rechnungsart, zusatz.gesamtNetto, zusatz.vertragsart, nettoSumme, steuersatz]);

  return (
    <Karte titel="Rechnungsart">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
        {ARTEN.map((a) => {
          const aktiv = zusatz.rechnungsart === a.wert;
          return (
            <button
              key={a.wert}
              type="button"
              disabled={artGesperrt && !aktiv}
              onClick={() => setZusatz({ ...zusatz, rechnungsart: a.wert })}
              style={{
                textAlign: "left",
                background: aktiv ? "rgba(201,168,76,0.12)" : C.navy,
                border: `1px solid ${aktiv ? C.gold : C.border}`,
                borderRadius: 10,
                padding: "12px 14px",
                color: "#fff",
                cursor: artGesperrt && !aktiv ? "not-allowed" : "pointer",
                opacity: artGesperrt && !aktiv ? 0.45 : 1,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "clamp(13.5px, 1.19vw, 19px)", marginBottom: 4 }}>
                {aktiv ? "● " : "○ "}
                {a.label}
              </div>
              <div style={{ color: C.textDim, fontSize: "clamp(11.5px, 1vw, 16px)", lineHeight: 1.45 }}>
                {a.erklaerung}
              </div>
            </button>
          );
        })}
      </div>

      {ausAbschlagskreis && zusatz.rechnungsart === "abschlag" && !gesperrt && (
        <Merkzettel
          art="info"
          text={
            "Diese Rechnung traegt mit " + rechnungsnummer + " eine Nummer aus dem Abschlagskreis. " +
            "Die Rechnungsart laesst sich deshalb nicht mehr wechseln — eine nachtraeglich " +
            "geaenderte Rechnungsnummer waere nach GoBD unzulaessig."
          }
        />
      )}

      {zusatz.rechnungsart === "abschlag" && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            <div>
              <label style={labelStyle}>Vertragsart</label>
              <select
                value={zusatz.vertragsart}
                disabled={gesperrt}
                onChange={(e) => setZusatz({ ...zusatz, vertragsart: e.target.value as Vertragsart })}
                style={inputStyle}
              >
                <option value="offen">noch nicht festgelegt</option>
                <option value="verbraucher">Verbraucherbauvertrag</option>
                <option value="unternehmer">Unternehmer / gewerblich</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Vereinbarte Gesamtvergütung (netto)</label>
              <input
                value={zusatz.gesamtNetto}
                disabled={gesperrt}
                onChange={(e) => setZusatz({ ...zusatz, gesamtNetto: e.target.value })}
                placeholder="einschließlich Nachträge"
                inputMode="decimal"
                style={inputStyle}
              />
            </div>
          </div>

          {zusatz.vertragsart === "offen" && (
            <Merkzettel
              art="warn"
              text={
                "Die Vertragsart ist nicht festgelegt. Bei einem Verbraucherbauvertrag dürfen alle " +
                "Abschläge zusammen 90 % der Gesamtvergütung nicht übersteigen (§ 650m Abs. 1 BGB). " +
                "Solange das offen ist, wurde diese Grenze NICHT geprüft."
              }
            />
          )}

          {abschlag?.deckel && (
            <div
              style={{
                marginTop: 12,
                background: C.navy,
                border: `1px solid ${abschlag.deckel.ueberschritten ? C.danger : C.border}`,
                borderRadius: 10,
                padding: "14px 16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ color: C.textDim }}>Gesamtvergütung (brutto)</span>
                <span style={{ fontWeight: 700 }}>{geld(abschlag.deckel.gesamtverguetung)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ color: C.textDim }}>Höchstbetrag aller Abschläge (90 %)</span>
                <span style={{ fontWeight: 700 }}>{geld(abschlag.deckel.hoechstbetrag)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ color: C.textDim }}>mit dieser Rechnung erreicht</span>
                <span style={{ fontWeight: 700, color: abschlag.deckel.ueberschritten ? C.danger : C.green }}>
                  {geld(abschlag.deckel.bereits)}
                </span>
              </div>
            </div>
          )}

          {abschlag?.hinweise
            .filter((h) => h.feld === "deckel" || h.feld === "sicherheit")
            .map((h, i) => (
              <Merkzettel key={i} art={h.feld === "deckel" ? "gefahr" : "warn"} text={h.text} />
            ))}

          <Merkzettel
            art="info"
            text={
              "Nach § 632a Abs. 1 Satz 2 BGB ist die erbrachte Leistung durch eine Aufstellung " +
              "nachzuweisen, die eine rasche und sichere Beurteilung ermöglicht. Eine einzelne " +
              "Zeile „Abschlagszahlung“ genügt dem nicht — nutzen Sie die Positionen."
            }
          />
        </div>
      )}
    </Karte>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// KARTE 2 — ZAHLUNGSBEDINGUNGEN
// ───────────────────────────────────────────────────────────────────────────

export function ZahlungsbedingungenKarte({
  zusatz,
  setZusatz,
  gesperrt,
}: {
  zusatz: RechnungsZusatz;
  setZusatz: (z: RechnungsZusatz) => void;
  gesperrt: boolean;
}) {
  const ustId = useMemo(
    () => (zusatz.ustIdKunde.trim() === "" ? null : pruefeUstIdNr(zusatz.ustIdKunde)),
    [zusatz.ustIdKunde],
  );

  return (
    <Karte titel="Zahlungsbedingungen">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
        <div>
          <label style={labelStyle}>Skonto (%)</label>
          <input
            value={zusatz.skontoProzent}
            disabled={gesperrt}
            onChange={(e) => setZusatz({ ...zusatz, skontoProzent: e.target.value })}
            placeholder="z. B. 2"
            inputMode="decimal"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Skontofrist (Tage)</label>
          <input
            value={zusatz.skontoTage}
            disabled={gesperrt}
            onChange={(e) => setZusatz({ ...zusatz, skontoTage: e.target.value })}
            placeholder="z. B. 14"
            inputMode="numeric"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Skonto rechnet von</label>
          <select
            value={zusatz.skontoBasis}
            disabled={gesperrt}
            onChange={(e) => setZusatz({ ...zusatz, skontoBasis: e.target.value as "" | SkontoBasis })}
            style={inputStyle}
          >
            <option value="">noch nicht festgelegt</option>
            <option value="restbetrag">Restbetrag dieser Rechnung</option>
            <option value="gesamtleistung">gesamte Leistung</option>
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginTop: 14 }}>
        <div>
          <label style={labelStyle}>Sicherheitseinbehalt (%)</label>
          <input
            value={zusatz.einbehaltProzent}
            disabled={gesperrt}
            onChange={(e) => setZusatz({ ...zusatz, einbehaltProzent: e.target.value })}
            placeholder="z. B. 5"
            inputMode="decimal"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Einbehalt rechnet von</label>
          <select
            value={zusatz.einbehaltBasis}
            disabled={gesperrt}
            onChange={(e) => setZusatz({ ...zusatz, einbehaltBasis: e.target.value as "brutto" | "netto" })}
            style={inputStyle}
          >
            <option value="brutto">Bruttobetrag</option>
            <option value="netto">Nettobetrag</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Einbehalt zurück bis</label>
          <input
            type="date"
            value={zusatz.einbehaltBis}
            disabled={gesperrt}
            onChange={(e) => setZusatz({ ...zusatz, einbehaltBis: e.target.value })}
            style={inputStyle}
          />
        </div>
      </div>

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
            checked={zusatz.reverseCharge}
            disabled={gesperrt}
            onChange={(e) => setZusatz({ ...zusatz, reverseCharge: e.target.checked })}
            style={{ width: 18, height: 18, accentColor: C.gold, cursor: "pointer" }}
          />
          <span style={{ fontSize: "clamp(14px, 1.25vw, 20px)", fontWeight: 600 }}>
            Bauleistung nach § 13b UStG (Steuerschuldnerschaft des Leistungsempfängers)
          </span>
        </label>
      </div>
      {zusatz.reverseCharge && (
        <Merkzettel
          art="warn"
          text={
            "Diese Rechnung wird OHNE Umsatzsteuer geschrieben. Der Pflichthinweis " +
            "„Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG)“ gehört auf das Dokument " +
            "(§ 14a Abs. 5 UStG). Er erscheint erst, wenn Paket 4 gebaut ist."
          }
        />
      )}

      <div style={{ marginTop: 14 }}>
        <label style={labelStyle}>USt-IdNr. des Kunden</label>
        <input
          value={zusatz.ustIdKunde}
          disabled={gesperrt}
          onChange={(e) => setZusatz({ ...zusatz, ustIdKunde: e.target.value })}
          placeholder="z. B. DE123456789"
          style={{
            ...inputStyle,
            borderColor: ustId ? (ustId.formatOk ? C.green : C.danger) : C.border,
          }}
        />
        {ustId && (
          <Merkzettel
            art={ustId.formatOk ? "info" : "gefahr"}
            text={
              ustId.formatOk
                ? (ustId.pruefzifferGerechnet
                    ? "Format und Prüfziffer stimmen. "
                    : "Das Format stimmt; für " + ustId.land + " wird keine Prüfziffer gerechnet. ") +
                  "Das ist NICHT der Nachweis nach § 18e UStG — dafür braucht es die qualifizierte " +
                  "Abfrage beim Bundeszentralamt für Steuern."
                : ustId.klartext
            }
          />
        )}
      </div>
    </Karte>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// KARTE 3 — DIE ABSETZUNG DER ABSCHLAEGE
// ───────────────────────────────────────────────────────────────────────────

export type AbschlagZeile = AbschlagPosten & {
  id: string;
  /** false heisst: aus netto und Steuer ergibt sich kein deutscher Steuersatz. */
  satzEingerastet?: boolean;
};

export function AbsetzungsBlock({
  auftragId,
  eigeneId,
  gesamt,
  waehrung,
  zusatz,
  gesperrt,
  onAuswahl,
}: {
  auftragId: string | null;
  eigeneId: string;
  gesamt: LeistungsZeile[];
  waehrung: string;
  zusatz: RechnungsZusatz;
  gesperrt: boolean;
  onAuswahl: (zeilen: AbschlagZeile[]) => void;
}) {
  const [alle, setAlle] = useState<AbschlagZeile[]>([]);
  const [gewaehlt, setGewaehlt] = useState<Record<string, boolean>>({});
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let abgebrochen = false;
    async function laden() {
      if (!auftragId) { setAlle([]); return; }
      setLaedt(true);
      setFehler(null);
      const { data, error } = await supabase
        .from("rechnungen")
        .select("id, rechnungsnummer, rechnungsdatum, netto_summe, mwst_summe, zahlungsstatus")
        .eq("auftrag_id", auftragId)
        .eq("rechnungsart", "abschlag")
        .neq("id", eigeneId)
        .order("rechnungsdatum", { ascending: true });

      if (abgebrochen) return;
      setLaedt(false);
      if (error) { setFehler(error.message); return; }

      // Der Steuersatz steht NICHT an der Rechnung, nur netto_summe und
      // mwst_summe. Er wird hergeleitet statt auf 19 geraten — sonst landet
      // ein 7-%-Abschlag in der 19-%-Gruppe (Befund 8 aus Punkt 63).
      const zeilen: AbschlagZeile[] = (data || []).map((r: any) => {
        const s = satzAusBetraegen(r.netto_summe, r.mwst_summe);
        return {
          id: String(r.id),
          nummer: r.rechnungsnummer || "",
          datum: r.rechnungsdatum,
          netto: r.netto_summe,
          steuer: r.mwst_summe,
          steuersatz: s.satz,
          satzEingerastet: s.eingerastet,
          storniert: r.zahlungsstatus === "storniert",
        };
      });
      setAlle(zeilen);
      // Vorbelegt sind ALLE nicht stornierten — der vergessene Abschlag ist
      // der teure Fall, nicht der zu viel angehakte.
      const vor: Record<string, boolean> = {};
      for (const z of zeilen) vor[z.id] = !z.storniert;
      setGewaehlt(vor);
    }
    void laden();
    return () => { abgebrochen = true; };
  }, [auftragId, eigeneId]);

  const ausgewaehlt = useMemo(
    () => alle.filter((z) => gewaehlt[z.id]),
    [alle, gewaehlt],
  );

  useEffect(() => { onAuswahl(ausgewaehlt); }, [ausgewaehlt, onAuswahl]);

  const ergebnis = useMemo(
    () =>
      baueSchlussrechnung({
        gesamt,
        abschlaege: ausgewaehlt,
        skontoProzent: zusatz.skontoProzent,
        skontoTage: zusatz.skontoTage,
        skontoBasis: zusatz.skontoBasis === "" ? undefined : zusatz.skontoBasis,
        einbehalt: { prozent: zusatz.einbehaltProzent, basis: zusatz.einbehaltBasis },
        reverseCharge: zusatz.reverseCharge,
      }),
    [gesamt, ausgewaehlt, zusatz],
  );

  const auswahlHinweise = useMemo(
    () => pruefeAuswahl(alle, ausgewaehlt),
    [alle, ausgewaehlt],
  );

  if (zusatz.rechnungsart !== "schluss") return null;

  return (
    <Karte titel="Abschlagszahlungen absetzen">
      {!auftragId && (
        <Merkzettel
          art="gefahr"
          text={
            "Diese Rechnung ist mit keinem Auftrag verknüpft. ARGONAUT kann deshalb NICHT nachsehen, " +
            "ob es Abschlagsrechnungen gibt. Verknüpfen Sie oben einen Auftrag — sonst wird die " +
            "Umsatzsteuer der Abschläge ein zweites Mal ausgewiesen und nach § 14c Abs. 1 UStG " +
            "auch ein zweites Mal geschuldet."
          }
        />
      )}

      {laedt && <p style={{ color: C.textDim }}>ARGONAUT sucht die Abschlagsrechnungen…</p>}
      {fehler && <Merkzettel art="gefahr" text={"Die Abschläge konnten nicht geladen werden: " + fehler} />}

      {auftragId && !laedt && alle.length === 0 && (
        <Merkzettel
          art="warn"
          text={"Zu diesem Auftrag ist keine Abschlagsrechnung gespeichert. Falls doch welche gestellt wurden, tragen Sie sie zuerst als Abschlagsrechnung ein."}
        />
      )}

      {alle.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          {alle.map((z) => (
            <label
              key={z.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: `1px solid ${C.border}`,
                cursor: gesperrt ? "default" : "pointer",
                opacity: z.storniert ? 0.55 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={!!gewaehlt[z.id]}
                disabled={gesperrt}
                onChange={(e) => setGewaehlt({ ...gewaehlt, [z.id]: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: C.gold }}
              />
              <span style={{ flex: 1, fontWeight: 600 }}>
                {z.nummer || "ohne Nummer"}
                {z.storniert && <span style={{ color: C.danger, fontWeight: 400 }}> · storniert</span>}
              </span>
              <span style={{ color: C.textDim, fontSize: "clamp(12.5px, 1.06vw, 17px)" }}>
                {geld(Number(z.netto) || 0, waehrung)} netto
              </span>
              <span style={{ fontWeight: 700, color: C.cyan, minWidth: 110, textAlign: "right" }}>
                {geld(Number(z.steuer) || 0, waehrung)} USt
              </span>
            </label>
          ))}
        </div>
      )}

      {ausgewaehlt
        .filter((z) => z.satzEingerastet === false)
        .map((z) => (
          <Merkzettel
            key={"satz" + z.id}
            art="gefahr"
            text={
              "Bei " + (z.nummer || "einer Abschlagsrechnung") + " ergibt sich aus Entgelt und " +
              "Umsatzsteuer ein Satz von " + String(z.steuersatz) + " %. Einen solchen Steuersatz " +
              "gibt es in Deutschland nicht. Prüfen Sie diese Abschlagsrechnung, bevor Sie sie " +
              "absetzen — sonst stimmt die Absetzung nach § 14 Abs. 5 UStG nicht."
            }
          />
        ))}

      {auswahlHinweise.map((h, i) => (
        <Merkzettel key={i} art={h.feld === "absetzung" ? "gefahr" : "warn"} text={h.text} />
      ))}

      {/* Der Absetzungsblock selbst */}
      <div
        style={{
          marginTop: 16,
          background: C.navy,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: "16px 18px",
        }}
      >
        <Zeile label="Gesamtbetrag der Leistung (netto)" wert={geld(ergebnis.gesamtNetto, waehrung)} />
        {ergebnis.gruppen
          .filter((g) => g.gesamtNetto !== 0 || g.gesamtSteuer !== 0)
          .map((g) => (
            <Zeile
              key={"g" + g.steuersatz}
              label={"zzgl. " + satzText(g.steuersatz) + " % USt auf " + geld(g.gesamtNetto, waehrung)}
              wert={geld(g.gesamtSteuer, waehrung)}
              eingerueckt
            />
          ))}
        <Zeile label="Gesamtbetrag brutto" wert={geld(ergebnis.gesamtBrutto, waehrung)} stark />

        <div style={{ height: 12 }} />

        <Zeile label="abzüglich bereits berechneter Abschlagszahlungen" wert="" />
        {ergebnis.gruppen
          .filter((g) => g.abgesetztNetto !== 0 || g.abgesetztSteuer !== 0)
          .map((g) => (
            <Zeile
              key={"a" + g.steuersatz}
              label={"Entgelt " + geld(g.abgesetztNetto, waehrung) + " zzgl. " + satzText(g.steuersatz) + " % USt"}
              wert={geld(g.abgesetztSteuer, waehrung)}
              eingerueckt
            />
          ))}
        <Zeile label="Summe der Abschläge" wert={"− " + geld(ergebnis.abgesetztBrutto, waehrung)} />

        <div style={{ height: 12 }} />

        <Zeile label="Verbleibender Betrag (netto)" wert={geld(ergebnis.restNetto, waehrung)} />
        <Zeile label="zzgl. Umsatzsteuer" wert={geld(ergebnis.restSteuer, waehrung)} eingerueckt />
        <Zeile label="Verbleibender Betrag brutto" wert={geld(ergebnis.restBrutto, waehrung)} stark />

        {ergebnis.einbehalt > 0 && (
          <Zeile label="abzüglich Sicherheitseinbehalt" wert={"− " + geld(ergebnis.einbehalt, waehrung)} />
        )}
        {ergebnis.skonto > 0 && (
          <Zeile
            label={"bei Zahlung in der Skontofrist abzüglich"}
            wert={"− " + geld(ergebnis.skonto, waehrung)}
          />
        )}
        {(ergebnis.einbehalt > 0 || ergebnis.skonto > 0) && (
          <Zeile label="Zahlbetrag" wert={geld(ergebnis.zahlbetrag, waehrung)} stark />
        )}
      </div>

      {ergebnis.hinweise.map((h, i) => (
        <Merkzettel
          key={i}
          art={h.feld === "ueberzahlung" || h.feld === "reverse" || h.feld === "steuersatz" ? "gefahr"
            : h.feld === "absetzung" ? "info" : "warn"}
          text={h.text}
        />
      ))}

      <Merkzettel
        art="info"
        text={
          "Diese Aufstellung steht heute nur auf dem Bildschirm. Auf das Rechnungs-PDF und in die " +
          "E-Rechnung kommt sie mit Paket 4."
        }
      />
    </Karte>
  );
}

function Zeile({
  label,
  wert,
  stark,
  eingerueckt,
}: {
  label: string;
  wert: string;
  stark?: boolean;
  eingerueckt?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 16,
        padding: stark ? "8px 0" : "4px 0",
        paddingLeft: eingerueckt ? 16 : 0,
        borderTop: stark ? `1px solid ${C.border}` : undefined,
        fontSize: stark ? "clamp(14px, 1.25vw, 20px)" : "clamp(12.5px, 1.13vw, 18px)",
      }}
    >
      <span style={{ color: stark ? "#fff" : C.textDim, fontWeight: stark ? 700 : 400 }}>{label}</span>
      <span style={{ fontWeight: stark ? 800 : 600, color: stark ? C.gold : "#fff", whiteSpace: "nowrap" }}>
        {wert}
      </span>
    </div>
  );
}
