'use client';

// ============================================================
// ARGONAUT OS · Bündel 19 · Bau & Handwerk komplett (Dashboard)
// Reiter "LV / Kalkulation" (Leistungsverzeichnis + Nachträge -> Rechnung)
// und "Abnahme" (Abnahmeprotokoll mit Mängelliste).
// Pfad: app/dashboard/bau-lv/page.tsx
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

type LV = { id: string; titel: string; kunde_name: string | null; status: string; netto_summe: number; rechnung_id: string | null };
type Pos = { id: string; ordnungszahl: string | null; kurztext: string; menge: number; einheit: string; einzelpreis: number; mwst_satz: number; gesamt_netto: number; ist_nachtrag: boolean; nachtrag_grund: string | null; position: number };
type Mangel = { beschreibung: string; frist: string; behoben: boolean };
type Abnahme = { id: string; titel: string; datum: string; ort: string | null; art: string; maengel: Mangel[]; unterschrift_name: string | null };

function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function heute() { return new Date().toISOString().slice(0, 10); }
function dHu(iso: string) { const p = (iso || '').split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }

const ART_LABEL: Record<string, string> = { voll: 'Abnahme ohne Vorbehalt', unter_vorbehalt: 'Abnahme unter Vorbehalt', verweigert: 'Abnahme verweigert' };
const ART_FARBE: Record<string, string> = { voll: C.green, unter_vorbehalt: C.warn, verweigert: C.danger };

const LEER_POS = { ordnungszahl: '', kurztext: '', menge: '1', einheit: 'm²', einzelpreis: '', mwst_satz: '19', ist_nachtrag: false, nachtrag_grund: '' };

