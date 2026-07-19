'use client';

// ============================================================
// ARGONAUT OS · Welle 4 · Wiederkehrende Rechnungen (Abos)
// Vorlage anlegen (Empfänger, Positionen, Intervall) -> per Klick oder wenn
// fällig die nächste echte Rechnung erzeugen (Wartung, Retainer, Miete …).
// Pfad: app/dashboard/abo-rechnungen/page.tsx
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

type PosRow = { bezeichnung: string; menge: string; einheit: string; einzelpreis: string; mwst_satz: string };
type PosJson = { bezeichnung: string; menge: number; einheit: string; einzelpreis: number; mwst_satz: number };
type Kontakt = { id: string; name: string; email: string | null };
type Abo = {
  id: string; kontakt_id: string | null; empfaenger_name: string | null; titel: string;
  positionen: PosJson[]; intervall: string; naechste_faellig: string; aktiv: boolean;
  zuletzt_erzeugt: string | null; anzahl_erzeugt: number;
};

const INTERVALLE = [{ w: 'monat', l: 'monatlich' }, { w: 'quartal', l: 'vierteljährlich' }, { w: 'jahr', l: 'jährlich' }];
function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function heute() { return new Date().toISOString().slice(0, 10); }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function kontaktName(k: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return s(k.anzeigename) || [s(k.vorname), s(k.nachname)].filter(Boolean).join(' ') || s(k.name) || s(k.firmenname) || s(k.firma) || s(k.email) || 'Kontakt';
}
const LEER_POS: PosRow = { bezeichnung: '', menge: '1', einheit: 'Pauschal', einzelpreis: '', mwst_satz: '19' };

