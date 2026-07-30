'use client';

import { useEffect, useState, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { emailNormalisieren, istEmailGueltig, zaehleAbonnenten } from '@/lib/newsletter';

// ============================================================
// ARGONAUT OS · MARKETING · Newsletter (Punkt 29a)
// Abonnenten-Liste + manuelle Pflege. Versand + öffentliche
// Abmeldung folgen in Punkt 29b.
// ============================================================

const C = {
  navy: '#0A1628',
  navy2: '#0F1F33',
  gold: '#C9A84C',
  cyan: '#00e5ff',
  green: '#4CAF7D',
  danger: '#E06666',
  warn: '#E0A24C',
  textDim: '#8FA3BE',
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type Abonnent = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  quelle: string | null;
  angemeldet_am: string;
  abgemeldet_am: string | null;
};

function fmtDatum(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function NewsletterAbonnenten() {
  const [liste, setListe] = useState<Abonnent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [fEmail, setFEmail] = useState('');
  const [fName, setFName] = useState('');
  const [speichern, setSpeichern] = useState(false);
  const [hinweis, setHinweis] = useState<string | null>(null);

  async function laden() {
    setLoading(true);
    setFehler(null);
    const { data, error } = await supabase
      .from('newsletter_abonnenten')
      .select('*')
      .order('angemeldet_am', { ascending: false });
    if (error) {
      setFehler(error.message);
      setListe([]);
    } else {
      setListe((data ?? []) as Abonnent[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    laden();
  }, []);

  const kpi = useMemo(() => zaehleAbonnenten(liste), [liste]);

  async function hinzufuegen() {
    setHinweis(null);
    const email = emailNormalisieren(fEmail);
    if (!istEmailGueltig(email)) {
      setHinweis('Bitte eine gültige E-Mail-Adresse eingeben.');
      return;
    }
    setSpeichern(true);
    const { error } = await supabase.from('newsletter_abonnenten').insert({
      email,
      name: fName.trim() || null,
      quelle: 'manuell',
    });
    setSpeichern(false);
    if (error) {
      // 23505 = Unique-Verletzung (E-Mail schon in der Liste dieses Kontos)
      if ((error as { code?: string }).code === '23505') {
        setHinweis('Diese E-Mail steht bereits in deiner Liste.');
      } else {
        setHinweis('Fehler beim Speichern: ' + error.message);
      }
      return;
    }
    setFEmail('');
    setFName('');
    laden();
  }

  async function statusSetzen(a: Abonnent, neu: 'aktiv' | 'abgemeldet') {
    const { error } = await supabase
      .from('newsletter_abonnenten')
      .update({
        status: neu,
        abgemeldet_am: neu === 'abgemeldet' ? new Date().toISOString() : null,
      })
      .eq('id', a.id);
    if (error) {
      alert('Fehler: ' + error.message);
      return;
    }
    laden();
  }

  async function loeschen(a: Abonnent) {
    if (!confirm(`„${a.email}" wirklich aus der Liste löschen?`)) return;
    const { error } = await supabase.from('newsletter_abonnenten').delete().eq('id', a.id);
    if (error) {
      alert('Fehler: ' + error.message);
      return;
    }
    laden();
  }

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Kopf */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(32px, 2.81vw, 45px)', fontWeight: 700, color: C.gold, margin: 0 }}>
              ✉️ Newsletter
            </h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0' }}>
              Deine Empfänger-Liste. Versand & Abmelde-Seite folgen im nächsten Schritt.
            </p>
          </div>
          <a
            href="/dashboard/marketing"
            style={{ background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none' }}
          >
            ‹ Zurück zum Marketing
          </a>
        </div>

        {/* KPI-Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, margin: '20px 0 24px' }}>
          {[
            { label: 'Abonnenten gesamt', wert: kpi.gesamt, farbe: C.cyan },
            { label: 'Aktiv', wert: kpi.aktiv, farbe: C.green },
            { label: 'Abgemeldet', wert: kpi.abgemeldet, farbe: C.textDim },
          ].map((kp) => (
            <div key={kp.label} style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(34px, 3vw, 48px)', fontWeight: 700, color: kp.farbe }}>
                {kp.wert}
              </div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
                {kp.label}
              </div>
            </div>
          ))}
        </div>

        {/* Hinzufügen */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '20px 24px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(17px, 1.5vw, 24px)', marginBottom: 14 }}>
            Abonnent hinzufügen
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '2 1 240px' }}>
              <label style={labelStyle}>E-Mail *</label>
              <input value={fEmail} onChange={(e) => setFEmail(e.target.value)} placeholder="kunde@beispiel.de" style={inputStyle} />
            </div>
            <div style={{ flex: '2 1 200px' }}>
              <label style={labelStyle}>Name (optional)</label>
              <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="z. B. Maria Muster" style={inputStyle} />
            </div>
            <button
              onClick={hinzufuegen}
              disabled={speichern}
              style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 24px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, cursor: speichern ? 'wait' : 'pointer', opacity: speichern ? 0.7 : 1, height: 44 }}
            >
              {speichern ? 'Speichere…' : '+ Hinzufügen'}
            </button>
          </div>
          {hinweis && (
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.warn, margin: '12px 0 0', fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
              {hinweis}
            </p>
          )}
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '12px 0 0', fontSize: 'clamp(12px, 1vw, 16px)' }}>
            Hinweis: Newsletter nur an Empfänger senden, die zugestimmt haben (§7 UWG). Später melden sich Abonnenten selbst über das E-Book-Formular an.
          </p>
        </div>

        {/* Liste */}
        {loading ? (
          <p style={{ color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Lade Abonnenten…</p>
        ) : fehler ? (
          <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: 18, color: C.danger, fontFamily: 'DM Sans, sans-serif' }}>
            Fehler beim Laden: {fehler}
          </div>
        ) : liste.length === 0 ? (
          <div style={{ background: C.navy2, borderRadius: 14, padding: '48px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(16px, 1.38vw, 22px)' }}>
              Noch keine Abonnenten. Füge oben deinen ersten Empfänger hinzu.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {liste.map((a) => {
              const abgemeldet = a.status === 'abgemeldet';
              return (
                <div key={a.id} style={{ background: C.navy2, borderRadius: 12, padding: '14px 18px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(15px, 1.31vw, 21px)' }}>
                        {a.email}
                      </span>
                      <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.06vw, 16px)', color: abgemeldet ? C.textDim : C.green, border: `1px solid ${abgemeldet ? C.textDim : C.green}`, borderRadius: 12, padding: '2px 10px' }}>
                        {abgemeldet ? 'Abgemeldet' : 'Aktiv'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.06vw, 16px)', color: C.textDim, marginTop: 4 }}>
                      {a.name && <span>{a.name}</span>}
                      <span>Quelle: {a.quelle ?? '—'}</span>
                      <span>Seit: {fmtDatum(a.angemeldet_am)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {abgemeldet ? (
                      <button onClick={() => statusSetzen(a, 'aktiv')} style={btnStyle(C.green)}>Reaktivieren</button>
                    ) : (
                      <button onClick={() => statusSetzen(a, 'abgemeldet')} style={btnStyle(C.warn)}>Abmelden</button>
                    )}
                    <button onClick={() => loeschen(a)} style={btnStyle(C.textDim)}>Löschen</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 'clamp(13px, 1.13vw, 18px)',
  color: '#8FA3BE',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0F1F33',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 9,
  padding: '10px 12px',
  color: '#fff',
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 'clamp(14px, 1.25vw, 20px)',
  boxSizing: 'border-box',
};

function btnStyle(farbe: string): React.CSSProperties {
  return {
    background: 'transparent',
    color: farbe,
    border: `1px solid ${farbe}`,
    borderRadius: 8,
    padding: '7px 13px',
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 'clamp(13px, 1.13vw, 18px)',
    cursor: 'pointer',
  };
}
