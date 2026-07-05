// ============================================================================
// ARGONAUT OS · Komponente "FristAmpel" (Etappe 1, Baustein 1)
// Visuelle Ampel für ein Zieldatum. Nutzt die reine Logik aus ./fristLogik.
// Inline-Styles (kein Tailwind). Keine Hooks -> in Server- UND Client-Pages
// gleichermaßen einsetzbar.
//
// Varianten:
//   "punkt" – nur farbiger Punkt + kurzer Text (kompakt, für Tabellen)
//   "badge" – gefüllte Pille mit Rand (Standard)
//   "zeile" – Bezeichnung links + Badge rechts (für Detailseiten)
// ============================================================================

import { berechneAmpel, AmpelOptionen } from './fristLogik';

export interface FristAmpelProps {
  /** Zieldatum: Date, "YYYY-MM-DD", ISO-String, oder null/undefined. */
  datum: Date | string | null | undefined;
  /** Optionaler Kontext, z. B. "TÜV", "Kündigungsfrist", "Rechnung fällig". */
  bezeichnung?: string;
  /** Ab so vielen Resttagen wird es gelb. Default 30. */
  gelbAbTagen?: number;
  /** Ab so vielen Resttagen wird es rot. Default 7. */
  rotAbTagen?: number;
  /** Darstellung. Default "badge". */
  variante?: 'punkt' | 'badge' | 'zeile';
  /** Zusätzlicher Style am äußeren Container. */
  style?: React.CSSProperties;
}

export default function FristAmpel({
  datum,
  bezeichnung,
  gelbAbTagen,
  rotAbTagen,
  variante = 'badge',
  style,
}: FristAmpelProps) {
  const opt: AmpelOptionen = { gelbAbTagen, rotAbTagen };
  const a = berechneAmpel(datum, opt);

  const punkt = (
    <span
      style={{
        display: 'inline-block',
        width: 9,
        height: 9,
        borderRadius: '50%',
        background: a.farbe,
        flexShrink: 0,
        boxShadow: a.status === 'rot' ? `0 0 0 3px ${a.hintergrund}` : 'none',
      }}
    />
  );

  // --- Variante: nur Punkt + Text ------------------------------------------
  if (variante === 'punkt') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 13,
          color: a.farbe,
          fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif",
          ...style,
        }}
      >
        {punkt}
        <span>{a.label}</span>
      </span>
    );
  }

  // --- gemeinsame Badge-Pille ----------------------------------------------
  const badge = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '4px 11px',
        borderRadius: 999,
        background: a.hintergrund,
        border: `1px solid ${a.rand}`,
        color: a.farbe,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "'DM Sans', sans-serif",
        whiteSpace: 'nowrap',
      }}
    >
      {punkt}
      <span>{a.label}</span>
    </span>
  );

  // --- Variante: Badge allein ----------------------------------------------
  if (variante === 'badge') {
    return <span style={style}>{badge}</span>;
  }

  // --- Variante: Zeile (Bezeichnung + Badge) -------------------------------
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        ...style,
      }}
    >
      {bezeichnung && (
        <span
          style={{
            fontSize: 14,
            color: '#0A1628',
            fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {bezeichnung}
        </span>
      )}
      {badge}
    </div>
  );
}
