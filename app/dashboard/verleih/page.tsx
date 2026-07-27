'use client';

// ============================================================
// ARGONAUT OS · A1 · Verleih-/Vermietungs-Engine
// Mietgegenstände verwalten + Ausleih-Vorgänge (reservieren → ausgeben →
// zurücknehmen) mit Verfügbarkeits-Check, Wochenstaffel-Preis und Kaution.
// Reine Formeln aus lib/verleih (0 €, getestet).
// Pfad: app/dashboard/verleih/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  mietTage, mietPreis, freieAnzahl, istUeberfaellig, zaehleVerleih,
  VERLEIH_VORLAGEN, verleihVorlage, type VorgangBasis,
} from '@/lib/verleih';
import { augeVerleih } from '@/lib/auge';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Artikel = { id: string; bezeichnung: string; kategorie: string | null; inventar_nr: string | null; tagessatz: number; wochensatz: number | null; kaution: number; anzahl: number; status: string };
type Vorgang = VorgangBasis & {
  id: string; artikel_id: string; kontakt_id: string | null; mieter_name: string | null;
  tagessatz: number; kaution: number; status: string; ausgegeben_am: string | null; zurueck_am: string | null; rechnung_id: string | null;
};
type Kontakt = { id: string; name: string };

const STATUS_META: Record<string, { label: string; farbe: string }> = {
  reserviert: { label: '📅 reserviert', farbe: C.cyan },
  ausgegeben: { label: '📤 ausgegeben', farbe: C.warn },
  zurueck: { label: '✓ zurück', farbe: C.green },
  storniert: { label: '✕ storniert', farbe: C.textDim },
};

function heuteLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function eur(n: number | null) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function kontaktName(k: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return s(k.anzeigename) || [s(k.vorname), s(k.nachname)].filter(Boolean).join(' ') || s(k.name) || s(k.firmenname) || s(k.firma) || s(k.email) || 'Kontakt';
}

