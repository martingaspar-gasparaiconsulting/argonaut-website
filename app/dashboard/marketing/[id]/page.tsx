'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// ARGONAUT OS · MODUL 3 MARKETING · M3 Detailseite
// Reiter: Übersicht / Inhalte / Kalender / Einstellungen
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

type Kampagne = {
  id: string;
  name: string;
  ziel: string | null;
  beschreibung: string | null;
  status: string;
  kanaele: string[] | null;
  budget: number | null;
  start_datum: string | null;
  end_datum: string | null;
  zielgruppe_id: string | null;
  created_at: string;
};

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

type Kalender = {
  id: string;
  kampagne_id: string | null;
  inhalt_id: string | null;
  titel: string;
  kanal: string | null;
  geplant_am: string | null;
  status: string;
  notiz: string | null;
};

const STATUS_OPTS = [
  { v: 'entwurf', label: 'Entwurf' },
  { v: 'aktiv', label: 'Aktiv' },
  { v: 'pausiert', label: 'Pausiert' },
  { v: 'abgeschlossen', label: 'Abgeschlossen' },
];
const KANAL_OPTS = ['email', 'instagram', 'facebook', 'linkedin', 'google', 'website', 'print'];
const TYP_OPTS = [
  { v: 'post', label: 'Social-Post' },
  { v: 'newsletter', label: 'Newsletter' },
  { v: 'anzeige', label: 'Anzeige' },
  { v: 'blog', label: 'Blog-Artikel' },
];
const INHALT_STATUS = [
  { v: 'entwurf', label: 'Entwurf' },
  { v: 'freigegeben', label: 'Freigegeben' },
  { v: 'veroeffentlicht', label: 'Veröffentlicht' },
];

