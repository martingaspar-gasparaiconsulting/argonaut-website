'use client';

// ============================================================
// ARGONAUT OS · Bündel 29 · Bildung & Kurse (Dashboard)
// Kurse (mit Plätzen/Belegung) + Anmeldungen je Kurs.
// Pfad: app/dashboard/bildung/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Kurs = { id: string; titel: string; start_am: string | null; ort: string | null; plaetze: number; preis: number; status: string };
type Anmeldung = { id: string; kurs_id: string; name: string; email: string | null; status: string; abgerechnet?: boolean };

function heute() { return new Date().toISOString().slice(0, 10); }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
const AN_STATUS = ['angemeldet', 'bestaetigt', 'teilgenommen', 'storniert'];

export default function BildungPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [kurse, setKurse] = useState<Kurs[]>([]);
  const [anm, setAnm] = useState<Anmeldung[]>([]);
  const [aktiv, setAktiv] = useState<Kurs | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [nk, setNk] = useState({ titel: '', start_am: heute(), ort: '', plaetze: '10', preis: '' });
  const [na, setNa] = useState({ name: '', email: '' });

  const laden_ = useCallback(async () => {
    const { data: k } = await supabase.from('bildung_kurse').select('id, titel, start_am, ort, plaetze, preis, status').order('start_am', { ascending: true });
    setKurse((k as Kurs[]) ?? []);
    const { data: a } = await supabase.from('bildung_anmeldungen').select('id, kurs_id, name, email, status, abgerechnet');
    setAnm((a as Anmeldung[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await laden_(); setLaden(false);
    })();
  }, [laden_]);

  const belegt = useCallback((kid: string) => anm.filter((a) => a.kurs_id === kid && a.status !== 'storniert').length, [anm]);

  async function kursAnlegen() {
    if (!uid || !nk.titel.trim()) { setFehler('Bitte einen Titel angeben.'); return; }
    setFehler(null); setOk(null);
    const { data, error } = await supabase.from('bildung_kurse').insert({
      owner_user_id: uid, titel: nk.titel.trim(), start_am: nk.start_am || null, ort: nk.ort.trim() || null,
      plaetze: parseInt(nk.plaetze, 10) || 10, preis: num(nk.preis),
    }).select('id, titel, start_am, ort, plaetze, preis, status').single();
    if (error || !data) { setFehler('Kurs konnte nicht gespeichert werden.'); return; }
    setNk({ titel: '', start_am: heute(), ort: '', plaetze: '10', preis: '' }); setOk('Kurs gespeichert.'); await laden_(); setAktiv(data as Kurs);
  }
  async function anmelden() {
    if (!uid || !aktiv || !na.name.trim()) { setFehler('Bitte einen Namen angeben.'); return; }
    if (belegt(aktiv.id) >= aktiv.plaetze) { setFehler('Kurs ist ausgebucht.'); return; }
    setFehler(null);
    const { error } = await supabase.from('bildung_anmeldungen').insert({ owner_user_id: uid, kurs_id: aktiv.id, name: na.name.trim(), email: na.email.trim() || null });
    if (error) { setFehler('Anmeldung fehlgeschlagen.'); return; }
    setNa({ name: '', email: '' }); await laden_();
  }
  async function anmStatus(a: Anmeldung, status: string) {
    const { error } = await supabase.from('bildung_anmeldungen').update({ status }).eq('id', a.id);
    if (!error) setAnm((l) => l.map((x) => (x.id === a.id ? { ...x, status } : x)));
  }
  async function rechnungErstellen(a: Anmeldung) {
    if (!aktiv) return;
    if (a.abgerechnet) { setFehler('Diese Anmeldung ist bereits berechnet.'); return; }
    if (!(Number(aktiv.preis) > 0)) { setFehler('Der Kurs hat keinen Preis hinterlegt.'); return; }
    setFehler(null); setOk(null);
    const positionen = [{
      bezeichnung: `Kursgebühr: ${aktiv.titel}`, menge: 1, einheit: 'Teilnahme',
      einzelpreis: Number(aktiv.preis) || 0, mwst_satz: 19,
    }];
    try {
      const res = await fetch('/api/rechnung-aus-fachpaket', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titel: `Kurs: ${aktiv.titel}`, empfaenger_name: a.name,
          empfaenger_email: a.email || undefined, positionen,
          quelle_tabelle: 'bildung_anmeldungen', quelle_ids: [a.id],
        }),
      });
      const j = await res.json();
      if (!res.ok) { setFehler(j?.error || 'Rechnung fehlgeschlagen.'); return; }
      setOk(`Rechnung für ${a.name} erstellt${j?.kontaktVerknuepft ? ' und mit dem Kontakt verknüpft' : ''}. Sie liegt unter „🧾 Rechnungen".`);
      await laden_();
    } catch { setFehler('Netzwerkfehler bei der Rechnungserstellung.'); }
  }

  const aktivAnm = useMemo(() => (aktiv ? anm.filter((a) => a.kurs_id === aktiv.id) : []), [aktiv, anm]);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🎓 Bildung & Kurse</h1>
      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>Kurs anlegen</div>
        <div style={styles.row}>
          <input style={{ ...styles.inp, flex: 1 }} value={nk.titel} onChange={(e) => setNk({ ...nk, titel: e.target.value })} placeholder="Kurstitel" />
          <label style={styles.lab}>Start<input type="date" style={styles.inp} value={nk.start_am} onChange={(e) => setNk({ ...nk, start_am: e.target.value })} /></label>
          <input style={{ ...styles.inp, width: 130 }} value={nk.ort} onChange={(e) => setNk({ ...nk, ort: e.target.value })} placeholder="Ort" />
          <label style={styles.lab}>Plätze<input style={{ ...styles.inp, width: 66 }} value={nk.plaetze} onChange={(e) => setNk({ ...nk, plaetze: e.target.value })} inputMode="numeric" /></label>
          <label style={styles.lab}>Preis €<input style={{ ...styles.inp, width: 76 }} value={nk.preis} onChange={(e) => setNk({ ...nk, preis: e.target.value })} inputMode="decimal" /></label>
          <button style={styles.primaer} onClick={kursAnlegen}>＋ Kurs</button>
        </div>
      </div>

      {laden ? <p style={styles.dim}>Lädt …</p> : (
        <div style={styles.split}>
          <div style={styles.lvListe}>
            {kurse.map((k) => {
              const b = belegt(k.id); const voll = b >= k.plaetze;
              return (
                <button key={k.id} style={{ ...styles.lvItem, ...(aktiv?.id === k.id ? styles.lvAktiv : {}) }} onClick={() => setAktiv(k)}>
                  <div style={{ fontWeight: 700 }}>{k.titel}</div>
                  <div style={{ color: C.textDim, fontSize: 13 }}>{d(k.start_am)}{k.ort ? ` · ${k.ort}` : ''}</div>
                  <div style={{ color: voll ? C.danger : C.green, fontSize: 12, marginTop: 3 }}>{b} / {k.plaetze} belegt{voll ? ' · ausgebucht' : ''}</div>
                </button>
              );
            })}
            {!kurse.length && <p style={styles.dim}>Noch keine Kurse.</p>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {!aktiv ? <p style={styles.dim}>Links einen Kurs wählen.</p> : (
              <div style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontWeight: 800 }}>{aktiv.titel} · Teilnehmer</div>
                  <div style={{ color: C.gold, fontWeight: 800 }}>{belegt(aktiv.id)} / {aktiv.plaetze} · {eur(belegt(aktiv.id) * aktiv.preis)}</div>
                </div>
                <div style={styles.row}>
                  <input style={{ ...styles.inp, flex: 1 }} value={na.name} onChange={(e) => setNa({ ...na, name: e.target.value })} placeholder="Name" />
                  <input style={{ ...styles.inp, width: 170 }} value={na.email} onChange={(e) => setNa({ ...na, email: e.target.value })} placeholder="E-Mail" />
                  <button style={styles.dazuBtn} onClick={anmelden}>＋ Anmelden</button>
                </div>
                {aktivAnm.map((a) => (
                  <div key={a.id} style={styles.posZeile}>
                    <span style={{ flex: 1 }}>{a.name}{a.email ? ` · ${a.email}` : ''}</span>
                    <select style={styles.statusSelect} value={a.status} onChange={(e) => anmStatus(a, e.target.value)}>
                      {AN_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {a.abgerechnet
                      ? <span style={styles.badgeOk}>✓ berechnet</span>
                      : <button style={styles.rechnungBtnSmall} onClick={() => rechnungErstellen(a)}>→ Rechnung</button>}
                  </div>
                ))}
                {!aktivAnm.length && <p style={styles.dim}>Noch keine Anmeldungen.</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  split: { display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 16, marginTop: 12, alignItems: 'start' },
  lvListe: { display: 'flex', flexDirection: 'column', gap: 8 },
  lvItem: { textAlign: 'left', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', color: C.text, fontFamily: 'inherit' },
  lvAktiv: { borderColor: C.gold },
  posZeile: { display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 6, fontSize: 14 },
  statusSelect: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 8px', fontSize: 13, fontFamily: 'inherit' },
  rechnungBtnSmall: { background: 'rgba(76,175,125,0.12)', color: C.green, border: `1px solid ${C.green}`, borderRadius: 8, padding: '6px 11px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  badgeOk: { display: 'inline-block', border: `1px solid ${C.green}`, color: C.green, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' },
  dazuBtn: { background: 'transparent', color: C.text, border: `1px dashed ${C.border}`, borderRadius: 9, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
