'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// ============================================================================
// ARGONAUT OS · Command Center · Belege · UploadWidget.tsx  (Block B3b)
// Beleg-Foto/PDF hochladen → POST /api/beleg-upload → KI-Vorschlag anzeigen →
// Liste aktualisieren (router.refresh). Der Beleg wird als unbestätigt
// gespeichert; Bestätigen/Korrigieren folgt in B3c. Nur Martin (Route sperrt).
// Props: ansicht — als art-Hinweis an die KI (geschäftlich/privat).
// ============================================================================

const C = {
  gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D', text: '#E8EDF4',
  dim: 'rgba(255,255,255,0.45)', border: 'rgba(201,168,76,0.16)', card: 'rgba(255,255,255,0.04)',
};

type Vorschlag = {
  haendler?: string | null; datum?: string | null; kategorie?: string | null;
  betrag_brutto?: number | null; art?: string | null; richtung?: string | null;
  absetzbar_prozent?: number | null; abschreibung?: string | null; afa_jahre?: number | null;
  modell?: string | null;
};

function eur(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n) : '—';
}

export default function UploadWidget({ ansicht }: { ansicht: 'geschaeftlich' | 'privat' }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'laedt' | 'fertig' | 'fehler'>('idle');
  const [fehler, setFehler] = useState<string>('');
  const [vorschlag, setVorschlag] = useState<Vorschlag | null>(null);
  const [dateiName, setDateiName] = useState<string>('');

  async function hochladen(datei: File) {
    setStatus('laedt');
    setFehler('');
    setVorschlag(null);
    setDateiName(datei.name);
    try {
      const fd = new FormData();
      fd.append('datei', datei);
      fd.append('art', ansicht);
      const res = await fetch('/api/beleg-upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setStatus('fehler');
        setFehler(typeof data?.error === 'string' ? data.error : 'Upload fehlgeschlagen.');
        return;
      }
      setVorschlag((data.vorschlag || data.beleg?.ki_vorschlag || {}) as Vorschlag);
      setStatus('fertig');
      router.refresh(); // Liste + EÜR unten aktualisieren
    } catch {
      setStatus('fehler');
      setFehler('Netzwerkfehler. Bitte erneut versuchen.');
    }
  }

  function aufAuswahl(e: React.ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    if (datei) hochladen(datei);
    e.target.value = ''; // gleiche Datei erneut wählbar
  }

  const laedt = status === 'laedt';

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 'clamp(16px,1.8vw,22px)', marginBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: '1.05rem' }}>Beleg hochladen</div>
          <div style={{ color: C.dim, fontSize: '0.85rem', marginTop: 4 }}>
            Foto oder PDF — das KI-Auge liest Händler, Betrag, Kategorie und schlägt die Verbuchung vor
            {' '}({ansicht === 'privat' ? 'privat' : 'geschäftlich'}).
          </div>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={laedt}
          style={{
            background: laedt ? 'rgba(201,168,76,0.4)' : C.gold, color: '#0A1628', border: 'none',
            borderRadius: 10, padding: '0.7rem 1.3rem', fontWeight: 700, fontSize: '0.95rem',
            cursor: laedt ? 'default' : 'pointer', fontFamily: 'var(--font-syne), sans-serif', whiteSpace: 'nowrap',
          }}
        >
          {laedt ? 'KI liest den Beleg …' : '📎 Beleg auswählen'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          onChange={aufAuswahl}
          style={{ display: 'none' }}
        />
      </div>

      {laedt && (
        <div style={{ color: C.cyan, fontSize: '0.85rem', marginTop: 14 }}>
          „{dateiName}" wird hochgeladen und klassifiziert — einen Moment.
        </div>
      )}

      {status === 'fehler' && (
        <div style={{ color: '#e06666', fontSize: '0.85rem', marginTop: 14, border: '1px solid rgba(224,102,102,0.35)', borderRadius: 10, padding: '0.6rem 0.8rem' }}>
          {fehler}
        </div>
      )}

      {status === 'fertig' && vorschlag && (
        <div style={{ marginTop: 16, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.9rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ color: C.green, fontWeight: 700, fontSize: '0.9rem' }}>✓ Gespeichert</span>
            <span style={{ fontSize: '0.72rem', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 6, padding: '0.05rem 0.4rem' }}>KI-Vorschlag · unbestätigt</span>
            {vorschlag.modell && <span style={{ fontSize: '0.72rem', color: C.dim }}>Modell: {vorschlag.modell}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.6rem 1.2rem' }}>
            <Feld label="Händler" wert={vorschlag.haendler || '—'} />
            <Feld label="Datum" wert={vorschlag.datum || '—'} />
            <Feld label="Kategorie" wert={vorschlag.kategorie || '—'} />
            <Feld label="Betrag" wert={eur(vorschlag.betrag_brutto)} />
            <Feld label="Art" wert={vorschlag.art === 'privat' ? 'privat' : 'geschäftlich'} />
            <Feld label="Richtung" wert={vorschlag.richtung === 'einnahme' ? 'Einnahme' : 'Ausgabe'} />
            <Feld label="Absetzbar" wert={`${Number(vorschlag.absetzbar_prozent) || 0} %`} />
            <Feld
              label="Abschreibung"
              wert={vorschlag.abschreibung === 'afa' ? `AfA${vorschlag.afa_jahre ? ` · ${vorschlag.afa_jahre} J.` : ''}` : 'sofort'}
            />
          </div>
          <div style={{ color: C.dim, fontSize: '0.78rem', marginTop: 12 }}>
            Der Beleg steht jetzt unten in der Liste. Bestätigen bzw. korrigieren kannst du ihn im nächsten Schritt.
          </div>
        </div>
      )}
    </div>
  );
}

function Feld({ label, wert }: { label: string; wert: string }) {
  return (
    <div>
      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem' }}>{label}</div>
      <div style={{ color: '#E8EDF4', fontWeight: 600, fontSize: '0.92rem', marginTop: 2 }}>{wert}</div>
    </div>
  );
}
