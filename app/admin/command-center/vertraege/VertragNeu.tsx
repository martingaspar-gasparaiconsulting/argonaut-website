'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ============================================================================
// ARGONAUT OS · Command Center · Verträge · VertragNeu.tsx  (Block C3)
// „+ Vertrag hinzufügen" — Formular, das über /api/vertrag-speichern anlegt und
// die Liste + Kennzahlen aktualisiert (router.refresh). Nur Martin (Route sperrt).
// ============================================================================

const C = {
  gold: '#C9A84C', text: '#E8EDF4', dim: 'rgba(255,255,255,0.45)',
  border: 'rgba(201,168,76,0.16)', card: 'rgba(255,255,255,0.04)',
};
const inputStil: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`,
  borderRadius: 8, padding: '0.45rem 0.6rem', color: C.text, fontSize: '0.88rem', fontFamily: 'inherit',
};
const labelStil: React.CSSProperties = { color: C.dim, fontSize: '0.72rem', marginBottom: 3, display: 'block' };

const leer = (art: 'geschaeftlich' | 'privat') => ({
  anbieter: '', bezeichnung: '', kategorie: '', art, betrag: '',
  intervall: 'monat', absetzbar_prozent: art === 'privat' ? '0' : '100',
  start_datum: '', ende_datum: '', notiz: '',
});

export default function VertragNeu({ ansicht }: { ansicht: 'geschaeftlich' | 'privat' }) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState('');
  const [f, setF] = useState(leer(ansicht));

  const setk = (k: keyof ReturnType<typeof leer>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((alt) => ({ ...alt, [k]: e.target.value }));

  async function speichern() {
    if (!f.anbieter.trim() && !f.bezeichnung.trim()) { setFehler('Bitte mindestens Anbieter oder Bezeichnung angeben.'); return; }
    setLaedt(true);
    setFehler('');
    try {
      const res = await fetch('/api/vertrag-speichern', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ felder: f }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) { setFehler(typeof data?.error === 'string' ? data.error : 'Speichern fehlgeschlagen.'); setLaedt(false); return; }
      setF(leer(ansicht));
      setOffen(false);
      setLaedt(false);
      router.refresh();
    } catch {
      setFehler('Netzwerkfehler. Bitte erneut versuchen.');
      setLaedt(false);
    }
  }

  if (!offen) {
    return (
      <button type="button" onClick={() => { setF(leer(ansicht)); setOffen(true); }}
        style={{ background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '0.6rem 1.2rem', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'var(--font-syne), sans-serif', marginBottom: '1.5rem' }}>
        + Vertrag hinzufügen
      </button>
    );
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.gold}`, borderRadius: 14, padding: '1rem 1.1rem', marginBottom: '1.5rem' }}>
      <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: '1rem', marginBottom: 12 }}>Neuer Vertrag</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.7rem 1rem' }}>
        <div><label style={labelStil}>Anbieter</label><input style={inputStil} value={f.anbieter} onChange={setk('anbieter')} placeholder="z. B. Vercel" /></div>
        <div><label style={labelStil}>Bezeichnung</label><input style={inputStil} value={f.bezeichnung} onChange={setk('bezeichnung')} placeholder="z. B. Pro-Hosting" /></div>
        <div><label style={labelStil}>Kategorie</label><input style={inputStil} value={f.kategorie} onChange={setk('kategorie')} placeholder="z. B. Infrastruktur" /></div>
        <div><label style={labelStil}>Betrag (€)</label><input type="number" step="0.01" inputMode="decimal" style={inputStil} value={f.betrag} onChange={setk('betrag')} /></div>
        <div>
          <label style={labelStil}>Intervall</label>
          <select style={inputStil} value={f.intervall} onChange={setk('intervall')}>
            <option value="monat">monatlich</option>
            <option value="jahr">jährlich</option>
          </select>
        </div>
        <div>
          <label style={labelStil}>Art</label>
          <select style={inputStil} value={f.art} onChange={setk('art')}>
            <option value="geschaeftlich">geschäftlich</option>
            <option value="privat">privat</option>
          </select>
        </div>
        <div><label style={labelStil}>Absetzbar (%)</label><input type="number" min="0" max="100" style={inputStil} value={f.absetzbar_prozent} onChange={setk('absetzbar_prozent')} /></div>
        <div><label style={labelStil}>Beginn</label><input type="date" style={inputStil} value={f.start_datum} onChange={setk('start_datum')} /></div>
        <div><label style={labelStil}>Ende (optional)</label><input type="date" style={inputStil} value={f.ende_datum} onChange={setk('ende_datum')} /></div>
        <div style={{ gridColumn: '1 / -1' }}><label style={labelStil}>Notiz</label><input style={inputStil} value={f.notiz} onChange={setk('notiz')} /></div>
      </div>
      <div style={{ color: C.dim, fontSize: '0.72rem', marginTop: 8 }}>privat wird immer 0 % absetzbar (stellt das System sicher).</div>
      {fehler && <div style={{ color: '#e06666', fontSize: '0.82rem', marginTop: 8 }}>{fehler}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => { setOffen(false); setFehler(''); }} disabled={laedt}
          style={{ background: 'transparent', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.5rem 1rem', fontWeight: 600, cursor: 'pointer' }}>Abbrechen</button>
        <button type="button" onClick={speichern} disabled={laedt}
          style={{ background: C.gold, color: '#0A1628', border: 'none', borderRadius: 8, padding: '0.5rem 1.1rem', fontWeight: 700, cursor: laedt ? 'default' : 'pointer', fontFamily: 'var(--font-syne), sans-serif' }}>
          {laedt ? 'Speichert …' : 'Vertrag anlegen'}
        </button>
      </div>
    </div>
  );
}