function ampel(k: Kampagne): { farbe: string; text: string } {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  if (k.status === 'abgeschlossen') return { farbe: C.textDim, text: 'Abgeschlossen' };
  if (k.status === 'pausiert') return { farbe: C.warn, text: 'Pausiert' };
  if (k.end_datum) {
    const ende = new Date(k.end_datum);
    ende.setHours(0, 0, 0, 0);
    const diff = Math.round((ende.getTime() - heute.getTime()) / 86400000);
    if (diff < 0) return { farbe: C.danger, text: 'Überfällig' };
    if (diff <= 7) return { farbe: C.warn, text: 'Endet bald' };
  }
  return { farbe: C.green, text: 'Im Plan' };
}
function statusLabel(v: string): string {
  return STATUS_OPTS.find((s) => s.v === v)?.label ?? v;
}
function typLabel(v: string): string {
  return TYP_OPTS.find((s) => s.v === v)?.label ?? v;
}
function inhaltStatusLabel(v: string): string {
  return INHALT_STATUS.find((s) => s.v === v)?.label ?? v;
}
function fmtDatum(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDatumZeit(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function fmtBudget(b: number | null): string {
  if (b == null) return '—';
  return b.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
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
      <label style={{ display: 'block', fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: C.textDim, marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default function KampagneDetail() {
  const params = useParams();
  const id = (Array.isArray(params?.id) ? params?.id[0] : params?.id) as string;

  const [kampagne, setKampagne] = useState<Kampagne | null>(null);
  const [inhalte, setInhalte] = useState<Inhalt[]>([]);
  const [kalender, setKalender] = useState<Kalender[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [tab, setTab] = useState<'uebersicht' | 'inhalte' | 'kalender' | 'einstellungen'>('uebersicht');

  const laden = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setFehler(null);
    const { data: kData, error: kErr } = await supabase
      .from('marketing_kampagnen').select('*').eq('id', id).single();
    if (kErr) {
      setFehler(kErr.message);
      setLoading(false);
      return;
    }
    setKampagne(kData as Kampagne);

    const { data: iData } = await supabase
      .from('marketing_inhalte').select('*').eq('kampagne_id', id)
      .order('created_at', { ascending: false });
    setInhalte((iData ?? []) as Inhalt[]);

    const { data: calData } = await supabase
      .from('marketing_kalender').select('*').eq('kampagne_id', id)
      .order('geplant_am', { ascending: true });
    setKalender((calData ?? []) as Kalender[]);

    setLoading(false);
  }, [id]);

  useEffect(() => { laden(); }, [laden]);

  if (loading) {
    return (
      <div style={{ background: C.navy, minHeight: '100vh', padding: '32px 40px' }}>
        <p style={{ color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Lade Kampagne…</p>
      </div>
    );
  }
  if (fehler || !kampagne) {
    return (
      <div style={{ background: C.navy, minHeight: '100vh', padding: '32px 40px' }}>
        <a href="/dashboard/marketing" style={{ color: C.cyan, fontFamily: 'DM Sans, sans-serif' }}>
          ← Zurück zu Marketing
        </a>
        <div style={{ marginTop: 20, background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: 18, color: C.danger, fontFamily: 'DM Sans, sans-serif' }}>
          {fehler ?? 'Kampagne nicht gefunden.'}
        </div>
      </div>
    );
  }

  const a = ampel(kampagne);

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>
        {/* Zurück */}
        <a href="/dashboard/marketing" style={{ color: C.cyan, fontFamily: 'DM Sans, sans-serif', fontSize: 14, textDecoration: 'none' }}>
          ← Zurück zu Marketing
        </a>

        {/* Kopf */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '16px 0 6px', flexWrap: 'wrap' }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%', background: a.farbe, flexShrink: 0 }} title={a.text} />
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 30, fontWeight: 700, color: C.gold, margin: 0 }}>
            {kampagne.name}
          </h1>
          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: a.farbe, border: `1px solid ${a.farbe}`, borderRadius: 12, padding: '3px 12px' }}>
            {a.text}
          </span>
        </div>
        {kampagne.ziel && (
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 24px', fontSize: 15 }}>
            🎯 {kampagne.ziel}
          </p>
        )}

        {/* Reiter */}
        <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 28, flexWrap: 'wrap' }}>
          {([
            { v: 'uebersicht', label: 'Übersicht' },
            { v: 'inhalte', label: `Inhalte (${inhalte.length})` },
            { v: 'kalender', label: `Kalender (${kalender.length})` },
            { v: 'einstellungen', label: 'Einstellungen' },
          ] as const).map((t) => (
            <button
              key={t.v}
              onClick={() => setTab(t.v)}
              style={{
                background: 'transparent',
                color: tab === t.v ? C.gold : C.textDim,
                border: 'none',
                borderBottom: tab === t.v ? `2px solid ${C.gold}` : '2px solid transparent',
                padding: '10px 16px',
                fontFamily: 'Syne, sans-serif',
                fontSize: 15,
                fontWeight: tab === t.v ? 700 : 400,
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'uebersicht' && <TabUebersicht kampagne={kampagne} inhalte={inhalte} kalender={kalender} />}
        {tab === 'inhalte' && <TabInhalte kampagneId={id} inhalte={inhalte} reload={laden} />}
        {tab === 'kalender' && <TabKalender kampagneId={id} kalender={kalender} reload={laden} />}
        {tab === 'einstellungen' && <TabEinstellungen kampagne={kampagne} reload={laden} />}
      </div>
    </div>
  );
}

// ============================================================
// TAB · ÜBERSICHT
// ============================================================
function TabUebersicht({ kampagne, inhalte, kalender }: { kampagne: Kampagne; inhalte: Inhalt[]; kalender: Kalender[] }) {
  const geplant = kalender.filter((k) => k.status === 'geplant').length;
  const freigegeben = inhalte.filter((i) => i.status === 'freigegeben' || i.status === 'veroeffentlicht').length;

  const kacheln = [
    { label: 'Inhalte', wert: inhalte.length, farbe: C.cyan },
    { label: 'Davon freigegeben', wert: freigegeben, farbe: C.green },
    { label: 'Geplante Posts', wert: geplant, farbe: C.gold },
  ];

  return (
    <div>
      {/* Mini-KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 24 }}>
        {kacheln.map((k) => (
          <div key={k.label} style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 30, fontWeight: 700, color: k.farbe }}>{k.wert}</div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 14 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Eckdaten */}
      <div style={{ background: C.navy2, borderRadius: 14, padding: '24px 28px', border: '1px solid rgba(255,255,255,0.06)' }}>
        <ZeileInfo label="Status" wert={statusLabel(kampagne.status)} />
        <ZeileInfo label="Zeitraum" wert={`${fmtDatum(kampagne.start_datum)} – ${fmtDatum(kampagne.end_datum)}`} />
        <ZeileInfo label="Budget" wert={fmtBudget(kampagne.budget)} />
        <ZeileInfo label="Kanäle" wert={kampagne.kanaele && kampagne.kanaele.length > 0 ? kampagne.kanaele.join(', ') : '—'} />
        <ZeileInfo label="Beschreibung" wert={kampagne.beschreibung || '—'} />
      </div>
    </div>
  );
}

function ZeileInfo({ label, wert }: { label: string; wert: string }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ width: 140, flexShrink: 0, fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 14 }}>{label}</div>
      <div style={{ fontFamily: 'DM Sans, sans-serif', color: '#fff', fontSize: 14, whiteSpace: 'pre-wrap' }}>{wert}</div>
    </div>
  );
}

