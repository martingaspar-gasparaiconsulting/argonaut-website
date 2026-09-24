'use client';

// ============================================================
// ARGONAUT OS · BewertungAntwort (Paket PA · B15)
// Ein Knopf, der eine öffentliche Antwort auf eine Kundenbewertung
// vorformuliert. Der Text erscheint in einem Feld zum Ändern und Kopieren —
// veröffentlicht wird von Hand (Google, eigene Website …).
// Regeln der Antwort stehen in lib/sachbearbeiter.ts (systemBewertung):
// Sie-Form, nicht streiten, keine Auftragsdetails, keine Preise.
// ============================================================

import { useState, CSSProperties } from 'react';

const C = {
  navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

export default function BewertungAntwort({
  sterne, text, plattform, knopfText = '✍ Antwort entwerfen',
}: { sterne: number | null; text: string | null; plattform?: string; knopfText?: string }) {
  const [entwurf, setEntwurf] = useState('');
  const [hinweise, setHinweise] = useState<string[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);

  async function entwerfen() {
    setLaeuft(true); setFehler(null); setKopiert(false);
    try {
      const r = await fetch('/api/sachbearbeiter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modus: 'bewertung', sterne, text: text || '', plattform: plattform || '' }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) { setFehler(j?.error || 'Die Antwort konnte nicht erstellt werden.'); return; }
      setEntwurf(String(j.text || ''));
      setHinweise(Array.isArray(j.hinweise) ? j.hinweise : []);
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setLaeuft(false); }
  }

  function kopiere() {
    try { void navigator.clipboard.writeText(entwurf); setKopiert(true); setTimeout(() => setKopiert(false), 1600); } catch { /* egal */ }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={() => void entwerfen()} disabled={laeuft} style={{ ...s.knopf, opacity: laeuft ? 0.55 : 1 }}>
        {laeuft ? '⏳ Formuliere …' : entwurf ? '↻ Neu formulieren' : knopfText}
      </button>
      {fehler && <div style={s.err}>{fehler}</div>}
      {entwurf && (
        <div style={{ marginTop: 10 }}>
          <textarea value={entwurf} onChange={(e) => setEntwurf(e.target.value)} rows={5} style={s.feld} />
          {hinweise.length > 0 && (
            <ul style={s.hinweise}>{hinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <button onClick={kopiere} style={s.knopf}>{kopiert ? '✓ Kopiert' : '📋 Kopieren'}</button>
            <span style={{ color: C.textDim, fontSize: 12.5 }}>Vor dem Veröffentlichen bitte lesen — die Antwort ist öffentlich.</span>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  knopf: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },
  feld: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14.5, fontFamily: 'inherit', lineHeight: 1.55, resize: 'vertical' },
  hinweise: { color: C.warn, fontSize: 13, lineHeight: 1.5, margin: '8px 0 0', paddingLeft: 18 },
  err: { color: C.danger, fontSize: 13.5, marginTop: 8 },
};
