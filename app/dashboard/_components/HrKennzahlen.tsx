// ============================================================================
// ARGONAUT OS · Komponente "HrKennzahlen" (Etappe 2 · Quick-Win 10)
// HR-Kennzahlen: Krankenquote + Fluktuation – additiv, self-contained.
//
// Holt sich Mitarbeiter + Abwesenheiten selbst und berechnet fuer das
// laufende Kalenderjahr:
//   - Aktive Mitarbeiter (Headcount)
//   - Krankenquote  = Krank-Tage / (aktive MA x Arbeitstage) x 100
//   - Fluktuation    = Austritte / aktive MA x 100
//   - Ein-/Austritte im laufenden Jahr
// Dazu ein KI-Klartext ("Was heisst das fuer mich?").
//
// DSGVO: zeigt NUR aggregierte Zahlen, KEINE einzelnen Personen/Krankdaten.
// SAFETY-FIRST + ADDITIV: ersetzt nichts. Einfach importieren + <HrKennzahlen/>.
//
// Inline-Styles (kein Tailwind). Branding: ARGONAUT / "die KI" – nie "Claude".
// ============================================================================
"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiKlartext from "./KiKlartext";

// Marken-Palette (identisch zum Dashboard, lokal gehalten -> self-contained)
const C = {
  navy: "#0A1628",
  navy2: "#0F1F33",
  gold: "#C9A84C",
  cyan: "#00e5ff",
  green: "#4CAF7D",
  danger: "#E06666",
  warn: "#E0A24C",
  textDim: "#8FA3BE",
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type Mitarbeiter = {
  id: string;
  status: string | null;
  eintrittsdatum: string | null;
  austrittsdatum: string | null;
};

type Abwesenheit = {
  typ: string | null;
  von: string | null;
  bis: string | null;
  tage: number | null;
  status: string | null;
};

// ---- Anzeige-Helfer -------------------------------------------------------
function fmtProzent(v: number | null, dez = 1): string {
  if (v == null || Number.isNaN(v)) return "\u2014";
  return (
    new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: dez,
      maximumFractionDigits: dez,
    }).format(v) + " %"
  );
}