// ============================================================
// TAB · INHALTE
// ============================================================
function TabInhalte({ kampagneId, inhalte, reload }: { kampagneId: string; inhalte: Inhalt[]; reload: () => void }) {
  const [offen, setOffen] = useState(false);
  const [bearbeite, setBearbeite] = useState<Inhalt | null>(null);
  const [fTitel, setFTitel] = useState('');
  const [fTyp, setFTyp] = useState('post');
  const [fKanal, setFKanal] = useState('email');
  const [fInhalt, setFInhalt] = useState('');
  const [fStatus, setFStatus] = useState('entwurf');
  const [speichern, setSpeichern] = useState(false);

  function neu() {
    setBearbeite(null);
    setFTitel(''); setFTyp('post'); setFKanal('email'); setFInhalt(''); setFStatus('entwurf');
    setOffen(true);
  }
  function bearbeiten(i: Inhalt) {
    setBearbeite(i);
    setFTitel(i.titel); setFTyp(i.typ); setFKanal(i.kanal ?? 'email');
    setFInhalt(i.inhalt ?? ''); setFStatus(i.status);
    setOffen(true);
  }
  async function speichernKlick() {
    if (!fTitel.trim()) { alert('Bitte einen Titel eingeben.'); return; }
    setSpeichern(true);
    const payload: Record<string, unknown> = {
      kampagne_id: kampagneId, titel: fTitel.trim(), typ: fTyp, kanal: fKanal,
      inhalt: fInhalt.trim() || null, status: fStatus,
    };
    let error;
    if (bearbeite) {
      ({ error } = await supabase.from('marketing_inhalte').update(payload).eq('id', bearbeite.id));
    } else {
      ({ error } = await supabase.from('marketing_inhalte').insert(payload));
    }
    setSpeichern(false);
    if (error) { alert('Fehler: ' + error.message); return; }
    setOffen(false);
    reload();
  }
  async function loeschen(i: Inhalt) {
    if (!confirm(`Inhalt „${i.titel}" wirklich löschen?`)) return;
    const { error } = await supabase.from('marketing_inhalte').delete().eq('id', i.id);
    if (error) { alert('Fehler: ' + error.message); return; }
    reload();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: 0, fontSize: 14 }}>
          Inhalte dieser Kampagne. Das KI-Content-Studio kommt in einem späteren Schritt.
        </p>
        <button onClick={neu} style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '9px 18px', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          + Inhalt
        </button>
      </div>

      {inhalte.length === 0 ? (
        <div style={{ background: C.navy2, borderRadius: 14, padding: '40px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim }}>Noch keine Inhalte. Leg den ersten an.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {inhalte.map((i) => (
            <div key={i.id} style={{ background: C.navy2, borderRadius: 12, padding: '16px 20px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 700, color: '#fff' }}>{i.titel}</span>
                  {i.ki_generiert && <span style={{ fontSize: 11, color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10, padding: '1px 8px', fontFamily: 'DM Sans, sans-serif' }}>KI</span>}
                  <span style={{ fontSize: 12, color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>{typLabel(i.typ)} · {i.kanal} · {inhaltStatusLabel(i.status)}</span>
                </div>
                {i.inhalt && <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 13, margin: 0, whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>{i.inhalt}</p>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => bearbeiten(i)} style={{ background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 8, padding: '7px 13px', fontFamily: 'DM Sans, sans-serif', fontSize: 13, cursor: 'pointer' }}>Bearbeiten</button>
                <button onClick={() => loeschen(i)} style={{ background: 'transparent', color: C.danger, border: `1px solid ${C.danger}`, borderRadius: 8, padding: '7px 13px', fontFamily: 'DM Sans, sans-serif', fontSize: 13, cursor: 'pointer' }}>Löschen</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {offen && (
        <DialogRahmen titel={bearbeite ? 'Inhalt bearbeiten' : 'Neuer Inhalt'} onClose={() => setOffen(false)}>
          <Feld label="Titel *">
            <input value={fTitel} onChange={(e) => setFTitel(e.target.value)} placeholder="z. B. Instagram-Post Herbststart" style={inputStyle} />
          </Feld>
          <div style={{ display: 'flex', gap: 14 }}>
            <Feld label="Typ">
              <select value={fTyp} onChange={(e) => setFTyp(e.target.value)} style={inputStyle}>
                {TYP_OPTS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
            </Feld>
            <Feld label="Kanal">
              <select value={fKanal} onChange={(e) => setFKanal(e.target.value)} style={inputStyle}>
                {KANAL_OPTS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Feld>
          </div>
          <Feld label="Inhalt / Text">
            <textarea value={fInhalt} onChange={(e) => setFInhalt(e.target.value)} rows={5} style={{ ...inputStyle, resize: 'vertical' }} />
          </Feld>
          <Feld label="Status">
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={inputStyle}>
              {INHALT_STATUS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
          </Feld>
          <DialogButtons onClose={() => setOffen(false)} onSave={speichernKlick} speichern={speichern} />
        </DialogRahmen>
      )}
    </div>
  );
}

// ============================================================
// TAB · KALENDER
// ============================================================
function TabKalender({ kampagneId, kalender, reload }: { kampagneId: string; kalender: Kalender[]; reload: () => void }) {
  const [offen, setOffen] = useState(false);
  const [bearbeite, setBearbeite] = useState<Kalender | null>(null);
  const [fTitel, setFTitel] = useState('');
  const [fKanal, setFKanal] = useState('email');
  const [fGeplant, setFGeplant] = useState('');
  const [fStatus, setFStatus] = useState('geplant');
  const [fNotiz, setFNotiz] = useState('');
  const [speichern, setSpeichern] = useState(false);

  function neu() {
    setBearbeite(null);
    setFTitel(''); setFKanal('email'); setFGeplant(''); setFStatus('geplant'); setFNotiz('');
    setOffen(true);
  }
  function bearbeiten(k: Kalender) {
    setBearbeite(k);
    setFTitel(k.titel); setFKanal(k.kanal ?? 'email');
    setFGeplant(k.geplant_am ? k.geplant_am.slice(0, 16) : '');
    setFStatus(k.status); setFNotiz(k.notiz ?? '');
    setOffen(true);
  }
  async function speichernKlick() {
    if (!fTitel.trim()) { alert('Bitte einen Titel eingeben.'); return; }
    setSpeichern(true);
    const payload: Record<string, unknown> = {
      kampagne_id: kampagneId, titel: fTitel.trim(), kanal: fKanal,
      geplant_am: fGeplant ? new Date(fGeplant).toISOString() : null,
      status: fStatus, notiz: fNotiz.trim() || null,
    };
    let error;
    if (bearbeite) {
      ({ error } = await supabase.from('marketing_kalender').update(payload).eq('id', bearbeite.id));
    } else {
      ({ error } = await supabase.from('marketing_kalender').insert(payload));
    }
    setSpeichern(false);
    if (error) { alert('Fehler: ' + error.message); return; }
    setOffen(false);
    reload();
  }
  async function loeschen(k: Kalender) {
    if (!confirm(`Eintrag „${k.titel}" wirklich löschen?`)) return;
    const { error } = await supabase.from('marketing_kalender').delete().eq('id', k.id);
    if (error) { alert('Fehler: ' + error.message); return; }
    reload();
  }

  function statusFarbe(s: string): string {
    if (s === 'veroeffentlicht') return C.green;
    if (s === 'entwurf') return C.warn;
    return C.cyan;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: 0, fontSize: 14 }}>
          Geplante Veröffentlichungen. Der Drag&amp;Drop-Redaktionskalender kommt in einem späteren Schritt.
        </p>
        <button onClick={neu} style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '9px 18px', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          + Termin
        </button>
      </div>

      {kalender.length === 0 ? (
        <div style={{ background: C.navy2, borderRadius: 14, padding: '40px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim }}>Noch keine geplanten Termine.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {kalender.map((k) => (
            <div key={k.id} style={{ background: C.navy2, borderRadius: 12, padding: '16px 20px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: statusFarbe(k.status), flexShrink: 0 }} />
                  <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 700, color: '#fff' }}>{k.titel}</span>
                  <span style={{ fontSize: 12, color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>{k.kanal}</span>
                </div>
                <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: C.textDim }}>
                  🕒 {fmtDatumZeit(k.geplant_am)}{k.notiz ? ` · ${k.notiz}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => bearbeiten(k)} style={{ background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 8, padding: '7px 13px', fontFamily: 'DM Sans, sans-serif', fontSize: 13, cursor: 'pointer' }}>Bearbeiten</button>
                <button onClick={() => loeschen(k)} style={{ background: 'transparent', color: C.danger, border: `1px solid ${C.danger}`, borderRadius: 8, padding: '7px 13px', fontFamily: 'DM Sans, sans-serif', fontSize: 13, cursor: 'pointer' }}>Löschen</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {offen && (
        <DialogRahmen titel={bearbeite ? 'Termin bearbeiten' : 'Neuer Termin'} onClose={() => setOffen(false)}>
          <Feld label="Titel *">
            <input value={fTitel} onChange={(e) => setFTitel(e.target.value)} placeholder="z. B. Newsletter-Versand KW40" style={inputStyle} />
          </Feld>
          <div style={{ display: 'flex', gap: 14 }}>
            <Feld label="Kanal">
              <select value={fKanal} onChange={(e) => setFKanal(e.target.value)} style={inputStyle}>
                {KANAL_OPTS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Feld>
            <Feld label="Status">
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={inputStyle}>
                <option value="geplant">Geplant</option>
                <option value="entwurf">Entwurf</option>
                <option value="veroeffentlicht">Veröffentlicht</option>
              </select>
            </Feld>
          </div>
          <Feld label="Geplant am">
            <input type="datetime-local" value={fGeplant} onChange={(e) => setFGeplant(e.target.value)} style={inputStyle} />
          </Feld>
          <Feld label="Notiz">
            <textarea value={fNotiz} onChange={(e) => setFNotiz(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </Feld>
          <DialogButtons onClose={() => setOffen(false)} onSave={speichernKlick} speichern={speichern} />
        </DialogRahmen>
      )}
    </div>
  );
}

// ============================================================
// TAB · EINSTELLUNGEN
// ============================================================
function TabEinstellungen({ kampagne, reload }: { kampagne: Kampagne; reload: () => void }) {
  const [fName, setFName] = useState(kampagne.name);
  const [fZiel, setFZiel] = useState(kampagne.ziel ?? '');
  const [fBeschreibung, setFBeschreibung] = useState(kampagne.beschreibung ?? '');
  const [fStatus, setFStatus] = useState(kampagne.status);
  const [fKanaele, setFKanaele] = useState<string[]>(kampagne.kanaele ?? []);
  const [fBudget, setFBudget] = useState(kampagne.budget != null ? String(kampagne.budget) : '');
  const [fStart, setFStart] = useState(kampagne.start_datum ?? '');
  const [fEnde, setFEnde] = useState(kampagne.end_datum ?? '');
  const [speichern, setSpeichern] = useState(false);

  function toggleKanal(kanal: string) {
    setFKanaele((prev) => prev.includes(kanal) ? prev.filter((x) => x !== kanal) : [...prev, kanal]);
  }
  async function speichernKlick() {
    if (!fName.trim()) { alert('Bitte einen Namen eingeben.'); return; }
    setSpeichern(true);
    const payload: Record<string, unknown> = {
      name: fName.trim(), ziel: fZiel.trim() || null, beschreibung: fBeschreibung.trim() || null,
      status: fStatus, kanaele: fKanaele,
      budget: fBudget.trim() ? Number(fBudget.replace(',', '.')) : null,
      start_datum: fStart || null, end_datum: fEnde || null,
    };
    const { error } = await supabase.from('marketing_kampagnen').update(payload).eq('id', kampagne.id);
    setSpeichern(false);
    if (error) { alert('Fehler: ' + error.message); return; }
    reload();
    alert('Gespeichert.');
  }
  async function abschliessen() {
    if (!confirm(`Kampagne „${kampagne.name}" auf „Abgeschlossen" setzen?`)) return;
    const { error } = await supabase.from('marketing_kampagnen').update({ status: 'abgeschlossen' }).eq('id', kampagne.id);
    if (error) { alert('Fehler: ' + error.message); return; }
    reload();
  }

  return (
    <div style={{ background: C.navy2, borderRadius: 14, padding: '28px 30px', border: '1px solid rgba(255,255,255,0.06)', maxWidth: 640 }}>
      <Feld label="Name *">
        <input value={fName} onChange={(e) => setFName(e.target.value)} style={inputStyle} />
      </Feld>
      <Feld label="Ziel">
        <input value={fZiel} onChange={(e) => setFZiel(e.target.value)} style={inputStyle} />
      </Feld>
      <Feld label="Beschreibung">
        <textarea value={fBeschreibung} onChange={(e) => setFBeschreibung(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
      </Feld>
      <div style={{ display: 'flex', gap: 14 }}>
        <Feld label="Status">
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={inputStyle}>
            {STATUS_OPTS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        </Feld>
        <Feld label="Budget (€)">
          <input value={fBudget} onChange={(e) => setFBudget(e.target.value)} inputMode="decimal" style={inputStyle} />
        </Feld>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <Feld label="Start">
          <input type="date" value={fStart} onChange={(e) => setFStart(e.target.value)} style={inputStyle} />
        </Feld>
        <Feld label="Ende">
          <input type="date" value={fEnde} onChange={(e) => setFEnde(e.target.value)} style={inputStyle} />
        </Feld>
      </div>
      <Feld label="Kanäle">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {KANAL_OPTS.map((kanal) => {
            const an = fKanaele.includes(kanal);
            return (
              <button key={kanal} onClick={() => toggleKanal(kanal)} style={{ background: an ? C.cyan : 'transparent', color: an ? C.navy : C.textDim, border: `1px solid ${an ? C.cyan : 'rgba(255,255,255,0.15)'}`, borderRadius: 16, padding: '5px 14px', fontFamily: 'DM Sans, sans-serif', fontSize: 13, cursor: 'pointer' }}>
                {kanal}
              </button>
            );
          })}
        </div>
      </Feld>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, flexWrap: 'wrap', gap: 12 }}>
        {kampagne.status !== 'abgeschlossen' ? (
          <button onClick={abschliessen} style={{ background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '11px 20px', fontFamily: 'DM Sans, sans-serif', cursor: 'pointer' }}>
            Kampagne abschließen
          </button>
        ) : <span />}
        <button onClick={speichernKlick} disabled={speichern} style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 28px', fontFamily: 'Syne, sans-serif', fontWeight: 700, cursor: speichern ? 'wait' : 'pointer', opacity: speichern ? 0.7 : 1 }}>
          {speichern ? 'Speichere…' : 'Speichern'}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Wiederverwendbare Dialog-Bausteine
// ============================================================
function DialogRahmen({ titel, onClose, children }: { titel: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.navy, borderRadius: 18, padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${C.gold}` }}>
        <h2 style={{ fontFamily: 'Syne, sans-serif', color: C.gold, fontSize: 23, margin: '0 0 20px' }}>{titel}</h2>
        {children}
      </div>
    </div>
  );
}

function DialogButtons({ onClose, onSave, speichern }: { onClose: () => void; onSave: () => void; speichern: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
      <button onClick={onClose} style={{ background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '11px 20px', fontFamily: 'DM Sans, sans-serif', cursor: 'pointer' }}>
        Abbrechen
      </button>
      <button onClick={onSave} disabled={speichern} style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 24px', fontFamily: 'Syne, sans-serif', fontWeight: 700, cursor: speichern ? 'wait' : 'pointer', opacity: speichern ? 0.7 : 1 }}>
        {speichern ? 'Speichere…' : 'Speichern'}
      </button>
    </div>
  );
}
