'use client';
// ============================================================
// ARGONAUT OS · Lager je Filiale (Block D · #4)
// Bestand JE (Artikel, Standort) als additive Ebene neben dem globalen
// artikel.aktueller_bestand. Matrix-Editor + Umlagerung zwischen Filialen +
// Verlauf. Der globale Bestand bleibt unangetastet (Gesamt-Referenz).
// ============================================================
import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  cardBg: 'rgba(255,255,255,0.03)', inputBg: 'rgba(255,255,255,0.05)', danger: '#E06666', warn: '#E0A24C',
};

type Standort = { id: string; name: string; ist_hauptsitz: boolean };
type Artikel = { id: string; artikelnummer: string | null; bezeichnung: string; einheit: string | null; aktueller_bestand: number | null };
type BestandRow = { id: string; artikel_id: string; standort_id: string; bestand: number };
type Umlagerung = { id: string; artikel_id: string; von_standort_id: string; nach_standort_id: string; menge: number; datum: string; notiz: string | null };

const zahl = (v: number | string | null | undefined): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fmt = (n: number): string => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
const key = (a: string, s: string) => `${a}|${s}`;

export default function LagerJeFilialePage() {
  const [chefId, setChefId] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [standorte, setStandorte] = useState<Standort[]>([]);
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [bestand, setBestand] = useState<Record<string, BestandRow>>({});
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [umlagerungen, setUmlagerungen] = useState<Umlagerung[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [nurBestand, setNurBestand] = useState(false);
  const [tab, setTab] = useState<'matrix' | 'verlauf'>('matrix');
  const [umlModal, setUmlModal] = useState(false);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUid(user?.id ?? null);
      if (!user) return;
      const { data: ma } = await supabase.from('mitarbeiter').select('owner_user_id').eq('auth_user_id', user.id).maybeSingle();
      setChefId(ma ? (ma as { owner_user_id: string }).owner_user_id : user.id);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [st, ar, be, um] = await Promise.all([
        supabase.from('standorte').select('id,name,ist_hauptsitz').eq('aktiv', true).order('ist_hauptsitz', { ascending: false }).order('name'),
        supabase.from('artikel').select('id,artikelnummer,bezeichnung,einheit,aktueller_bestand').eq('aktiv', true).order('bezeichnung'),
        supabase.from('artikel_bestand_standort').select('id,artikel_id,standort_id,bestand'),
        supabase.from('lager_umlagerung').select('id,artikel_id,von_standort_id,nach_standort_id,menge,datum,notiz').order('datum', { ascending: false }).limit(200),
      ]);
      if (st.error) throw st.error;
      if (ar.error) throw ar.error;
      setStandorte((st.data as Standort[]) ?? []);
      setArtikel((ar.data as Artikel[]) ?? []);
      const map: Record<string, BestandRow> = {};
      const w: Record<string, string> = {};
      ((be.data as BestandRow[]) ?? []).forEach((r) => { map[key(r.artikel_id, r.standort_id)] = r; w[key(r.artikel_id, r.standort_id)] = String(r.bestand); });
      setBestand(map); setWerte(w);
      setUmlagerungen((um.data as Umlagerung[]) ?? []);
    } catch (e: unknown) {
      setError('Lager-Daten konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const standortName = (id: string) => standorte.find((s) => s.id === id)?.name ?? 'Filiale';
  const artikelName = (id: string) => artikel.find((a) => a.id === id)?.bezeichnung ?? 'Artikel';

  async function speichereBestand(artikelId: string, standortId: string, roh: string) {
    if (!chefId) return;
    const k = key(artikelId, standortId);
    const neu = zahl(roh);
    const alt = bestand[k]?.bestand;
    if (alt !== undefined && alt === neu) return;            // nichts geändert
    setSavingCell(k);
    try {
      const { data, error } = await supabase.from('artikel_bestand_standort')
        .upsert({ owner_user_id: chefId, artikel_id: artikelId, standort_id: standortId, bestand: neu, aktualisiert_am: new Date().toISOString() }, { onConflict: 'artikel_id,standort_id' })
        .select('id,artikel_id,standort_id,bestand').single();
      if (error) throw error;
      const row = data as BestandRow;
      setBestand((m) => ({ ...m, [k]: row }));
      setWerte((w) => ({ ...w, [k]: String(row.bestand) }));
    } catch (e: unknown) {
      setError('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
      setWerte((w) => ({ ...w, [k]: alt !== undefined ? String(alt) : '' }));
    } finally { setSavingCell(null); }
  }

  const gefiltert = artikel.filter((a) => {
    if (suche.trim()) {
      const q = suche.trim().toLowerCase();
      if (!(`${a.bezeichnung} ${a.artikelnummer ?? ''}`.toLowerCase().includes(q))) return false;
    }
    if (nurBestand) {
      const summe = standorte.reduce((s, st) => s + zahl(bestand[key(a.id, st.id)]?.bestand), 0);
      if (summe <= 0) return false;
    }
    return true;
  });

  const summeFiliale = (artikelId: string) => standorte.reduce((s, st) => s + zahl(bestand[key(artikelId, st.id)]?.bestand), 0);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>ARGONAUT OS · Multistandort · Lager</div>
          <h1 style={styles.h1}>Lager je Filiale</h1>
          <p style={styles.sub}>Bestand pro Artikel und Filiale — direkt in der Tabelle bearbeitbar. Der globale Gesamtbestand bleibt als Referenz erhalten.</p>
        </div>
        {standorte.length >= 2 && <button style={styles.primaryBtn} onClick={() => setUmlModal(true)}>↔ Umlagern</button>}
      </div>

      <div style={styles.tabs}>
        <button style={tabBtn(tab === 'matrix')} onClick={() => setTab('matrix')}>Bestände</button>
        <button style={tabBtn(tab === 'verlauf')} onClick={() => setTab('verlauf')}>Umlagerungen ({umlagerungen.length})</button>
      </div>

      {standorte.length < 2 && (
        <div style={{ ...styles.stateBox, marginBottom: 12 }}>Ein Filial-Lager lohnt sich ab zwei Standorten. Lege weitere Filialen an, um Bestände getrennt zu führen und umzulagern.</div>
      )}

      {tab === 'matrix' && (
        <>
          <div style={styles.toolbar}>
            <input style={styles.search} placeholder="Artikel suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
            <label style={styles.check}><input type="checkbox" checked={nurBestand} onChange={(e) => setNurBestand(e.target.checked)} /> nur mit Bestand</label>
            <div style={styles.countPill}>{gefiltert.length} Artikel · {standorte.length} Filialen</div>
          </div>

          <div style={{ ...styles.card, padding: 0, overflowX: 'auto' }}>
            {loading && <div style={styles.stateBox}>Lädt …</div>}
            {!loading && error && <div style={{ ...styles.stateBox, color: C.danger }}>{error}<div><button style={styles.ghostBtn} onClick={load}>Erneut versuchen</button></div></div>}
            {!loading && !error && gefiltert.length === 0 && <div style={styles.stateBox}>Keine Artikel gefunden.</div>}
            {!loading && !error && gefiltert.length > 0 && (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, textAlign: 'left', position: 'sticky', left: 0, background: C.navy }}>Artikel</th>
                    {standorte.map((s) => <th key={s.id} style={styles.th}>{s.name}{s.ist_hauptsitz ? ' ★' : ''}</th>)}
                    <th style={styles.th}>Σ Filialen</th>
                    <th style={{ ...styles.th, color: C.textDim }}>Global</th>
                  </tr>
                </thead>
                <tbody>
                  {gefiltert.map((a) => {
                    const sum = summeFiliale(a.id);
                    const glob = zahl(a.aktueller_bestand);
                    const diff = Math.abs(sum - glob) > 0.001;
                    return (
                      <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ ...styles.tdName, position: 'sticky', left: 0, background: C.navy }}>
                          <span style={{ fontWeight: 700, color: C.text }}>{a.bezeichnung}</span>
                          <span style={{ display: 'block', color: C.textDim, fontSize: 12 }}>{a.artikelnummer || '—'} · {a.einheit || 'Stk'}</span>
                        </td>
                        {standorte.map((s) => {
                          const k = key(a.id, s.id);
                          return (
                            <td key={s.id} style={styles.tdCell}>
                              <input
                                style={{ ...styles.cellInput, borderColor: savingCell === k ? C.cyan : C.line }}
                                inputMode="decimal"
                                value={werte[k] ?? ''}
                                onChange={(e) => setWerte((w) => ({ ...w, [k]: e.target.value }))}
                                onBlur={(e) => speichereBestand(a.id, s.id, e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                placeholder="0"
                              />
                            </td>
                          );
                        })}
                        <td style={{ ...styles.tdCell, fontWeight: 700, color: C.text }}>{fmt(sum)}</td>
                        <td style={{ ...styles.tdCell, color: diff ? C.warn : C.textDim }} title={diff ? 'Weicht von der Summe der Filialen ab' : 'Stimmt mit der Summe überein'}>{fmt(glob)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p style={styles.hint}>Hinweis: „Global" ist der bisherige Gesamtbestand (aus Wareneingang/Inventur) und bleibt unverändert. Weicht er von „Σ Filialen" ab, sind noch nicht alle Bestände auf die Filialen verteilt.</p>
        </>
      )}

      {tab === 'verlauf' && (
        <div style={{ ...styles.card, padding: 0, overflowX: 'auto' }}>
          {loading && <div style={styles.stateBox}>Lädt …</div>}
          {!loading && umlagerungen.length === 0 && <div style={styles.stateBox}>Noch keine Umlagerungen erfasst.</div>}
          {!loading && umlagerungen.length > 0 && (
            <table style={styles.table}>
              <thead><tr><th style={{ ...styles.th, textAlign: 'left' }}>Datum</th><th style={{ ...styles.th, textAlign: 'left' }}>Artikel</th><th style={{ ...styles.th, textAlign: 'left' }}>Von → Nach</th><th style={styles.th}>Menge</th><th style={{ ...styles.th, textAlign: 'left' }}>Notiz</th></tr></thead>
              <tbody>
                {umlagerungen.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={styles.tdName}>{(() => { try { return new Date(u.datum).toLocaleDateString('de-DE'); } catch { return u.datum; } })()}</td>
                    <td style={{ ...styles.tdName, color: C.text }}>{artikelName(u.artikel_id)}</td>
                    <td style={styles.tdName}><span style={{ color: C.warn }}>{standortName(u.von_standort_id)}</span> → <span style={{ color: C.green }}>{standortName(u.nach_standort_id)}</span></td>
                    <td style={{ ...styles.tdCell, fontWeight: 700, color: C.text }}>{fmt(zahl(u.menge))}</td>
                    <td style={styles.tdName}>{u.notiz || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {umlModal && chefId && (
        <UmlagernModal
          chefId={chefId}
          uid={uid}
          standorte={standorte}
          artikel={artikel}
          bestand={bestand}
          onClose={() => setUmlModal(false)}
          onDone={() => { setUmlModal(false); load(); }}
        />
      )}
    </div>
  );
}

function UmlagernModal({ chefId, uid, standorte, artikel, bestand, onClose, onDone }: {
  chefId: string; uid: string | null; standorte: Standort[]; artikel: Artikel[];
  bestand: Record<string, BestandRow>; onClose: () => void; onDone: () => void;
}) {
  const [artikelId, setArtikelId] = useState('');
  const [von, setVon] = useState('');
  const [nach, setNach] = useState('');
  const [menge, setMenge] = useState('');
  const [notiz, setNotiz] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const vonBestand = artikelId && von ? zahl(bestand[key(artikelId, von)]?.bestand) : 0;

  async function umlagern() {
    if (!artikelId) { setMsg('Bitte einen Artikel wählen.'); return; }
    if (!von || !nach) { setMsg('Bitte Von- und Nach-Filiale wählen.'); return; }
    if (von === nach) { setMsg('Von- und Nach-Filiale müssen unterschiedlich sein.'); return; }
    const m = zahl(menge);
    if (m <= 0) { setMsg('Bitte eine Menge größer 0 angeben.'); return; }
    if (m > vonBestand && !window.confirm(`Die Quell-Filiale hat nur ${fmt(vonBestand)} auf Lager. Trotzdem ${fmt(m)} umlagern? (Bestand wird negativ)`)) return;
    setSaving(true); setMsg(null);
    try {
      const kVon = key(artikelId, von), kNach = key(artikelId, nach);
      const neuVon = vonBestand - m;
      const neuNach = zahl(bestand[kNach]?.bestand) + m;
      const upserts = [
        { owner_user_id: chefId, artikel_id: artikelId, standort_id: von, bestand: neuVon, aktualisiert_am: new Date().toISOString() },
        { owner_user_id: chefId, artikel_id: artikelId, standort_id: nach, bestand: neuNach, aktualisiert_am: new Date().toISOString() },
      ];
      const up = await supabase.from('artikel_bestand_standort').upsert(upserts, { onConflict: 'artikel_id,standort_id' });
      if (up.error) throw up.error;
      const ins = await supabase.from('lager_umlagerung').insert({
        owner_user_id: chefId, artikel_id: artikelId, von_standort_id: von, nach_standort_id: nach,
        menge: m, notiz: notiz.trim() || null, erstellt_von: uid,
      });
      if (ins.error) throw ins.error;
      onDone();
    } catch (e: unknown) {
      setMsg('Umlagern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSaving(false); }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>Umlagern zwischen Filialen</h2>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Schließen">×</button>
        </div>
        <div style={styles.modalBody}>
          <label style={styles.label}>Artikel *
            <select style={styles.input} value={artikelId} onChange={(e) => setArtikelId(e.target.value)}>
              <option value="">— wählen —</option>
              {artikel.map((a) => <option key={a.id} value={a.id}>{a.bezeichnung}{a.artikelnummer ? ` (${a.artikelnummer})` : ''}</option>)}
            </select>
          </label>
          <div style={styles.formRow}>
            <label style={styles.label}>Von Filiale *
              <select style={styles.input} value={von} onChange={(e) => setVon(e.target.value)}>
                <option value="">— wählen —</option>
                {standorte.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label style={styles.label}>Nach Filiale *
              <select style={styles.input} value={nach} onChange={(e) => setNach(e.target.value)}>
                <option value="">— wählen —</option>
                {standorte.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
          {artikelId && von && <div style={{ color: C.textDim, fontSize: 13 }}>Verfügbar in Quell-Filiale: <b style={{ color: C.text }}>{fmt(vonBestand)}</b></div>}
          <div style={styles.formRow}>
            <label style={styles.label}>Menge *<input style={styles.input} inputMode="decimal" value={menge} onChange={(e) => setMenge(e.target.value)} placeholder="0" /></label>
            <label style={styles.label}>Notiz<input style={styles.input} value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="optional" /></label>
          </div>
          {msg && <div style={styles.infoMsg}>{msg}</div>}
        </div>
        <div style={styles.modalFoot}>
          <button style={styles.ghostBtn} onClick={onClose}>Abbrechen</button>
          <button style={{ ...styles.primaryBtn, opacity: saving ? 0.6 : 1 }} onClick={umlagern} disabled={saving}>{saving ? 'Lagert um …' : '↔ Umlagern'}</button>
        </div>
      </div>
    </div>
  );
}

function tabBtn(active: boolean): CSSProperties {
  return { background: 'transparent', border: 'none', cursor: 'pointer', padding: '10px 4px', marginRight: 22, fontSize: 'clamp(14px, 1.2vw, 19px)', fontWeight: 700, fontFamily: "'DM Sans', sans-serif", color: active ? C.gold : C.textDim, borderBottom: active ? `2px solid ${C.gold}` : '2px solid transparent' };
}

const styles: Record<string, CSSProperties> = {
  page: { padding: 'clamp(16px, 2.4vw, 40px)', color: C.text, fontFamily: "'DM Sans', sans-serif", maxWidth: 1500, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 16 },
  eyebrow: { fontSize: 'clamp(11px, 0.95vw, 14px)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.7)' },
  h1: { fontSize: 'clamp(26px, 3vw, 44px)', fontWeight: 800, margin: '4px 0 6px' },
  sub: { fontSize: 'clamp(13px, 1.15vw, 18px)', color: C.textDim, maxWidth: 760, margin: 0 },
  tabs: { display: 'flex', borderBottom: `1px solid ${C.line}`, marginBottom: 16 },
  toolbar: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
  search: { flex: '1 1 240px', minWidth: 180, padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.line}`, background: C.inputBg, color: C.text, fontSize: 'clamp(13px, 1.1vw, 17px)', outline: 'none' },
  check: { display: 'inline-flex', alignItems: 'center', gap: 7, color: C.textDim, fontSize: 'clamp(12px, 1vw, 15px)', cursor: 'pointer' },
  countPill: { padding: '8px 14px', borderRadius: 999, background: 'rgba(201,168,76,0.12)', border: `1px solid ${C.line}`, color: C.gold, fontWeight: 700, fontSize: 'clamp(12px, 1vw, 15px)', whiteSpace: 'nowrap' },
  card: { background: C.cardBg, border: `1px solid ${C.line}`, borderRadius: 16 },
  stateBox: { padding: 40, textAlign: 'center', color: C.textDim, fontSize: 'clamp(14px, 1.2vw, 18px)' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 640 },
  th: { textAlign: 'right', padding: '12px 14px', fontSize: 'clamp(11px, 0.94vw, 14px)', letterSpacing: 0.4, textTransform: 'uppercase', color: C.textDim, borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' },
  tdName: { padding: '10px 14px', fontSize: 'clamp(13px, 1.1vw, 16px)', color: C.textDim, whiteSpace: 'nowrap' },
  tdCell: { padding: '8px 10px', textAlign: 'right', fontSize: 'clamp(13px, 1.1vw, 16px)' },
  cellInput: { width: 90, padding: '7px 8px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.inputBg, color: C.text, fontSize: 'clamp(13px, 1.05vw, 16px)', textAlign: 'right', outline: 'none' },
  hint: { color: C.textDim, fontSize: 'clamp(12px, 1vw, 15px)', marginTop: 10, maxWidth: 900 },
  primaryBtn: { padding: '10px 18px', borderRadius: 10, border: 'none', background: C.gold, color: C.navy, fontWeight: 800, cursor: 'pointer', fontSize: 'clamp(13px, 1.1vw, 17px)', whiteSpace: 'nowrap' },
  ghostBtn: { padding: '9px 16px', borderRadius: 10, border: `1px solid ${C.line}`, background: 'transparent', color: C.text, cursor: 'pointer', fontWeight: 600, fontSize: 'clamp(13px, 1.05vw, 16px)' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 },
  modal: { width: 'min(600px, 100%)', maxHeight: '90vh', overflow: 'auto', background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 18, display: 'flex', flexDirection: 'column' },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: `1px solid ${C.line}` },
  modalTitle: { margin: 0, fontSize: 'clamp(18px, 1.7vw, 26px)', fontWeight: 800 },
  closeBtn: { background: 'transparent', border: 'none', color: C.textDim, fontSize: 28, cursor: 'pointer', lineHeight: 1 },
  modalBody: { padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'clamp(12px, 1vw, 15px)', fontWeight: 600, color: C.textDim },
  input: { padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.line}`, background: C.inputBg, color: C.text, fontSize: 'clamp(13px, 1.1vw, 16px)', outline: 'none' },
  infoMsg: { padding: '10px 14px', borderRadius: 10, background: 'rgba(201,168,76,0.1)', border: `1px solid ${C.line}`, color: C.gold, fontSize: 'clamp(12px, 1vw, 15px)' },
  modalFoot: { display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 22px', borderTop: `1px solid ${C.line}` },
};