// Arbeitstage (Mo–Fr) zwischen zwei Daten, inklusive Start und Ende
function arbeitstageZwischen(start: Date, ende: Date): number {
  let count = 0;
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(ende.getFullYear(), ende.getMonth(), ende.getDate());
  while (d <= e) {
    const wt = d.getDay(); // 0 = So, 6 = Sa
    if (wt !== 0 && wt !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// Jahr aus einem 'YYYY-MM-DD'-String
function jahrVon(datum: string | null): number | null {
  if (!datum) return null;
  const j = Number(datum.slice(0, 4));
  return Number.isNaN(j) ? null : j;
}

// Tage einer Abwesenheit (bevorzugt Feld "tage", sonst aus von/bis berechnet)
function tageVon(a: Abwesenheit): number {
  if (a.tage != null && !Number.isNaN(Number(a.tage))) return Number(a.tage);
  if (a.von && a.bis) {
    const v = new Date(a.von).getTime();
    const b = new Date(a.bis).getTime();
    if (!Number.isNaN(v) && !Number.isNaN(b) && b >= v) {
      return Math.round((b - v) / 86400000) + 1;
    }
  }
  return 0;
}

// Ampeln (Benchmarks: dt. Krankenquote ~5,4 %; Fluktuation grob)
function krankAmpel(q: number | null): { farbe: string; text: string } {
  if (q == null) return { farbe: C.textDim, text: "keine Daten" };
  if (q < 4) return { farbe: C.green, text: "Niedrig" };
  if (q <= 7) return { farbe: C.warn, text: "Im Schnitt" };
  return { farbe: C.danger, text: "Erhoeht" };
}
function fluktAmpel(f: number | null): { farbe: string; text: string } {
  if (f == null) return { farbe: C.textDim, text: "keine Daten" };
  if (f < 10) return { farbe: C.green, text: "Stabil" };
  if (f <= 20) return { farbe: C.warn, text: "Erhoeht" };
  return { farbe: C.danger, text: "Hoch" };
}

export default function HrKennzahlen({ style }: { style?: React.CSSProperties }) {
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [abwesenheiten, setAbwesenheiten] = useState<Abwesenheit[]>([]);
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      setLaden(true);
      const [maRes, abRes] = await Promise.all([
        supabase.from("mitarbeiter").select("id, status, eintrittsdatum, austrittsdatum"),
        supabase.from("hr_abwesenheiten").select("typ, von, bis, tage, status"),
      ]);
      if (!aktiv) return;
      setMitarbeiter((maRes.data ?? []) as Mitarbeiter[]);
      setAbwesenheiten((abRes.data ?? []) as Abwesenheit[]);
      setLaden(false);
    })();
    return () => {
      aktiv = false;
    };
  }, []);

  // ---- Kennzahlen ---------------------------------------------------------
  const k = useMemo(() => {
    const heute = new Date();
    const jahr = heute.getFullYear();
    const jahresStart = new Date(jahr, 0, 1);
    const arbeitstage = arbeitstageZwischen(jahresStart, heute);

    // Personal
    const aktive = mitarbeiter.filter((m) => (m.status ?? "").toLowerCase() === "aktiv" && !m.austrittsdatum);
    const aktiveCount = aktive.length;
    const eintritteJahr = mitarbeiter.filter((m) => jahrVon(m.eintrittsdatum) === jahr).length;
    const austritteJahr = mitarbeiter.filter((m) => jahrVon(m.austrittsdatum) === jahr).length;

    // Abwesenheiten (laufendes Jahr, Beginn im Jahr)
    const imJahr = abwesenheiten.filter((a) => jahrVon(a.von) === jahr);
    const krankTage = imJahr
      .filter((a) => (a.typ ?? "").toLowerCase() === "krankheit")
      .reduce((s, a) => s + tageVon(a), 0);
    const urlaubTage = imJahr
      .filter((a) => (a.typ ?? "").toLowerCase() === "urlaub")
      .reduce((s, a) => s + tageVon(a), 0);
    const offeneAbw = abwesenheiten.filter((a) => (a.status ?? "").toLowerCase() !== "genehmigt").length;

    // Quoten
    const sollPersonentage = aktiveCount * arbeitstage;
    const krankenquote = sollPersonentage > 0 ? (krankTage / sollPersonentage) * 100 : null;
    const fluktuation = aktiveCount > 0 ? (austritteJahr / aktiveCount) * 100 : null;

    return {
      jahr,
      arbeitstage,
      aktiveCount,
      eintritteJahr,
      austritteJahr,
      krankTage,
      urlaubTage,
      offeneAbw,
      krankenquote,
      fluktuation,
    };
  }, [mitarbeiter, abwesenheiten]);

  const kAmpel = krankAmpel(k.krankenquote);
  const fAmpel = fluktAmpel(k.fluktuation);

  // Kopf-Ampel = die "kritischere" der beiden
  const kopfFarbe =
    kAmpel.farbe === C.danger || fAmpel.farbe === C.danger
      ? C.danger
      : kAmpel.farbe === C.warn || fAmpel.farbe === C.warn
      ? C.warn
      : kAmpel.farbe === C.textDim && fAmpel.farbe === C.textDim
      ? C.textDim
      : C.green;

  // ---- KI-Kontext (echte Zahlen) ------------------------------------------
  const kiKontext = useMemo(() => {
    if (k.aktiveCount === 0) {
      return "Es sind noch keine aktiven Mitarbeiter erfasst.";
    }
    return (
      `${k.aktiveCount} aktive Mitarbeiter. ` +
      `Krankenquote im laufenden Jahr: ${fmtProzent(k.krankenquote)} ` +
      `(${k.krankTage} Krankheitstage). ` +
      `Fluktuationsrate: ${fmtProzent(k.fluktuation, 0)} ` +
      `(${k.austritteJahr} Austritte, ${k.eintritteJahr} Eintritte im Jahr). ` +
      `Offene/unbestaetigte Abwesenheiten: ${k.offeneAbw}.`
    );
  }, [k]);

  // ---- KPI-Kacheln --------------------------------------------------------
  const kacheln: { label: string; wert: string; farbe: string; sub?: string }[] = [
    {
      label: "Aktive Mitarbeiter",
      wert: String(k.aktiveCount),
      farbe: C.cyan,
      sub: `${k.eintritteJahr} Eintritte ${k.jahr}`,
    },
    {
      label: "Krankenquote (Jahr)",
      wert: fmtProzent(k.krankenquote),
      farbe: kAmpel.farbe,
      sub: `${kAmpel.text} · ${k.krankTage} Krankheitstage`,
    },
    {
      label: "Fluktuationsrate (Jahr)",
      wert: fmtProzent(k.fluktuation, 0),
      farbe: fAmpel.farbe,
      sub: `${fAmpel.text} · ${k.austritteJahr} Austritte`,
    },
    {
      label: "Bewegung (Jahr)",
      wert: `+${k.eintritteJahr} / -${k.austritteJahr}`,
      farbe: C.gold,
      sub: "Ein- / Austritte",
    },
  ];

  return (
    <div
      style={{
        background: C.navy2,
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        ...style,
      }}
    >
      {/* Kopf */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span
          style={{
            display: "inline-block",
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: kopfFarbe,
            boxShadow: `0 0 10px ${kopfFarbe}`,
          }}
        />
        <h3
          style={{
            margin: 0,
            fontSize: 'clamp(16px, 1.38vw, 22px)',
            fontWeight: 800,
            letterSpacing: 0.3,
            color: "#fff",
            fontFamily: "var(--font-dm-sans), sans-serif",
          }}
        >
          HR-Kennzahlen &middot; Krankenquote &amp; Fluktuation
        </h3>
      </div>

      {/* KPI-Kacheln */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {kacheln.map((kp) => (
          <div
            key={kp.label}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                fontSize: 'clamp(22px, 1.94vw, 31px)',
                fontWeight: 800,
                color: kp.farbe,
                fontFamily: "var(--font-dm-sans), sans-serif",
                lineHeight: 1.1,
              }}
            >
              {laden ? "\u2026" : kp.wert}
            </div>
            <div
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: C.textDim,
                fontSize: 'clamp(13px, 1.13vw, 18px)',
                marginTop: 4,
              }}
            >
              {kp.label}
            </div>
            {kp.sub && (
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 'clamp(11.5px, 1vw, 16px)',
                  marginTop: 2,
                }}
              >
                {kp.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Detail-Zeile (aggregiert, DSGVO-konform) */}
      {!laden && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            padding: "10px 14px",
            marginBottom: 16,
            borderRadius: 10,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.05)",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 'clamp(13px, 1.13vw, 18px)',
            color: C.textDim,
          }}
        >
          <span>
            Krankheitstage {k.jahr}:{" "}
            <strong style={{ color: "rgba(255,255,255,0.85)" }}>{k.krankTage}</strong>
          </span>
          <span>
            Urlaubstage {k.jahr}:{" "}
            <strong style={{ color: "rgba(255,255,255,0.85)" }}>{k.urlaubTage}</strong>
          </span>
          <span>
            Offene Abwesenheiten:{" "}
            <strong style={{ color: "rgba(255,255,255,0.85)" }}>{k.offeneAbw}</strong>
          </span>
          <span>
            Arbeitstage seit 01.01.:{" "}
            <strong style={{ color: "rgba(255,255,255,0.85)" }}>{k.arbeitstage}</strong>
          </span>
        </div>
      )}

      {/* KI-Klartext: "Was heisst das fuer mich?" */}
      {!laden && (
        <KiKlartext
          kontext={kiKontext}
          modul="Personal / HR-Kennzahlen"
          akzent={kopfFarbe}
          dunkel
        />
      )}
    </div>
  );
}