export default function BauLvPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [tab, setTab] = useState<'lv' | 'abnahme'>('lv');
  const [lvs, setLvs] = useState<LV[]>([]);
  const [aktivLv, setAktivLv] = useState<LV | null>(null);
  const [positionen, setPositionen] = useState<Pos[]>([]);
  const [abnahmen, setAbnahmen] = useState<Abnahme[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [neuLv, setNeuLv] = useState({ titel: '', kunde: '' });
  const [pos, setPos] = useState({ ...LEER_POS });

  const [ab, setAb] = useState({ titel: 'Abnahme', datum: heute(), ort: '', teilnehmer: '', art: 'voll', unterschrift_name: '' });
  const [maengel, setMaengel] = useState<Mangel[]>([]);
  const [mangel, setMangel] = useState({ beschreibung: '', frist: '' });

  const ladeLvs = useCallback(async () => {
    const { data } = await supabase.from('bau_lv').select('id, titel, kunde_name, status, netto_summe, rechnung_id').order('erstellt_am', { ascending: false });
    setLvs((data as LV[]) ?? []);
  }, []);
  const ladeAbnahmen = useCallback(async () => {
    const { data } = await supabase.from('bau_abnahmen').select('id, titel, datum, ort, art, maengel, unterschrift_name').order('datum', { ascending: false });
    setAbnahmen(((data as Record<string, unknown>[]) ?? []).map((a) => ({ ...a, maengel: (a.maengel as Mangel[]) || [] })) as Abnahme[]);
  }, []);
  const ladePositionen = useCallback(async (lvId: string) => {
    const { data } = await supabase.from('bau_lv_positionen').select('id, ordnungszahl, kurztext, menge, einheit, einzelpreis, mwst_satz, gesamt_netto, ist_nachtrag, nachtrag_grund, position').eq('lv_id', lvId).order('position', { ascending: true });
    setPositionen((data as Pos[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      await ladeLvs(); await ladeAbnahmen();
      setLaden(false);
    })();
  }, [ladeLvs, ladeAbnahmen]);

  async function lvAnlegen() {
    if (!uid || !neuLv.titel.trim()) { setFehler('Bitte einen Titel angeben.'); return; }
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { data, error } = await supabase.from('bau_lv').insert({ owner_user_id: uid, titel: neuLv.titel.trim(), kunde_name: neuLv.kunde.trim() || null })
        .select('id, titel, kunde_name, status, netto_summe, rechnung_id').single();
      if (error || !data) { setFehler('LV konnte nicht angelegt werden.'); return; }
      setLvs((l) => [data as LV, ...l]); setNeuLv({ titel: '', kunde: '' });
      setAktivLv(data as LV); setPositionen([]);
    } finally { setBusy(false); }
  }

  async function lvOeffnen(lv: LV) { setAktivLv(lv); setOk(null); setFehler(null); await ladePositionen(lv.id); }

  async function summeAktualisieren(lvId: string) {
    const { data } = await supabase.from('bau_lv_positionen').select('gesamt_netto').eq('lv_id', lvId);
    const summe = ((data as { gesamt_netto: number }[]) ?? []).reduce((s, p) => s + (Number(p.gesamt_netto) || 0), 0);
    await supabase.from('bau_lv').update({ netto_summe: Math.round(summe * 100) / 100, aktualisiert_am: new Date().toISOString() }).eq('id', lvId);
    setLvs((l) => l.map((x) => (x.id === lvId ? { ...x, netto_summe: Math.round(summe * 100) / 100 } : x)));
    setAktivLv((a) => (a && a.id === lvId ? { ...a, netto_summe: Math.round(summe * 100) / 100 } : a));
  }

  async function posAnlegen() {
    if (!uid || !aktivLv) return;
    if (!pos.kurztext.trim()) { setFehler('Bitte einen Kurztext angeben.'); return; }
    setBusy(true); setFehler(null);
    try {
      const gesamt = Math.round(num(pos.menge) * num(pos.einzelpreis) * 100) / 100;
      const { error } = await supabase.from('bau_lv_positionen').insert({
        owner_user_id: uid, lv_id: aktivLv.id, ordnungszahl: pos.ordnungszahl.trim() || null, kurztext: pos.kurztext.trim(),
        menge: num(pos.menge), einheit: pos.einheit.trim() || 'Stk', einzelpreis: num(pos.einzelpreis), mwst_satz: num(pos.mwst_satz),
        gesamt_netto: gesamt, ist_nachtrag: pos.ist_nachtrag, nachtrag_grund: pos.ist_nachtrag ? (pos.nachtrag_grund.trim() || null) : null,
        position: positionen.length + 1,
      });
      if (error) { setFehler('Position konnte nicht gespeichert werden.'); return; }
      setPos({ ...LEER_POS });
      await ladePositionen(aktivLv.id); await summeAktualisieren(aktivLv.id);
    } finally { setBusy(false); }
  }
  async function posLoeschen(id: string) {
    if (!aktivLv) return;
    const { error } = await supabase.from('bau_lv_positionen').delete().eq('id', id);
    if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
    await ladePositionen(aktivLv.id); await summeAktualisieren(aktivLv.id);
  }

  async function inRechnung() {
    if (!aktivLv) return;
    setBusy(true); setFehler(null); setOk(null);
    try {
      const res = await fetch('/api/rechnung-aus-lv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lvId: aktivLv.id }) });
      const j = await res.json();
      if (!res.ok) { setFehler(j?.error || 'Umwandlung fehlgeschlagen.'); return; }
      setOk(j.bereitsVorhanden ? 'Zu diesem LV gibt es bereits eine Rechnung.' : 'Rechnung erstellt — unter „🧾 Rechnungen".');
      await ladeLvs();
    } finally { setBusy(false); }
  }

  function mangelDazu() { if (!mangel.beschreibung.trim()) return; setMaengel((m) => [...m, { beschreibung: mangel.beschreibung.trim(), frist: mangel.frist, behoben: false }]); setMangel({ beschreibung: '', frist: '' }); }
  async function abnahmeSpeichern() {
    if (!uid) return;
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('bau_abnahmen').insert({
        owner_user_id: uid, titel: ab.titel.trim() || 'Abnahme', datum: ab.datum, ort: ab.ort.trim() || null,
        teilnehmer: ab.teilnehmer.trim() || null, art: ab.art, maengel, unterschrift_name: ab.unterschrift_name.trim() || null,
      });
      if (error) { setFehler('Abnahme konnte nicht gespeichert werden.'); return; }
      setAb({ titel: 'Abnahme', datum: heute(), ort: '', teilnehmer: '', art: 'voll', unterschrift_name: '' }); setMaengel([]);
      setOk('Abnahmeprotokoll gespeichert.'); await ladeAbnahmen();
    } finally { setBusy(false); }
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🏗 Bau & Handwerk</h1>
      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'lv' ? styles.tabAn : {}) }} onClick={() => setTab('lv')}>📐 LV / Kalkulation</button>
        <button style={{ ...styles.tab, ...(tab === 'abnahme' ? styles.tabAn : {}) }} onClick={() => setTab('abnahme')}>✅ Abnahme</button>
      </div>

      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {tab === 'lv' ? (
        <>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Neues Leistungsverzeichnis</div>
            <div style={styles.row}>
              <input style={styles.inp} value={neuLv.titel} onChange={(e) => setNeuLv({ ...neuLv, titel: e.target.value })} placeholder="Titel (z. B. Rohbau Haus Müller)" />
              <input style={styles.inp} value={neuLv.kunde} onChange={(e) => setNeuLv({ ...neuLv, kunde: e.target.value })} placeholder="Kunde" />
              <button style={{ ...styles.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={lvAnlegen}>＋ Anlegen</button>
            </div>
          </div>

          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.split}>
              <div style={styles.lvListe}>
                {lvs.map((lv) => (
                  <button key={lv.id} style={{ ...styles.lvItem, ...(aktivLv?.id === lv.id ? styles.lvAktiv : {}) }} onClick={() => lvOeffnen(lv)}>
                    <div style={{ fontWeight: 700 }}>{lv.titel}</div>
                    <div style={{ color: C.textDim, fontSize: 13 }}>{lv.kunde_name || '—'} · {eur(lv.netto_summe)} netto · {lv.status}</div>
                  </button>
                ))}
                {!lvs.length && <p style={styles.dim}>Noch keine LVs.</p>}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {!aktivLv ? <p style={styles.dim}>Links ein LV wählen oder oben ein neues anlegen.</p> : (
                  <div style={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ fontWeight: 800 }}>{aktivLv.titel}</div>
                      <div style={{ fontWeight: 800, color: C.gold }}>{eur(aktivLv.netto_summe)} netto</div>
                    </div>

                    {positionen.map((p) => (
                      <div key={p.id} style={styles.posZeile}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>
                            {p.ist_nachtrag && <span style={styles.ntBadge}>Nachtrag</span>}
                            {p.ordnungszahl ? `${p.ordnungszahl} · ` : ''}{p.kurztext}
                          </div>
                          <div style={{ color: C.textDim, fontSize: 12.5 }}>{p.menge.toLocaleString('de-DE')} {p.einheit} × {eur(p.einzelpreis)}{p.nachtrag_grund ? ` · ${p.nachtrag_grund}` : ''}</div>
                        </div>
                        <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{eur(p.gesamt_netto)}</div>
                        <button style={styles.wegBtn} onClick={() => posLoeschen(p.id)}>✕</button>
                      </div>
                    ))}

                    <div style={styles.posForm}>
                      <input style={{ ...styles.inp, width: 78 }} value={pos.ordnungszahl} onChange={(e) => setPos({ ...pos, ordnungszahl: e.target.value })} placeholder="OZ" />
                      <input style={{ ...styles.inp, flex: 1, minWidth: 120 }} value={pos.kurztext} onChange={(e) => setPos({ ...pos, kurztext: e.target.value })} placeholder="Kurztext" />
                      <input style={{ ...styles.inp, width: 60 }} value={pos.menge} onChange={(e) => setPos({ ...pos, menge: e.target.value })} placeholder="Menge" inputMode="decimal" />
                      <input style={{ ...styles.inp, width: 56 }} value={pos.einheit} onChange={(e) => setPos({ ...pos, einheit: e.target.value })} placeholder="Einh." />
                      <input style={{ ...styles.inp, width: 76 }} value={pos.einzelpreis} onChange={(e) => setPos({ ...pos, einzelpreis: e.target.value })} placeholder="EP €" inputMode="decimal" />
                      <select style={{ ...styles.inp, width: 56 }} value={pos.mwst_satz} onChange={(e) => setPos({ ...pos, mwst_satz: e.target.value })}><option value="19">19%</option><option value="7">7%</option></select>
                    </div>
                    <div style={styles.ntRow}>
                      <label style={styles.check}><input type="checkbox" checked={pos.ist_nachtrag} onChange={(e) => setPos({ ...pos, ist_nachtrag: e.target.checked })} /> Nachtrag</label>
                      {pos.ist_nachtrag && <input style={{ ...styles.inp, flex: 1 }} value={pos.nachtrag_grund} onChange={(e) => setPos({ ...pos, nachtrag_grund: e.target.value })} placeholder="Grund des Nachtrags" />}
                      <button style={styles.dazuBtn} disabled={busy} onClick={posAnlegen}>＋ Position</button>
                    </div>

                    <button style={{ ...styles.rechnungBtn, opacity: busy || !positionen.length ? 0.6 : 1 }} disabled={busy || !positionen.length} onClick={inRechnung}>🧾 Aus LV eine Rechnung erstellen</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={styles.card}>
            <div style={{ fontWeight: 800 }}>Neues Abnahmeprotokoll</div>
            <div style={styles.row}>
              <input style={styles.inp} value={ab.titel} onChange={(e) => setAb({ ...ab, titel: e.target.value })} placeholder="Titel" />
              <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={ab.datum} onChange={(e) => setAb({ ...ab, datum: e.target.value })} /></label>
              <input style={styles.inp} value={ab.ort} onChange={(e) => setAb({ ...ab, ort: e.target.value })} placeholder="Ort / Bauvorhaben" />
            </div>
            <div style={styles.row}>
              <input style={styles.inp} value={ab.teilnehmer} onChange={(e) => setAb({ ...ab, teilnehmer: e.target.value })} placeholder="Teilnehmer" />
              <select style={styles.inp} value={ab.art} onChange={(e) => setAb({ ...ab, art: e.target.value })}>
                {Object.entries(ART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input style={styles.inp} value={ab.unterschrift_name} onChange={(e) => setAb({ ...ab, unterschrift_name: e.target.value })} placeholder="Name (Bauherr)" />
            </div>

            <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>Mängel</div>
            {maengel.map((m, i) => (
              <div key={i} style={styles.mangelZeile}>
                <span style={{ flex: 1 }}>{m.beschreibung}</span>
                <span style={{ color: C.textDim, fontSize: 13 }}>{m.frist ? `Frist ${dHu(m.frist)}` : 'ohne Frist'}</span>
                <button style={styles.wegBtn} onClick={() => setMaengel((x) => x.filter((_, k) => k !== i))}>✕</button>
              </div>
            ))}
            <div style={styles.row}>
              <input style={{ ...styles.inp, flex: 1 }} value={mangel.beschreibung} onChange={(e) => setMangel({ ...mangel, beschreibung: e.target.value })} placeholder="Mangel beschreiben" />
              <label style={styles.lab}>Frist<input type="date" style={styles.inp} value={mangel.frist} onChange={(e) => setMangel({ ...mangel, frist: e.target.value })} /></label>
              <button style={styles.dazuBtn} onClick={mangelDazu}>＋ Mangel</button>
            </div>

            <button style={{ ...styles.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={abnahmeSpeichern}>💾 Abnahme speichern</button>
          </div>

          <div style={styles.liste}>
            {abnahmen.map((a) => (
              <div key={a.id} style={styles.item}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{a.titel} <span style={{ color: C.textDim, fontWeight: 400 }}>· {dHu(a.datum)}{a.ort ? ` · ${a.ort}` : ''}</span></div>
                  <div style={{ color: C.textDim, fontSize: 13 }}>{(a.maengel || []).length} Mangel/Mängel{a.unterschrift_name ? ` · ${a.unterschrift_name}` : ''}</div>
                </div>
                <span style={{ ...styles.badge, color: ART_FARBE[a.art] || C.textDim, borderColor: ART_FARBE[a.art] || C.border }}>{ART_LABEL[a.art] || a.art}</span>
              </div>
            ))}
            {!abnahmen.length && <p style={styles.dim}>Noch keine Abnahmen.</p>}
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  tabs: { display: 'flex', gap: 8, margin: '16px 0 6px' },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' },
  split: { display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 16, marginTop: 12, alignItems: 'start' },
  lvListe: { display: 'flex', flexDirection: 'column', gap: 8 },
  lvItem: { textAlign: 'left', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', color: C.text, fontFamily: 'inherit' },
  lvAktiv: { borderColor: C.gold },
  posZeile: { display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 8 },
  ntBadge: { background: C.warn, color: C.navy, borderRadius: 6, padding: '1px 6px', fontSize: 11, fontWeight: 800, marginRight: 6 },
  posForm: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  ntRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: C.text, cursor: 'pointer', whiteSpace: 'nowrap' },
  dazuBtn: { background: 'transparent', color: C.text, border: `1px dashed ${C.border}`, borderRadius: 9, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  rechnungBtn: { background: C.green, color: '#04240f', border: 'none', borderRadius: 10, padding: '12px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', marginTop: 6 },
  wegBtn: { background: 'transparent', color: C.danger, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', cursor: 'pointer' },
  mangelZeile: { display: 'flex', gap: 10, alignItems: 'center', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px' },
  liste: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 },
  item: { display: 'flex', gap: 12, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', flexWrap: 'wrap' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '4px 12px', fontSize: 12.5, fontWeight: 700 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
