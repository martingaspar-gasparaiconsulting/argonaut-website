'use client';

// ============================================================================
// ARGONAUT OS · app/dashboard/_components/Hinweise.tsx
//
// ▄▄▄ WARUM ES DIESEN BAUSTEIN GIBT (A7, 22.09.2026) ▄▄▄
// In lib/ liegen mehr als ein Dutzend fertige, getestete Hinweis-Funktionen —
// bkHinweise, ustvaHinweise, bankHinweise, provisionHinweise und so fort. Sie
// sagen dem Betrieb, WORAUF ER ACHTEN MUSS, und wurden nie angezeigt: sie
// waren gebaut, getestet und nirgends angeschlossen ("Andockpunkte").
//
// Damit sie ueberall gleich aussehen und niemand sie je wieder von Hand baut,
// gibt es diesen einen Baustein. Er zeigt nichts an, wenn es nichts zu sagen
// gibt — eine leere Hinweis-Box waere schlimmer als keine.
//
// KEINE Warnfarbe als Grundton: Hinweise sind Hinweise, keine Fehler. Wer
// jeden Hinweis rot faerbt, bringt den Betrieb dazu, alle zu uebersehen.
// ============================================================================

import type { CSSProperties } from 'react';

const F = {
  navy2: '#0F2036',
  gold: '#C9A84C',
  text: '#E8EDF4',
  textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)',
  warn: '#E0A24C',
};

export type HinweiseProps = {
  /** Die Hinweistexte. Leere Liste = der Baustein zeigt gar nichts. */
  texte: Array<string | null | undefined>;
  /** Ueberschrift ueber der Liste. */
  titel?: string;
  /**
   * true faerbt die Liste als Warnung ein. Sparsam benutzen — nur, wenn etwas
   * wirklich schiefgehen kann, nicht fuer jeden Hinweis.
   */
  warnung?: boolean;
  /** Zusaetzlicher Abstand nach oben/unten. */
  style?: CSSProperties;
};

export default function Hinweise({ texte, titel = 'Worauf Sie achten sollten', warnung = false, style }: HinweiseProps) {
  const liste = (texte || [])
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter((t) => t.length > 0);

  if (liste.length === 0) return null;

  const akzent = warnung ? F.warn : F.gold;

  return (
    <div
      style={{
        background: F.navy2,
        border: `1px solid ${warnung ? 'rgba(224,162,76,0.35)' : F.border}`,
        borderLeft: `3px solid ${akzent}`,
        borderRadius: 12,
        padding: '14px 16px',
        margin: '14px 0',
        ...style,
      }}
    >
      <div
        style={{
          color: akzent,
          fontWeight: 700,
          fontSize: 'clamp(13px, 1.13vw, 18px)',
          marginBottom: liste.length > 0 ? 8 : 0,
        }}
      >
        {titel}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {liste.map((t, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              gap: 9,
              alignItems: 'flex-start',
              padding: '5px 0',
              color: F.text,
              fontSize: 'clamp(12.5px, 1.06vw, 17px)',
              lineHeight: 1.55,
            }}
          >
            <span style={{ color: F.textDim, flexShrink: 0 }}>·</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ein einzelner Klartext-Satz, ohne Aufzaehlung — fuer margeKlartext & Co. */
export function Klartext({ text, style }: { text?: string | null; style?: CSSProperties }) {
  const t = (text || '').trim();
  if (!t) return null;
  return (
    <div
      style={{
        color: F.textDim,
        fontSize: 'clamp(12.5px, 1.06vw, 17px)',
        lineHeight: 1.55,
        margin: '10px 0 0',
        ...style,
      }}
    >
      {t}
    </div>
  );
}
