'use client';

// ============================================================
// ARGONAUT OS · Bündel 10 · Projekt-Abrechnung (billable)
// Abrechenbare Zeiten/Leistungen je Projekt erfassen und daraus mit einem
// Klick eine Rechnung erzeugen (über /api/rechnung-aus-projekt).
// Pfad: app/dashboard/projekt-abrechnung/page.tsx
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

type Projekt = { id: string; name: string | null };
type Leistung = {
  id: string; projekt_id: string | null; kunde_name: string | null; datum: string;
  beschreibung: string; stunden: number; stundensatz: number; mwst_satz: number;
  abgerechnet: boolean; rechnung_id: string | null;
};

function heute() { return new Date().toISOString().slice(0, 10); }
function datumHuebsch(iso: string | null): string {
  if (!iso) return '—';
  const p = iso.split('T')[0].split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}
function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }

const LEER = { datum: heute(), beschreibung: '', stunden: '', stundensatz: '', kunde_name: '' };

export default function ProjektAbrechnungPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [projektId, setProjektId] = useState('');
  const [liste, setListe] = useState<Leistung[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState({ ...LEER });
  const [busy, setBusy] = useState(false);
  const [rechnungBusy, setRechnungBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      const { data: pr } = await supabase.from('projekte').select('id, name').eq('archiviert', false).order('name', { ascending: true });
      const l = (pr as Projekt[]) ?? [];
      setProjekte(l);
      if (l.length) setProjektId(l[0].id);
      setLaden(false);
    })();
  }, []);

  const laden_ = useCallback(async () => {
    if (!projektId) { setListe([]); return; }
    setFehler(null);
    try {
      const { data, error } = await supabase.from('projektleistungen').select('*').eq('projekt_id', projektId).order('datum', { ascending: false });
      if (error) throw error;
      setListe((data as Leistung[]) ?? []);
    } catch (e: unknown) {
      setFehler('Leistungen konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }, [projektId]);
  useEffect(() => { void laden_(); }, [laden_]);

  async function hinzufuegen() {
    if (!uid || !projektId) { setFehler('Bitte ein Projekt wählen.'); return; }
    if (!form.beschreibung.trim()) { setFehler('Bitte eine Beschreibung angeben.'); return; }
    if (num(form.stunden) <= 0) { setFehler('Bitte Stunden > 0 angeben.'); return; }
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('projektleistungen').insert({
        owner_user_id: uid, projekt_id: projektId, kunde_name: form.kunde_name.trim() || null,
        datum: form.datum || heute(), beschreibung: form.beschreibung.trim(),
        stunden: num(form.stunden), stundensatz: num(form.stundensatz), mwst_satz: 19,
      });
      if (error) throw error;
      setForm((f) => ({ ...LEER, stundensatz: f.stundensatz, kunde_name: f.kunde_name })); // Satz/Kunde merken
      await laden_();
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setBusy(false); }
  }
  async function loeschen(l: Leistung) {
    if (l.abgerechnet) { setFehler('Abgerechnete Leistungen können nicht gelöscht werden.'); return; }
    if (!window.confirm('Diese Leistung löschen?')) return;
    try {
      const { error } = await supabase.from('projektleistungen').delete().eq('id', l.id);
      if (error) throw error;
      await laden_();
    } catch (e: unknown) {
      setFehler('Löschen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  async function rechnungErstellen() {
    if (!projektId) return;
    if (!offene.length) { setFehler('Keine offenen Leistungen zum Abrechnen.'); return; }
    if (!window.confirm(`Rechnung über ${offene.length} offene Leistung(en) (${eur(offenNetto)} netto) erstellen?`)) return;
    setRechnungBusy(true); setFehler(null); setOk(null);
    try {
      const res = await fetch('/api/rechnung-aus-projekt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projektId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Rechnung konnte nicht erstellt werden.');
      setOk('Rechnung erstellt — die Leistungen wurden übernommen.');
      await laden_();
    } catch (e: unknown) {
      setFehler('Rechnung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setRechnungBusy(false); }
  }

  const offene = useMemo(() => liste.filter((l) => !l.abgerechnet), [liste]);
  const abgerechnet = useMemo(() => liste.filter((l) => l.abgerechnet), [liste]);
  const offenNetto = useMemo(() => offene.reduce((s, l) => s + l.stunden * l.stundensatz, 0), [offene]);
  const offenStunden = useMemo(() => offene.reduce((s, l) => s + l.stunden, 0), [offene]);

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Projekte</div>
      <h1 style={styles.h1}>Projekt-Abrechnung</h1>
      <p style={styles.sub}>Abrechenbare Zeiten je Projekt erfassen — und mit einem Klick zur Rechnung machen.</p>

      <div style={styles.projektZeile}>
        <label style={styles.lbl}>Projekt</label>
        {projekte.length === 0 ? (
          <div style={styles.hint}>Noch keine Projekte. Lege zuerst unter <a href="/dashboard/projekte" style={{ color: C.cyan, fontWeight: 700 }}>Projekte</a> eines an.</div>
        ) : (
          <select style={{ ...styles.input, maxWidth: 420 }} value={projektId} onChange={(e) => setProjektId(e.target.value)}>
            {projekte.map((p) => <option key={p.id} value={p.id}>{p.name || 'Projekt ohne Name'}</option>)}
          </select>
        )}
      </div>

      <div style={styles.summenGrid}>
        <SummeKarte label="Offen (Stunden)" value={String(offenStunden).replace('.', ',')} accent={C.cyan} />
        <SummeKarte label="Offen (netto)" value={eur(offenNetto)} accent={C.gold} />
        <SummeKarte label="Abgerechnet" value={String(abgerechnet.length)} accent={C.green} />
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      {projektId && (
        <>
          {/* Erfassen */}
          <div style={styles.card}>
            <h2 style={styles.cardTitel}>Zeit / Leistung erfassen</h2>
            <div style={styles.formGrid}>
              <div><label style={styles.lbl}>Datum</label><input type="date" style={styles.input} value={form.datum} onChange={(e) => setForm((f) => ({ ...f, datum: e.target.value }))} /></div>
              <div><label style={styles.lbl}>Kunde (optional)</label><input style={styles.input} value={form.kunde_name} onChange={(e) => setForm((f) => ({ ...f, kunde_name: e.target.value }))} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={styles.lbl}>Beschreibung *</label><input style={styles.input} value={form.beschreibung} onChange={(e) => setForm((f) => ({ ...f, beschreibung: e.target.value }))} placeholder="z. B. Konzeption & Abstimmung" /></div>
              <div><label style={styles.lbl}>Stunden</label><input style={styles.input} inputMode="decimal" value={form.stunden} onChange={(e) => setForm((f) => ({ ...f, stunden: e.target.value }))} placeholder="z. B. 2,5" /></div>
              <div><label style={styles.lbl}>Stundensatz (€)</label><input style={styles.input} inputMode="decimal" value={form.stundensatz} onChange={(e) => setForm((f) => ({ ...f, stundensatz: e.target.value }))} placeholder="z. B. 95" /></div>
            </div>
            <div style={{ marginTop: 12 }}>
              <button onClick={hinzufuegen} disabled={busy} style={{ ...styles.primaer, opacity: busy ? 0.6 : 1 }}>{busy ? 'Speichert …' : '+ Erfassen'}</button>
            </div>
          </div>

          {/* Offene Leistungen + Rechnung */}
          <div style={{ ...styles.card, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
              <h2 style={{ ...styles.cardTitel, margin: 0 }}>Offene Leistungen</h2>
              <button onClick={rechnungErstellen} disabled={rechnungBusy || offene.length === 0} style={{ ...styles.primaer, opacity: (rechnungBusy || offene.length === 0) ? 0.5 : 1 }}>
                {rechnungBusy ? 'Erstellt …' : `🧾 Rechnung erstellen (${eur(offenNetto)})`}
              </button>
            </div>
            {offene.length === 0 ? <div style={styles.hint}>Keine offenen Leistungen. Erfasse oben Zeiten oder alles ist abgerechnet.</div> : (
              <Tabelle rows={offene} onDelete={loeschen} />
            )}
          </div>

          {/* Abgerechnet */}
          {abgerechnet.length > 0 && (
            <div style={{ ...styles.card, marginTop: 16 }}>
              <h2 style={styles.cardTitel}>Bereits abgerechnet</h2>
              <Tabelle rows={abgerechnet} onDelete={loeschen} />
              <div style={{ marginTop: 10 }}><a href="/dashboard/rechnungen" style={{ color: C.cyan, fontWeight: 700 }}>Zu den Rechnungen ›</a></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Tabelle({ rows, onDelete }: { rows: Leistung[]; onDelete: (l: Leistung) => void }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={styles.table}>
        <thead><tr>
          <th style={styles.th}>Datum</th><th style={styles.th}>Beschreibung</th>
          <th style={{ ...styles.th, textAlign: 'right' }}>Std</th><th style={{ ...styles.th, textAlign: 'right' }}>Satz</th>
          <th style={{ ...styles.th, textAlign: 'right' }}>Netto</th><th style={{ ...styles.th, textAlign: 'right' }}></th>
        </tr></thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td style={styles.td}>{datumHuebsch(l.datum)}</td>
              <td style={styles.td}>{l.beschreibung}{l.kunde_name ? <span style={{ color: C.textDim }}> · {l.kunde_name}</span> : null}</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{String(l.stunden).replace('.', ',')}</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{eur(l.stundensatz)}</td>
              <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>{eur(l.stunden * l.stundensatz)}</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{!l.abgerechnet && <button onClick={() => onDelete(l)} style={styles.miniBtnGhost}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function SummeKarte({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (<div style={styles.summeBox}><div style={styles.summeLabel}>{label}</div><div style={{ ...styles.summeValue, color: accent || C.text }}>{value}</div></div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(30px, 2.63vw, 42px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 18px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 680, lineHeight: 1.5 },
  projektZeile: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 14 },
  summenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 },
  summeBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  summeLabel: { fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  summeValue: { fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(22px, 2vw, 32px)', fontWeight: 800 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(17px, 1.5vw, 24px)', fontWeight: 700, margin: '0 0 14px', color: C.text },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  lbl: { display: 'block', fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit' },
  primaer: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtnGhost: { background: 'transparent', color: C.danger, border: `1px solid ${C.border}`, borderRadius: 8, padding: '4px 10px', fontSize: 'clamp(13px, 1.13vw, 18px)', fontFamily: 'inherit', cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 640 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` },
  td: { padding: '10px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'top' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '14px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 },
};