export default function VerleihPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [tab, setTab] = useState<'vorgaenge' | 'artikel'>('vorgaenge');
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [vorgaenge, setVorgaenge] = useState<Vorgang[]>([]);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const H = heuteLokal();

  const [na, setNa] = useState({ bezeichnung: '', kategorie: '', tagessatz: '', wochensatz: '', kaution: '', anzahl: '1' });
  const [nv, setNv] = useState({ artikel_id: '', kontakt_id: '', mieter_name: '', von: H, bis: H });

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [a, v, k] = await Promise.all([
        supabase.from('verleih_artikel').select('*').order('bezeichnung', { ascending: true }),
        supabase.from('verleih_vorgang').select('*').order('von', { ascending: false }),
        supabase.from('kontakte').select('*'),
      ]);
      setArtikel((a.data as Artikel[]) ?? []);
      setVorgaenge((v.data as Vorgang[]) ?? []);
      setKontakte(((k.data as Record<string, unknown>[]) ?? []).map((x) => ({ id: String(x.id), name: kontaktName(x) })).sort((p, q) => p.name.localeCompare(q.name)));
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

  const kennzahlen = useMemo(() => zaehleVerleih(vorgaenge, H), [vorgaenge, H]);
  const artById = useCallback((id: string) => artikel.find((x) => x.id === id), [artikel]);

  // --- Live-Vorschau für den neuen Vorgang ---
  const vorschau = useMemo(() => {
    const art = artById(nv.artikel_id);
    if (!art || !nv.von || !nv.bis || nv.bis < nv.von) return null;
    const tage = mietTage(nv.von, nv.bis);
    const preis = mietPreis(tage, art.tagessatz, art.wochensatz);
    const frei = freieAnzahl(art.anzahl, vorgaenge.filter((x) => x.artikel_id === art.id), nv.von, nv.bis);
    return { tage, preis, kaution: art.kaution, frei, art };
  }, [nv, artById, vorgaenge]);

  // --- Artikel anlegen ---
  async function artikelAnlegen() {
    if (!uid || !na.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setBusy('artikel'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('verleih_artikel').insert({
        owner_user_id: uid, bezeichnung: na.bezeichnung.trim(), kategorie: na.kategorie.trim() || null,
        tagessatz: num(na.tagessatz), wochensatz: na.wochensatz.trim() ? num(na.wochensatz) : null,
        kaution: num(na.kaution), anzahl: Math.max(1, Math.round(num(na.anzahl)) || 1), status: 'aktiv',
      });
      if (error) throw error;
      setNa({ bezeichnung: '', kategorie: '', tagessatz: '', wochensatz: '', kaution: '', anzahl: '1' });
      setOk('Mietgegenstand angelegt.'); await laden_();
    } catch (e: unknown) { setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  // --- Vorgang anlegen (reservieren) ---
  async function vorgangAnlegen() {
    if (!uid) return;
    const art = artById(nv.artikel_id);
    if (!art) { setFehler('Bitte einen Mietgegenstand wählen.'); return; }
    if (!nv.von || !nv.bis || nv.bis < nv.von) { setFehler('Bitte einen gültigen Zeitraum wählen (bis ≥ von).'); return; }
    if (vorschau && vorschau.frei <= 0) { setFehler('Im gewählten Zeitraum ist kein Exemplar frei.'); return; }
    setBusy('vorgang'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('verleih_vorgang').insert({
        owner_user_id: uid, artikel_id: art.id, kontakt_id: nv.kontakt_id || null, mieter_name: nv.mieter_name.trim() || null,
        von: nv.von, bis: nv.bis, tagessatz: art.tagessatz, kaution: art.kaution, status: 'reserviert',
      });
      if (error) throw error;
      setNv({ artikel_id: '', kontakt_id: '', mieter_name: '', von: H, bis: H });
      setOk('Ausleihe reserviert.'); await laden_();
    } catch (e: unknown) { setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function vorgangStatus(v: Vorgang, status: string) {
    setBusy(v.id); setFehler(null);
    const patch: Record<string, unknown> = { status, aktualisiert_am: new Date().toISOString() };
    if (status === 'ausgegeben') patch.ausgegeben_am = H;
    if (status === 'zurueck') patch.zurueck_am = H;
    try {
      const { error } = await supabase.from('verleih_vorgang').update(patch).eq('id', v.id);
      if (error) throw error;
      await laden_();
    } catch (e: unknown) { setFehler('Status fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function rechnungErstellen(v: Vorgang) {
    if (v.rechnung_id) { window.location.href = `/dashboard/rechnungen?id=${v.rechnung_id}`; return; }
    setBusy(v.id); setFehler(null); setOk(null);
    try {
      const res = await fetch('/api/rechnung-aus-verleih', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vorgangId: v.id }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (res.status === 409 && j.rechnungId) { await laden_(); setOk('Für diese Ausleihe gibt es bereits eine Rechnung.'); return; }
        throw new Error(j.error || 'Fehler');
      }
      await laden_();
      setOk('Rechnung erstellt.');
    } catch (e: unknown) { setFehler('Rechnung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  function kontaktWahl(id: string) {
    const k = kontakte.find((x) => x.id === id);
    setNv((f) => ({ ...f, kontakt_id: id, mieter_name: k ? k.name : f.mieter_name }));
  }

  function vorlageWahl(key: string) {
    const vl = verleihVorlage(key);
    if (!vl) return;
    setNa((f) => ({ ...f, bezeichnung: vl.bezeichnung, kategorie: vl.kategorie }));
  }

  const kontaktName_ = (id: string | null) => kontakte.find((k) => k.id === id)?.name ?? null;

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Verleih</div>
      <h1 style={styles.h1}>🔑 Verleih & Vermietung</h1>
      <p style={styles.sub}>Mietgegenstände, Verfügbarkeit und Ausleih-Vorgänge an einem Ort — mit Tages-/Wochenpreis, Kaution und Überfälligkeits-Ampel.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <Kpi label="Ausgegeben" value={String(kennzahlen.ausgegeben)} accent={C.warn} />
        <Kpi label="Reserviert" value={String(kennzahlen.reserviert)} accent={C.cyan} />
        <Kpi label="Überfällig" value={String(kennzahlen.ueberfaellig)} accent={kennzahlen.ueberfaellig > 0 ? C.danger : C.green} />
        <Kpi label="Mietgegenstände" value={String(artikel.length)} accent={C.text} />
      </div>
      {!laden && (
        <div style={{ marginBottom: 14 }}>
          <KiAuge modul="Verleih" regel={augeVerleih(kennzahlen)} />
        </div>
      )}

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'vorgaenge' ? styles.tabAn : {}) }} onClick={() => setTab('vorgaenge')}>📋 Ausleihen</button>
        <button style={{ ...styles.tab, ...(tab === 'artikel' ? styles.tabAn : {}) }} onClick={() => setTab('artikel')}>🔧 Mietgegenstände</button>
      </div>

      {/* ---------- AUSLEIHEN ---------- */}
      {tab === 'vorgaenge' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Neue Ausleihe</div>
            {artikel.length === 0 ? (
              <div style={styles.hint}>Lege zuerst im Reiter „Mietgegenstände" einen Artikel an.</div>
            ) : (
              <>
                <div style={styles.grid}>
                  <label style={styles.lab}>Gegenstand
                    <select style={styles.inp} value={nv.artikel_id} onChange={(e) => setNv({ ...nv, artikel_id: e.target.value })}>
                      <option value="">— wählen —</option>
                      {artikel.filter((a) => a.status === 'aktiv').map((a) => <option key={a.id} value={a.id}>{a.bezeichnung} ({eur(a.tagessatz)}/Tag)</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Mieter (Kontakt)
                    <select style={styles.inp} value={nv.kontakt_id} onChange={(e) => kontaktWahl(e.target.value)}>
                      <option value="">— kein Kontakt —</option>
                      {kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Mieter (Freitext)<input style={styles.inp} value={nv.mieter_name} onChange={(e) => setNv({ ...nv, mieter_name: e.target.value })} /></label>
                  <label style={styles.lab}>Von<input type="date" style={styles.inp} value={nv.von} onChange={(e) => setNv({ ...nv, von: e.target.value })} /></label>
                  <label style={styles.lab}>Bis<input type="date" style={styles.inp} value={nv.bis} onChange={(e) => setNv({ ...nv, bis: e.target.value })} /></label>
                </div>
                {vorschau && (
                  <div style={{ ...styles.vorschau, borderColor: vorschau.frei > 0 ? C.border : C.danger }}>
                    <span><b>{vorschau.tage}</b> Miettage · <b style={{ color: C.gold }}>{eur(vorschau.preis)}</b> netto{vorschau.kaution > 0 ? ` · Kaution ${eur(vorschau.kaution)}` : ''}</span>
                    <span style={{ color: vorschau.frei > 0 ? C.green : C.danger, fontWeight: 700 }}>{vorschau.frei > 0 ? `✓ ${vorschau.frei} frei` : '✕ nicht verfügbar'}</span>
                  </div>
                )}
                <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'vorgang' ? 0.6 : 1 }} disabled={busy === 'vorgang'} onClick={vorgangAnlegen}>＋ Reservieren</button>
              </>
            )}
          </div>

          {laden ? <p style={styles.hint}>Lädt …</p> : (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {vorgaenge.length === 0 ? <div style={{ padding: 20, color: C.textDim }}>Noch keine Ausleihen.</div> : (
                <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>Gegenstand</th><th style={styles.th}>Mieter</th><th style={styles.th}>Zeitraum</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Preis</th><th style={styles.th}>Status</th><th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th>
                  </tr></thead>
                  <tbody>
                    {vorgaenge.map((v) => {
                      const art = artById(v.artikel_id);
                      const tage = mietTage(v.von ?? '', v.bis ?? '');
                      const preis = mietPreis(tage, v.tagessatz, art?.wochensatz);
                      const sm = STATUS_META[v.status] ?? STATUS_META.reserviert;
                      const ueber = istUeberfaellig(v, H);
                      return (
                        <tr key={v.id} style={{ opacity: v.status === 'storniert' ? 0.5 : 1 }}>
                          <td style={styles.td}>{art?.bezeichnung ?? '—'}</td>
                          <td style={{ ...styles.td, color: C.textDim }}>{v.mieter_name || kontaktName_(v.kontakt_id) || '—'}</td>
                          <td style={styles.td}>{d(v.von ?? null)} – {d(v.bis ?? null)} <span style={{ color: C.textDim }}>({tage} T)</span>{ueber && <div style={{ color: C.danger, fontSize: 'clamp(11px,0.94vw,15px)', fontWeight: 700 }}>überfällig</div>}</td>
                          <td style={{ ...styles.td, textAlign: 'right', color: C.gold, fontWeight: 700 }}>{eur(preis)}</td>
                          <td style={styles.td}><span style={{ ...styles.badge, color: sm.farbe, borderColor: sm.farbe }}>{sm.label}</span></td>
                          <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {v.status === 'reserviert' && <button style={styles.mini} disabled={busy === v.id} onClick={() => vorgangStatus(v, 'ausgegeben')}>📤 Ausgeben</button>}
                            {v.status === 'ausgegeben' && <button style={{ ...styles.mini, color: C.green, borderColor: `${C.green}55` }} disabled={busy === v.id} onClick={() => vorgangStatus(v, 'zurueck')}>✓ Zurück</button>}
                            {(v.status === 'reserviert' || v.status === 'ausgegeben') && <button style={styles.mini} disabled={busy === v.id} onClick={() => vorgangStatus(v, 'storniert')}>Stornieren</button>}
                            {(v.status === 'ausgegeben' || v.status === 'zurueck') && !v.rechnung_id && <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55` }} disabled={busy === v.id} onClick={() => rechnungErstellen(v)}>€ Rechnung</button>}
                            {v.rechnung_id && <button style={{ ...styles.mini, color: C.cyan, borderColor: `${C.cyan}55` }} onClick={() => rechnungErstellen(v)}>Rechnung ›</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------- MIETGEGENSTÄNDE ---------- */}
      {tab === 'artikel' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Mietgegenstand anlegen</div>
            <label style={{ ...styles.lab, marginBottom: 12 }}>🔧 Aus Vorlage starten (optional – füllt Bezeichnung & Kategorie)
              <select style={styles.inp} value="" onChange={(e) => { vorlageWahl(e.target.value); e.target.value = ''; }}>
                <option value="">— Vorlage wählen —</option>
                {[...new Set(VERLEIH_VORLAGEN.map((v) => v.branche))].map((br) => (
                  <optgroup key={br} label={br}>
                    {VERLEIH_VORLAGEN.filter((v) => v.branche === br).map((v) => <option key={v.key} value={v.key}>{v.bezeichnung}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <div style={styles.grid}>
              <label style={styles.lab}>Bezeichnung<input style={styles.inp} value={na.bezeichnung} onChange={(e) => setNa({ ...na, bezeichnung: e.target.value })} placeholder="z. B. Minibagger 1,8 t" /></label>
              <label style={styles.lab}>Kategorie<input style={styles.inp} value={na.kategorie} onChange={(e) => setNa({ ...na, kategorie: e.target.value })} placeholder="z. B. Baumaschine" /></label>
              <label style={styles.lab}>Tagessatz (€)<input style={styles.inp} inputMode="decimal" value={na.tagessatz} onChange={(e) => setNa({ ...na, tagessatz: e.target.value })} /></label>
              <label style={styles.lab}>Wochensatz (€, optional)<input style={styles.inp} inputMode="decimal" value={na.wochensatz} onChange={(e) => setNa({ ...na, wochensatz: e.target.value })} /></label>
              <label style={styles.lab}>Kaution (€)<input style={styles.inp} inputMode="decimal" value={na.kaution} onChange={(e) => setNa({ ...na, kaution: e.target.value })} /></label>
              <label style={styles.lab}>Exemplare<input style={styles.inp} inputMode="numeric" value={na.anzahl} onChange={(e) => setNa({ ...na, anzahl: e.target.value })} /></label>
            </div>
            <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'artikel' ? 0.6 : 1 }} disabled={busy === 'artikel'} onClick={artikelAnlegen}>＋ Anlegen</button>
          </div>

          {laden ? <p style={styles.hint}>Lädt …</p> : (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {artikel.length === 0 ? <div style={{ padding: 20, color: C.textDim }}>Noch keine Mietgegenstände.</div> : (
                <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>Gegenstand</th><th style={styles.th}>Kategorie</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Tag</th><th style={{ ...styles.th, textAlign: 'right' }}>Woche</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Kaution</th><th style={{ ...styles.th, textAlign: 'right' }}>Frei heute</th>
                  </tr></thead>
                  <tbody>
                    {artikel.map((a) => {
                      const frei = freieAnzahl(a.anzahl, vorgaenge.filter((x) => x.artikel_id === a.id), H, H);
                      return (
                        <tr key={a.id}>
                          <td style={styles.td}>{a.bezeichnung}{a.status !== 'aktiv' ? <span style={{ color: C.textDim }}> · {a.status}</span> : ''}</td>
                          <td style={{ ...styles.td, color: C.textDim }}>{a.kategorie || '—'}</td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>{eur(a.tagessatz)}</td>
                          <td style={{ ...styles.td, textAlign: 'right', color: C.textDim }}>{a.wochensatz ? eur(a.wochensatz) : '—'}</td>
                          <td style={{ ...styles.td, textAlign: 'right', color: C.textDim }}>{eur(a.kaution)}</td>
                          <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700, color: frei > 0 ? C.green : C.danger }}>{frei} / {a.anzahl}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (<div style={styles.kpi}><div style={{ ...styles.kWert, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div></div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 760, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '4px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 24, fontWeight: 800, lineHeight: 1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  tabs: { display: 'flex', gap: 8, margin: '4px 0 12px' },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  vorschau: { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 12, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 'clamp(13px, 1.13vw, 18px)' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 6, whiteSpace: 'nowrap' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 720 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 'clamp(11.5px, 1vw, 16px)', fontWeight: 700, whiteSpace: 'nowrap' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
