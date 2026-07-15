// ============================================================================
// ARGONAUT OS · Komponente "DateiImport" (Etappe 2, Baustein 2c-2)
// Wiederverwendbare Upload-Fläche: Datei hochladen/hineinziehen -> ruft die
// universelle Lese-Route /api/datei-text -> liefert den reinen Text per
// onText-Callback zurück. Weiß NICHTS vom Ziel (Preise, Kontakte, …) und ist
// damit in jedem Reiter einsetzbar.
// Inline-Styles (kein Tailwind). Branding: ARGONAUT / "die KI" – nie "Claude".
//
// I-1c-2 (Block 1, Kontakt-Import): NEUER OPTIONALER PROP `onDatei`.
//   Ohne ihn verhält sich die Komponente EXAKT wie bisher — Preisliste und
//   Lieferanten bleiben unberührt.
//   Mit ihm bekommt der Aufrufer die ROHE Datei und liest sie selbst.
//
//   Warum? /api/datei-text macht die Datei zu Text und unterstellt dabei eine
//   Kodierung. Eine Lexware-CSV in Windows-1252 käme als "Sch?fer" an. Für
//   Kundenadressen ist das tödlich: die Dublettenerkennung findet dann nichts.
//   Wer die Bytes braucht, bekommt die Bytes.
// ============================================================================
"use client";

import { useRef, useState } from "react";

const GOLD = "#C9A84C";
const CYAN = "#00e5ff";
const GREEN = "#4CAF7D";
const DANGER = "#E06666";

export interface DateiImportMeta {
  dateiname: string;
  typ: string;
  gekuerzt: boolean;
}

export interface DateiImportProps {
  /** Wird aufgerufen, sobald der Text aus der Datei ausgelesen wurde. */
  onText?: (text: string, meta: DateiImportMeta) => void;
  /**
   * Optional: gibt die ROHE Datei durch, ohne sie an /api/datei-text zu schicken.
   * Ist dieser Prop gesetzt, wird `onText` NICHT aufgerufen — der Aufrufer
   * übernimmt das Lesen selbst (z. B. mit eigener Kodierungserkennung).
   */
  onDatei?: (datei: File) => void;
  /** Weiße Schrift + dunkle Fläche für Navy-Hintergründe (Dashboard). */
  dunkel?: boolean;
  /** Akzentfarbe (Rahmen beim Ziehen, Icon). Default Gold. */
  akzent?: string;
  /** Zusätzlicher Style am äußeren Container. */
  style?: React.CSSProperties;
  /** Optional: Endungen einschränken, z. B. nur ["csv"] für den Kontakt-Import. */
  endungen?: string[];
  /** Optional: eigener Hinweistext unter der Fläche. */
  hinweis?: string;
}

const ERLAUBTE_ENDUNGEN = ["pdf", "docx", "xlsx", "xlsm", "csv", "txt"];
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB (passt zur Route)

