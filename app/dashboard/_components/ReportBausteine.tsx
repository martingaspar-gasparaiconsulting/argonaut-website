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
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: 0.2,
        }}
      >
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
        <span>{titel}</span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          color: FARBEN.hell,
          fontSize: 30,
          fontWeight: 800,
          lineHeight: 1.1,
        }}
      >
        <span>{wertText}</span>
        {einheit && (
          <span style={{ fontSize: 16, fontWeight: 700, color: FARBEN.grau }}>
            {einheit}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 18 }}>
        {hatTrend && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: trendPositiv ? FARBEN.gruen : FARBEN.rot,
            }}
          >
            {trendPositiv ? '▲' : '▼'} {formatZahl(Math.abs(trend as number))} %
          </span>
        )}
        {unterzeile && (
          <span style={{ fontSize: 12, color: FARBEN.grau }}>{unterzeile}</span>
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
  const tooltipFormatter = (value: number | string): [string, string] => {
    const zahl = typeof value === 'number' ? formatZahl(value) : String(value);
    return [einheit ? `${zahl} ${einheit}` : zahl, 'Wert'];
  };

  const tooltipStyle = {
    background: FARBEN.navy,
    border: `1px solid ${FARBEN.rand}`,
    borderRadius: 8,
    color: FARBEN.hell,
    fontSize: 13,
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
          fontSize: 15,
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
            fontSize: 14,
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
                  wrapperStyle={{ fontSize: 12, color: FARBEN.grau }}
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
