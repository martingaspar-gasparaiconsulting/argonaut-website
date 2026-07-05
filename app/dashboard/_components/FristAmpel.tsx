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

import { berechneAmpel, berechneReaktionsAmpel, AmpelStatus, AmpelOptionen } from './fristLogik';

// Hellere Ampel-Farben für dunklen Hintergrund (z. B. Navy-Seiten).
const FARBEN_DUNKEL: Record<AmpelStatus, { farbe: string; hintergrund: string; rand: string }> = {
  gruen: { farbe: '#4ade80', hintergrund: 'rgba(74,222,128,0.14)',  rand: 'rgba(74,222,128,0.40)' },
  gelb:  { farbe: '#fbbf24', hintergrund: 'rgba(251,191,36,0.14)',  rand: 'rgba(251,191,36,0.40)' },
  rot:   { farbe: '#f87171', hintergrund: 'rgba(248,113,113,0.16)', rand: 'rgba(248,113,113,0.45)' },
  grau:  { farbe: '#94a3b8', hintergrund: 'rgba(148,163,184,0.14)', rand: 'rgba(148,163,184,0.35)' },
};

export interface FristAmpelProps {
  /** Zieldatum: Date, "YYYY-MM-DD", ISO-String, oder null/undefined. */
  datum: Date | string | null | undefined;
  /** Optionaler Kontext, z. B. "TÜV", "Kündigungsfrist", "Rechnung fällig". */
  bezeichnung?: string;
  /** "frist" = Resttage bis Zieldatum (Standard). "reaktion" = verstrichene Zeit seit Startpunkt. */
  modus?: 'frist' | 'reaktion';
  /** Ab so vielen Resttagen wird es gelb. Default 30. (nur modus="frist") */
  gelbAbTagen?: number;
  /** Ab so vielen Resttagen wird es rot. Default 7. (nur modus="frist") */
  rotAbTagen?: number;
  /** Ab so vielen verstrichenen Stunden wird es gelb. Default 4. (nur modus="reaktion") */
  gelbAbStunden?: number;
  /** Ab so vielen verstrichenen Stunden wird es rot. Default 24. (nur modus="reaktion") */
  rotAbStunden?: number;
  /** Hellere Farben + weiße Bezeichnung für dunklen Hintergrund. */
  dunkel?: boolean;
  /** Darstellung. Default "badge". */
  variante?: 'punkt' | 'badge' | 'zeile';
  /** Zusätzlicher Style am äußeren Container. */
  style?: React.CSSProperties;
}

export default function FristAmpel({
  datum,
  bezeichnung,
  modus = 'frist',
  gelbAbTagen,
  rotAbTagen,
  gelbAbStunden,
  rotAbStunden,
  dunkel = false,
  variante = 'badge',
  style,
}: FristAmpelProps) {
  const roh =
    modus === 'reaktion'
      ? berechneReaktionsAmpel(datum, { gelbAbStunden, rotAbStunden })
      : berechneAmpel(datum, { gelbAbTagen, rotAbTagen } as AmpelOptionen);

  // Farben je nach Hintergrund wählen (Status bleibt gleich, nur die Töne).
  const toene = dunkel ? FARBEN_DUNKEL[roh.status] : { farbe: roh.farbe, hintergrund: roh.hintergrund, rand: roh.rand };
  const a = { ...roh, ...toene };

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
            color: dunkel ? 'rgba(255,255,255,0.85)' : '#0A1628',
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
