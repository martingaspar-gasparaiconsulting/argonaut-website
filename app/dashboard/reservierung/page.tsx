'use client';

// ============================================================
// ARGONAUT OS · B-II · Reservierung & Platzverwaltung
// EIN Modul, drei Betriebsarten (art):
//   🍽 Tischreservierung (Gastro)  · Zeitfenster + Personen + No-Show
//   🛞 Einlagerung (Reifenhotel)   · Verwahrung §688 BGB, Saison rein/raus
//   🥐 Vorbestellung (Theke)       · Artikel + Abholtermin
// Reine Formeln aus lib/reservierung (0 €, node-getestet).
// Pfad: app/dashboard/reservierung/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import Leerzustand from '../_components/Leerzustand';
import { createBrowserClient } from '@supabase/ssr';
import {
  RES_ARTEN, resArtInfo, PLATZ_ARTEN, STATUS_JE_ART, START_STATUS, statusInfo,
  konflikteTisch, lagerLage, betragBrutto, zaehleReservierung, dauerStunden,
  type ResArt, type PlatzArt, type Farbe,
} from '@/lib/reservierung';
import { augeReservierung } from '@/lib/auge';
import { verwahrProtokollPdf } from '@/lib/verwahrProtokollPdf';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const FARBE: Record<Farbe, string> = { gold: C.gold, cyan: C.cyan, green: C.green, textDim: C.textDim, danger: C.danger, warn: C.warn };

type Platz = {
  id: string; art: PlatzArt; bezeichnung: string; standort: string | null;
  kapazitaet: number | null; status: string; notiz: string | null;
};
type Vorgang = {
  id: string; art: ResArt; platz_id: string | null; kontakt_id: string | null;
  kunde_name: string | null; kunde_tel: string | null;
  von: string | null; bis: string | null; anzahl: number | null;
  gegenstand: string | null; kennzeichen: string | null;
  betrag: number; mwst_satz: number; status: string;
  erledigt_am: string | null; notiz: string | null; rechnung_id: string | null;
};
type Kontakt = { id: string; name: string };

function heuteLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function jetztLokal() { const d = new Date(); return `${heuteLokal()}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function eur(n: number | null) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function fmtDatum(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function fmtZeit(iso: string | null) { if (!iso) return '—'; return iso.length >= 16 ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}. ${iso.slice(11, 16)}` : fmtDatum(iso); }
function kontaktName(k: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return s(k.anzeigename) || [s(k.vorname), s(k.nachname)].filter(Boolean).join(' ') || s(k.name) || s(k.firmenname) || s(k.firma) || s(k.email) || 'Kontakt';
}

const LEER_NP = { art: 'tisch' as PlatzArt, bezeichnung: '', standort: '', kapazitaet: '', notiz: '' };
const LEER_NV = {
  art: 'tischreservierung' as ResArt, platz_id: '', kontakt_id: '', kunde_name: '', kunde_tel: '',
  von: jetztLokal(), bis: '', anzahl: '', gegenstand: '', kennzeichen: '', betrag: '', mwst_satz: '19',
};

