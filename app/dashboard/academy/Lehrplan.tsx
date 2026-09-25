'use client';
// ============================================================================
// ARGONAUT OS · Academy · Lehrplan „Vom Matrosen zum Kapitän" (Paket A4)
//
// Zeigt die aktuelle Etappe (Ziel + Aufgaben mit Link) und die nächste als
// Vorschau; alle Etappen lassen sich aufklappen. Die Inhalte stehen in
// lib/lehrplan.ts. Nichts wird gespeichert — der Fortschritt ist die Zahl der
// abgeschlossenen Kurse, die die Academy ohnehin zählt.
// ============================================================================
import { useState } from 'react';
import { LEHRPLAN, etappeFuer, naechsteEtappe, type Etappe, type LehrRolle } from '@/lib/lehrplan';

const C = {
  gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', dim: 'rgba(255,255,255,0.45)', border: 'rgba(255,255,255,0.1)',
};

function EtappeBlock({ e, rolle, aktuell }: { e: Etappe; rolle: LehrRolle; aktuell: boolean }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 14.5, color: aktuell ? C.gold : C.text }}>
        {e.icon} {e.rang}{' '}
        <span style={{ color: C.dim, fontWeight: 600, fontSize: 12.5 }}>
          {e.abKursen === 0 ? '· vor dem ersten Kurs' : `· ab ${e.abKursen} ${e.abKursen === 1 ? 'Kurs' : 'Kursen'}`}
        </span>
      </div>
      <div style={{ color: C.text, fontSize: 13.5, margin: '4px 0 6px' }}>{e.ziel[rolle]}</div>
      <ol style={{ margin: 0, paddingLeft: 20, color: C.text, fontSize: 13.5, lineHeight: 1.55 }}>
        {e.aufgaben[rolle].map((a, i) => (
          <li key={i} style={{ marginBottom: 4 }}>
            {a.text}{' '}
            <a href={a.href} style={{ color: C.cyan, fontWeight: 700, textDecoration: 'none' }}>öffnen ›</a>
            {a.probe && <span style={{ color: C.green, fontSize: 12, marginLeft: 6 }}>mit Probe-Eintrag</span>}
            {a.freigabe && <span style={{ color: C.dim, fontSize: 12, marginLeft: 6 }}>(wenn der Chef den Bereich freigeschaltet hat)</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Lehrplan({ rolle, kurse }: { rolle: LehrRolle; kurse: number }) {
  const [alle, setAlle] = useState(false);
  const jetzt = etappeFuer(kurse);
  const naechst = naechsteEtappe(kurse);

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`,
      borderRadius: 16, padding: '16px 18px', marginBottom: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15.5, color: C.text }}>🧭 Ihr Lehrplan — vom Matrosen zum Kapitän</div>
          <div style={{ color: C.dim, fontSize: 13, marginTop: 3 }}>
            {rolle === 'chef' ? 'Für den Chef: Einrichtung, Tagesgeschäft, Geld, Überblick.' : 'Für Mitarbeiter: Ihr Arbeitstag im System, Schritt für Schritt.'}
            {' '}Auf jeder Seite erklärt der Guide unten links die Einzelheiten.
          </div>
        </div>
        <button type="button" onClick={() => setAlle((v) => !v)} style={{
          background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '6px 12px', color: C.dim, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
        }}>
          {alle ? 'Nur aktuelle Etappe' : 'Alle Etappen zeigen'}
        </button>
      </div>

      {alle
        ? LEHRPLAN.map((e) => <EtappeBlock key={e.key} e={e} rolle={rolle} aktuell={e.key === jetzt.key} />)
        : (
          <>
            <EtappeBlock e={jetzt} rolle={rolle} aktuell />
            {naechst && (
              <div style={{ color: C.dim, fontSize: 12.5, marginTop: 10 }}>
                Danach: {naechst.icon} <b style={{ color: C.text }}>{naechst.rang}</b> — {naechst.ziel[rolle]}
              </div>
            )}
          </>
        )}
    </div>
  );
}
