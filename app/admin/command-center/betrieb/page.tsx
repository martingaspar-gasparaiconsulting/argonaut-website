'use client';

import { useEffect, useState, type CSSProperties } from 'react';

// ============================================================
// ARGONAUT OS · Command Center · Betriebe einrichten (G3 Push 4)
//
// Die Übersicht vor der Akte: Welcher Kunde ist fertig eingerichtet, und wo
// liegt noch etwas an? Der Kunde bekommt All-in-One — die Zugänge (WhatsApp,
// Meta, Mail, später Bank) macht der Betreiber. Damit stellt sich beim vierten
// Kunden die Frage: Bei WEM steht was offen? Genau die beantwortet diese Seite.
//
// Sortiert wird nach Offenem, nicht alphabetisch: Wer Arbeit macht, steht oben.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', textDim: '#8FA3BE',
};

type Zeile = {
  id: string;
  name: string;
  erledigt: number;
  offen: number;
  gesamt: number;
  prozent: number;
};

export default function CcBetriebe() {
  const [betriebe, setBetriebe] = useState<Zeile[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [suche, setSuche] = useState('');

  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      try {
        const r = await fetch('/api/admin/betrieb-einrichtung');
        const d = await r.json();
        if (abgebrochen) return;
        if (d?.ok) setBetriebe(Array.isArray(d.betriebe) ? d.betriebe : []);
        else setFehler(d?.error || 'Konnte die Betriebe nicht laden.');
      } catch {
        if (!abgebrochen) setFehler('Verbindung fehlgeschlagen.');
      }
      if (!abgebrochen) setLaden(false);
    })();
    return () => { abgebrochen = true; };
  }, []);

  const gefiltert = betriebe
    .filter((b) => b.name.toLowerCase().includes(suche.trim().toLowerCase()))
    // Wer Arbeit macht, steht oben; bei Gleichstand alphabetisch.
    .slice()
    .sort((a, b) => (b.offen - a.offen) || a.name.localeCompare(b.name, 'de'));

  const fertig = betriebe.filter((b) => b.offen === 0).length;
  const offeneGesamt = betriebe.reduce((s, b) => s + b.offen, 0);

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>

        <div style={s.kopf}>
          <div>
            <h1 style={s.h1}>🗂️ Betriebe einrichten</h1>
            <p style={s.sub}>
              Einen Betrieb anklicken und sehen, was bei ihm noch zu tun ist. Die Liste
              pflegt sich nicht von Hand: Ein Punkt gilt als erledigt, weil die Daten es
              sagen — nicht, weil jemand ein Häkchen gesetzt hat.
            </p>
          </div>
          <a href="/admin/command-center" style={s.btnGhost}>‹ Command Center</a>
        </div>

        {fehler && <div style={s.fehlerBox}>{fehler}</div>}

        {laden ? (
          <div style={s.hint}>Lädt …</div>
        ) : (
          <>
            <div style={s.kpiZeile}>
              <div style={s.kpi}><b>{betriebe.length}</b><span style={s.kpiText}>Betriebe</span></div>
              <div style={s.kpi}><b style={{ color: C.green }}>{fertig}</b><span style={s.kpiText}>vollständig eingerichtet</span></div>
              <div style={s.kpi}>
                <b style={{ color: offeneGesamt > 0 ? C.gold : C.green }}>{offeneGesamt}</b>
                <span style={s.kpiText}>offene Punkte insgesamt</span>
              </div>
            </div>

            <div style={s.karte}>
              <label style={s.label}>Suchen</label>
              <input
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                placeholder="Name des Betriebs"
                style={s.input}
              />
            </div>

            {gefiltert.length === 0 ? (
              <div style={s.karte}>
                <div style={s.karteTitel}>Noch kein Betrieb sichtbar</div>
                <p style={s.hinweis}>
                  {betriebe.length === 0
                    ? 'Sobald der erste Kunde angelegt ist, steht er hier mit seiner Einrichtungs-Checkliste.'
                    : 'Kein Betrieb passt zu dieser Suche.'}
                </p>
              </div>
            ) : (
              <div style={s.karte}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.tabelle}>
                    <thead>
                      <tr>
                        <th style={s.th}>Betrieb</th>
                        <th style={s.th}>Stand</th>
                        <th style={{ ...s.th, textAlign: 'right' }}>Offen</th>
                        <th style={s.th}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {gefiltert.map((b) => (
                        <tr key={b.id}>
                          <td style={s.td}>
                            <a href={`/admin/command-center/betrieb/${encodeURIComponent(b.id)}`} style={s.link}>
                              {b.name}
                            </a>
                          </td>
                          <td style={{ ...s.td, minWidth: 220 }}>
                            <div style={s.balkenAussen}>
                              <div
                                style={{
                                  ...s.balkenInnen,
                                  width: `${Math.max(2, b.prozent)}%`,
                                  background: b.offen === 0 ? C.green : C.gold,
                                }}
                              />
                            </div>
                            <span style={s.balkenText}>
                              {b.erledigt} von {b.gesamt} · {b.prozent} %
                            </span>
                          </td>
                          <td style={{ ...s.td, textAlign: 'right' }}>
                            <span style={b.offen === 0 ? s.pillOk : s.pillOffen}>
                              {b.offen === 0 ? '✓ fertig' : b.offen}
                            </span>
                          </td>
                          <td style={{ ...s.td, textAlign: 'right' }}>
                            <a href={`/admin/command-center/betrieb/${encodeURIComponent(b.id)}`} style={s.btnCyan}>
                              Akte öffnen
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  kopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 16 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.4rem, 2.4vw, 2.1rem)', fontWeight: 700, color: C.gold, margin: 0 },
  sub: { fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '8px 0 0', maxWidth: '62ch', lineHeight: 1.6 },
  btnGhost: { background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' },

  kpiZeile: { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 },
  kpi: { background: C.navy2, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 20px', fontFamily: 'DM Sans, sans-serif', minWidth: 150, color: '#fff', fontSize: 22, fontWeight: 700 },
  kpiText: { display: 'block', color: C.textDim, fontSize: 13, fontWeight: 400, marginTop: 2 },

  karte: { background: C.navy2, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '18px 22px', marginBottom: 18, fontFamily: 'DM Sans, sans-serif' },
  karteTitel: { fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, color: '#fff', fontSize: '1.15rem', marginBottom: 12 },
  label: { display: 'block', color: C.textDim, fontSize: 13, fontWeight: 700, marginBottom: 6 },
  input: { background: C.navy, color: '#fff', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: 15, width: '100%', maxWidth: 460, boxSizing: 'border-box' },
  hinweis: { color: C.textDim, fontSize: 13, lineHeight: 1.55, margin: '8px 0 0', maxWidth: '68ch' },

  tabelle: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', color: C.textDim, fontSize: 11.5, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '0 12px 8px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' },
  td: { padding: '11px 12px 11px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#fff', verticalAlign: 'middle' },
  link: { color: '#fff', textDecoration: 'none', fontWeight: 700 },

  balkenAussen: { background: 'rgba(255,255,255,0.08)', borderRadius: 999, height: 7, overflow: 'hidden', maxWidth: 220 },
  balkenInnen: { height: '100%', borderRadius: 999 },
  balkenText: { display: 'block', color: C.textDim, fontSize: 12, marginTop: 5 },

  pillOk: { color: C.green, border: `1px solid ${C.green}`, borderRadius: 12, padding: '3px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  pillOffen: { color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 12, padding: '3px 12px', fontSize: 12.5, fontWeight: 700 },

  btnCyan: { background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10, padding: '7px 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5, textDecoration: 'none', whiteSpace: 'nowrap' },

  hint: { color: C.textDim, fontFamily: 'DM Sans, sans-serif', padding: 20 },
  fehlerBox: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: `1px solid ${C.danger}55`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: 'DM Sans, sans-serif' },
};
