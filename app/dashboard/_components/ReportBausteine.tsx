'use client';

/**
 * ══════════════════════════════════════════════════════════════════
 * ARGONAUT OS · Report-Fundament (Block B-1)
 * ------------------------------------------------------------------
 * Zwei wiederverwendbare Bausteine für ALLE Analytics-Reports (B-2..B-7)
 * UND später für Block D (BWA/EÜR). Einmal bauen, überall nutzen.
 *
 *   <KpiKarte />       → eine einzelne Kennzahl (Zahl + Trend)
 *   <DiagrammKarte />  → Balken- / Linien- / Torten-Diagramm
 *
 * Reine Frontend-Bausteine, keine Datenbank-Anbindung (die kommt in
 * den einzelnen Reports). Styling = Dashboard-Theme (Inline-Styles).
 * ══════════════════════════════════════════════════════════════════
 */

import type { ReactNode } from 'react';
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

// ── Farbpalette (Dashboard-Theme) ─────────────────────────────────
const FARBEN = {
  navy: '#0A1628',
  navyHell: '#0f2038',
  gold: '#C9A84C',
  cyan: '#00e5ff',
  gruen: '#22c55e',
  rot: '#ef4444',
  grau: '#64748b',
  hell: '#e2e8f0',
  rand: 'rgba(201,168,76,0.18)',
};

// Farb-Reihe für Torten-Segmente
const TORTEN_FARBEN = [
  '#C9A84C', '#00e5ff', '#22c55e', '#ef4444',
  '#a855f7', '#f59e0b', '#3b82f6', '#ec4899',
];

