'use client';

// ============================================================
// ARGONAUT OS · Import-Center · Fortschritts-Anzeige (Schritt 0, 27.09.2026)
//
// DateiBalken:  ein Balken je Datei, vier Phasen nebeneinander
//               Laden -> Lesen -> Prüfen -> Einspielen, dazu "x von y" und Restzeit.
// GesamtBalken: ein Balken über alle Dateien eines Umzugs.
// Alle Rechnungen stecken in lib/importFortschritt.ts (node-getestet).
// ============================================================

import type { CSSProperties } from 'react';
import { PHASEN, dateiProzent, type Phase } from '@/lib/importFortschritt';

const C = {
  gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D', text: '#E8EDF4', dim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C', leer: 'rgba(143,163,190,0.14)',
};

export type BalkenStand = {
  phase: Phase | 'fertig';
  /** 0 bis 1 innerhalb der Phase */
  anteil: number;
  /** z. B. "1.500 von 12.480 Zeilen" oder "3,4 MB von 8 MB" */
  zaehler?: string | null;
  /** z. B. "noch ca. 1 Min 20 s" */
  rest?: string | null;
  /** z. B. "wartet auf Ihre Zuordnung" */
  wartet?: string | null;
  angehalten?: boolean;
  fehler?: boolean;
};

export function DateiBalken({ name, stand, kompakt = false }: { name: string; stand: BalkenStand; kompakt?: boolean }) {
  const prozent = dateiProzent({ phase: stand.phase, anteil: stand.anteil });
  const aktIdx = stand.phase === 'fertig' ? PHASEN.length : PHASEN.findIndex((p) => p.key === stand.phase);
  const farbe = stand.fehler ? C.danger : stand.angehalten ? C.warn : stand.phase === 'fertig' ? C.green : C.cyan;

  return (
    <div style={s.rahmen} aria-label={`${name}: ${prozent} Prozent`}>
      <div style={s.kopf}>
        <b style={{ color: C.text, fontSize: kompakt ? 12.5 : 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</b>
        <span style={{ color: farbe, fontWeight: 800, fontSize: kompakt ? 12.5 : 14 }}>{prozent} %</span>
      </div>
      <div style={s.leiste} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prozent}>
        {PHASEN.map((p, i) => {
          const fuellung = i < aktIdx ? 1 : i === aktIdx ? Math.min(1, Math.max(0, stand.anteil)) : 0;
          return (
            <div key={p.key} style={{ ...s.segment, flexGrow: p.gewicht }}>
              <div style={{ height: '100%', width: `${Math.round(fuellung * 100)}%`, background: farbe, transition: 'width .25s linear' }} />
            </div>
          );
        })}
      </div>
      {!kompakt && (
        <div style={s.phasen}>
          {PHASEN.map((p, i) => {
            const status = i < aktIdx ? '✓' : i === aktIdx ? '●' : '○';
            const col = i < aktIdx ? C.green : i === aktIdx ? farbe : C.dim;
            return (
              <span key={p.key} style={{ flexGrow: p.gewicht, flexBasis: 0, color: col, fontSize: 11.5, fontWeight: i === aktIdx ? 800 : 600 }}>
                {status} {p.label}
              </span>
            );
          })}
        </div>
      )}
      {(stand.zaehler || stand.rest || stand.wartet) && (
        <div style={{ color: C.dim, fontSize: 12.5, marginTop: 5, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {stand.zaehler && <span>{stand.zaehler}</span>}
          {stand.rest && <span style={{ color: C.text }}>{stand.rest}</span>}
          {stand.wartet && <span style={{ color: C.warn }}>{stand.wartet}</span>}
        </div>
      )}
    </div>
  );
}

export function GesamtBalken({ prozent, text, unter }: { prozent: number; text: string; unter?: string | null }) {
  const p = Math.max(0, Math.min(100, Math.round(prozent)));
  return (
    <div>
      <div style={s.kopf}>
        <b style={{ color: C.text, fontSize: 14 }}>{text}</b>
        <span style={{ color: p >= 100 ? C.green : C.gold, fontWeight: 800, fontSize: 16 }}>{p} %</span>
      </div>
      <div style={{ ...s.leiste, height: 14 }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}>
        <div style={{ height: '100%', width: `${p}%`, background: p >= 100 ? C.green : C.gold, borderRadius: 7, transition: 'width .3s linear' }} />
      </div>
      {unter && <div style={{ color: C.dim, fontSize: 12.5, marginTop: 5 }}>{unter}</div>}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  rahmen: { border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 11px', background: 'rgba(10,22,40,0.5)' },
  kopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 6 },
  leiste: { display: 'flex', gap: 3, height: 10, borderRadius: 7, overflow: 'hidden', background: 'transparent' },
  segment: { flexBasis: 0, background: C.leer, borderRadius: 4, overflow: 'hidden' },
  phasen: { display: 'flex', gap: 3, marginTop: 5 },
};
