'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ============================================================================
// ARGONAUT OS · Command Center · Verträge · VertragZeile.tsx  (Block C3)
// Eine Vertrags-Zeile: Anzeige mit [Bearbeiten] + [aktiv/inaktiv]; im Bearbeiten-
// Modus ein Formular. Speichert/schaltet über /api/vertrag-speichern und
// aktualisiert Liste + Kennzahlen (router.refresh). Nicht-destruktiv.
// ============================================================================

const C = {
  gold: '#C9A84C', green: '#4CAF7D', text: '#E8EDF4', dim: 'rgba(255,255,255,0.45)',
  border: 'rgba(201,168,76,0.16)', card: 'rgba(255,255,255,0.04)',
};
const inputStil: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`,
  borderRadius: 8, padding: '0.45rem 0.6rem', color: C.text, fontSize: '0.88rem', fontFamily: 'inherit',
};
const labelStil: React.CSSProperties = { color: C.dim, fontSize: '0.72rem', marginBottom: 3, display: 'block' };

export type Vertrag = {
  id: string;
  anbieter: string | null;
  bezeichnung: string | null;
  kategorie: string | null;
  art: string | null;
  betrag: number | null;
  intervall: string | null;
  absetzbar_prozent: number | null;
  start_datum: string | null;
  ende_datum: string | null;
  aktiv: boolean | null;
  notiz: string | null;
};

function eur(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n) : '—';
}
function datumDe(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function proMonat(v: Vertrag): number {
  const b = Number(v.betrag);
  if (!Number.isFinite(b)) return 0;
  return v.intervall === 'jahr' ? b / 12 : b;
}

export default function VertragZeile({ vertrag }: { vertrag: Vertrag }) {
  const router = useRouter();
  const [modus, setModus] = useState<'anzeige' | 'bearbeiten'>('anzeige');
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState('');
  const [f, setF] = useState({
    anbieter: vertrag.anbieter || '',
    bezeichnung: vertrag.bezeichnung || '',
    kategorie: vertrag.kategorie || '',
    art: vertrag.art === 'privat' ? 'privat' : 'geschaeftlich',
    betrag: vertrag.betrag != null ? String(vertrag.betrag) : '',
    intervall: vertrag.intervall === 'jahr' ? 'jahr' : 'monat',
    absetzbar_prozent: vertrag.absetzbar_prozent != null ? String(vertrag.absetzbar_prozent) : '',
    start_datum: vertrag.start_datum || '',
    ende_datum: vertrag.ende_datum || '',
    notiz: vertrag.notiz || '',
  });
  const setk = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((alt) => ({ ...alt, [k]: e.target.value }));

  async function senden(payload: Record<string, unknown>) {
    setLaedt(true);
    setFehler('');
    try {
      const res = await fetch('/api/vertrag-speichern', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: vertrag.id, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) { setFehler(typeof data?.error === 'string' ? data.error : 'Fehlgeschlagen.'); setLaedt(false); return; }
      setModus('anzeige');
      setLaedt(false);
      router.refresh();
    } catch {
      setFehler('Netzwerkfehler. Bitte erneut versuchen.');
      setLaedt(false);
    }
  }

  const inaktiv = vertrag.aktiv === false;

  if (modus === 'bearbeiten') {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.gold}`, borderRadius: 14, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.7rem 1rem' }}>
          <div><label style={labelStil}>Anbieter</label><input style={inputStil} value={f.anbieter} onChange={setk('anbieter')} /></div>
          <div><label style={labelStil}>Bezeichnung</label><input style={inputStil} value={f.bezeichnung} onChange={setk('bezeichnung')} /></div>
          <div><label style={labelStil}>Kategorie</label><input style={inputStil} value={f.kategorie} onChange={setk('kategorie')} /></div>
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
        {fehler && <div style={{ color: '#e06666', fontSize: '0.82rem', marginTop: 8 }}>{fehler}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => { setModus('anzeige'); setFehler(''); }} disabled={laedt}
            style={{ background: 'transparent', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.5rem 1rem', fontWeight: 600, cursor: 'pointer' }}>Abbrechen</button>
          <button type="button" onClick={() => senden({ felder: f })} disabled={laedt}
            style={{ background: C.gold, color: '#0A1628', border: 'none', borderRadius: 8, padding: '0.5rem 1.1rem', fontWeight: 700, cursor: laedt ? 'default' : 'pointer', fontFamily: 'var(--font-syne), sans-serif' }}>
            {laedt ? 'Speichert …' : 'Speichern'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'center', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '0.85rem 1rem', opacity: inaktiv ? 0.55 : 1 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{vertrag.anbieter || 'Ohne Anbieter'}</span>
          {vertrag.bezeichnung && <span style={{ color: C.dim, fontSize: '0.85rem' }}>· {vertrag.bezeichnung}</span>}
          {vertrag.kategorie && <span style={{ fontSize: '0.72rem', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 6, padding: '0.05rem 0.4rem' }}>{vertrag.kategorie}</span>}
          {inaktiv && <span style={{ fontSize: '0.72rem', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 6, padding: '0.05rem 0.4rem' }}>inaktiv</span>}
        </div>
        <div style={{ color: C.dim, fontSize: '0.82rem', marginTop: '0.2rem' }}>
          {vertrag.intervall === 'jahr' ? 'jährlich' : 'monatlich'} · {Number(vertrag.absetzbar_prozent) || 0}% absetzbar
          {vertrag.start_datum ? ` · ab ${datumDe(vertrag.start_datum)}` : ''}
          {vertrag.ende_datum ? ` · bis ${datumDe(vertrag.ende_datum)}` : ''}
        </div>
        {fehler && <div style={{ color: '#e06666', fontSize: '0.78rem', marginTop: 4 }}>{fehler}</div>}
      </div>
      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: '1.05rem' }}>
          {eur(proMonat(vertrag))}<span style={{ color: C.dim, fontSize: '0.75rem', fontWeight: 400 }}> / Mon.</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => senden({ aktiv: inaktiv })} disabled={laedt}
            style={{ background: 'transparent', color: inaktiv ? C.green : C.dim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.35rem 0.7rem', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
            {inaktiv ? 'Aktivieren' : 'Deaktivieren'}
          </button>
          <button type="button" onClick={() => setModus('bearbeiten')} disabled={laedt}
            style={{ background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.35rem 0.7rem', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
            Bearbeiten
          </button>
        </div>
      </div>
    </div>
  );
}
