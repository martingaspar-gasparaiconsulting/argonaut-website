'use client';

// ============================================================
// ARGONAUT OS · A4 · Belegung generisch
// Bookbare Einheiten (Ferienwohnung, Stellplatz, Halle, Bahn, Apartment …)
// + Belegungsvorgänge mit Verfügbarkeits-Check, Preis je Nacht/Tag/Stunde,
// Grundgebühr und Kaution. Reine Formeln aus lib/belegung (0 €, getestet).
// Doppelbelegung ist zusätzlich in der DB gesperrt (EXCLUDE-Constraint).
// Pfad: app/dashboard/belegung/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseStandortCookie } from '@/lib/aktiverStandort';
import { konkreterStandort, standortOrFilter } from '@/lib/standortDaten';
import Leerzustand from '../_components/Leerzustand';
import { EigeneFelderManager, EigeneFelderInputs, EigeneFelderAnzeige, ladeFelder, ladeWerte, speichereWerte } from '../_components/EigeneFelder';
import { NurVoll } from '../_components/Ansicht';
import type { EigenesFeld } from '@/lib/eigeneFelder';
import {
  ABRECHNUNGSARTEN, berechneVorgang, konflikte, zaehleBelegung, istAktuellBelegt,
  type Abrechnungsart,
} from '@/lib/belegung';
import { augeBelegung } from '@/lib/auge';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const MODUL = 'belegung_vorgang';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Einheit = {
  id: string; bezeichnung: string; kategorie: string | null; einheit_nr: string | null;
  abrechnungsart: Abrechnungsart; preis_pro_einheit: number; grundgebuehr: number; kaution: number;
  max_belegung: number | null; mwst_satz: number; status: string;
};
type Vorgang = {
  id: string; einheit_id: string; kontakt_id: string | null; gast_name: string | null;
  von: string; bis: string; anzahl_gaeste: number | null;
  preis_pro_einheit: number; grundgebuehr: number; kaution: number; mwst_satz: number;
  status: string; rechnung_id: string | null; notiz: string | null;
};
type Kontakt = { id: string; name: string };

const STATUS_META: Record<string, { label: string; farbe: string }> = {
  reserviert:  { label: '📅 reserviert',  farbe: C.cyan },
  bestaetigt:  { label: '✓ bestätigt',    farbe: C.gold },
  eingecheckt: { label: '🔑 eingecheckt',  farbe: C.green },
  ausgecheckt: { label: '📤 ausgecheckt',  farbe: C.textDim },
  storniert:   { label: '✕ storniert',    farbe: C.textDim },
};

const ART_LABEL: Record<Abrechnungsart, string> = { nacht: 'Nächte', tag: 'Tage', stunde: 'Std' };

function heuteLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function plusTage(iso: string, n: number) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function eur(n: number | null) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function fmtDatum(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function fmtZeit(iso: string | null) { if (!iso) return '—'; return iso.length >= 16 ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}. ${iso.slice(11, 16)}` : fmtDatum(iso); }
function zeige(iso: string | null, art: Abrechnungsart) { return art === 'stunde' ? fmtZeit(iso) : fmtDatum(iso); }
function kontaktName(k: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return s(k.anzeigename) || [s(k.vorname), s(k.nachname)].filter(Boolean).join(' ') || s(k.name) || s(k.firmenname) || s(k.firma) || s(k.email) || 'Kontakt';
}

export default function BelegungPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [tab, setTab] = useState<'belegungen' | 'einheiten'>('belegungen');
  const [einheiten, setEinheiten] = useState<Einheit[]>([]);
  const [vorgaenge, setVorgaenge] = useState<Vorgang[]>([]);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const H = heuteLokal();

  const [ne, setNe] = useState({ bezeichnung: '', kategorie: '', einheit_nr: '', abrechnungsart: 'nacht' as Abrechnungsart, preis: '', grundgebuehr: '', kaution: '', max_belegung: '', mwst_satz: '7' });
  const [nv, setNv] = useState({ einheit_id: '', kontakt_id: '', gast_name: '', von: H, bis: plusTage(H, 1), anzahl_gaeste: '' });
  const [felder, setFelder] = useState<EigenesFeld[]>([]);
  const [nmExtra, setNmExtra] = useState<Record<string, string>>({});
  const [werteMap, setWerteMap] = useState<Record<string, Record<string, string>>>({});

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      // Filial-Zuschnitt (fail-open): aktiver Standort zeigt seine + Standort-lose Einheiten.
      const sid = konkreterStandort(leseStandortCookie());
      let beq = supabase.from('belegung_einheit').select('*');
      if (sid) beq = beq.or(standortOrFilter(sid));
      const [e, v, k] = await Promise.all([
        beq.order('bezeichnung', { ascending: true }),
        supabase.from('belegung_vorgang').select('*').order('von', { ascending: false }),
        supabase.from('kontakte').select('*'),
      ]);
      const eRows = (e.data as Einheit[]) ?? [];
      setEinheiten(eRows);
      const eIds = new Set(eRows.map((x) => x.id));
      // Vorgänge nur zu sichtbaren (Filial-)Einheiten — hält Belegt-Anzeige/KPIs konsistent.
      const vv = ((v.data as Vorgang[]) ?? []).filter((x) => eIds.has(x.einheit_id));
      setVorgaenge(vv);
      setFelder(await ladeFelder(MODUL));
      setWerteMap(await ladeWerte(MODUL, vv.map((r) => r.id)));
      setKontakte(((k.data as Record<string, unknown>[]) ?? []).map((x) => ({ id: String(x.id), name: kontaktName(x) })).sort((p, q) => p.name.localeCompare(q.name)));
    } catch (err: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
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

  const kennzahlen = useMemo(() => zaehleBelegung(einheiten, vorgaenge, new Date()), [einheiten, vorgaenge]);
  const einById = useCallback((id: string) => einheiten.find((x) => x.id === id), [einheiten]);
  const selEinheit = einById(nv.einheit_id);
  const selArt: Abrechnungsart = selEinheit?.abrechnungsart ?? 'nacht';

  // --- Live-Vorschau für die neue Belegung ---
  const vorschau = useMemo(() => {
    const e = selEinheit;
    if (!e || !nv.von || !nv.bis || nv.bis <= nv.von) return null;
    const p = berechneVorgang({ art: e.abrechnungsart, von: nv.von, bis: nv.bis, preisProEinheit: e.preis_pro_einheit, grundgebuehr: e.grundgebuehr, kaution: e.kaution, mwstSatz: e.mwst_satz });
    const konflikt = konflikte(e.id, nv.von, nv.bis, vorgaenge);
    return { p, frei: konflikt.length === 0, e };
  }, [nv, selEinheit, vorgaenge]);

  function einheitWahl(id: string) {
    const e = einById(id);
    const art = e?.abrechnungsart ?? 'nacht';
    setNv((f) => ({
      ...f, einheit_id: id,
      von: art === 'stunde' ? `${H}T09:00` : H,
      bis: art === 'stunde' ? `${H}T10:00` : plusTage(H, 1),
    }));
  }

  function kontaktWahl(id: string) {
    const k = kontakte.find((x) => x.id === id);
    setNv((f) => ({ ...f, kontakt_id: id, gast_name: k ? k.name : f.gast_name }));
  }

  // --- Einheit anlegen ---
  async function einheitAnlegen() {
    if (!uid || !ne.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setBusy('einheit'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('belegung_einheit').insert({
        owner_user_id: uid, standort_id: konkreterStandort(leseStandortCookie()), bezeichnung: ne.bezeichnung.trim(), kategorie: ne.kategorie.trim() || null,
        einheit_nr: ne.einheit_nr.trim() || null, abrechnungsart: ne.abrechnungsart,
        preis_pro_einheit: num(ne.preis), grundgebuehr: num(ne.grundgebuehr), kaution: num(ne.kaution),
        max_belegung: ne.max_belegung.trim() ? Math.round(num(ne.max_belegung)) : null,
        mwst_satz: num(ne.mwst_satz) || 7, status: 'aktiv',
      });
      if (error) throw error;
      setNe({ bezeichnung: '', kategorie: '', einheit_nr: '', abrechnungsart: 'nacht', preis: '', grundgebuehr: '', kaution: '', max_belegung: '', mwst_satz: '7' });
      setOk('Einheit angelegt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  // --- Belegung anlegen (reservieren) ---
  async function vorgangAnlegen() {
    if (!uid) return;
    const e = selEinheit;
    if (!e) { setFehler('Bitte eine Einheit wählen.'); return; }
    if (!nv.von || !nv.bis || nv.bis <= nv.von) { setFehler('Bitte einen gültigen Zeitraum wählen (bis muss nach von liegen).'); return; }
    if (vorschau && !vorschau.frei) { setFehler('Dieser Zeitraum ist für die Einheit bereits belegt.'); return; }
    setBusy('vorgang'); setFehler(null); setOk(null);
    try {
      const { data: neu, error } = await supabase.from('belegung_vorgang').insert({
        owner_user_id: uid, einheit_id: e.id, kontakt_id: nv.kontakt_id || null, gast_name: nv.gast_name.trim() || null,
        von: nv.von, bis: nv.bis, anzahl_gaeste: nv.anzahl_gaeste.trim() ? Math.round(num(nv.anzahl_gaeste)) : null,
        preis_pro_einheit: e.preis_pro_einheit, grundgebuehr: e.grundgebuehr, kaution: e.kaution, mwst_satz: e.mwst_satz,
        status: 'reserviert',
      }).select('id').single();
      if (error) {
        // 23P01 = exclusion_violation → Doppelbelegung durch DB verhindert
        if ((error as { code?: string }).code === '23P01') { setFehler('Dieser Zeitraum ist für die Einheit bereits belegt (von der Datenbank gesperrt).'); return; }
        throw error;
      }
      try { await speichereWerte(MODUL, (neu as { id: string }).id, uid, nmExtra); } catch { /* eigene Felder optional */ }
      setNmExtra({});
      setNv({ einheit_id: '', kontakt_id: '', gast_name: '', von: H, bis: plusTage(H, 1), anzahl_gaeste: '' });
      setOk('Belegung reserviert.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function vorgangStatus(v: Vorgang, status: string) {
    setBusy(v.id); setFehler(null);
    try {
      const { error } = await supabase.from('belegung_vorgang').update({ status }).eq('id', v.id);
      if (error) throw error;
      await laden_();
    } catch (err: unknown) { setFehler('Status fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function rechnungErstellen(v: Vorgang) {
    if (v.rechnung_id) { window.location.href = `/dashboard/rechnungen?id=${v.rechnung_id}`; return; }
    setBusy(v.id); setFehler(null); setOk(null);
    try {
      const res = await fetch('/api/rechnung-aus-belegung', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vorgangId: v.id }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (res.status === 409 && j.rechnungId) { await laden_(); setOk('Für diese Belegung gibt es bereits eine Rechnung.'); return; }
        throw new Error(j.error || 'Fehler');
      }
      await laden_();
      setOk('Rechnung erstellt.');
    } catch (err: unknown) { setFehler('Rechnung fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  const kontaktName_ = (id: string | null) => kontakte.find((k) => k.id === id)?.name ?? null;
  const einheitBelegtJetzt = (id: string) => vorgaenge.some((v) => v.einheit_id === id && istAktuellBelegt(v, new Date()));

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Belegung</div>
      <h1 style={styles.h1}>🗓 Belegung & Vermietung</h1>
      <p style={styles.sub}>Einheiten, Verfügbarkeit und Belegungen an einem Ort — für Ferienwohnung, Stellplatz, Halle oder Apartment. Preis je Nacht, Tag oder Stunde, mit Grundgebühr und Kaution. Doppelbelegung ist ausgeschlossen.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <Kpi label="Belegt jetzt" value={String(kennzahlen.belegtJetzt)} accent={C.warn} />
        <Kpi label="Frei jetzt" value={String(kennzahlen.freiJetzt)} accent={C.green} />
        <Kpi label="Anreisen heute" value={String(kennzahlen.anreisenHeute)} accent={C.cyan} />
        <Kpi label="Abreisen heute" value={String(kennzahlen.abreisenHeute)} accent={C.text} />
        <Kpi label="Einheiten" value={String(kennzahlen.aktiveEinheiten)} accent={C.text} />
      </div>
      {!laden && (
        <div style={{ marginBottom: 14 }}>
          <KiAuge modul="Belegung" regel={augeBelegung(kennzahlen)} />
        </div>
      )}

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'belegungen' ? styles.tabAn : {}) }} onClick={() => setTab('belegungen')}>📋 Belegungen</button>
        <button style={{ ...styles.tab, ...(tab === 'einheiten' ? styles.tabAn : {}) }} onClick={() => setTab('einheiten')}>🏠 Einheiten</button>
      </div>

      {/* ---------- BELEGUNGEN ---------- */}
      {tab === 'belegungen' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Neue Belegung</div>
            {einheiten.length === 0 ? (
              <div style={styles.hint}>Lege zuerst im Reiter „Einheiten" eine buchbare Einheit an.</div>
            ) : (
              <>
                <div style={styles.grid}>
                  <label style={styles.lab}>Einheit
                    <select style={styles.inp} value={nv.einheit_id} onChange={(e) => einheitWahl(e.target.value)}>
                      <option value="">— wählen —</option>
                      {einheiten.filter((e) => e.status === 'aktiv').map((e) => <option key={e.id} value={e.id}>{e.bezeichnung} ({eur(e.preis_pro_einheit)}/{ART_LABEL[e.abrechnungsart].replace('Nächte', 'Nacht').replace('Tage', 'Tag')})</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Gast (Kontakt)
                    <select style={styles.inp} value={nv.kontakt_id} onChange={(e) => kontaktWahl(e.target.value)}>
                      <option value="">— kein Kontakt —</option>
                      {kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Gast (Freitext)<input style={styles.inp} value={nv.gast_name} onChange={(e) => setNv({ ...nv, gast_name: e.target.value })} /></label>
                  <label style={styles.lab}>{selArt === 'stunde' ? 'Von (Datum + Zeit)' : selArt === 'tag' ? 'Von (erster Tag)' : 'Anreise'}
                    <input type={selArt === 'stunde' ? 'datetime-local' : 'date'} style={styles.inp} value={nv.von} onChange={(e) => setNv({ ...nv, von: e.target.value })} />
                  </label>
                  <label style={styles.lab}>{selArt === 'stunde' ? 'Bis (Datum + Zeit)' : selArt === 'tag' ? 'Bis (Folgetag, exkl.)' : 'Abreise'}
                    <input type={selArt === 'stunde' ? 'datetime-local' : 'date'} style={styles.inp} value={nv.bis} onChange={(e) => setNv({ ...nv, bis: e.target.value })} />
                  </label>
                  <NurVoll>
                    <label style={styles.lab}>Personen (optional)<input style={styles.inp} inputMode="numeric" value={nv.anzahl_gaeste} onChange={(e) => setNv({ ...nv, anzahl_gaeste: e.target.value })} /></label>
                    <EigeneFelderInputs felder={felder} werte={nmExtra} setWert={(fid, w) => setNmExtra((s) => ({ ...s, [fid]: w }))} inpStyle={styles.inp} labStyle={styles.lab} />
                  </NurVoll>
                </div>
                {vorschau && (
                  <div style={{ ...styles.vorschau, borderColor: vorschau.frei ? C.border : C.danger }}>
                    <span>
                      <b>{vorschau.p.menge}</b> {ART_LABEL[vorschau.e.abrechnungsart]} · <b style={{ color: C.gold }}>{eur(vorschau.p.netto)}</b> netto · {eur(vorschau.p.brutto)} brutto ({vorschau.p.mwstSatz} % MwSt){vorschau.e.kaution > 0 ? ` · Kaution ${eur(vorschau.e.kaution)}` : ''}
                    </span>
                    <span style={{ color: vorschau.frei ? C.green : C.danger, fontWeight: 700 }}>{vorschau.frei ? '✓ verfügbar' : '✕ belegt'}</span>
                  </div>
                )}
                <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'vorgang' ? 0.6 : 1 }} disabled={busy === 'vorgang'} onClick={vorgangAnlegen}>＋ Reservieren</button>
              </>
            )}
          </div>

          {uid && <EigeneFelderManager modul={MODUL} ownerId={uid} onChange={laden_} />}

          {laden ? <p style={styles.hint}>Lädt …</p> : (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {vorgaenge.length === 0 ? <Leerzustand icon="📅" titel="Noch keine Belegungen" text="Buche Einheiten mit Verfügbarkeits-Check, Preis und Kaution." schritte={["Einheit anlegen (Reiter „Einheiten“)", "Belegung mit Zeitraum erfassen", "Verfügbarkeit und Preis prüfen"]} /> : (
                <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>Einheit</th><th style={styles.th}>Gast</th><th style={styles.th}>Zeitraum</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Preis (brutto)</th><th style={styles.th}>Status</th><th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th>
                  </tr></thead>
                  <tbody>
                    {vorgaenge.map((v) => {
                      const e = einById(v.einheit_id);
                      const art = e?.abrechnungsart ?? 'nacht';
                      const p = berechneVorgang({ art, von: v.von, bis: v.bis, preisProEinheit: v.preis_pro_einheit, grundgebuehr: v.grundgebuehr, kaution: v.kaution, mwstSatz: v.mwst_satz });
                      const sm = STATUS_META[v.status] ?? STATUS_META.reserviert;
                      return (
                        <tr key={v.id} style={{ opacity: v.status === 'storniert' ? 0.5 : 1 }}>
                          <td style={styles.td}>{e?.bezeichnung ?? '—'}</td>
                          <td style={{ ...styles.td, color: C.textDim }}>{v.gast_name || kontaktName_(v.kontakt_id) || '—'}<EigeneFelderAnzeige felder={felder} werte={werteMap[v.id]} /></td>
                          <td style={styles.td}>{zeige(v.von, art)} – {zeige(v.bis, art)} <span style={{ color: C.textDim }}>({p.menge} {ART_LABEL[art]})</span></td>
                          <td style={{ ...styles.td, textAlign: 'right', color: C.gold, fontWeight: 700 }}>{eur(p.brutto)}</td>
                          <td style={styles.td}><span style={{ ...styles.badge, color: sm.farbe, borderColor: sm.farbe }}>{sm.label}</span></td>
                          <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {v.status === 'reserviert' && <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55` }} disabled={busy === v.id} onClick={() => vorgangStatus(v, 'bestaetigt')}>✓ Bestätigen</button>}
                            {v.status === 'bestaetigt' && <button style={{ ...styles.mini, color: C.green, borderColor: `${C.green}55` }} disabled={busy === v.id} onClick={() => vorgangStatus(v, 'eingecheckt')}>🔑 Check-in</button>}
                            {v.status === 'eingecheckt' && <button style={{ ...styles.mini, color: C.cyan, borderColor: `${C.cyan}55` }} disabled={busy === v.id} onClick={() => vorgangStatus(v, 'ausgecheckt')}>📤 Check-out</button>}
                            {(v.status === 'reserviert' || v.status === 'bestaetigt') && <button style={styles.mini} disabled={busy === v.id} onClick={() => vorgangStatus(v, 'storniert')}>Stornieren</button>}
                            {(v.status === 'bestaetigt' || v.status === 'eingecheckt' || v.status === 'ausgecheckt') && !v.rechnung_id && <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55` }} disabled={busy === v.id} onClick={() => rechnungErstellen(v)}>€ Rechnung</button>}
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

      {/* ---------- EINHEITEN ---------- */}
      {tab === 'einheiten' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Einheit anlegen</div>
            <div style={styles.grid}>
              <label style={styles.lab}>Bezeichnung<input style={styles.inp} value={ne.bezeichnung} onChange={(e) => setNe({ ...ne, bezeichnung: e.target.value })} placeholder="z. B. Ferienwohnung Seeblick" /></label>
              <label style={styles.lab}>Kategorie<input style={styles.inp} value={ne.kategorie} onChange={(e) => setNe({ ...ne, kategorie: e.target.value })} placeholder="z. B. Ferienwohnung, Stellplatz, Halle" /></label>
              <NurVoll>
                <label style={styles.lab}>Interne Nr. (optional)<input style={styles.inp} value={ne.einheit_nr} onChange={(e) => setNe({ ...ne, einheit_nr: e.target.value })} /></label>
              </NurVoll>
              <label style={styles.lab}>Abrechnung
                <select style={styles.inp} value={ne.abrechnungsart} onChange={(e) => setNe({ ...ne, abrechnungsart: e.target.value as Abrechnungsart })}>
                  {ABRECHNUNGSARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
              </label>
              <label style={styles.lab}>Preis pro {ne.abrechnungsart === 'stunde' ? 'Stunde' : ne.abrechnungsart === 'tag' ? 'Tag' : 'Nacht'} (€, netto)<input style={styles.inp} inputMode="decimal" value={ne.preis} onChange={(e) => setNe({ ...ne, preis: e.target.value })} /></label>
              <label style={styles.lab}>Grundgebühr (€, netto, optional)<input style={styles.inp} inputMode="decimal" value={ne.grundgebuehr} onChange={(e) => setNe({ ...ne, grundgebuehr: e.target.value })} placeholder="z. B. Endreinigung" /></label>
              <label style={styles.lab}>Kaution (€)<input style={styles.inp} inputMode="decimal" value={ne.kaution} onChange={(e) => setNe({ ...ne, kaution: e.target.value })} /></label>
              <NurVoll>
                <label style={styles.lab}>Max. Personen (optional)<input style={styles.inp} inputMode="numeric" value={ne.max_belegung} onChange={(e) => setNe({ ...ne, max_belegung: e.target.value })} /></label>
              </NurVoll>
              <label style={styles.lab}>MwSt.-Satz
                <select style={styles.inp} value={ne.mwst_satz} onChange={(e) => setNe({ ...ne, mwst_satz: e.target.value })}>
                  <option value="7">7 % — Beherbergung (Übernachtung)</option>
                  <option value="19">19 % — Halle/Platz/Bahn & Nebenleistung</option>
                </select>
              </label>
            </div>
            <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'einheit' ? 0.6 : 1 }} disabled={busy === 'einheit'} onClick={einheitAnlegen}>＋ Anlegen</button>
          </div>

          {laden ? <p style={styles.hint}>Lädt …</p> : (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {einheiten.length === 0 ? <Leerzustand icon="🏠" titel="Noch keine Einheiten" text="Lege buchbare Einheiten an (Wohnung, Stellplatz, Halle …)." schritte={["Einheit oben anlegen", "Preis je Nacht/Tag/Stunde setzen", "Grundgebühr und Kaution hinterlegen"]} /> : (
                <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>Einheit</th><th style={styles.th}>Kategorie</th><th style={styles.th}>Abrechnung</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Preis</th><th style={{ ...styles.th, textAlign: 'right' }}>Kaution</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>MwSt.</th><th style={styles.th}>Jetzt</th>
                  </tr></thead>
                  <tbody>
                    {einheiten.map((e) => {
                      const belegt = einheitBelegtJetzt(e.id);
                      const artLbl = e.abrechnungsart === 'stunde' ? 'Stunde' : e.abrechnungsart === 'tag' ? 'Tag' : 'Nacht';
                      return (
                        <tr key={e.id}>
                          <td style={styles.td}>{e.bezeichnung}{e.status !== 'aktiv' ? <span style={{ color: C.textDim }}> · {e.status}</span> : ''}{e.einheit_nr ? <span style={{ color: C.textDim }}> · {e.einheit_nr}</span> : ''}</td>
                          <td style={{ ...styles.td, color: C.textDim }}>{e.kategorie || '—'}</td>
                          <td style={{ ...styles.td, color: C.textDim }}>pro {artLbl}</td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>{eur(e.preis_pro_einheit)}{e.grundgebuehr > 0 ? <span style={{ color: C.textDim }}> +{eur(e.grundgebuehr)}</span> : ''}</td>
                          <td style={{ ...styles.td, textAlign: 'right', color: C.textDim }}>{eur(e.kaution)}</td>
                          <td style={{ ...styles.td, textAlign: 'right', color: C.textDim }}>{e.mwst_satz} %</td>
                          <td style={styles.td}><span style={{ ...styles.badge, color: belegt ? C.warn : C.green, borderColor: belegt ? C.warn : C.green }}>{belegt ? 'belegt' : 'frei'}</span></td>
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
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 820, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, margin: '4px 0 12px' },
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