export default function AboRechnungenPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [abos, setAbos] = useState<Abo[]>([]);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ kontakt_id: '', empfaenger_name: '', titel: '', intervall: 'monat', naechste_faellig: heute(), notiz: '' });
  const [posRows, setPosRows] = useState<PosRow[]>([{ ...LEER_POS }]);

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const { data: aData } = await supabase.from('abo_rechnungen').select('*').order('naechste_faellig', { ascending: true });
      setAbos((aData as Abo[]) ?? []);
      const { data: kData } = await supabase.from('kontakte').select('*');
      const ks: Kontakt[] = ((kData as Record<string, unknown>[]) || []).map((k) => ({
        id: String(k.id), name: kontaktName(k), email: (typeof k.email === 'string' ? k.email : null),
      })).sort((a, b) => a.name.localeCompare(b.name));
      setKontakte(ks);
    } catch (e: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await laden_();
    })();
  }, [laden_]);

  function reset() {
    setEditId(null);
    setForm({ kontakt_id: '', empfaenger_name: '', titel: '', intervall: 'monat', naechste_faellig: heute(), notiz: '' });
    setPosRows([{ ...LEER_POS }]);
  }
  function bearbeiten(a: Abo) {
    setEditId(a.id);
    setForm({
      kontakt_id: a.kontakt_id || '', empfaenger_name: a.empfaenger_name || '', titel: a.titel || '',
      intervall: a.intervall || 'monat', naechste_faellig: (a.naechste_faellig || heute()).slice(0, 10), notiz: '',
    });
    const rows = (Array.isArray(a.positionen) ? a.positionen : []).map((p) => ({
      bezeichnung: String(p.bezeichnung ?? ''), menge: String(p.menge ?? 1), einheit: String(p.einheit ?? 'Pauschal'),
      einzelpreis: String(p.einzelpreis ?? ''), mwst_satz: String(p.mwst_satz ?? 19),
    }));
    setPosRows(rows.length ? rows : [{ ...LEER_POS }]);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function setPos(i: number, patch: Partial<PosRow>) { setPosRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x))); }
  function posDazu() { setPosRows((r) => [...r, { ...LEER_POS }]); }
  function posWeg(i: number) { setPosRows((r) => (r.length > 1 ? r.filter((_, k) => k !== i) : r)); }

  function kontaktWahl(id: string) {
    const k = kontakte.find((x) => x.id === id);
    setForm((f) => ({ ...f, kontakt_id: id, empfaenger_name: k ? k.name : f.empfaenger_name }));
  }

  const vorschau = useMemo(() => {
    let netto = 0, brutto = 0;
    for (const p of posRows) {
      const n = num(p.menge) * num(p.einzelpreis);
      netto += n; brutto += n * (1 + num(p.mwst_satz) / 100);
    }
    return { netto, brutto };
  }, [posRows]);

  async function speichern() {
    if (!uid) return;
    if (!form.titel.trim()) { setFehler('Bitte einen Titel angeben.'); return; }
    const positionen: PosJson[] = posRows
      .filter((p) => p.bezeichnung.trim() || num(p.einzelpreis) > 0)
      .map((p) => ({ bezeichnung: p.bezeichnung.trim() || 'Leistung', menge: num(p.menge) || 1, einheit: p.einheit.trim() || 'Pauschal', einzelpreis: num(p.einzelpreis), mwst_satz: num(p.mwst_satz) || 19 }));
    if (!positionen.length) { setFehler('Bitte mindestens eine Position mit Preis erfassen.'); return; }
    setBusy(true); setFehler(null); setOk(null);
    try {
      const payload = {
        owner_user_id: uid, kontakt_id: form.kontakt_id || null, empfaenger_name: form.empfaenger_name.trim() || null,
        titel: form.titel.trim(), positionen, intervall: form.intervall, naechste_faellig: form.naechste_faellig,
        notiz: form.notiz.trim() || null, updated_at: new Date().toISOString(),
      };
      if (editId) {
        const { error } = await supabase.from('abo_rechnungen').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('abo_rechnungen').insert(payload);
        if (error) throw error;
      }
      setOk(editId ? 'Vorlage aktualisiert.' : 'Vorlage angelegt.'); reset(); await laden_();
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setBusy(false); }
  }

  async function aktivToggle(a: Abo) {
    try { await supabase.from('abo_rechnungen').update({ aktiv: !a.aktiv }).eq('id', a.id); await laden_(); } catch { /* ignore */ }
  }
  async function loeschen(a: Abo) {
    if (typeof window !== 'undefined' && !window.confirm(`Vorlage „${a.titel}" löschen?`)) return;
    try { await supabase.from('abo_rechnungen').delete().eq('id', a.id); if (editId === a.id) reset(); await laden_(); } catch { /* ignore */ }
  }

  async function erzeugen(a: Abo): Promise<boolean> {
    const res = await fetch('/api/rechnung-aus-abo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aboId: a.id }) });
    const j = await res.json();
    if (!res.ok) { setFehler(j?.error || 'Rechnung fehlgeschlagen.'); return false; }
    return true;
  }
  async function einzeln(a: Abo) {
    setBusy(true); setFehler(null); setOk(null);
    const g = await erzeugen(a);
    if (g) setOk(`Rechnung aus „${a.titel}" erstellt — liegt unter 🧾 Rechnungen.`);
    await laden_(); setBusy(false);
  }
  async function alleFaelligen() {
    const faellig = abos.filter((a) => a.aktiv && a.naechste_faellig && a.naechste_faellig.slice(0, 10) <= heute());
    if (!faellig.length) { setFehler('Aktuell ist keine Vorlage fällig.'); return; }
    setBusy(true); setFehler(null); setOk(null);
    let n = 0;
    for (const a of faellig) { if (await erzeugen(a)) n++; }
    setOk(`${n} fällige Rechnung(en) erzeugt.`);
    await laden_(); setBusy(false);
  }

  const faelligeAnzahl = useMemo(() => abos.filter((a) => a.aktiv && a.naechste_faellig && a.naechste_faellig.slice(0, 10) <= heute()).length, [abos]);
  const mrr = useMemo(() => abos.filter((a) => a.aktiv).reduce((s, a) => {
    const netto = (Array.isArray(a.positionen) ? a.positionen : []).reduce((x, p) => x + (Number(p.menge) || 1) * (Number(p.einzelpreis) || 0), 0);
    const teiler = a.intervall === 'jahr' ? 12 : a.intervall === 'quartal' ? 3 : 1;
    return s + netto / teiler;
  }, 0), [abos]);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🔁 Wiederkehrende Rechnungen</h1>
      <p style={styles.sub}>Wartungsverträge, Retainer, Mieten & Abos: einmal als Vorlage anlegen — die nächste Rechnung entsteht per Klick oder wenn sie fällig ist.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.green }}>{abos.filter((a) => a.aktiv).length}</div><div style={styles.kLabel}>aktive Vorlagen</div></div>
        <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.gold }}>{eur(mrr)}</div><div style={styles.kLabel}>≈ Umsatz / Monat (netto)</div></div>
        <div style={styles.kpi}><div style={{ ...styles.kWert, color: faelligeAnzahl ? C.warn : C.textDim }}>{faelligeAnzahl}</div><div style={styles.kLabel}>jetzt fällig</div></div>
      </div>

      {/* Formular */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={styles.cardTitel}>{editId ? '✏️ Vorlage bearbeiten' : '➕ Neue Vorlage'}</div>
          {editId && <button style={styles.mini} onClick={reset}>Abbrechen / Neu</button>}
        </div>
        <div style={styles.grid2}>
          <label style={styles.lab}>Titel *<input style={styles.inp} value={form.titel} onChange={(e) => setForm((f) => ({ ...f, titel: e.target.value }))} placeholder="z. B. Wartungsvertrag / Retainer März" /></label>
          <label style={styles.lab}>Kontakt (optional)
            <select style={styles.inp} value={form.kontakt_id} onChange={(e) => kontaktWahl(e.target.value)}>
              <option value="">— kein Kontakt —</option>
              {kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </label>
          <label style={styles.lab}>Empfänger-Name<input style={styles.inp} value={form.empfaenger_name} onChange={(e) => setForm((f) => ({ ...f, empfaenger_name: e.target.value }))} placeholder="steht auf der Rechnung" /></label>
          <label style={styles.lab}>Intervall
            <select style={styles.inp} value={form.intervall} onChange={(e) => setForm((f) => ({ ...f, intervall: e.target.value }))}>
              {INTERVALLE.map((i) => <option key={i.w} value={i.w}>{i.l}</option>)}
            </select>
          </label>
          <label style={styles.lab}>Nächste Fälligkeit<input type="date" style={styles.inp} value={form.naechste_faellig} onChange={(e) => setForm((f) => ({ ...f, naechste_faellig: e.target.value }))} /></label>
        </div>

        <div style={{ marginTop: 14, fontWeight: 700, fontSize: 14 }}>Positionen</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {posRows.map((p, i) => (
            <div key={i} style={styles.posRow}>
              <input style={{ ...styles.inp, flex: 1, minWidth: 140 }} value={p.bezeichnung} onChange={(e) => setPos(i, { bezeichnung: e.target.value })} placeholder="Bezeichnung" />
              <input style={{ ...styles.inp, width: 64 }} value={p.menge} onChange={(e) => setPos(i, { menge: e.target.value })} inputMode="decimal" placeholder="Menge" />
              <input style={{ ...styles.inp, width: 92 }} value={p.einheit} onChange={(e) => setPos(i, { einheit: e.target.value })} placeholder="Einheit" />
              <input style={{ ...styles.inp, width: 92 }} value={p.einzelpreis} onChange={(e) => setPos(i, { einzelpreis: e.target.value })} inputMode="decimal" placeholder="€ netto" />
              <input style={{ ...styles.inp, width: 64 }} value={p.mwst_satz} onChange={(e) => setPos(i, { mwst_satz: e.target.value })} inputMode="decimal" placeholder="MwSt %" />
              <button style={styles.posWeg} onClick={() => posWeg(i)} title="Position entfernen">✕</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
          <button style={styles.mini} onClick={posDazu}>＋ Position</button>
          <div style={{ color: C.textDim, fontSize: 14 }}>Netto {eur(vorschau.netto)} · <span style={{ color: C.text, fontWeight: 700 }}>Brutto {eur(vorschau.brutto)}</span></div>
        </div>

        <button style={{ ...styles.primaer, marginTop: 14, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={speichern}>{busy ? 'Speichert …' : (editId ? '💾 Änderungen speichern' : '💾 Vorlage anlegen')}</button>
      </div>

      {/* Fällige */}
      <div style={{ ...styles.card, marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div><b>{faelligeAnzahl}</b> Vorlage(n) sind heute oder früher fällig.</div>
        <button style={{ ...styles.primaer, opacity: (busy || !faelligeAnzahl) ? 0.5 : 1 }} disabled={busy || !faelligeAnzahl} onClick={alleFaelligen}>⚡ Alle fälligen jetzt erzeugen</button>
      </div>

      {/* Liste */}
      <div style={{ ...styles.card, marginTop: 16 }}>
        <div style={styles.cardTitel}>Vorlagen</div>
        {laden ? <p style={styles.dim}>Lädt …</p> : abos.length === 0 ? <p style={styles.dim}>Noch keine Vorlagen. Leg oben die erste an.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {abos.map((a) => {
              const netto = (Array.isArray(a.positionen) ? a.positionen : []).reduce((x, p) => x + (Number(p.menge) || 1) * (Number(p.einzelpreis) || 0), 0);
              const faellig = a.aktiv && a.naechste_faellig && a.naechste_faellig.slice(0, 10) <= heute();
              const intv = INTERVALLE.find((i) => i.w === a.intervall)?.l || a.intervall;
              return (
                <div key={a.id} style={{ ...styles.zeile, opacity: a.aktiv ? 1 : 0.55 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{a.titel} <span style={{ color: C.textDim, fontWeight: 400, fontSize: 13 }}>· {intv} · {eur(netto)} netto</span></div>
                    <div style={{ color: C.textDim, fontSize: 13 }}>{a.empfaenger_name || '—'} · nächste Fälligkeit {d(a.naechste_faellig)}{a.anzahl_erzeugt ? ` · ${a.anzahl_erzeugt}× erzeugt` : ''}</div>
                  </div>
                  {faellig && <span style={{ ...styles.badge, color: C.warn, borderColor: C.warn }}>fällig</span>}
                  <button style={styles.aboBtn} disabled={busy || !a.aktiv} onClick={() => einzeln(a)}>→ Rechnung</button>
                  <button style={styles.mini} onClick={() => bearbeiten(a)}>Bearbeiten</button>
                  <button style={styles.mini} onClick={() => aktivToggle(a)}>{a.aktiv ? 'Pausieren' : 'Aktivieren'}</button>
                  <button style={{ ...styles.mini, color: C.danger, borderColor: 'rgba(224,102,102,0.4)' }} onClick={() => loeschen(a)}>Löschen</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 780 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '16px 0' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px', textAlign: 'center' },
  kWert: { fontSize: 24, fontWeight: 800, lineHeight: 1 },
  kLabel: { color: C.textDim, fontSize: 12, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 17 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  posRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  posWeg: { background: 'transparent', color: C.danger, border: `1px solid rgba(224,102,102,0.4)`, borderRadius: 8, padding: '8px 11px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  aboBtn: { background: 'rgba(76,175,125,0.12)', color: C.green, border: `1px solid ${C.green}`, borderRadius: 9, padding: '7px 12px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', fontSize: 14 },
  badge: { border: '1px solid', borderRadius: 999, padding: '2px 9px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
