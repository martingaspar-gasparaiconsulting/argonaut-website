'use client';

import { useEffect, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// ARGONAUT OS · MODUL 3 MARKETING · M5 KI-Content-Studio
// Briefing -> /api/marketing-content -> Varianten -> bearbeiten
// -> uebernehmen in marketing_inhalte (ki_generiert=true)
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

type KampagneMini = { id: string; name: string };
type Vorschlag = { titel: string; inhalt: string; uebernommen?: boolean };

const TYP_OPTS = [
  { v: 'post', label: 'Social-Post' },
  { v: 'newsletter', label: 'Newsletter' },
  { v: 'anzeige', label: 'Anzeige' },
  { v: 'blog', label: 'Blog-Artikel' },
];
const KANAL_OPTS = ['email', 'instagram', 'facebook', 'linkedin', 'google', 'website', 'print'];
const TON_OPTS = ['professionell', 'locker', 'verkäuferisch', 'sachlich-informativ', 'emotional', 'humorvoll'];
const LAENGE_OPTS = [
  { v: 'kurz', label: 'Kurz' },
  { v: 'mittel', label: 'Mittel' },
  { v: 'lang', label: 'Lang' },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0F1F33',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 9,
  padding: '10px 12px',
  color: '#fff',
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 14,
  boxSizing: 'border-box',
};

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16, flex: 1 }}>
      <label style={{ display: 'block', fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: C.textDim, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

export default function ContentStudio() {
  const [kampagnen, setKampagnen] = useState<KampagneMini[]>([]);

  // Briefing
  const [typ, setTyp] = useState('post');
  const [kanal, setKanal] = useState('instagram');
  const [ziel, setZiel] = useState('');
  const [tonalitaet, setTonalitaet] = useState('professionell');
  const [laenge, setLaenge] = useState('mittel');
  const [anzahl, setAnzahl] = useState(2);
  const [kampagneId, setKampagneId] = useState('');

  // Ergebnis
  const [generiere, setGeneriere] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [vorschlaege, setVorschlaege] = useState<Vorschlag[]>([]);
  const [quellen, setQuellen] = useState<string[]>([]);

  const ladeKampagnen = useCallback(async () => {
    const { data } = await supabase
      .from('marketing_kampagnen').select('id, name').order('created_at', { ascending: false });
    setKampagnen((data ?? []) as KampagneMini[]);
  }, []);

  useEffect(() => { ladeKampagnen(); }, [ladeKampagnen]);

  async function generieren() {
    if (!ziel.trim()) { setFehler('Bitte ein Thema / Ziel angeben.'); return; }
    setGeneriere(true);
    setFehler(null);
    setVorschlaege([]);
    setQuellen([]);
    try {
      const res = await fetch('/api/marketing-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typ, kanal, ziel, tonalitaet, laenge, anzahl }),
      });
      const data = await res.json();
      if (!res.ok) { setFehler(data?.error ?? 'Generierung fehlgeschlagen.'); setGeneriere(false); return; }
      setVorschlaege((data.vorschlaege ?? []).map((v: Vorschlag) => ({ ...v, uebernommen: false })));
      setQuellen(data.quellen ?? []);
    } catch {
      setFehler('Netzwerkfehler. Bitte erneut versuchen.');
    }
    setGeneriere(false);
  }

  function aendere(idx: number, feld: 'titel' | 'inhalt', wert: string) {
    setVorschlaege((prev) => prev.map((v, i) => i === idx ? { ...v, [feld]: wert } : v));
  }

  async function uebernehmen(idx: number) {
    const v = vorschlaege[idx];
    if (!v.titel.trim()) { alert('Bitte einen Titel vergeben.'); return; }
    const payload: Record<string, unknown> = {
      kampagne_id: kampagneId || null,
      titel: v.titel.trim(),
      typ,
      kanal,
      inhalt: v.inhalt,
      status: 'entwurf',
      ki_generiert: true,
    };
    const { error } = await supabase.from('marketing_inhalte').insert(payload);
    if (error) { alert('Fehler: ' + error.message); return; }
    setVorschlaege((prev) => prev.map((x, i) => i === idx ? { ...x, uebernommen: true } : x));
  }

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <a href="/dashboard/marketing" style={{ color: C.cyan, fontFamily: 'DM Sans, sans-serif', fontSize: 14, textDecoration: 'none' }}>
          ← Zurück zu Marketing
        </a>

        <div style={{ margin: '16px 0 24px' }}>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 30, fontWeight: 700, color: C.gold, margin: 0 }}>✨ KI-Content-Studio</h1>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0', fontSize: 14 }}>
            Briefing eingeben — die KI schreibt im Markenton aus eurem Firmen-Wissen. Du gibst frei.
          </p>
        </div>

        {/* Briefing-Karte */}
        <div style={{ background: C.navy2, borderRadius: 16, padding: '26px 28px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 28 }}>
          <Feld label="Thema / Ziel *">
            <textarea
              value={ziel}
              onChange={(e) => setZiel(e.target.value)}
              rows={2}
              placeholder="z. B. Herbst-Aktion bewerben: professionelle Holzernte, Termine sichern"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Feld>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Feld label="Format">
              <select value={typ} onChange={(e) => setTyp(e.target.value)} style={inputStyle}>
                {TYP_OPTS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
            </Feld>
            <Feld label="Kanal">
              <select value={kanal} onChange={(e) => setKanal(e.target.value)} style={inputStyle}>
                {KANAL_OPTS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Feld>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Feld label="Tonalität">
              <select value={tonalitaet} onChange={(e) => setTonalitaet(e.target.value)} style={inputStyle}>
                {TON_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Feld>
            <Feld label="Länge">
              <select value={laenge} onChange={(e) => setLaenge(e.target.value)} style={inputStyle}>
                {LAENGE_OPTS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
              </select>
            </Feld>
            <Feld label="Varianten">
              <select value={anzahl} onChange={(e) => setAnzahl(Number(e.target.value))} style={inputStyle}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </Feld>
          </div>

          <Feld label="Kampagne (optional — beim Übernehmen zugeordnet)">
            <select value={kampagneId} onChange={(e) => setKampagneId(e.target.value)} style={inputStyle}>
              <option value="">— keine —</option>
              {kampagnen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </Feld>

          <button
            onClick={generieren}
            disabled={generiere}
            style={{
              marginTop: 8,
              background: C.gold,
              color: C.navy,
              border: 'none',
              borderRadius: 10,
              padding: '13px 28px',
              fontFamily: 'Syne, sans-serif',
              fontWeight: 700,
              fontSize: 15,
              cursor: generiere ? 'wait' : 'pointer',
              opacity: generiere ? 0.7 : 1,
            }}
          >
            {generiere ? '✨ KI schreibt…' : '✨ Generieren'}
          </button>

          {fehler && (
            <div style={{ marginTop: 16, background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 10, padding: 14, color: C.danger, fontFamily: 'DM Sans, sans-serif', fontSize: 14 }}>
              {fehler}
            </div>
          )}
        </div>

        {/* Quellen-Hinweis */}
        {quellen.length > 0 && (
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 13, marginBottom: 16 }}>
            📚 Genutztes Firmen-Wissen: {quellen.join(', ')}
          </p>
        )}

        {/* Vorschläge */}
        {vorschlaege.length > 0 && (
          <div style={{ display: 'grid', gap: 18 }}>
            {vorschlaege.map((v, idx) => (
              <div key={idx} style={{ background: C.navy2, borderRadius: 14, padding: '20px 24px', border: `1px solid ${v.uebernommen ? C.green : 'rgba(255,255,255,0.06)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10, padding: '2px 8px', fontFamily: 'DM Sans, sans-serif' }}>KI · Variante {idx + 1}</span>
                  <input
                    value={v.titel}
                    onChange={(e) => aendere(idx, 'titel', e.target.value)}
                    placeholder="Interner Titel"
                    style={{ ...inputStyle, fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16 }}
                  />
                </div>
                <textarea
                  value={v.inhalt}
                  onChange={(e) => aendere(idx, 'inhalt', e.target.value)}
                  rows={Math.min(16, Math.max(4, Math.ceil(v.inhalt.length / 70)))}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  {v.uebernommen ? (
                    <span style={{ fontFamily: 'DM Sans, sans-serif', color: C.green, fontSize: 14, fontWeight: 600 }}>✓ In Inhalte übernommen</span>
                  ) : (
                    <button
                      onClick={() => uebernehmen(idx)}
                      style={{ background: 'transparent', color: C.green, border: `1px solid ${C.green}`, borderRadius: 9, padding: '9px 18px', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                    >
                      ✓ In Inhalte übernehmen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
