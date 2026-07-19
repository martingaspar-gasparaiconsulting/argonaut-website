'use client';

// ============================================================
// ARGONAUT OS · Bündel 33 · Verein, Kultur & Sozial (Dashboard)
// Reiter "Mitglieder" (mit Beitrag/Jahresvolumen) und "Veranstaltungen".
// Hinweis: SEPA-Einzug der Beiträge läuft über das Modul „Mitglieder & Abos".
// Pfad: app/dashboard/verein/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Mitglied = { id: string; name: string; email: string | null; beitrag: number; intervall: string; rolle: string | null; status: string };
type Veranstaltung = { id: string; titel: string; datum: string | null; ort: string | null; teilnehmer: number; ehrenamt_stunden: number };

function heute() { return new Date().toISOString().slice(0, 10); }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function jahresBeitrag(m: Mitglied) { const f = m.intervall === 'monat' ? 12 : m.intervall === 'quartal' ? 4 : 1; return (Number(m.beitrag) || 0) * f; }

export default function VereinPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [tab, setTab] = useState<'mitglieder' | 'veranstaltungen'>('mitglieder');
  const [mitglieder, setMitglieder] = useState<Mitglied[]>([]);
  const [veranst, setVeranst] = useState<Veranstaltung[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [nm, setNm] = useState({ name: '', email: '', beitrag: '', intervall: 'jahr', rolle: 'Mitglied' });
  const [nv, setNv] = useState({ titel: '', datum: heute(), ort: '', teilnehmer: '', ehrenamt_stunden: '' });

  const laden_ = useCallback(async () => {
    const { data: m } = await supabase.from('verein_mitglieder').select('id, name, email, beitrag, intervall, rolle, status').order('name', { ascending: true });
    setMitglieder((m as Mitglied[]) ?? []);
    const { data: v } = await supabase.from('verein_veranstaltungen').select('id, titel, datum, ort, teilnehmer, ehrenamt_stunden').order('datum', { ascending: false });
    setVeranst((v as Veranstaltung[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await laden_(); setLaden(false);
    })();
  }, [laden_]);

  async function mitgliedAnlegen() {
    if (!uid || !nm.name.trim()) { setFehler('Bitte einen Namen angeben.'); return; }
    setFehler(null); setOk(null);
    const { error } = await supabase.from('verein_mitglieder').insert({
      owner_user_id: uid, name: nm.name.trim(), email: nm.email.trim() || null, beitrag: num(nm.beitrag), intervall: nm.intervall, rolle: nm.rolle.trim() || null,
    });
    if (error) { setFehler('Mitglied konnte nicht gespeichert werden.'); return; }
    setNm({ name: '', email: '', beitrag: '', intervall: 'jahr', rolle: 'Mitglied' }); setOk('Mitglied gespeichert.'); await laden_();
  }
  async function veranstAnlegen() {
    if (!uid || !nv.titel.trim()) { setFehler('Bitte einen Titel angeben.'); return; }
    setFehler(null); setOk(null);
    const { error } = await supabase.from('verein_veranstaltungen').insert({
      owner_user_id: uid, titel: nv.titel.trim(), datum: nv.datum || null, ort: nv.ort.trim() || null,
      teilnehmer: parseInt(nv.teilnehmer, 10) || 0, ehrenamt_stunden: num(nv.ehrenamt_stunden),
    });
    if (error) { setFehler('Veranstaltung konnte nicht gespeichert werden.'); return; }
    setNv({ titel: '', datum: heute(), ort: '', teilnehmer: '', ehrenamt_stunden: '' }); setOk('Veranstaltung gespeichert.'); await laden_();
  }

  const aktive = mitglieder.filter((m) => m.status === 'aktiv');
  const jahresvolumen = aktive.reduce((s, m) => s + jahresBeitrag(m), 0);
  const ehrenamtSumme = veranst.reduce((s, v) => s + (Number(v.ehrenamt_stunden) || 0), 0);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🤝 Verein, Kultur & Sozial</h1>
      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'mitglieder' ? styles.tabAn : {}) }} onClick={() => setTab('mitglieder')}>👥 Mitglieder</button>
        <button style={{ ...styles.tab, ...(tab === 'veranstaltungen' ? styles.tabAn : {}) }} onClick={() => setTab('veranstaltungen')}>🎪 Veranstaltungen</button>
      </div>
      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {tab === 'mitglieder' ? (
        <>
          <div style={styles.kacheln}>
            <div style={styles.kachel}><div style={styles.kLabel}>Aktive Mitglieder</div><div style={styles.kWert}>{aktive.length}</div></div>
            <div style={styles.kachel}><div style={styles.kLabel}>Beitragsvolumen / Jahr</div><div style={{ ...styles.kWert, color: C.gold }}>{eur(jahresvolumen)}</div></div>
          </div>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Mitglied anlegen</div>
            <div style={styles.row}>
              <input style={{ ...styles.inp, flex: 1 }} value={nm.name} onChange={(e) => setNm({ ...nm, name: e.target.value })} placeholder="Name" />
              <input style={{ ...styles.inp, width: 170 }} value={nm.email} onChange={(e) => setNm({ ...nm, email: e.target.value })} placeholder="E-Mail" />
              <label style={styles.lab}>Beitrag €<input style={{ ...styles.inp, width: 76 }} value={nm.beitrag} onChange={(e) => setNm({ ...nm, beitrag: e.target.value })} inputMode="decimal" /></label>
              <select style={styles.inp} value={nm.intervall} onChange={(e) => setNm({ ...nm, intervall: e.target.value })}><option value="monat">monatl.</option><option value="quartal">quartal</option><option value="jahr">jährl.</option></select>
              <input style={{ ...styles.inp, width: 120 }} value={nm.rolle} onChange={(e) => setNm({ ...nm, rolle: e.target.value })} placeholder="Rolle" />
              <button style={styles.primaer} onClick={mitgliedAnlegen}>＋ Mitglied</button>
            </div>
            <div style={{ color: C.textDim, fontSize: 12.5 }}>💡 Beitrags-Einzug per SEPA läuft über das Modul „👥 Mitglieder & Abos".</div>
          </div>
          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.liste}>
              {mitglieder.map((m) => (
                <div key={m.id} style={styles.item}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{m.name} <span style={{ color: C.textDim, fontWeight: 400 }}>· {m.rolle || 'Mitglied'}</span></div>
                    <div style={{ color: C.textDim, fontSize: 13 }}>{eur(m.beitrag)} / {m.intervall} · {eur(jahresBeitrag(m))}/Jahr</div>
                  </div>
                  <span style={{ ...styles.badge, color: m.status === 'aktiv' ? C.green : C.textDim, borderColor: m.status === 'aktiv' ? C.green : C.border }}>{m.status}</span>
                </div>
              ))}
              {!mitglieder.length && <p style={styles.dim}>Noch keine Mitglieder.</p>}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={styles.kacheln}>
            <div style={styles.kachel}><div style={styles.kLabel}>Veranstaltungen</div><div style={styles.kWert}>{veranst.length}</div></div>
            <div style={styles.kachel}><div style={styles.kLabel}>Ehrenamt-Stunden</div><div style={{ ...styles.kWert, color: C.gold }}>{ehrenamtSumme.toLocaleString('de-DE')} h</div></div>
          </div>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Veranstaltung anlegen</div>
            <div style={styles.row}>
              <input style={{ ...styles.inp, flex: 1 }} value={nv.titel} onChange={(e) => setNv({ ...nv, titel: e.target.value })} placeholder="Titel" />
              <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={nv.datum} onChange={(e) => setNv({ ...nv, datum: e.target.value })} /></label>
              <input style={{ ...styles.inp, width: 130 }} value={nv.ort} onChange={(e) => setNv({ ...nv, ort: e.target.value })} placeholder="Ort" />
              <label style={styles.lab}>Teiln.<input style={{ ...styles.inp, width: 66 }} value={nv.teilnehmer} onChange={(e) => setNv({ ...nv, teilnehmer: e.target.value })} inputMode="numeric" /></label>
              <label style={styles.lab}>Ehrenamt h<input style={{ ...styles.inp, width: 76 }} value={nv.ehrenamt_stunden} onChange={(e) => setNv({ ...nv, ehrenamt_stunden: e.target.value })} inputMode="decimal" /></label>
              <button style={styles.primaer} onClick={veranstAnlegen}>＋ Veranstaltung</button>
            </div>
          </div>
          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.liste}>
              {veranst.map((v) => (
                <div key={v.id} style={styles.item}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{v.titel}</div>
                    <div style={{ color: C.textDim, fontSize: 13 }}>{d(v.datum)}{v.ort ? ` · ${v.ort}` : ''} · {v.teilnehmer} Teilnehmer{v.ehrenamt_stunden ? ` · ${v.ehrenamt_stunden} h Ehrenamt` : ''}</div>
                  </div>
                </div>
              ))}
              {!veranst.length && <p style={styles.dim}>Noch keine Veranstaltungen.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  tabs: { display: 'flex', gap: 8, margin: '16px 0 6px' },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  kacheln: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 12 },
  kachel: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
  kLabel: { color: C.textDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' },
  kWert: { fontSize: 22, fontWeight: 800, marginTop: 3 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  liste: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 },
  item: { display: 'flex', gap: 12, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', flexWrap: 'wrap' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '4px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
