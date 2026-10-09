'use client';

// ============================================================
// ARGONAUT OS · Paket 281 · K15a Kaufstatus im Kundenportal
// Der Käufer sieht seinen Fahrzeugkauf: Schritte (reserviert -> Vertrag ->
// Zulassung -> Übergabe), Kaufpreis, Anzahlung, Inzahlungnahme, Restbetrag und
// wo der Fahrzeugbrief gerade ist. Daten kommen fertig gefiltert aus
// /api/oeffentlich/portal (Positivliste lib/kfzKaufstatus.ts).
// Pfad: app/portal/[token]/PortalKauf.tsx
// ============================================================

import type { CSSProperties } from 'react';
import type { PortalKauf as Kauf } from '@/lib/kfzKaufstatus';

const C = { navy2: '#0F2036', gold: '#c9a84c', text: '#EAF1F6', dim: '#9fb3bd', border: 'rgba(122,163,179,0.18)', green: '#4CAF7D', warn: '#E0A24C' };

function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function de(t: string | null) { return t ? `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}` : ''; }

const BRIEF: Record<string, string> = {
  beim_haendler: 'Liegt sicher bei uns.',
  zulassung: 'Ist gerade bei der Zulassungsstelle.',
  uebergeben: 'Wurde Ihnen übergeben.',
};

export default function PortalKauf({ kaeufe }: { kaeufe: Kauf[] }) {
  if (!kaeufe.length) return null;
  return (
    <>
      {kaeufe.map((k, i) => (
        <div key={(k.nr ?? '') + i} style={s.card}>
          <h2 style={s.h2}>🚗 Ihr Fahrzeugkauf</h2>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{k.fahrzeug}</div>
          <div style={s.dim}>
            {[k.erstzulassung ? `Erstzulassung ${k.erstzulassung}` : null, k.farbe, k.nr ? `Vorgang ${k.nr}` : null].filter(Boolean).join(' · ')}
          </div>

          <ol style={s.liste} aria-label="Stand Ihres Kaufs">
            {k.schritte.map((x) => {
              const farbe = x.stand === 'erledigt' ? C.green : x.stand === 'aktiv' ? C.gold : C.dim;
              return (
                <li key={x.key} style={s.schritt}>
                  <span aria-hidden="true" style={{ ...s.punkt, borderColor: farbe, background: x.stand === 'erledigt' ? C.green : 'transparent', color: x.stand === 'erledigt' ? '#0A1628' : farbe }}>
                    {x.stand === 'erledigt' ? '✓' : x.stand === 'aktiv' ? '•' : ''}
                  </span>
                  <span>
                    <span style={{ fontWeight: x.stand === 'aktiv' ? 700 : 500, color: x.stand === 'offen' ? C.dim : C.text }}>{x.label}</span>
                    {x.stand === 'aktiv' && <span style={{ ...s.dim, color: C.gold }}> · aktuell</span>}
                    {(x.datum || x.text) && <span style={{ ...s.dim, display: 'block' }}>{[x.stand === 'erledigt' && x.datum ? de(x.datum) : null, x.text].filter(Boolean).join(' · ')}</span>}
                  </span>
                </li>
              );
            })}
          </ol>

          <table style={s.tab}><tbody>
            <tr><td style={s.td}>Kaufpreis gesamt</td><td style={s.tdR}>{eur(k.geld.gesamt)}</td></tr>
            {k.geld.inzahlung > 0 && <tr><td style={s.td}>Ihr Fahrzeug in Zahlung</td><td style={s.tdR}>− {eur(k.geld.inzahlung)}</td></tr>}
            {k.geld.anzahlung > 0 && <tr><td style={s.td}>Anzahlung</td><td style={s.tdR}>− {eur(k.geld.anzahlung)}</td></tr>}
            {(k.geld.inzahlung > 0 || k.geld.anzahlung > 0) && (
              <tr><td style={{ ...s.td, fontWeight: 700 }}>{k.geld.rest >= 0 ? 'Restbetrag' : 'Wir zahlen Ihnen aus'}</td><td style={{ ...s.tdR, fontWeight: 700 }}>{eur(Math.abs(k.geld.rest))}</td></tr>
            )}
          </tbody></table>
          <div style={{ ...s.dim, marginTop: 6 }}>Maßgeblich sind Kaufvertrag und Rechnung. Ob eine Zahlung schon eingegangen ist, sehen Sie bei Ihren Rechnungen.</div>

          {k.brief && <div style={{ marginTop: 10, fontSize: 14 }}>📄 Fahrzeugbrief: <span style={{ color: C.text }}>{BRIEF[k.brief]}</span></div>}
        </div>
      ))}
    </>
  );
}

const s: Record<string, CSSProperties> = {
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 18, padding: 24 },
  h2: { fontSize: 19, fontWeight: 700, margin: '0 0 14px', color: C.text },
  dim: { color: C.dim, fontSize: 13.5 },
  liste: { listStyle: 'none', padding: 0, margin: '14px 0', display: 'grid', gap: 10 },
  schritt: { display: 'grid', gridTemplateColumns: '26px 1fr', gap: 10, alignItems: 'start', fontSize: 14.5 },
  punkt: { width: 22, height: 22, borderRadius: '50%', border: '2px solid', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800 },
  tab: { width: '100%', borderCollapse: 'collapse', marginTop: 4 },
  td: { padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 14 },
  tdR: { padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 14, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
};