export default function ReservierungPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [aussteller, setAussteller] = useState('');
  const [tab, setTab] = useState<'vorgaenge' | 'plaetze'>('vorgaenge');
  const [plaetze, setPlaetze] = useState<Platz[]>([]);
  const [vorgaenge, setVorgaenge] = useState<Vorgang[]>([]);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [np, setNp] = useState({ ...LEER_NP });
  const [nv, setNv] = useState({ ...LEER_NV });

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [p, v, k] = await Promise.all([
        supabase.from('reservierung_platz').select('*').order('bezeichnung', { ascending: true }),
        supabase.from('reservierung_vorgang').select('*').order('von', { ascending: false }),
        supabase.from('kontakte').select('*'),
      ]);
      setPlaetze((p.data as Platz[]) ?? []);
      setVorgaenge((v.data as Vorgang[]) ?? []);
      setKontakte(((k.data as Record<string, unknown>[]) ?? []).map((x) => ({ id: String(x.id), name: kontaktName(x) })).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      const m = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const firma = [m.firmenname, m.firma, m.unternehmen, m.name].find((x) => typeof x === 'string' && (x as string).trim());
      setAussteller(typeof firma === 'string' ? firma : '');
      await laden_();
    })();
  }, [laden_]);

  const kennzahlen = useMemo(() => zaehleReservierung(plaetze, vorgaenge, new Date()), [plaetze, vorgaenge]);
  const info = resArtInfo(nv.art);
  const plaetzeDerArt = useMemo(() => plaetze.filter((p) => p.art === info.platzArt && p.status === 'aktiv'), [plaetze, info.platzArt]);

  // --- Live-Vorschau: Betrag (Einlagerung/Vorbestellung) + Tisch-Konflikt ---
  const vorschau = useMemo(() => {
    const b = info.hatBetrag && nv.betrag ? betragBrutto(num(nv.betrag), num(nv.mwst_satz) || 19) : null;
    let konflikt = false, dauer = 0;
    if (nv.art === 'tischreservierung' && nv.platz_id && nv.von && nv.bis && nv.bis > nv.von) {
      konflikt = konflikteTisch(nv.platz_id, nv.von, nv.bis, vorgaenge).length > 0;
      dauer = dauerStunden(nv.von, nv.bis);
    }
    return { b, konflikt, dauer };
  }, [nv, info.hatBetrag, vorgaenge]);

  function artWechsel(art: ResArt) {
    const i = resArtInfo(art);
    setNv({
      ...LEER_NV, art,
      von: i.hatZeitfenster ? jetztLokal() : (art === 'einlagerung' ? heuteLokal() : jetztLokal()),
      mwst_satz: '19',
    });
  }
  function kontaktWahl(id: string) {
    const k = kontakte.find((x) => x.id === id);
    setNv((f) => ({ ...f, kontakt_id: id, kunde_name: k ? k.name : f.kunde_name }));
  }

  async function platzAnlegen() {
    if (!uid || !np.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setBusy('platz'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('reservierung_platz').insert({
        owner_user_id: uid, art: np.art, bezeichnung: np.bezeichnung.trim(),
        standort: np.standort.trim() || null,
        kapazitaet: np.kapazitaet.trim() ? Math.round(num(np.kapazitaet)) : null,
        status: 'aktiv', notiz: np.notiz.trim() || null,
      });
      if (error) throw error;
      setNp({ ...LEER_NP }); setOk('Platz angelegt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function vorgangAnlegen() {
    if (!uid) return;
    if (info.hatZeitfenster) {
      if (!nv.von || !nv.bis || nv.bis <= nv.von) { setFehler('Bitte ein gültiges Zeitfenster wählen (bis nach von).'); return; }
      if (vorschau.konflikt) { setFehler('Dieser Tisch ist im gewählten Zeitfenster bereits reserviert.'); return; }
    } else if (!nv.von) { setFehler(`Bitte ${info.zeitLabel} angeben.`); return; }
    if (!nv.kunde_name.trim() && !nv.kontakt_id) { setFehler('Bitte Kunde (Kontakt oder Freitext) angeben.'); return; }
    setBusy('vorgang'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('reservierung_vorgang').insert({
        owner_user_id: uid, art: nv.art, platz_id: nv.platz_id || null, kontakt_id: nv.kontakt_id || null,
        kunde_name: nv.kunde_name.trim() || null, kunde_tel: nv.kunde_tel.trim() || null,
        von: nv.von, bis: info.hatZeitfenster ? nv.bis : null,
        anzahl: nv.anzahl.trim() ? Math.round(num(nv.anzahl)) : null,
        gegenstand: nv.gegenstand.trim() || null, kennzeichen: nv.kennzeichen.trim() || null,
        betrag: info.hatBetrag ? num(nv.betrag) : 0, mwst_satz: num(nv.mwst_satz) || 19,
        status: START_STATUS[nv.art],
      });
      if (error) throw error;
      setNv({ ...LEER_NV, art: nv.art, von: info.hatZeitfenster ? jetztLokal() : (nv.art === 'einlagerung' ? heuteLokal() : jetztLokal()) });
      setOk(`${info.label} angelegt.`); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function setzeStatus(v: Vorgang, status: string) {
    setBusy(v.id); setFehler(null);
    try {
      const erledigt = (STATUS_JE_ART[v.art] && ['erschienen', 'no_show', 'storniert', 'ausgelagert', 'entsorgt', 'abgeholt'].includes(status)) ? new Date().toISOString() : null;
      const { error } = await supabase.from('reservierung_vorgang').update({ status, erledigt_am: erledigt }).eq('id', v.id);
      if (error) throw error;
      await laden_();
    } catch (err: unknown) { setFehler('Status fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function rechnungErstellen(v: Vorgang) {
    setBusy(v.id); setFehler(null); setOk(null);
    try {
      const res = await fetch('/api/rechnung-aus-reservierung', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vorgangId: v.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setFehler(j?.error || 'Rechnung konnte nicht erstellt werden.'); return; }
      setOk('Rechnung erstellt.'); await laden_();
    } catch (err: unknown) { setFehler('Fehler: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  function protokoll(v: Vorgang) {
    const p = plaetze.find((x) => x.id === v.platz_id);
    verwahrProtokollPdf({
      aussteller: aussteller || 'Mein Betrieb',
      kunde: v.kunde_name || kontakte.find((k) => k.id === v.kontakt_id)?.name || '—',
      telefon: v.kunde_tel || '',
      kennzeichen: v.kennzeichen || '',
      eingelagertAm: fmtDatum(v.von),
      lagerplatz: p ? `${p.bezeichnung}${p.standort ? ' · ' + p.standort : ''}` : '—',
      gegenstand: v.gegenstand || '',
    });
  }

  const kontaktName_ = (id: string | null) => kontakte.find((k) => k.id === id)?.name ?? null;
  const platzName = (id: string | null) => plaetze.find((p) => p.id === id)?.bezeichnung ?? '—';

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Reservierung & Platz</div>
      <h1 style={styles.h1}>🪑 Reservierung & Platzverwaltung</h1>
      <p style={styles.sub}>Ein Modul für drei Abläufe: Tischreservierung mit No-Show-Kontrolle (Gastro), Einlagerung als Verwahrung nach §688 BGB (Reifenhotel) und Vorbestellung mit Abholtermin (Theke). Plätze, Termine und Fristen an einem Ort.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <Kpi label="Tische heute" value={String(kennzahlen.tischHeute)} accent={C.cyan} />
        <Kpi label="Eingelagert" value={String(kennzahlen.eingelagertAktiv)} accent={C.green} />
        <Kpi label="Verwertung fällig" value={String(kennzahlen.verwertungFaellig)} accent={kennzahlen.verwertungFaellig ? C.danger : C.text} />
        <Kpi label="Vorbestellungen offen" value={String(kennzahlen.vorbestellungOffen)} accent={C.gold} />
        <Kpi label="Abholung überfällig" value={String(kennzahlen.abholUeberfaellig)} accent={kennzahlen.abholUeberfaellig ? C.warn : C.text} />
        <Kpi label="No-Shows" value={String(kennzahlen.noShowGesamt)} accent={C.text} />
      </div>
      {!laden && (
        <div style={{ marginBottom: 14 }}>
          <KiAuge modul="Reservierung" regel={augeReservierung(kennzahlen)} />
        </div>
      )}

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'vorgaenge' ? styles.tabAn : {}) }} onClick={() => setTab('vorgaenge')}>📋 Vorgänge</button>
        <button style={{ ...styles.tab, ...(tab === 'plaetze' ? styles.tabAn : {}) }} onClick={() => setTab('plaetze')}>🪑 Plätze</button>
      </div>

      {/* ---------- VORGÄNGE ---------- */}
      {tab === 'vorgaenge' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Neuer Vorgang</div>
            <div style={styles.artRow}>
              {RES_ARTEN.map((a) => (
                <button key={a.key} onClick={() => artWechsel(a.key)}
                  style={{ ...styles.artBtn, ...(nv.art === a.key ? styles.artBtnAn : {}) }}>
                  {a.icon} {a.label}
                </button>
              ))}
            </div>

            <div style={styles.grid}>
              <label style={styles.lab}>{info.platzLabel}
                <select style={styles.inp} value={nv.platz_id} onChange={(e) => setNv({ ...nv, platz_id: e.target.value })}>
                  <option value="">{info.hatZeitfenster ? '— wählen —' : '— optional —'}</option>
                  {plaetzeDerArt.map((p) => <option key={p.id} value={p.id}>{p.bezeichnung}{p.kapazitaet ? ` (${p.kapazitaet} Plätze)` : ''}</option>)}
                </select>
              </label>
              <label style={styles.lab}>Kunde (Kontakt)
                <select style={styles.inp} value={nv.kontakt_id} onChange={(e) => kontaktWahl(e.target.value)}>
                  <option value="">— kein Kontakt —</option>
                  {kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              </label>
              <label style={styles.lab}>Kunde (Freitext)<input style={styles.inp} value={nv.kunde_name} onChange={(e) => setNv({ ...nv, kunde_name: e.target.value })} /></label>
              <label style={styles.lab}>Telefon (optional)<input style={styles.inp} value={nv.kunde_tel} onChange={(e) => setNv({ ...nv, kunde_tel: e.target.value })} /></label>

              <label style={styles.lab}>{info.hatZeitfenster ? 'Von (Datum + Zeit)' : info.zeitLabel}
                <input type={nv.art === 'einlagerung' ? 'date' : 'datetime-local'} style={styles.inp} value={nv.von} onChange={(e) => setNv({ ...nv, von: e.target.value })} />
              </label>
              {info.hatZeitfenster && (
                <label style={styles.lab}>Bis (Datum + Zeit)
                  <input type="datetime-local" style={styles.inp} value={nv.bis} onChange={(e) => setNv({ ...nv, bis: e.target.value })} />
                </label>
              )}

              {nv.art === 'tischreservierung' && (
                <label style={styles.lab}>Personen<input style={styles.inp} inputMode="numeric" value={nv.anzahl} onChange={(e) => setNv({ ...nv, anzahl: e.target.value })} /></label>
              )}
              {nv.art === 'einlagerung' && (
                <label style={styles.lab}>Kennzeichen (optional)<input style={styles.inp} value={nv.kennzeichen} onChange={(e) => setNv({ ...nv, kennzeichen: e.target.value })} placeholder="z. B. M-AB 1234" /></label>
              )}
              {nv.art === 'vorbestellung' && (
                <label style={styles.lab}>Stück (optional)<input style={styles.inp} inputMode="numeric" value={nv.anzahl} onChange={(e) => setNv({ ...nv, anzahl: e.target.value })} /></label>
              )}

              {(nv.art === 'einlagerung' || nv.art === 'vorbestellung') && (
                <label style={{ ...styles.lab, gridColumn: '1 / -1' }}>{nv.art === 'einlagerung' ? 'Gegenstand / Zustand (Fabrikat, DOT-Alter, Profiltiefe, Felgen)' : 'Artikel'}
                  <input style={styles.inp} value={nv.gegenstand} onChange={(e) => setNv({ ...nv, gegenstand: e.target.value })} placeholder={nv.art === 'einlagerung' ? 'z. B. 4× Winterreifen 205/55 R16, DOT 1223, Profil 6 mm, Alufelgen o. B.' : 'z. B. 2 Brote, 1 Sahnetorte'} />
                </label>
              )}
              {info.hatBetrag && (
                <>
                  <label style={styles.lab}>{nv.art === 'einlagerung' ? 'Saison-Gebühr (€, netto)' : 'Anzahlung (€, netto)'}<input style={styles.inp} inputMode="decimal" value={nv.betrag} onChange={(e) => setNv({ ...nv, betrag: e.target.value })} /></label>
                  <label style={styles.lab}>MwSt.-Satz
                    <select style={styles.inp} value={nv.mwst_satz} onChange={(e) => setNv({ ...nv, mwst_satz: e.target.value })}>
                      <option value="19">19 %</option>
                      <option value="7">7 %</option>
                    </select>
                  </label>
                </>
              )}
            </div>

            {(vorschau.b || (nv.art === 'tischreservierung' && nv.platz_id && nv.bis > nv.von && nv.von)) && (
              <div style={{ ...styles.vorschau, borderColor: (nv.art === 'tischreservierung' && vorschau.konflikt) ? C.danger : C.border }}>
                <span>
                  {nv.art === 'tischreservierung' && vorschau.dauer > 0 && <><b>{vorschau.dauer}</b> Std{nv.anzahl ? ` · ${nv.anzahl} Pers.` : ''}</>}
                  {vorschau.b && <> {nv.art !== 'tischreservierung' ? '' : ' · '}<b style={{ color: C.gold }}>{eur(vorschau.b.netto)}</b> netto · {eur(vorschau.b.brutto)} brutto ({vorschau.b.mwstSatz} % MwSt)</>}
                </span>
                {nv.art === 'tischreservierung' && nv.platz_id && (
                  <span style={{ color: vorschau.konflikt ? C.danger : C.green, fontWeight: 700 }}>{vorschau.konflikt ? '✕ belegt' : '✓ frei'}</span>
                )}
              </div>
            )}
            <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'vorgang' ? 0.6 : 1 }} disabled={busy === 'vorgang'} onClick={vorgangAnlegen}>＋ {info.label} anlegen</button>
          </div>

          {laden ? <p style={styles.hint}>Lädt …</p> : (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {vorgaenge.length === 0 ? <Leerzustand icon="🍽️" titel="Noch keine Vorgänge" text="Reservierungen, Einlagerungen oder Vorbestellungen — je nach Betriebsart." schritte={["Betriebsart und Platz wählen", "Vorgang mit Termin erfassen", "Status pflegen (reserviert → erledigt)"]} /> : (
                <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>Art</th><th style={styles.th}>Kunde</th><th style={styles.th}>Platz</th>
                    <th style={styles.th}>Termin / Info</th><th style={styles.th}>Status</th><th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th>
                  </tr></thead>
                  <tbody>
                    {vorgaenge.map((v) => {
                      const ai = resArtInfo(v.art);
                      const sm = statusInfo(v.art, v.status);
                      const lager = v.art === 'einlagerung' && v.von ? lagerLage(v.von, new Date()) : null;
                      const b = ai.hatBetrag && v.betrag > 0 ? betragBrutto(v.betrag, v.mwst_satz) : null;
                      return (
                        <tr key={v.id} style={{ opacity: (v.status === 'storniert' || v.status === 'ausgelagert' || v.status === 'abgeholt' || v.status === 'entsorgt') ? 0.55 : 1 }}>
                          <td style={styles.td}><span title={ai.label}>{ai.icon}</span> <span style={{ color: C.textDim, fontSize: 13 }}>{ai.label}</span></td>
                          <td style={styles.td}>{v.kunde_name || kontaktName_(v.kontakt_id) || '—'}{v.kennzeichen ? <span style={{ color: C.textDim }}> · {v.kennzeichen}</span> : ''}</td>
                          <td style={{ ...styles.td, color: C.textDim }}>{platzName(v.platz_id)}</td>
                          <td style={styles.td}>
                            {v.art === 'tischreservierung' && <>{fmtZeit(v.von)}–{v.bis ? fmtZeit(v.bis).slice(-5) : ''}{v.anzahl ? <span style={{ color: C.textDim }}> · {v.anzahl} Pers.</span> : ''}</>}
                            {v.art === 'einlagerung' && <>{fmtDatum(v.von)}{lager ? <span style={{ color: lager.verwertbar ? C.danger : C.textDim }}> · {lager.tageEingelagert} T{lager.verwertbar ? ' · verwertbar' : lager.ueberLaufzeit ? ' · über Laufzeit' : ''}</span> : ''}{v.gegenstand ? <div style={{ color: C.textDim, fontSize: 13 }}>{v.gegenstand}</div> : ''}</>}
                            {v.art === 'vorbestellung' && <>{fmtZeit(v.von)}{v.anzahl ? <span style={{ color: C.textDim }}> · {v.anzahl} Stk</span> : ''}{v.gegenstand ? <div style={{ color: C.textDim, fontSize: 13 }}>{v.gegenstand}</div> : ''}</>}
                            {b ? <div style={{ color: C.gold, fontSize: 13 }}>{eur(b.brutto)} brutto</div> : ''}
                          </td>
                          <td style={styles.td}><span style={{ ...styles.badge, color: FARBE[sm.farbe], borderColor: FARBE[sm.farbe] }}>{sm.label}</span></td>
                          <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {/* Tischreservierung */}
                            {v.art === 'tischreservierung' && v.status === 'reserviert' && <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55` }} disabled={busy === v.id} onClick={() => setzeStatus(v, 'bestaetigt')}>✓ Bestätigen</button>}
                            {v.art === 'tischreservierung' && (v.status === 'bestaetigt' || v.status === 'reserviert') && <button style={{ ...styles.mini, color: C.green, borderColor: `${C.green}55` }} disabled={busy === v.id} onClick={() => setzeStatus(v, 'erschienen')}>🍽 Erschienen</button>}
                            {v.art === 'tischreservierung' && (v.status === 'bestaetigt' || v.status === 'reserviert') && <button style={{ ...styles.mini, color: C.warn, borderColor: `${C.warn}55` }} disabled={busy === v.id} onClick={() => setzeStatus(v, 'no_show')}>⚠ No-Show</button>}
                            {v.art === 'tischreservierung' && (v.status === 'reserviert' || v.status === 'bestaetigt') && <button style={styles.mini} disabled={busy === v.id} onClick={() => setzeStatus(v, 'storniert')}>Stornieren</button>}
                            {/* Einlagerung */}
                            {v.art === 'einlagerung' && v.status === 'eingelagert' && <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55` }} disabled={busy === v.id} onClick={() => setzeStatus(v, 'zur_abholung')}>🔔 Zur Abholung</button>}
                            {v.art === 'einlagerung' && (v.status === 'eingelagert' || v.status === 'zur_abholung') && <button style={{ ...styles.mini, color: C.green, borderColor: `${C.green}55` }} disabled={busy === v.id} onClick={() => setzeStatus(v, 'ausgelagert')}>📤 Ausgelagert</button>}
                            {v.art === 'einlagerung' && lager?.verwertbar && (v.status === 'eingelagert' || v.status === 'zur_abholung') && <button style={{ ...styles.mini, color: C.danger, borderColor: `${C.danger}55` }} disabled={busy === v.id} onClick={() => setzeStatus(v, 'entsorgt')}>🗑 Entsorgt</button>}
                            {v.art === 'einlagerung' && <button style={{ ...styles.mini, color: C.cyan, borderColor: `${C.cyan}55` }} onClick={() => protokoll(v)}>📄 Protokoll</button>}
                            {/* Vorbestellung */}
                            {v.art === 'vorbestellung' && v.status === 'offen' && <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55` }} disabled={busy === v.id} onClick={() => setzeStatus(v, 'bereit')}>🔔 Bereit</button>}
                            {v.art === 'vorbestellung' && (v.status === 'offen' || v.status === 'bereit') && <button style={{ ...styles.mini, color: C.green, borderColor: `${C.green}55` }} disabled={busy === v.id} onClick={() => setzeStatus(v, 'abgeholt')}>✓ Abgeholt</button>}
                            {v.art === 'vorbestellung' && (v.status === 'offen' || v.status === 'bereit') && <button style={styles.mini} disabled={busy === v.id} onClick={() => setzeStatus(v, 'storniert')}>Stornieren</button>}
                            {/* Rechnung aus Vorgang (Einlagerung/Vorbestellung mit Betrag) */}
                            {ai.hatBetrag && v.betrag > 0 && v.status !== 'storniert' && (v.rechnung_id
                              ? <a href="/dashboard/rechnungen" style={{ ...styles.mini, color: C.green, borderColor: `${C.green}55`, textDecoration: 'none', display: 'inline-block' }}>Rechnung ›</a>
                              : <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55` }} disabled={busy === v.id} onClick={() => rechnungErstellen(v)}>€ Rechnung</button>)}
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

      {/* ---------- PLÄTZE ---------- */}
      {tab === 'plaetze' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Platz anlegen</div>
            <div style={styles.grid}>
              <label style={styles.lab}>Art
                <select style={styles.inp} value={np.art} onChange={(e) => setNp({ ...np, art: e.target.value as PlatzArt })}>
                  {PLATZ_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
              </label>
              <label style={styles.lab}>Bezeichnung<input style={styles.inp} value={np.bezeichnung} onChange={(e) => setNp({ ...np, bezeichnung: e.target.value })} placeholder="z. B. Tisch 5, Regal A-12, Theke 1" /></label>
              <label style={styles.lab}>Standort (optional)<input style={styles.inp} value={np.standort} onChange={(e) => setNp({ ...np, standort: e.target.value })} placeholder="z. B. Terrasse, Lagerhalle Nord" /></label>
              <label style={styles.lab}>{np.art === 'tisch' ? 'Sitzplätze' : 'Kapazität'} (optional)<input style={styles.inp} inputMode="numeric" value={np.kapazitaet} onChange={(e) => setNp({ ...np, kapazitaet: e.target.value })} /></label>
              <label style={{ ...styles.lab, gridColumn: '1 / -1' }}>Notiz (optional)<input style={styles.inp} value={np.notiz} onChange={(e) => setNp({ ...np, notiz: e.target.value })} /></label>
            </div>
            <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'platz' ? 0.6 : 1 }} disabled={busy === 'platz'} onClick={platzAnlegen}>＋ Anlegen</button>
          </div>

          {laden ? <p style={styles.hint}>Lädt …</p> : (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {plaetze.length === 0 ? <Leerzustand icon="🪑" titel="Noch keine Plätze" text="Lege Tische, Lagerplätze oder Abholstationen an." schritte={["Platz oben anlegen", "Kapazität/Bezeichnung erfassen", "Plätze für Vorgänge nutzen"]} /> : (
                <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>Art</th><th style={styles.th}>Bezeichnung</th><th style={styles.th}>Standort</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Kapazität</th><th style={styles.th}>Status</th>
                  </tr></thead>
                  <tbody>
                    {plaetze.map((p) => {
                      const pa = PLATZ_ARTEN.find((a) => a.key === p.art);
                      return (
                        <tr key={p.id}>
                          <td style={{ ...styles.td, color: C.textDim }}>{pa?.label ?? p.art}</td>
                          <td style={styles.td}>{p.bezeichnung}{p.notiz ? <div style={{ color: C.textDim, fontSize: 13 }}>{p.notiz}</div> : ''}</td>
                          <td style={{ ...styles.td, color: C.textDim }}>{p.standort || '—'}</td>
                          <td style={{ ...styles.td, textAlign: 'right', color: C.textDim }}>{p.kapazitaet ?? '—'}</td>
                          <td style={styles.td}><span style={{ ...styles.badge, color: p.status === 'aktiv' ? C.green : C.textDim, borderColor: p.status === 'aktiv' ? C.green : C.border }}>{p.status}</span></td>
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
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, margin: '4px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 24, fontWeight: 800, lineHeight: 1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  tabs: { display: 'flex', gap: 8, margin: '4px 0 12px' },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  artRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  artBtn: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 14px', fontSize: 'clamp(13px, 1.13vw, 18px)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  artBtnAn: { background: C.cyan, color: C.navy, borderColor: C.cyan },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  vorschau: { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 12, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 'clamp(13px, 1.13vw, 18px)' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 6, marginBottom: 4, whiteSpace: 'nowrap' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 760 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 'clamp(11.5px, 1vw, 16px)', fontWeight: 700, whiteSpace: 'nowrap' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