// Zahl hübsch im deutschen Format (1.234,5)
function formatZahl(wert: number): string {
  return wert.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

// ══════════════════════════════════════════════════════════════════
// 1) KpiKarte — eine einzelne Kennzahl mit optionalem Trend
// ══════════════════════════════════════════════════════════════════
export type KpiKarteProps = {
  titel: string;                 // z.B. "Umsatz (Monat)"
  wert: string | number;         // z.B. 12480  oder  "12.480 €"
  einheit?: string;              // z.B. "€", "Stück", "%"
  unterzeile?: string;           // z.B. "vs. Vormonat"
  trend?: number;                // z.B. 12 = +12 % (grün), -5 = -5 % (rot)
  akzentFarbe?: string;          // Standard: Gold
  icon?: string;                 // Emoji, z.B. "💶"
};

export function KpiKarte({
  titel,
  wert,
  einheit,
  unterzeile,
  trend,
  akzentFarbe = FARBEN.gold,
  icon,
}: KpiKarteProps) {
  const wertText = typeof wert === 'number' ? formatZahl(wert) : wert;
  const hatTrend = typeof trend === 'number';
  const trendPositiv = hatTrend && (trend as number) >= 0;

  return (
    <div
      style={{
        background: FARBEN.navyHell,
        border: `1px solid ${FARBEN.rand}`,
        borderRadius: 14,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 0,
        borderTop: `3px solid ${akzentFarbe}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: FARBEN.grau,
          fontSize: 'clamp(13px, 1.13vw, 18px)',
          fontWeight: 600,
          letterSpacing: 0.2,
        }}
      >
        {icon && <span style={{ fontSize: 'clamp(16px, 1.38vw, 22px)' }}>{icon}</span>}
        <span>{titel}</span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          color: FARBEN.hell,
          fontSize: 'clamp(30px, 2.63vw, 42px)',
          fontWeight: 800,
          lineHeight: 1.1,
        }}
      >
        <span>{wertText}</span>
        {einheit && (
          <span style={{ fontSize: 'clamp(16px, 1.38vw, 22px)', fontWeight: 700, color: FARBEN.grau }}>
            {einheit}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 18 }}>
        {hatTrend && (
          <span
            style={{
              fontSize: 'clamp(12px, 1.06vw, 17px)',
              fontWeight: 700,
              color: trendPositiv ? FARBEN.gruen : FARBEN.rot,
            }}
          >
            {trendPositiv ? '▲' : '▼'} {formatZahl(Math.abs(trend as number))} %
          </span>
        )}
        {unterzeile && (
          <span style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: FARBEN.grau }}>{unterzeile}</span>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// 2) DiagrammKarte — Balken / Linie / Torte
// ══════════════════════════════════════════════════════════════════
export type DiagrammPunkt = { name: string; wert: number };

export type DiagrammKarteProps = {
  titel: string;                          // Überschrift der Karte
  typ: 'balken' | 'linie' | 'torte';      // Diagramm-Art
  daten: DiagrammPunkt[];                 // [{ name: "Jan", wert: 1200 }, ...]
  farbe?: string;                         // Standard: Gold (Balken/Linie)
  hoehe?: number;                         // Höhe in px, Standard 300
  einheit?: string;                       // wird im Tooltip angehängt
};

export function DiagrammKarte({
  titel,
  typ,
  daten,
  farbe = FARBEN.gold,
  hoehe = 300,
  einheit,
}: DiagrammKarteProps) {
  const leer = !daten || daten.length === 0;

  // Tooltip-Werte im deutschen Format + Einheit
  // (Parameter bewusst 'unknown' -> kompatibel mit allen recharts-Versionen)
  const tooltipFormatter = (value: unknown): [string, string] => {
    const zahl =
      typeof value === 'number' ? formatZahl(value) : String(value ?? '');
    return [einheit ? `${zahl} ${einheit}` : zahl, 'Wert'];
  };

  const tooltipStyle = {
    background: FARBEN.navy,
    border: `1px solid ${FARBEN.rand}`,
    borderRadius: 8,
    color: FARBEN.hell,
    fontSize: 'clamp(13px, 1.13vw, 18px)',
  };

  return (
    <div
      style={{
        background: FARBEN.navyHell,
        border: `1px solid ${FARBEN.rand}`,
        borderRadius: 14,
        padding: '18px 20px 8px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          color: FARBEN.hell,
          fontSize: 'clamp(15px, 1.31vw, 21px)',
          fontWeight: 700,
        }}
      >
        {titel}
      </div>

      {leer ? (
        <div
          style={{
            height: hoehe,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: FARBEN.grau,
            fontSize: 'clamp(14px, 1.25vw, 20px)',
          }}
        >
          Keine Daten vorhanden
        </div>
      ) : (
        <div style={{ width: '100%', height: hoehe }}>
          <ResponsiveContainer width="100%" height="100%">
            {typ === 'balken' ? (
              <BarChart data={daten} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" stroke={FARBEN.grau} fontSize={12} />
                <YAxis stroke={FARBEN.grau} fontSize={12} />
                <Tooltip
                  formatter={tooltipFormatter}
                  contentStyle={tooltipStyle}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar dataKey="wert" fill={farbe} radius={[6, 6, 0, 0]} />
              </BarChart>
            ) : typ === 'linie' ? (
              <LineChart data={daten} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" stroke={FARBEN.grau} fontSize={12} />
                <YAxis stroke={FARBEN.grau} fontSize={12} />
                <Tooltip formatter={tooltipFormatter} contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="wert"
                  stroke={farbe}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: farbe }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            ) : (
              <PieChart>
                <Pie
                  data={daten}
                  dataKey="wert"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={hoehe * 0.32}
                  label={(entry: { name?: string }) => entry.name ?? ''}
                >
                  {daten.map((_, index) => (
                    <Cell
                      key={index}
                      fill={TORTEN_FARBEN[index % TORTEN_FARBEN.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={tooltipFormatter} contentStyle={tooltipStyle} />
                <Legend
                  wrapperStyle={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: FARBEN.grau }}
                />
              </PieChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Raster-Hilfe: bündelt KPI-Karten in ein responsives Grid ──────
export function KpiRaster({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
      }}
    >
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// 3) TabelleKarte — Datentabelle (für BWA/EÜR + Zahlungsabgleich)
//    Vorbereitet für Block C & D. Spalten frei definierbar, mit
//    Euro-/Zahl-Formatierung und optionalen betonten Summenzeilen.
// ══════════════════════════════════════════════════════════════════
export type TabellenSpalte = {
  schluessel: string;                       // Feldname in der Zeile
  kopf: string;                             // Spaltenüberschrift
  ausrichtung?: 'left' | 'right';           // Standard: left
  format?: 'text' | 'euro' | 'zahl';        // Standard: text
};

// Eine Zeile: freie Felder + optionales _betont (true = Summenzeile)
export type TabellenZeile = Record<
  string,
  string | number | boolean | null | undefined
>;

export type TabelleKarteProps = {
  titel: string;
  spalten: TabellenSpalte[];
  zeilen: TabellenZeile[];
};

function zelleFormatieren(
  wert: string | number | boolean | null | undefined,
  format?: 'text' | 'euro' | 'zahl',
): string {
  if (wert === null || wert === undefined || wert === '') return '–';
  if (format === 'euro') {
    const n = typeof wert === 'number' ? wert : Number(wert);
    return Number.isNaN(n) ? String(wert) : `${formatZahl(n)} €`;
  }
  if (format === 'zahl') {
    const n = typeof wert === 'number' ? wert : Number(wert);
    return Number.isNaN(n) ? String(wert) : formatZahl(n);
  }
  return String(wert);
}

export function TabelleKarte({ titel, spalten, zeilen }: TabelleKarteProps) {
  const leer = !zeilen || zeilen.length === 0;

  return (
    <div
      style={{
        background: FARBEN.navyHell,
        border: `1px solid ${FARBEN.rand}`,
        borderRadius: 14,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ color: FARBEN.hell, fontSize: 'clamp(15px, 1.31vw, 21px)', fontWeight: 700 }}>
        {titel}
      </div>

      {leer ? (
        <div
          style={{
            padding: '32px 0',
            textAlign: 'center',
            color: FARBEN.grau,
            fontSize: 'clamp(14px, 1.25vw, 20px)',
          }}
        >
          Keine Daten vorhanden
        </div>
      ) : (
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 'clamp(13.5px, 1.19vw, 19px)',
            }}
          >
            <thead>
              <tr>
                {spalten.map((sp) => (
                  <th
                    key={sp.schluessel}
                    style={{
                      textAlign: sp.ausrichtung ?? 'left',
                      color: FARBEN.grau,
                      fontWeight: 600,
                      padding: '8px 10px',
                      borderBottom: `1px solid ${FARBEN.rand}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {sp.kopf}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zeilen.map((zeile, zi) => (
                <tr
                  key={zi}
                  style={{
                    background: zeile._betont
                      ? 'rgba(201,168,76,0.10)'
                      : 'transparent',
                  }}
                >
                  {spalten.map((sp) => (
                    <td
                      key={sp.schluessel}
                      style={{
                        textAlign: sp.ausrichtung ?? 'left',
                        color: zeile._betont ? FARBEN.gold : FARBEN.hell,
                        fontWeight: zeile._betont ? 700 : 400,
                        padding: '8px 10px',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {zelleFormatieren(zeile[sp.schluessel], sp.format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// 4) VergleichsBalken — zwei (oder mehr) Datenreihen nebeneinander
//    Kern der BWA (Einnahmen vs Ausgaben). Vorbereitet für Block D.
// ══════════════════════════════════════════════════════════════════
export type VergleichsSerie = {
  schluessel: string;   // Feldname der Reihe in den Datenpunkten
  label: string;        // Anzeigename (Legende/Tooltip)
  farbe: string;        // Balkenfarbe
};

export type VergleichsPunkt = {
  name: string;
  [reihe: string]: string | number;
};

export type VergleichsBalkenProps = {
  titel: string;
  daten: VergleichsPunkt[];
  serien: VergleichsSerie[];   // z.B. Einnahmen (grün) + Ausgaben (rot)
  einheit?: string;
  hoehe?: number;
};

export function VergleichsBalken({
  titel,
  daten,
  serien,
  einheit,
  hoehe = 300,
}: VergleichsBalkenProps) {
  const leer = !daten || daten.length === 0;

  const tooltipFormatter = (value: unknown): string => {
    const zahl =
      typeof value === 'number' ? formatZahl(value) : String(value ?? '');
    return einheit ? `${zahl} ${einheit}` : zahl;
  };

  const tooltipStyle = {
    background: FARBEN.navy,
    border: `1px solid ${FARBEN.rand}`,
    borderRadius: 8,
    color: FARBEN.hell,
    fontSize: 'clamp(13px, 1.13vw, 18px)',
  };

  return (
    <div
      style={{
        background: FARBEN.navyHell,
        border: `1px solid ${FARBEN.rand}`,
        borderRadius: 14,
        padding: '18px 20px 8px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ color: FARBEN.hell, fontSize: 'clamp(15px, 1.31vw, 21px)', fontWeight: 700 }}>
        {titel}
      </div>

      {leer ? (
        <div
          style={{
            height: hoehe,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: FARBEN.grau,
            fontSize: 'clamp(14px, 1.25vw, 20px)',
          }}
        >
          Keine Daten vorhanden
        </div>
      ) : (
        <div style={{ width: '100%', height: hoehe }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daten} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" stroke={FARBEN.grau} fontSize={12} />
              <YAxis stroke={FARBEN.grau} fontSize={12} />
              <Tooltip
                formatter={tooltipFormatter}
                contentStyle={tooltipStyle}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Legend wrapperStyle={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: FARBEN.grau }} />
              {serien.map((serie) => (
                <Bar
                  key={serie.schluessel}
                  dataKey={serie.schluessel}
                  name={serie.label}
                  fill={serie.farbe}
                  radius={[6, 6, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