export default function DateiImport({
  onText,
  onDatei,
  dunkel = false,
  akzent = GOLD,
  style,
  endungen,
  hinweis,
}: DateiImportProps) {
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [ueber, setUeber] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const textHaupt = dunkel ? "rgba(255,255,255,0.88)" : "#0A1628";
  const textDim = dunkel ? "#8FA3BE" : "#64748b";
  const flaecheBg = dunkel ? "rgba(255,255,255,0.03)" : "rgba(10,22,40,0.02)";
  const rahmen = dunkel ? "rgba(255,255,255,0.18)" : "rgba(10,22,40,0.18)";

  const erlaubt = endungen && endungen.length > 0 ? endungen : ERLAUBTE_ENDUNGEN;
  const accept = erlaubt.map((e) => `.${e}`).join(",");
  const hinweisText =
    hinweis ??
    (endungen && endungen.length > 0
      ? `${erlaubt.map((e) => e.toUpperCase()).join(", ")} – bis 4 MB`
      : "PDF, Word (.docx), Excel (.xlsx) oder CSV – bis 4 MB");

  async function verarbeite(datei: File) {
    setFehler(null);
    setErfolg(null);
    const endung = (datei.name.split(".").pop() || "").toLowerCase();
    if (!erlaubt.includes(endung)) {
      setFehler(
        `Format „.${endung}" wird nicht unterstützt. Erlaubt: ${erlaubt
          .map((e) => e.toUpperCase())
          .join(", ")}.`
      );
      return;
    }
    if (datei.size > MAX_BYTES) {
      setFehler("Datei zu groß (max. 4 MB). Bitte in kleineren Teilen einlesen.");
      return;
    }

    // --- NEU: rohe Datei durchreichen, ohne Server-Umweg -----------------
    if (onDatei) {
      setErfolg(
        `„${datei.name}" ausgewählt – ${datei.size.toLocaleString("de-DE")} Bytes`
      );
      onDatei(datei);
      return;
    }

    // --- Bisheriges Verhalten, unverändert -------------------------------
    setLaden(true);
    try {
      const fd = new FormData();
      fd.append("datei", datei);
      const res = await fetch("/api/datei-text", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setFehler(data?.error || "Die Datei konnte nicht gelesen werden.");
        setLaden(false);
        return;
      }
      const text = String(data.text || "");
      setErfolg(
        `„${data.dateiname}" (${data.typ}) eingelesen – ${text.length.toLocaleString(
          "de-DE"
        )} Zeichen`
      );
      onText?.(text, {
        dateiname: String(data.dateiname || ""),
        typ: String(data.typ || ""),
        gekuerzt: !!data.gekuerzt,
      });
    } catch {
      setFehler("Verbindung fehlgeschlagen. Bitte erneut versuchen.");
    }
    setLaden(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setUeber(false);
    const f = e.dataTransfer.files?.[0];
    if (f) verarbeite(f);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) verarbeite(f);
    e.target.value = ""; // dieselbe Datei erneut auswählbar machen
  }

  return (
    <div style={style}>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setUeber(true);
        }}
        onDragLeave={() => setUeber(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${ueber ? akzent : rahmen}`,
          borderRadius: 12,
          background: ueber ? "rgba(201,168,76,0.06)" : flaecheBg,
          padding: "26px 20px",
          textAlign: "center",
          cursor: "pointer",
          transition: "border-color 0.15s ease, background 0.15s ease",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={onPick}
          style={{ display: "none" }}
        />
        {laden ? (
          <div style={{ color: textHaupt, fontSize: 'clamp(14.5px, 1.25vw, 20px)', fontWeight: 600 }}>
            Datei wird gelesen …
          </div>
        ) : (
          <>
            <div style={{ fontSize: 'clamp(26px, 2.25vw, 36px)', marginBottom: 6 }} aria-hidden>
              📄⬆️
            </div>
            <div style={{ color: textHaupt, fontSize: 'clamp(15px, 1.31vw, 21px)', fontWeight: 700 }}>
              Datei hierher ziehen oder{" "}
              <span style={{ color: akzent, textDecoration: "underline" }}>
                auswählen
              </span>
            </div>
            <div style={{ color: textDim, fontSize: 'clamp(12.5px, 1.13vw, 18px)', marginTop: 6 }}>
              {hinweisText}
            </div>
          </>
        )}
      </div>

      {erfolg && (
        <div
          style={{
            marginTop: 10,
            color: GREEN,
            fontSize: 'clamp(13px, 1.13vw, 18px)',
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span aria-hidden>✅</span>
          {erfolg}
        </div>
      )}
      {fehler && (
        <div
          style={{
            marginTop: 10,
            color: DANGER,
            fontSize: 'clamp(13px, 1.13vw, 18px)',
            fontWeight: 600,
          }}
        >
          {fehler}
        </div>
      )}
    </div>
  );
}
