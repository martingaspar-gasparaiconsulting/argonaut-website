'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// ARGONAUT OS · MODUL 3 MARKETING · M4 Redaktionskalender
// Monatsraster + Drag&Drop + Unterminiert-Ablage
// Kampagnen-übergreifend
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

type Kalender = {
  id: string;
  kampagne_id: string | null;
  titel: string;
  kanal: string | null;
  geplant_am: string | null;
  status: string;
  notiz: string | null;
};
type KampagneMini = { id: string; name: string };

const KANAL_OPTS = ['email', 'instagram', 'facebook', 'linkedin', 'google', 'website', 'print'];
const STATUS_OPTS = [
  { v: 'geplant', label: 'Geplant', farbe: C.cyan },
  { v: 'entwurf', label: 'Entwurf', farbe: C.warn },
  { v: 'veroeffentlicht', label: 'Veröffentlicht', farbe: C.green },
];

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function statusFarbe(s: string): string {
  return STATUS_OPTS.find((o) => o.v === s)?.farbe ?? C.cyan;
}
// lokaler Tagesschlüssel YYYY-MM-DD (zeitzonensicher)
function tagKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${t}`;
}
function tagKeyAusISO(iso: string | null): string | null {
  if (!iso) return null;
  return tagKey(new Date(iso));
}
function uhrzeit(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
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

export default function Redaktionskalender() {
  const [eintraege, setEintraege] = useState<Kalender[]>([]);
  const [kampagnen, setKampagnen] = useState<KampagneMini[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const heute = new Date();
  const [jahr, setJahr] = useState(heute.getFullYear());
  const [monat, setMonat] = useState(heute.getMonth());
  const [filterKampagne, setFilterKampagne] = useState<string>('alle');

  // Dialog
  const [offen, setOffen] = useState(false);
  const [bearbeite, setBearbeite] = useState<Kalender | null>(null);
  const [fTitel, setFTitel] = useState('');
  const [fKampagne, setFKampagne] = useState<string>('');
  const [fKanal, setFKanal] = useState('email');
  const [fStatus, setFStatus] = useState('geplant');
  const [fGeplant, setFGeplant] = useState('');
  const [fNotiz, setFNotiz] = useState('');
  const [speichern, setSpeichern] = useState(false);

  const laden = useCallback(async () => {
    setLoading(true);
    setFehler(null);
    const { data: kData, error: kErr } = await supabase
      .from('marketing_kalender').select('*').order('geplant_am', { ascending: true });
    if (kErr) { setFehler(kErr.message); setLoading(false); return; }
    setEintraege((kData ?? []) as Kalender[]);

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

  const gefiltert = useMemo(() => {
    if (filterKampagne === 'alle') return eintraege;
    return eintraege.filter((e) => e.kampagne_id === filterKampagne);
  }, [eintraege, filterKampagne]);

  // Termine ohne Datum
  const unterminiert = useMemo(() => gefiltert.filter((e) => !e.geplant_am), [gefiltert]);

  // Termine pro Tag (Map: tagKey -> Eintraege)
  const proTag = useMemo(() => {
    const map: Record<string, Kalender[]> = {};
    for (const e of gefiltert) {
      const key = tagKeyAusISO(e.geplant_am);
      if (!key) continue;
      (map[key] = map[key] ?? []).push(e);
    }
    return map;
  }, [gefiltert]);

  // Monatsraster bauen (Mo-Start)
  const zellen = useMemo(() => {
    const ersterTag = new Date(jahr, monat, 1);
    // JS: 0=So..6=Sa → in Mo=0..So=6 umrechnen
    const startOffset = (ersterTag.getDay() + 6) % 7;
    const tageImMonat = new Date(jahr, monat + 1, 0).getDate();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) arr.push(null);
    for (let t = 1; t <= tageImMonat; t++) arr.push(new Date(jahr, monat, t));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [jahr, monat]);

  function monatWechsel(richtung: number) {
    let m = monat + richtung;
    let j = jahr;
    if (m < 0) { m = 11; j -= 1; }
    if (m > 11) { m = 0; j += 1; }
    setMonat(m);
    setJahr(j);
  }
  function zuHeute() {
    const h = new Date();
    setMonat(h.getMonth());
    setJahr(h.getFullYear());
  }

  // ----- Drag&Drop -----
  async function aufTagAblegen(id: string, zielDatum: Date) {
    const eintrag = eintraege.find((e) => e.id === id);
    if (!eintrag) return;
    // bestehende Uhrzeit beibehalten, sonst 09:00
    let std = 9, min = 0;
    if (eintrag.geplant_am) {
      const alt = new Date(eintrag.geplant_am);
      std = alt.getHours();
      min = alt.getMinutes();
    }
    const neu = new Date(zielDatum.getFullYear(), zielDatum.getMonth(), zielDatum.getDate(), std, min);
    // optimistisch
    setEintraege((prev) => prev.map((e) => e.id === id ? { ...e, geplant_am: neu.toISOString() } : e));
    const { error } = await supabase.from('marketing_kalender').update({ geplant_am: neu.toISOString() }).eq('id', id);
    if (error) { alert('Fehler beim Verschieben: ' + error.message); laden(); }
  }

  // ----- Dialog -----
  function neu(vorbelegtDatum?: Date) {
    setBearbeite(null);
    setFTitel(''); setFKampagne(filterKampagne !== 'alle' ? filterKampagne : '');
    setFKanal('email'); setFStatus('geplant');
    if (vorbelegtDatum) {
      const d = new Date(vorbelegtDatum.getFullYear(), vorbelegtDatum.getMonth(), vorbelegtDatum.getDate(), 9, 0);
      setFGeplant(localDatetimeWert(d));
    } else {
      setFGeplant('');
    }
    setFNotiz('');
    setOffen(true);
  }
  function bearbeiten(e: Kalender) {
    setBearbeite(e);
    setFTitel(e.titel); setFKampagne(e.kampagne_id ?? '');
    setFKanal(e.kanal ?? 'email'); setFStatus(e.status);
    setFGeplant(e.geplant_am ? localDatetimeWert(new Date(e.geplant_am)) : '');
    setFNotiz(e.notiz ?? '');
    setOffen(true);
  }
  function localDatetimeWert(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  async function speichernKlick() {
    if (!fTitel.trim()) { alert('Bitte einen Titel eingeben.'); return; }
    setSpeichern(true);
    const payload: Record<string, unknown> = {
      titel: fTitel.trim(),
      kampagne_id: fKampagne || null,
      kanal: fKanal,
      status: fStatus,
      geplant_am: fGeplant ? new Date(fGeplant).toISOString() : null,
      notiz: fNotiz.trim() || null,
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
    laden();
  }
  async function loeschen(e: Kalender) {
    if (!confirm(`Eintrag „${e.titel}" wirklich löschen?`)) return;
    const { error } = await supabase.from('marketing_kalender').delete().eq('id', e.id);
    if (error) { alert('Fehler: ' + error.message); return; }
    setOffen(false);
    laden();
  }

  const heuteKey = tagKey(new Date());

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1280, margin: '0 auto' }}>
        <a href="/dashboard/marketing" style={{ color: C.cyan, fontFamily: 'DM Sans, sans-serif', fontSize: 14, textDecoration: 'none' }}>
          ← Zurück zu Marketing
        </a>

        {/* Kopf */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '16px 0 24px', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 30, fontWeight: 700, color: C.gold, margin: 0 }}>📅 Redaktionskalender</h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0', fontSize: 14 }}>
              Alle geplanten Veröffentlichungen. Termine per Drag&amp;Drop verschieben.
            </p>
          </div>
          <button onClick={() => neu()} style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 20px', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            + Termin
          </button>
        </div>

        {/* Steuerleiste */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => monatWechsel(-1)} style={navBtn}>‹</button>
            <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 19, fontWeight: 700, color: '#fff', minWidth: 170, textAlign: 'center' }}>
              {MONATE[monat]} {jahr}
            </span>
            <button onClick={() => monatWechsel(1)} style={navBtn}>›</button>
            <button onClick={zuHeute} style={{ ...navBtn, width: 'auto', padding: '0 14px', fontSize: 13 }}>Heute</button>
          </div>
          <select value={filterKampagne} onChange={(e) => setFilterKampagne(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 200 }}>
            <option value="alle">Alle Kampagnen</option>
            {kampagnen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </div>

        {fehler && (
          <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: 16, color: C.danger, fontFamily: 'DM Sans, sans-serif', marginBottom: 16 }}>
            {fehler}
          </div>
        )}

        {/* Unterminiert-Ablage */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const id = e.dataTransfer.getData('text/plain');
            if (!id) return;
            // auf Unterminiert ziehen → geplant_am = null
            setEintraege((prev) => prev.map((x) => x.id === id ? { ...x, geplant_am: null } : x));
            supabase.from('marketing_kalender').update({ geplant_am: null }).eq('id', id).then(({ error }: { error: unknown }) => { if (error) laden(); });
          }}
          style={{ background: C.navy2, border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 12, padding: '12px 16px', marginBottom: 18, minHeight: 56 }}
        >
          <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: C.textDim, marginBottom: 8 }}>
            UNTERMINIERT ({unterminiert.length}) — auf einen Tag ziehen, um zu planen
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {unterminiert.length === 0 ? (
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: C.textDim, opacity: 0.6 }}>—</span>
            ) : unterminiert.map((e) => (
              <Chip key={e.id} e={e} kampagne={kampagneName(e.kampagne_id)} onClick={() => bearbeiten(e)} />
            ))}
          </div>
        </div>

        {/* Monatsraster */}
        {loading ? (
          <p style={{ color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Lade Kalender…</p>
        ) : (
          <div>
            {/* Wochentag-Köpfe */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 8 }}>
              {WOCHENTAGE.map((w) => (
                <div key={w} style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: C.textDim, textAlign: 'center', fontWeight: 600 }}>{w}</div>
              ))}
            </div>
            {/* Tageszellen */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
              {zellen.map((d, idx) => {
                if (!d) return <div key={`leer-${idx}`} style={{ minHeight: 110 }} />;
                const key = tagKey(d);
                const istHeute = key === heuteKey;
                const termine = proTag[key] ?? [];
                return (
                  <div
                    key={key}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const id = e.dataTransfer.getData('text/plain');
                      if (id) aufTagAblegen(id, d);
                    }}
                    onClick={() => neu(d)}
                    style={{
                      minHeight: 110,
                      background: C.navy2,
                      borderRadius: 10,
                      border: istHeute ? `1px solid ${C.gold}` : '1px solid rgba(255,255,255,0.06)',
                      padding: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: istHeute ? C.gold : C.textDim, fontWeight: istHeute ? 700 : 400, marginBottom: 6 }}>
                      {d.getDate()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {termine.map((e) => (
                        <Chip key={e.id} e={e} kampagne={kampagneName(e.kampagne_id)} zeit onClick={(ev) => { ev.stopPropagation(); bearbeiten(e); }} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Dialog */}
      {offen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setOffen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.navy, borderRadius: 18, padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${C.gold}` }}>
            <h2 style={{ fontFamily: 'Syne, sans-serif', color: C.gold, fontSize: 23, margin: '0 0 20px' }}>
              {bearbeite ? 'Termin bearbeiten' : 'Neuer Termin'}
            </h2>
            <Feld label="Titel *">
              <input value={fTitel} onChange={(e) => setFTitel(e.target.value)} placeholder="z. B. Newsletter-Versand KW40" style={inputStyle} />
            </Feld>
            <Feld label="Kampagne">
              <select value={fKampagne} onChange={(e) => setFKampagne(e.target.value)} style={inputStyle}>
                <option value="">— keine —</option>
                {kampagnen.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </Feld>
            <div style={{ display: 'flex', gap: 14 }}>
              <Feld label="Kanal">
                <select value={fKanal} onChange={(e) => setFKanal(e.target.value)} style={inputStyle}>
                  {KANAL_OPTS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </Feld>
              <Feld label="Status">
                <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={inputStyle}>
                  {STATUS_OPTS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                </select>
              </Feld>
            </div>
            <Feld label="Geplant am">
              <input type="datetime-local" value={fGeplant} onChange={(e) => setFGeplant(e.target.value)} style={inputStyle} />
            </Feld>
            <Feld label="Notiz">
              <textarea value={fNotiz} onChange={(e) => setFNotiz(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </Feld>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, flexWrap: 'wrap', gap: 12 }}>
              {bearbeite ? (
                <button onClick={() => loeschen(bearbeite)} style={{ background: 'transparent', color: C.danger, border: `1px solid ${C.danger}`, borderRadius: 10, padding: '11px 18px', fontFamily: 'DM Sans, sans-serif', cursor: 'pointer' }}>
                  Löschen
                </button>
              ) : <span />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setOffen(false)} style={{ background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '11px 20px', fontFamily: 'DM Sans, sans-serif', cursor: 'pointer' }}>
                  Abbrechen
                </button>
                <button onClick={speichernKlick} disabled={speichern} style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 24px', fontFamily: 'Syne, sans-serif', fontWeight: 700, cursor: speichern ? 'wait' : 'pointer', opacity: speichern ? 0.7 : 1 }}>
                  {speichern ? 'Speichere…' : 'Speichern'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  background: C.navy2,
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff',
  fontSize: 18,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'DM Sans, sans-serif',
};

function Chip({ e, kampagne, zeit, onClick }: { e: Kalender; kampagne: string; zeit?: boolean; onClick: (ev: React.MouseEvent) => void }) {
  const farbe = statusFarbe(e.status);
  return (
    <div
      draggable
      onDragStart={(ev) => ev.dataTransfer.setData('text/plain', e.id)}
      onClick={onClick}
      title={kampagne ? `${kampagne} · ${e.titel}` : e.titel}
      style={{
        background: 'rgba(255,255,255,0.04)',
        borderLeft: `3px solid ${farbe}`,
        borderRadius: 6,
        padding: '4px 7px',
        cursor: 'grab',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      <div style={{ fontSize: 12, color: '#fff', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {zeit && e.geplant_am ? `${uhrzeit(e.geplant_am)} ` : ''}{e.titel}
      </div>
      {kampagne && (
        <div style={{ fontSize: 10, color: C.textDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{kampagne}</div>
      )}
    </div>
  );
}
