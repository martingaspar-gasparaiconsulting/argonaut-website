'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// ARGONAUT OS · MODUL 3 MARKETING · M6 Asset-Bibliothek
// Alle Inhalte zentral · Suche/Filter/Status · kampagnen-uebergreifend
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

type Inhalt = {
  id: string;
  kampagne_id: string | null;
  titel: string;
  typ: string;
  kanal: string | null;
  inhalt: string | null;
  status: string;
  ki_generiert: boolean;
  created_at: string;
};
type KampagneMini = { id: string; name: string };

const TYP_OPTS = [
  { v: 'post', label: 'Social-Post' },
  { v: 'newsletter', label: 'Newsletter' },
  { v: 'anzeige', label: 'Anzeige' },
  { v: 'blog', label: 'Blog-Artikel' },
];
const KANAL_OPTS = ['email', 'instagram', 'facebook', 'linkedin', 'google', 'website', 'print'];
const STATUS_OPTS = [
  { v: 'entwurf', label: 'Entwurf', farbe: C.warn },
  { v: 'freigegeben', label: 'Freigegeben', farbe: C.cyan },
  { v: 'veroeffentlicht', label: 'Veröffentlicht', farbe: C.green },
];

function typLabel(v: string): string { return TYP_OPTS.find((t) => t.v === v)?.label ?? v; }
function statusInfo(v: string) { return STATUS_OPTS.find((s) => s.v === v) ?? { v, label: v, farbe: C.textDim }; }
function fmtDatum(d: string): string {
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

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

export default function AssetBibliothek() {
  const [inhalte, setInhalte] = useState<Inhalt[]>([]);
  const [kampagnen, setKampagnen] = useState<KampagneMini[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  // Filter
  const [suche, setSuche] = useState('');
  const [fTyp, setFTyp] = useState('alle');
  const [fKanal, setFKanal] = useState('alle');
  const [fStatus, setFStatus] = useState('alle');
  const [fKi, setFKi] = useState('alle'); // alle | ki | manuell

  // Dialog
  const [offen, setOffen] = useState(false);
  const [bearbeite, setBearbeite] = useState<Inhalt | null>(null);
  const [dTitel, setDTitel] = useState('');
  const [dTyp, setDTyp] = useState('post');
  const [dKanal, setDKanal] = useState('email');
  const [dStatus, setDStatus] = useState('entwurf');
  const [dKampagne, setDKampagne] = useState('');
  const [dInhalt, setDInhalt] = useState('');
  const [speichern, setSpeichern] = useState(false);

  // Kopier-Feedback
  const [kopiertId, setKopiertId] = useState<string | null>(null);

  const laden = useCallback(async () => {
    setLoading(true);
    setFehler(null);
    const { data: iData, error: iErr } = await supabase
      .from('marketing_inhalte').select('*').order('created_at', { ascending: false });
    if (iErr) { setFehler(iErr.message); setLoading(false); return; }
    setInhalte((iData ?? []) as Inhalt[]);
    const { data: cData } = await supabase
      .from('marketing_kampagnen').select('id, name').order('created_at', { ascending: false });
    setKampagnen((cData ?? []) as KampagneMini[]);
    setLoading(false);
  }, []);

  useEffect(() => { laden(); }, [laden]);

  const kampagneName = useCallback((id: string | null): string => {
    if (!id) return '';
    return kampagnen.find((k) => k.id === id)?.name ?? '';
  }, [kampagnen]);

  const kpi = useMemo(() => ({
    gesamt: inhalte.length,
    entwurf: inhalte.filter((i) => i.status === 'entwurf').length,
    freigegeben: inhalte.filter((i) => i.status === 'freigegeben').length,
    veroeffentlicht: inhalte.filter((i) => i.status === 'veroeffentlicht').length,
  }), [inhalte]);

  const gefiltert = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return inhalte.filter((i) => {
      if (fTyp !== 'alle' && i.typ !== fTyp) return false;
      if (fKanal !== 'alle' && i.kanal !== fKanal) return false;
      if (fStatus !== 'alle' && i.status !== fStatus) return false;
      if (fKi === 'ki' && !i.ki_generiert) return false;
      if (fKi === 'manuell' && i.ki_generiert) return false;
      if (s) {
        const heu = (i.titel + ' ' + (i.inhalt ?? '')).toLowerCase();
        if (!heu.includes(s)) return false;
      }
      return true;
    });
  }, [inhalte, suche, fTyp, fKanal, fStatus, fKi]);

  function bearbeiten(i: Inhalt) {
    setBearbeite(i);
    setDTitel(i.titel); setDTyp(i.typ); setDKanal(i.kanal ?? 'email');
    setDStatus(i.status); setDKampagne(i.kampagne_id ?? ''); setDInhalt(i.inhalt ?? '');
    setOffen(true);
  }
  async function speichernKlick() {
    if (!bearbeite) return;
    if (!dTitel.trim()) { alert('Bitte einen Titel eingeben.'); return; }
    setSpeichern(true);
    const payload: Record<string, unknown> = {
      titel: dTitel.trim(), typ: dTyp, kanal: dKanal, status: dStatus,
      kampagne_id: dKampagne || null, inhalt: dInhalt.trim() || null,
    };
    const { error } = await supabase.from('marketing_inhalte').update(payload).eq('id', bearbeite.id);
    setSpeichern(false);
    if (error) { alert('Fehler: ' + error.message); return; }
    setOffen(false);
    laden();
  }
  async function loeschen(i: Inhalt) {
    if (!confirm(`Inhalt „${i.titel}" wirklich löschen?`)) return;
    const { error } = await supabase.from('marketing_inhalte').delete().eq('id', i.id);
    if (error) { alert('Fehler: ' + error.message); return; }
    laden();
  }
  async function kopieren(i: Inhalt) {
    try {
      await navigator.clipboard.writeText(i.inhalt ?? '');
      setKopiertId(i.id);
      setTimeout(() => setKopiertId((cur) => (cur === i.id ? null : cur)), 1800);
    } catch {
      alert('Kopieren nicht möglich. Bitte Text manuell markieren.');
    }
  }

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
        <a href="/dashboard/marketing" style={{ color: C.cyan, fontFamily: 'DM Sans, sans-serif', fontSize: 14, textDecoration: 'none' }}>
          ← Zurück zu Marketing
        </a>

        <div style={{ margin: '16px 0 24px' }}>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 30, fontWeight: 700, color: C.gold, margin: 0 }}>📚 Asset-Bibliothek</h1>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0', fontSize: 14 }}>
            Alle Inhalte zentral — suchen, filtern, Status pflegen, kopieren.
          </p>
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Inhalte gesamt', wert: kpi.gesamt, farbe: C.cyan },
            { label: 'Entwürfe', wert: kpi.entwurf, farbe: C.warn },
            { label: 'Freigegeben', wert: kpi.freigegeben, farbe: C.cyan },
            { label: 'Veröffentlicht', wert: kpi.veroeffentlicht, farbe: C.green },
          ].map((k) => (
            <div key={k.label} style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 30, fontWeight: 700, color: k.farbe }}>{k.wert}</div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 14 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Filterleiste */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="🔍 Suchen…"
            style={{ ...inputStyle, width: 'auto', flex: '1 1 220px', minWidth: 200 }}
          />
          <select value={fTyp} onChange={(e) => setFTyp(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
            <option value="alle">Alle Formate</option>
            {TYP_OPTS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
          <select value={fKanal} onChange={(e) => setFKanal(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
            <option value="alle">Alle Kanäle</option>
            {KANAL_OPTS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select value={fKi} onChange={(e) => setFKi(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
            <option value="alle">KI &amp; manuell</option>
            <option value="ki">Nur KI</option>
            <option value="manuell">Nur manuell</option>
          </select>
        </div>

        {/* Status-Pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[{ v: 'alle', label: 'Alle' }, ...STATUS_OPTS].map((f) => (
            <button
              key={f.v}
              onClick={() => setFStatus(f.v)}
              style={{
                background: fStatus === f.v ? C.gold : 'transparent',
                color: fStatus === f.v ? C.navy : C.textDim,
                border: `1px solid ${fStatus === f.v ? C.gold : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 20, padding: '6px 16px', fontFamily: 'DM Sans, sans-serif', fontSize: 14,
                fontWeight: fStatus === f.v ? 700 : 400, cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Liste */}
        {loading ? (
          <p style={{ color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Lade Bibliothek…</p>
        ) : fehler ? (
          <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: 18, color: C.danger, fontFamily: 'DM Sans, sans-serif' }}>
            {fehler}
          </div>
        ) : gefiltert.length === 0 ? (
          <div style={{ background: C.navy2, borderRadius: 14, padding: '48px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 16 }}>
              {inhalte.length === 0 ? 'Noch keine Inhalte. Erstelle welche im KI-Content-Studio oder in einer Kampagne.' : 'Keine Inhalte für diese Filter.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 16 }}>
            {gefiltert.map((i) => {
              const si = statusInfo(i.status);
              const kn = kampagneName(i.kampagne_id);
              return (
                <div key={i.id} style={{ background: C.navy2, borderRadius: 14, padding: '18px 20px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 17, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>{i.titel}</span>
                    {i.ki_generiert && <span style={{ fontSize: 11, color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10, padding: '1px 8px', fontFamily: 'DM Sans, sans-serif', flexShrink: 0 }}>KI</span>}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: si.farbe, border: `1px solid ${si.farbe}`, borderRadius: 10, padding: '2px 8px', fontFamily: 'DM Sans, sans-serif' }}>{si.label}</span>
                    <span style={{ fontSize: 12, color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>{typLabel(i.typ)} · {i.kanal}</span>
                  </div>

                  {kn && <span style={{ fontSize: 12, color: C.gold, fontFamily: 'DM Sans, sans-serif' }}>📣 {kn}</span>}

                  {i.inhalt && (
                    <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 13, margin: 0, whiteSpace: 'pre-wrap', maxHeight: 84, overflow: 'hidden', lineHeight: 1.5 }}>
                      {i.inhalt.length > 180 ? i.inhalt.slice(0, 180) + '…' : i.inhalt}
                    </p>
                  )}

                  <div style={{ fontSize: 11, color: C.textDim, fontFamily: 'DM Sans, sans-serif', opacity: 0.7 }}>{fmtDatum(i.created_at)}</div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
                    <button onClick={() => bearbeiten(i)} style={btnStyle(C.cyan)}>Bearbeiten</button>
                    <button onClick={() => kopieren(i)} style={btnStyle(kopiertId === i.id ? C.green : C.textDim)}>
                      {kopiertId === i.id ? '✓ Kopiert' : 'Kopieren'}
                    </button>
                    <button onClick={() => loeschen(i)} style={btnStyle(C.danger)}>Löschen</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog */}
      {offen && bearbeite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setOffen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.navy, borderRadius: 18, padding: 32, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${C.gold}` }}>
            <h2 style={{ fontFamily: 'Syne, sans-serif', color: C.gold, fontSize: 23, margin: '0 0 20px' }}>Inhalt bearbeiten</h2>
            <Feld label="Titel *">
              <input value={dTitel} onChange={(e) => setDTitel(e.target.value)} style={inputStyle} />
            </Feld>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <Feld label="Format">
                <select value={dTyp} onChange={(e) => setDTyp(e.target.value)} style={inputStyle}>
                  {TYP_OPTS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </Feld>
              <Feld label="Kanal">
                <select value={dKanal} onChange={(e) => setDKanal(e.target.value)} style={inputStyle}>
                  {KANAL_OPTS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </Feld>
              <Feld label="Status">
                <select value={dStatus} onChange={(e) => setDStatus(e.target.value)} style={inputStyle}>
                  {STATUS_OPTS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                </select>
              </Feld>
            </div>
            <Feld label="Kampagne">
              <select value={dKampagne} onChange={(e) => setDKampagne(e.target.value)} style={inputStyle}>
                <option value="">— keine —</option>
                {kampagnen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </Feld>
            <Feld label="Inhalt / Text">
              <textarea value={dInhalt} onChange={(e) => setDInhalt(e.target.value)} rows={10} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
            </Feld>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button onClick={() => setOffen(false)} style={{ background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '11px 20px', fontFamily: 'DM Sans, sans-serif', cursor: 'pointer' }}>Abbrechen</button>
              <button onClick={speichernKlick} disabled={speichern} style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 24px', fontFamily: 'Syne, sans-serif', fontWeight: 700, cursor: speichern ? 'wait' : 'pointer', opacity: speichern ? 0.7 : 1 }}>
                {speichern ? 'Speichere…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function btnStyle(farbe: string): React.CSSProperties {
  return {
    background: 'transparent',
    color: farbe,
    border: `1px solid ${farbe}`,
    borderRadius: 8,
    padding: '7px 13px',
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 13,
    cursor: 'pointer',
  };
}
