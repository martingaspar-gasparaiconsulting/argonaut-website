'use client';

// ============================================================
// ARGONAUT OS · Bündel 27 · Gesundheit & Wellness (Dashboard)
// Kundenkartei (mit Hinweisen) + Behandlungshistorie je Kunde.
// KEINE Medizinberatung — reines Verwaltungswerkzeug.
// Pfad: app/dashboard/wellness/page.tsx
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

type Kunde = { id: string; name: string; telefon: string | null; email: string | null; hinweise: string | null };
type Behandlung = { id: string; datum: string; behandlung: string; dauer_min: number | null; preis: number; notiz: string | null; abgerechnet?: boolean };

function heute() { return new Date().toISOString().slice(0, 10); }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function d(iso: string) { const p = (iso || '').split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }

export default function WellnessPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [aktiv, setAktiv] = useState<Kunde | null>(null);
  const [beh, setBeh] = useState<Behandlung[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [nk, setNk] = useState({ name: '', telefon: '', email: '', geburtsdatum: '', hinweise: '' });
  const [nb, setNb] = useState({ datum: heute(), behandlung: '', dauer_min: '', preis: '', notiz: '' });

  const ladeKunden = useCallback(async () => {
    const { data } = await supabase.from('wellness_kunden').select('id, name, telefon, email, hinweise').order('name', { ascending: true });
    setKunden((data as Kunde[]) ?? []);
  }, []);
  const ladeBeh = useCallback(async (kid: string) => {
    const { data } = await supabase.from('wellness_behandlungen').select('id, datum, behandlung, dauer_min, preis, notiz, abgerechnet').eq('kunde_id', kid).order('datum', { ascending: false });
    setBeh((data as Behandlung[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await ladeKunden(); setLaden(false);
    })();
  }, [ladeKunden]);

  async function kundeAnlegen() {
    if (!uid || !nk.name.trim()) { setFehler('Bitte einen Namen angeben.'); return; }
    setFehler(null); setOk(null);
    const { data, error } = await supabase.from('wellness_kunden').insert({
      owner_user_id: uid, name: nk.name.trim(), telefon: nk.telefon.trim() || null, email: nk.email.trim() || null,
      geburtsdatum: nk.geburtsdatum || null, hinweise: nk.hinweise.trim() || null,
    }).select('id, name, telefon, email, hinweise').single();
    if (error || !data) { setFehler('Kunde konnte nicht gespeichert werden.'); return; }
    setNk({ name: '', telefon: '', email: '', geburtsdatum: '', hinweise: '' }); setOk('Kunde gespeichert.'); await ladeKunden();
    setAktiv(data as Kunde); setBeh([]);
  }
  async function kundeOeffnen(k: Kunde) { setAktiv(k); await ladeBeh(k.id); }
  async function behAnlegen() {
    if (!uid || !aktiv || !nb.behandlung.trim()) { setFehler('Bitte eine Behandlung angeben.'); return; }
    setFehler(null);
    const { error } = await supabase.from('wellness_behandlungen').insert({
      owner_user_id: uid, kunde_id: aktiv.id, datum: nb.datum, behandlung: nb.behandlung.trim(),
      dauer_min: nb.dauer_min ? parseInt(nb.dauer_min, 10) : null, preis: num(nb.preis), notiz: nb.notiz.trim() || null,
    });
    if (error) { setFehler('Behandlung konnte nicht gespeichert werden.'); return; }
    setNb({ datum: heute(), behandlung: '', dauer_min: '', preis: '', notiz: '' }); await ladeBeh(aktiv.id);
  }

  async function rechnungErstellen() {
    if (!aktiv) return;
    const offen = beh.filter((b) => !b.abgerechnet && Number(b.preis) > 0);
    if (!offen.length) { setFehler('Keine offenen, bepreisten Behandlungen zum Abrechnen.'); return; }
    setFehler(null); setOk(null);
    const positionen = offen.map((b) => ({
      bezeichnung: `${d(b.datum)} · ${b.behandlung}`, menge: 1, einheit: 'Leistung',
      einzelpreis: Number(b.preis) || 0, mwst_satz: 19,
    }));
    try {
      const res = await fetch('/api/rechnung-aus-fachpaket', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titel: `Wellness · ${aktiv.name}`, empfaenger_name: aktiv.name,
          empfaenger_email: aktiv.email || undefined, positionen,
          quelle_tabelle: 'wellness_behandlungen', quelle_ids: offen.map((b) => b.id),
        }),
      });
      const j = await res.json();
      if (!res.ok) { setFehler(j?.error || 'Rechnung fehlgeschlagen.'); return; }
      setOk(`Rechnung über ${offen.length} Position(en) erstellt${j?.kontaktVerknuepft ? ' und mit dem Kontakt verknüpft' : ''}. Sie liegt unter „🧾 Rechnungen".`);
      await ladeBeh(aktiv.id);
    } catch { setFehler('Netzwerkfehler bei der Rechnungserstellung.'); }
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>💆 Gesundheit & Wellness</h1>
      <p style={styles.sub}>Kundenkartei mit Hinweisen und Behandlungshistorie. Reines Verwaltungswerkzeug — keine medizinische Beratung.</p>
      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>Kunde anlegen</div>
        <div style={styles.row}>
          <input style={{ ...styles.inp, flex: 1 }} value={nk.name} onChange={(e) => setNk({ ...nk, name: e.target.value })} placeholder="Name" />
          <input style={{ ...styles.inp, width: 130 }} value={nk.telefon} onChange={(e) => setNk({ ...nk, telefon: e.target.value })} placeholder="Telefon" />
          <input style={{ ...styles.inp, width: 160 }} value={nk.email} onChange={(e) => setNk({ ...nk, email: e.target.value })} placeholder="E-Mail" />
          <label style={styles.lab}>Geburtstag<input type="date" style={styles.inp} value={nk.geburtsdatum} onChange={(e) => setNk({ ...nk, geburtsdatum: e.target.value })} /></label>
          <input style={{ ...styles.inp, flex: 1 }} value={nk.hinweise} onChange={(e) => setNk({ ...nk, hinweise: e.target.value })} placeholder="Hinweise (Allergien, Wünsche …)" />
          <button style={styles.primaer} onClick={kundeAnlegen}>＋ Kunde</button>
        </div>
      </div>

      {laden ? <p style={styles.dim}>Lädt …</p> : (
        <div style={styles.split}>
          <div style={styles.lvListe}>
            {kunden.map((k) => (
              <button key={k.id} style={{ ...styles.lvItem, ...(aktiv?.id === k.id ? styles.lvAktiv : {}) }} onClick={() => kundeOeffnen(k)}>
                <div style={{ fontWeight: 700 }}>{k.name}</div>
                <div style={{ color: C.textDim, fontSize: 13 }}>{k.telefon || k.email || '—'}</div>
              </button>
            ))}
            {!kunden.length && <p style={styles.dim}>Noch keine Kunden.</p>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {!aktiv ? <p style={styles.dim}>Links einen Kunden wählen.</p> : (
              <div style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontWeight: 800 }}>{aktiv.name}</div>
                  <button style={styles.rechnungBtn} onClick={rechnungErstellen}>→ Rechnung aus offenen Behandlungen</button>
                </div>
                {aktiv.hinweise && <div style={styles.hinweis}>⚠️ {aktiv.hinweise}</div>}
                <div style={styles.row}>
                  <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={nb.datum} onChange={(e) => setNb({ ...nb, datum: e.target.value })} /></label>
                  <input style={{ ...styles.inp, flex: 1 }} value={nb.behandlung} onChange={(e) => setNb({ ...nb, behandlung: e.target.value })} placeholder="Behandlung" />
                  <label style={styles.lab}>Min<input style={{ ...styles.inp, width: 60 }} value={nb.dauer_min} onChange={(e) => setNb({ ...nb, dauer_min: e.target.value })} inputMode="numeric" /></label>
                  <label style={styles.lab}>€<input style={{ ...styles.inp, width: 70 }} value={nb.preis} onChange={(e) => setNb({ ...nb, preis: e.target.value })} inputMode="decimal" /></label>
                  <button style={styles.dazuBtn} onClick={behAnlegen}>＋</button>
                </div>
                {beh.map((b) => (
                  <div key={b.id} style={styles.posZeile}>
                    <span style={{ minWidth: 84 }}>{d(b.datum)}</span>
                    <span style={{ flex: 1 }}>{b.behandlung}{b.notiz ? ` · ${b.notiz}` : ''}</span>
                    {b.abgerechnet && <span style={styles.badgeOk}>✓ berechnet</span>}
                    <span style={{ color: C.textDim }}>{b.dauer_min ? `${b.dauer_min}′ · ` : ''}{eur(b.preis)}</span>
                  </div>
                ))}
                {!beh.length && <p style={styles.dim}>Noch keine Behandlungen.</p>}
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
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  split: { display: 'grid', gridTemplateColumns: 'minmax(200px, 280px) 1fr', gap: 16, marginTop: 12, alignItems: 'start' },
  lvListe: { display: 'flex', flexDirection: 'column', gap: 8 },
  lvItem: { textAlign: 'left', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', color: C.text, fontFamily: 'inherit' },
  lvAktiv: { borderColor: C.gold },
  hinweis: { background: 'rgba(224,162,76,0.1)', border: `1px solid ${C.warn}`, borderRadius: 9, padding: '8px 12px', fontSize: 13.5 },
  posZeile: { display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 6, fontSize: 14 },
  dazuBtn: { background: 'transparent', color: C.text, border: `1px dashed ${C.border}`, borderRadius: 9, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  rechnungBtn: { background: 'rgba(76,175,125,0.12)', color: C.green, border: `1px solid ${C.green}`, borderRadius: 10, padding: '9px 14px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  badgeOk: { display: 'inline-block', border: `1px solid ${C.green}`, color: C.green, borderRadius: 999, padding: '2px 9px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
