// ============================================================
// ARGONAUT OS · Paket 305 · Fahrzeugmappe — schlichte Linien-Symbole
// Eigene SVG-Pfade (24er Raster, Strich), damit die Kunden-Seite ohne
// Emoji und ohne fremde Schrift auskommt und auf jedem Handy gleich aussieht.
// ============================================================

import type { CSSProperties } from 'react';

const PFADE: Record<string, string[]> = {
  kamera: ['M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.4-2h5.8l1.4 2h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z', 'M12 16.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z'],
  video: ['M4 7.5A1.5 1.5 0 0 1 5.5 6h8A1.5 1.5 0 0 1 15 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 16.5z', 'M15 10.5l5-3v9l-5-3'],
  hochladen: ['M12 15V4', 'M7.5 8.5L12 4l4.5 4.5', 'M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15'],
  muell: ['M5 7h14', 'M9.5 7V5h5v2', 'M7 7l.8 12h8.4L17 7', 'M10.5 11v5', 'M13.5 11v5'],
  neu: ['M19.5 12a7.5 7.5 0 1 1-2.2-5.3', 'M19.5 4.5v4.2h-4.2'],
  haken: ['M5 12.5l4.5 4.5L19 7.5'],
  kreuz: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
  weiter: ['M5 12h14', 'M13 6l6 6-6 6'],
  zurueck: ['M19 12H5', 'M11 6l-6 6 6 6'],
  dokument: ['M7 3.5h6.5L18 8v12.5H7z', 'M13.5 3.5V8H18', 'M9.5 12.5h6', 'M9.5 16h6'],
  handy: ['M8 3.5h8A1.5 1.5 0 0 1 17.5 5v14a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5z', 'M11 17.5h2'],
  uhr: ['M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z', 'M12 7.5V12l3 2'],
  schloss: ['M6.5 11h11v9h-11z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  auto: ['M4 15.5v-3l2-5h12l2 5v3', 'M3.5 15.5h17v2.5h-17z', 'M7.5 18v1.5', 'M16.5 18v1.5', 'M4.5 12.5h15'],
  tausch: ['M5 9h13', 'M14.5 5.5L18 9l-3.5 3.5', 'M19 15H6', 'M9.5 11.5L6 15l3.5 3.5'],
  firma: ['M4.5 20.5V6.5l7-3 7 3v14', 'M9 20.5v-4h6v4', 'M8.5 9.5h1', 'M14.5 9.5h1', 'M8.5 13h1', 'M14.5 13h1'],
  person: ['M12 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5z', 'M4.5 20.5a7.5 7.5 0 0 1 15 0'],
  aufnahme: ['M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z'],
  stopp: ['M8 8h8v8H8z'],
  achtung: ['M12 4.5l8.5 15h-17z', 'M12 10v4', 'M12 16.8v.2'],
};

export function Symbol({ name, groesse = 20, stil }: { name: keyof typeof PFADE | string; groesse?: number; stil?: CSSProperties }) {
  const p = PFADE[name] ?? PFADE.dokument;
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', ...stil }}>
      {p.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
