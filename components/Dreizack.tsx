// ============================================================================
// ARGONAUT OS · components/Dreizack.tsx
//
// DAS Logo-Zeichen. Seit dem Logo-Tausch L1 (07.10.2026) ist das hier das
// Segel-A aus Martins neuem Logo — der Name "Dreizack" bleibt nur, damit die
// gut 20 Stellen, die dieses Bauteil verwenden, unveraendert weiterlaufen.
// Die Form selbst liegt an genau EINER Stelle: lib/argonautZeichen.ts
// (dieselbe Form nutzt auch das PDF-Zertifikat).
//
// Warum inline und nicht als Bilddatei: es skaliert verlustfrei von 16 px im
// Fliesstext bis 400 px auf dem Zertifikat, laedt nie nach (kein Aufblitzen,
// kein 404), und die Farbe kommt aus der Anwendung statt aus der Datei.
//
// Geschichte: zuerst der Spartaner-Helm (bis 03.08.2026), dann der vektorisierte
// Emoji-Dreizack (bis 07.10.2026), jetzt das Segel-A.
// Neue Stellen bitte IMMER dieses Bauteil verwenden.
// ============================================================================

import { ZEICHEN_PFAD, ZEICHEN_VERHAELTNIS } from '../lib/argonautZeichen';

/** Breite/Hoehe des Zeichens — bestimmt das Seitenverhaeltnis. */
export const DREIZACK_VERHAELTNIS = ZEICHEN_VERHAELTNIS;

export default function Dreizack({
  hoehe = 40,
  farbe = '#C9A84C',
  style,
}: {
  /** Hoehe in px oder als CSS-Wert (z. B. 'clamp(40px, 3.4vw, 56px)'). */
  hoehe?: number | string;
  farbe?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox={`0 0 ${ZEICHEN_VERHAELTNIS} 1`}
      role="img"
      aria-label="ARGONAUT"
      style={{ height: hoehe, width: 'auto', flexShrink: 0, display: 'block', overflow: 'visible', ...style }}
    >
      <path d={ZEICHEN_PFAD} fill={farbe} />
    </svg>
  );
}
