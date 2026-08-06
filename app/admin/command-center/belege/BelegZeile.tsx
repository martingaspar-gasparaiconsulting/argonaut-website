'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ============================================================================
// ARGONAUT OS · Command Center · Belege · BelegZeile.tsx  (Block B3c)
// Eine Beleg-Zeile: Anzeige mit [Bestätigen]/[Korrigieren]; im Bearbeiten-Modus
// ein Formular für alle Felder. Speichert über /api/beleg-bestaetigen und
// aktualisiert Liste + EÜR (router.refresh). Guards (privat 0 %, GWG, netto=brutto)
// erzwingt die Route serverseitig — hier nur Eingabe.
// ============================================================================

const C = {
  gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D', text: '#E8EDF4',
  dim: 'rgba(255,255,255,0.45)', border: 'rgba(201,168,76,0.16)', card: 'rgba(255,255,255,0.04)',
};

export type Beleg = {
  id: string;
  art: string | null;
  richtung: string | null;
  datum: string | null;
  haendler: string | null;
  beschreibung: string | null;
  kategorie: string | null;
  betrag_brutto: number | null;
  absetzbar_prozent: number | null;
  abschreibung: string | null;
  afa_jahre: number | null;
  bestaetigt: boolean | null;
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

const inputStil: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`,
  borderRadius: 8, padding: '0.45rem 0.6rem', color: C.text, fontSize: '0.88rem', fontFamily: 'inherit',
};
const labelStil: React.CSSProperties = { color: C.dim, fontSize: '0.72rem', marginBottom: 3, display: 'block' };

export default function BelegZeile({ beleg, bild }: { beleg: Beleg; bild?: string }) {
  const router = useRouter();
  const [modus, setModus] = useState<'anzeige' | 'bearbeiten'>('anzeige');
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState('');

  // Formular-Zustand (nur im Bearbeiten-Modus genutzt).
  const [f, setF] = useState({
    haendler: beleg.haendler || '',
    datum: beleg.datum || '',
    kategorie: beleg.kategorie || '',
    betrag_brutto: beleg.betrag_brutto != null ? String(beleg.betrag_brutto) : '',
    art: beleg.art === 'privat' ? 'privat' : 'geschaeftlich',
    richtung: beleg.richtung === 'einnahme' ? 'einnahme' : 'ausgabe',
    absetzbar_prozent: beleg.absetzbar_prozent != null ? String(beleg.absetzbar_prozent) : '',
    abschreibung: beleg.abschreibung === 'afa' ? 'afa' : 'sofort',
    afa_jahre: beleg.afa_jahre != null ? String(beleg.afa_jahre) : '',
    beschreibung: beleg.beschreibung || '',
  });
  const setk = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((alt) => ({ ...alt, [k]: e.target.value }));

  async function senden(payload: Record<string, unknown>) {
    setLaedt(true);
    setFehler('');
    try {
      const res = await fetch('/api/beleg-bestaetigen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: beleg.id, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setFehler(typeof data?.error === 'string' ? data.error : 'Speichern fehlgeschlagen.');
        setLaedt(false);
        return;
      }
      setModus('anzeige');
      setLaedt(false);
      router.refresh();
    } catch {
      setFehler('Netzwerkfehler. Bitte erneut versuchen.');
      setLaedt(false);
    }
  }

  const bestaetigen = () => senden({ bestaetigt: true });
  const speichern = () => senden({
    bestaetigt: true,
    felder: {
      haendler: f.haendler, datum: f.datum, kategorie: f.kategorie,
      betrag_brutto: f.betrag_brutto, art: f.art, richtung: f.richtung,
      absetzbar_prozent: f.absetzbar_prozent, abschreibung: f.abschreibung,
      afa_jahre: f.afa_jahre, beschreibung: f.beschreibung,
    },
  });

  const istEinnahme = beleg.richtung === 'einnahme';

  // ── Bearbeiten-Modus ─────────────────────────────────────────────────────
  if (modus === 'bearbeiten') {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.gold}`, borderRadius: 14, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.7rem 1rem' }}>
          <div><label style={labelStil}>Händler</label><input style={inputStil} value={f.haendler} onChange={setk('haendler')} /></div>
          <div><label style={labelStil}>Datum</label><input type="date" style={inputStil} value={f.datum} onChange={setk('datum')} /></div>
          <div><label style={labelStil}>Kategorie</label><input style={inputStil} value={f.kategorie} onChange={setk('kategorie')} /></div>
          <div><label style={labelStil}>Betrag (brutto €)</label><input type="number" step="0.01" inputMode="decimal" style={inputStil} value={f.betrag_brutto} onChange={setk('betrag_brutto')} /></div>
          <div>
            <label style={labelStil}>Art</label>
            <select style={inputStil} value={f.art} onChange={setk('art')}>
              <option value="geschaeftlich">geschäftlich</option>
              <option value="privat">privat</option>
            </select>
          </div>
          <div>
            <label style={labelStil}>Richtung</label>
            <select style={inputStil} value={f.richtung} onChange={setk('richtung')}>
              <option value="ausgabe">Ausgabe</option>
              <option value="einnahme">Einnahme</option>
            </select>
          </div>
          <div><label style={labelStil}>Absetzbar (%)</label><input type="number" min="0" max="100" style={inputStil} value={f.absetzbar_prozent} onChange={setk('absetzbar_prozent')} /></div>
          <div>
            <label style={labelStil}>Abschreibung</label>
            <select style={inputStil} value={f.abschreibung} onChange={setk('abschreibung')}>
              <option value="sofort">sofort</option>
              <option value="afa">AfA</option>
            </select>
          </div>
          <div><label style={labelStil}>AfA-Jahre</label><input type="number" min="1" style={inputStil} value={f.afa_jahre} onChange={setk('afa_jahre')} disabled={f.abschreibung !== 'afa'} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={labelStil}>Beschreibung</label><input style={inputStil} value={f.beschreibung} onChange={setk('beschreibung')} /></div>
        </div>
        <div style={{ color: C.dim, fontSize: '0.72rem', marginTop: 8 }}>
          Hinweis: privat wird immer 0 % absetzbar; bis 800 € netto gilt „sofort" (GWG). Das stellt das System automatisch sicher.
        </div>
        {fehler && <div style={{ color: '#e06666', fontSize: '0.82rem', marginTop: 8 }}>{fehler}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => { setModus('anzeige'); setFehler(''); }} disabled={laedt}
            style={{ background: 'transparent', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.5rem 1rem', fontWeight: 600, cursor: 'pointer' }}>
            Abbrechen
          </button>
          <button type="button" onClick={speichern} disabled={laedt}
            style={{ background: C.gold, color: '#0A1628', border: 'none', borderRadius: 8, padding: '0.5rem 1.1rem', fontWeight: 700, cursor: laedt ? 'default' : 'pointer', fontFamily: 'var(--font-syne), sans-serif' }}>
            {laedt ? 'Speichert …' : 'Speichern & bestätigen'}
          </button>
        </div>
      </div>
    );
  }

  // ── Anzeige-Modus ────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: '1rem', alignItems: 'center', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '0.85rem 1rem' }}>
      <div style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {bild ? <img src={bild} alt="Beleg" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: C.dim, fontSize: '1.4rem' }}>🧾</span>}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{beleg.haendler || 'Ohne Händler'}</span>
          {beleg.kategorie && <span style={{ fontSize: '0.72rem', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 6, padding: '0.05rem 0.4rem' }}>{beleg.kategorie}</span>}
          {!beleg.bestaetigt && <span style={{ fontSize: '0.72rem', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 6, padding: '0.05rem 0.4rem' }}>KI-Vorschlag</span>}
        </div>
        <div style={{ color: C.dim, fontSize: '0.82rem', marginTop: '0.2rem' }}>
          {datumDe(beleg.datum)} · {istEinnahme ? 'Einnahme' : 'Ausgabe'}
          {!istEinnahme && ` · ${Number(beleg.absetzbar_prozent) || 0}% absetzbar`}
          {beleg.abschreibung === 'afa' && beleg.afa_jahre ? ` · AfA ${beleg.afa_jahre} J.` : beleg.abschreibung === 'afa' ? ' · AfA' : ''}
        </div>
        {fehler && <div style={{ color: '#e06666', fontSize: '0.78rem', marginTop: 4 }}>{fehler}</div>}
      </div>
      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, fontSize: '1.05rem', color: istEinnahme ? C.green : C.text }}>
          {istEinnahme ? '+' : '−'}{eur(beleg.betrag_brutto).replace('-', '')}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!beleg.bestaetigt && (
            <button type="button" onClick={bestaetigen} disabled={laedt}
              style={{ background: C.green, color: '#0A1628', border: 'none', borderRadius: 8, padding: '0.35rem 0.7rem', fontWeight: 700, fontSize: '0.8rem', cursor: laedt ? 'default' : 'pointer' }}>
              {laedt ? '…' : '✓ Bestätigen'}
            </button>
          )}
          <button type="button" onClick={() => setModus('bearbeiten')} disabled={laedt}
            style={{ background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.35rem 0.7rem', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
            {beleg.bestaetigt ? 'Korrigieren' : 'Bearbeiten'}
          </button>
        </div>
        {beleg.bestaetigt && <div style={{ fontSize: '0.72rem', color: C.green }}>✓ bestätigt</div>}
      </div>
    </div>
  );
}
