'use client';

// ============================================================
// ARGONAUT OS · B-I · Einkauf & Beschaffung
// Lieferanten · Bestellungen mit Wareneingang · Retouren/Reklamationen
// je Position · Nachkalkulation (Aufschlag/Handelsspanne). Reine Formeln
// aus lib/einkauf (0 €, node-getestet). Pfad: app/dashboard/einkauf/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, Fragment, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  BESTELL_STATUS, offeneMenge, bestellNetto, lieferStatus,
  kalkuliereVk, margenAusVk, bruttoAusNetto, zaehleEinkauf,
  type PositionLite,
} from '@/lib/einkauf';
import { augeEinkauf } from '@/lib/auge';
import { bestellPdf } from '@/lib/bestellPdf';
import KiAuge from '../_components/KiAuge';
import Leerzustand from '../_components/Leerzustand';
import { EigeneFelderManager, EigeneFelderInputs, EigeneFelderAnzeige, ladeFelder, ladeWerte, speichereWerte } from '../_components/EigeneFelder';
import type { EigenesFeld } from '@/lib/eigeneFelder';

const MODUL = 'bestellung';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const FARBE: Record<string, string> = { gold: C.gold, cyan: C.cyan, green: C.green, textDim: C.textDim, danger: C.danger, warn: C.warn };

type Lieferant = { id: string; name: string; kundennummer: string | null; ansprechpartner: string | null; email: string | null; telefon: string | null; zahlungsziel_tage: number | null; status: string; notiz: string | null };
type Bestellung = { id: string; lieferant_id: string | null; bestell_nr: string | null; datum: string; status: string; liefer_datum: string | null; notiz: string | null };
type Position = { id: string; bestellung_id: string; artikel: string; menge: number; einheit: string | null; ek_preis: number; mwst_satz: number; menge_erhalten: number; retoure_menge: number; retoure_grund: string | null; artikel_id: string | null; lager_gebucht: number | null };
type LagerArtikel = { id: string; bezeichnung: string; artikelnummer: string | null; einheit: string | null; aktueller_bestand: number | null };

function heuteLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function eur(n: number | null) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function fmtDatum(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }

const LEER_NL = { name: '', kundennummer: '', ansprechpartner: '', email: '', telefon: '', zahlungsziel_tage: '14', notiz: '' };
type NeuePos = { artikel: string; menge: string; einheit: string; ek_preis: string; mwst_satz: string };
const LEER_NP: NeuePos = { artikel: '', menge: '', einheit: 'Stk', ek_preis: '', mwst_satz: '19' };

export default function EinkaufPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [aussteller, setAussteller] = useState('');
  const [tab, setTab] = useState<'bestellungen' | 'lieferanten' | 'kalkulation'>('bestellungen');
  const [lieferanten, setLieferanten] = useState<Lieferant[]>([]);
  const [bestellungen, setBestellungen] = useState<Bestellung[]>([]);
  const [positionen, setPositionen] = useState<Position[]>([]);
  const [artikel, setArtikel] = useState<LagerArtikel[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [nl, setNl] = useState({ ...LEER_NL });
  const [nb, setNb] = useState({ lieferant_id: '', bestell_nr: '', datum: heuteLokal(), notiz: '' });
  const [np, setNp] = useState<NeuePos>({ ...LEER_NP });
  const [posEntwurf, setPosEntwurf] = useState<NeuePos[]>([]);
  const [selBest, setSelBest] = useState<string | null>(null);
  const [felder, setFelder] = useState<EigenesFeld[]>([]);
  const [nbExtra, setNbExtra] = useState<Record<string, string>>({});
  const [werteMap, setWerteMap] = useState<Record<string, Record<string, string>>>({});
  const [weEdit, setWeEdit] = useState<Record<string, { erhalten: string; retoure: string; grund: string; artikel_id: string }>>({});

  // Kalkulation
  const [vk, setVk] = useState({ ek: '', gk: '10', gewinn: '30' });
  const [nk, setNk] = useState({ ek: '', vk: '', gk: '0' });

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [l, b, p, a] = await Promise.all([
        supabase.from('lieferant').select('*').order('name', { ascending: true }),
        supabase.from('bestellung').select('*').order('datum', { ascending: false }),
        supabase.from('bestellung_position').select('*'),
        supabase.from('artikel').select('id, bezeichnung, artikelnummer, einheit, aktueller_bestand').eq('aktiv', true).order('bezeichnung', { ascending: true }),
      ]);
      setLieferanten((l.data as Lieferant[]) ?? []);
      const bestRows = (b.data as Bestellung[]) ?? [];
      setBestellungen(bestRows);
      setPositionen((p.data as Position[]) ?? []);
      setArtikel((a.data as LagerArtikel[]) ?? []);
      setFelder(await ladeFelder(MODUL));
      setWerteMap(await ladeWerte(MODUL, bestRows.map((r) => r.id)));
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

  const posByBest = useCallback((bid: string) => positionen.filter((p) => p.bestellung_id === bid), [positionen]);
  const bestellungenLite = useMemo(() => bestellungen.map((b) => ({ status: b.status, positionen: posByBest(b.id) as PositionLite[] })), [bestellungen, posByBest]);
  const kennzahlen = useMemo(() => zaehleEinkauf(bestellungenLite, lieferanten), [bestellungenLite, lieferanten]);

  const vkErg = useMemo(() => vk.ek ? kalkuliereVk(num(vk.ek), num(vk.gk), num(vk.gewinn)) : null, [vk]);
  const nkErg = useMemo(() => (nk.ek && nk.vk) ? margenAusVk(num(nk.ek), num(nk.vk), num(nk.gk)) : null, [nk]);

  // ---------- Lieferant ----------
  async function lieferantAnlegen() {
    if (!uid || !nl.name.trim()) { setFehler('Bitte einen Namen angeben.'); return; }
    setBusy('lieferant'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('lieferant').insert({
        owner_user_id: uid, name: nl.name.trim(), kundennummer: nl.kundennummer.trim() || null,
        ansprechpartner: nl.ansprechpartner.trim() || null, email: nl.email.trim() || null,
        telefon: nl.telefon.trim() || null, zahlungsziel_tage: nl.zahlungsziel_tage.trim() ? Math.round(num(nl.zahlungsziel_tage)) : null,
        status: 'aktiv', notiz: nl.notiz.trim() || null,
      });
      if (error) throw error;
      setNl({ ...LEER_NL }); setOk('Lieferant angelegt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  // ---------- Bestellung ----------
  function posHinzufuegen() {
    if (!np.artikel.trim() || num(np.menge) <= 0) { setFehler('Bitte Artikel und Menge angeben.'); return; }
    setFehler(null);
    setPosEntwurf((l) => [...l, { ...np }]);
    setNp({ ...LEER_NP });
  }
  function posEntfernen(i: number) { setPosEntwurf((l) => l.filter((_, x) => x !== i)); }

  const entwurfNetto = useMemo(() => posEntwurf.reduce((s, p) => s + num(p.menge) * num(p.ek_preis), 0), [posEntwurf]);

  async function bestellungAnlegen() {
    if (!uid) return;
    if (posEntwurf.length === 0) { setFehler('Bitte mindestens eine Position hinzufügen.'); return; }
    setBusy('bestellung'); setFehler(null); setOk(null);
    try {
      const { data, error } = await supabase.from('bestellung').insert({
        owner_user_id: uid, lieferant_id: nb.lieferant_id || null,
        bestell_nr: nb.bestell_nr.trim() || `BE-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`,
        datum: nb.datum, status: 'bestellt', notiz: nb.notiz.trim() || null,
      }).select('id').single();
      if (error) throw error;
      const bid = (data as { id: string }).id;
      const rows = posEntwurf.map((p) => ({
        owner_user_id: uid, bestellung_id: bid, artikel: p.artikel.trim(), menge: num(p.menge),
        einheit: p.einheit.trim() || null, ek_preis: num(p.ek_preis), mwst_satz: num(p.mwst_satz) || 19,
        menge_erhalten: 0, retoure_menge: 0,
      }));
      const { error: e2 } = await supabase.from('bestellung_position').insert(rows);
      if (e2) throw e2;
      try { await speichereWerte(MODUL, bid, uid, nbExtra); } catch { /* eigene Felder optional */ }
      setNb({ lieferant_id: '', bestell_nr: '', datum: heuteLokal(), notiz: '' }); setNbExtra({});
      setPosEntwurf([]); setOk('Bestellung angelegt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function bestellungStatus(b: Bestellung, status: string) {
    setBusy(b.id); setFehler(null);
    try {
      const { error } = await supabase.from('bestellung').update({ status, liefer_datum: status === 'geliefert' ? heuteLokal() : null }).eq('id', b.id);
      if (error) throw error;
      await laden_();
    } catch (err: unknown) { setFehler('Status fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  function weOeffnen(b: Bestellung) {
    if (selBest === b.id) { setSelBest(null); return; }
    setSelBest(b.id);
    const init: Record<string, { erhalten: string; retoure: string; grund: string; artikel_id: string }> = {};
    posByBest(b.id).forEach((p) => { init[p.id] = { erhalten: String(p.menge_erhalten ?? 0), retoure: String(p.retoure_menge ?? 0), grund: p.retoure_grund ?? '', artikel_id: p.artikel_id ?? '' }; });
    setWeEdit(init);
  }

  async function wareneingangSpeichern(b: Bestellung) {
    if (!uid) return;
    setBusy('we'); setFehler(null); setOk(null);
    try {
      const ps = posByBest(b.id);
      let lagerDelta = 0;
      for (const p of ps) {
        const e = weEdit[p.id]; if (!e) continue;
        const erhalten = Math.max(num(e.erhalten), 0);
        const artikelId = e.artikel_id || null;
        await supabase.from('bestellung_position').update({
          menge_erhalten: erhalten, retoure_menge: Math.max(num(e.retoure), 0), retoure_grund: e.grund.trim() || null, artikel_id: artikelId,
        }).eq('id', p.id);

        // Wareneingang ins Lager: nur die NEU erhaltene Menge als 'Zugang' buchen
        // (Delta gegen lager_gebucht verhindert Doppelbuchung bei erneutem Speichern).
        const schonGebucht = Number(p.lager_gebucht) || 0;
        const delta = Math.round((erhalten - schonGebucht) * 100) / 100;
        if (artikelId && delta > 0) {
          const { data: aData } = await supabase.from('artikel').select('aktueller_bestand').eq('id', artikelId).single();
          const bestand = (aData as { aktueller_bestand: number | null } | null)?.aktueller_bestand ?? 0;
          const { error: eb } = await supabase.from('lagerbewegungen').insert({
            owner_user_id: uid, artikel_id: artikelId, typ: 'Zugang', menge: delta,
            grund: 'Wareneingang', referenz: `BE:${b.bestell_nr || b.id}`,
          });
          if (!eb) {
            await supabase.from('artikel').update({ aktueller_bestand: Math.round((bestand + delta) * 100) / 100, updated_at: new Date().toISOString() }).eq('id', artikelId);
            await supabase.from('bestellung_position').update({ lager_gebucht: erhalten }).eq('id', p.id);
            lagerDelta += delta;
          }
        }
      }
      // Status aus Liefergrad ableiten (nur wenn nicht storniert)
      const neu = ps.map((p) => ({ menge: p.menge, menge_erhalten: Math.max(num(weEdit[p.id]?.erhalten ?? String(p.menge_erhalten)), 0) }));
      const grad = lieferStatus(neu);
      if (b.status !== 'storniert') {
        const st = grad === 'geliefert' ? 'geliefert' : grad === 'teilgeliefert' ? 'teilgeliefert' : 'bestellt';
        await supabase.from('bestellung').update({ status: st, liefer_datum: st === 'geliefert' ? heuteLokal() : null }).eq('id', b.id);
      }
      setOk(lagerDelta > 0 ? `Wareneingang gespeichert · ${lagerDelta} ins Lager gebucht.` : 'Wareneingang gespeichert.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  function druckeBestellung(b: Bestellung) {
    const ps = posByBest(b.id);
    const l = lieferanten.find((x) => x.id === b.lieferant_id);
    const brutto = ps.reduce((s, p) => s + bruttoAusNetto(Number(p.menge) * Number(p.ek_preis), Number(p.mwst_satz) || 19).brutto, 0);
    bestellPdf({
      aussteller: aussteller || 'Mein Betrieb',
      bestellNr: b.bestell_nr || '',
      datum: fmtDatum(b.datum),
      lieferant: l?.name || '—',
      ansprechpartner: l?.ansprechpartner || '',
      kundennummer: l?.kundennummer || '',
      notiz: b.notiz || '',
      positionen: ps.map((p) => ({ artikel: p.artikel, menge: String(p.menge), einheit: p.einheit || '', ekPreis: eur(p.ek_preis), netto: eur(Number(p.menge) * Number(p.ek_preis)) })),
      summeNetto: eur(bestellNetto(ps)),
      summeBrutto: eur(Math.round(brutto * 100) / 100),
    });
  }

  const liefName = (id: string | null) => lieferanten.find((l) => l.id === id)?.name ?? '—';

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Einkauf</div>
      <h1 style={styles.h1}>📥 Einkauf & Beschaffung</h1>
      <p style={styles.sub}>Lieferanten, Bestellungen mit Wareneingang und Retouren/Reklamationen an einem Ort — plus Nachkalkulation (Aufschlag & Handelsspanne). Alle Beträge netto.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <Kpi label="Offene Bestellungen" value={String(kennzahlen.offeneBestellungen)} accent={C.cyan} />
        <Kpi label="Wareneingang offen" value={String(kennzahlen.wareneingangOffen)} accent={kennzahlen.wareneingangOffen ? C.warn : C.text} />
        <Kpi label="Retouren offen" value={String(kennzahlen.retourenOffen)} accent={kennzahlen.retourenOffen ? C.danger : C.text} />
        <Kpi label="Bestellwert offen" value={eur(kennzahlen.bestellwertOffen)} accent={C.gold} />
        <Kpi label="Lieferanten" value={String(kennzahlen.lieferantenAktiv)} accent={C.text} />
      </div>
      {!laden && (
        <div style={{ marginBottom: 14 }}>
          <KiAuge modul="Einkauf" regel={augeEinkauf(kennzahlen)} />
        </div>
      )}

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'bestellungen' ? styles.tabAn : {}) }} onClick={() => setTab('bestellungen')}>📦 Bestellungen</button>
        <button style={{ ...styles.tab, ...(tab === 'lieferanten' ? styles.tabAn : {}) }} onClick={() => setTab('lieferanten')}>🏭 Lieferanten</button>
        <button style={{ ...styles.tab, ...(tab === 'kalkulation' ? styles.tabAn : {}) }} onClick={() => setTab('kalkulation')}>🧮 Nachkalkulation</button>
      </div>

      {/* ---------- BESTELLUNGEN ---------- */}
      {tab === 'bestellungen' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Neue Bestellung</div>
            <div style={styles.grid}>
              <label style={styles.lab}>Lieferant
                <select style={styles.inp} value={nb.lieferant_id} onChange={(e) => setNb({ ...nb, lieferant_id: e.target.value })}>
                  <option value="">— wählen —</option>
                  {lieferanten.filter((l) => l.status === 'aktiv').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              <label style={styles.lab}>Bestell-Nr. (optional)<input style={styles.inp} value={nb.bestell_nr} onChange={(e) => setNb({ ...nb, bestell_nr: e.target.value })} placeholder="automatisch" /></label>
              <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={nb.datum} onChange={(e) => setNb({ ...nb, datum: e.target.value })} /></label>
              <label style={styles.lab}>Notiz (optional)<input style={styles.inp} value={nb.notiz} onChange={(e) => setNb({ ...nb, notiz: e.target.value })} /></label>
              <EigeneFelderInputs felder={felder} werte={nbExtra} setWert={(fid, w) => setNbExtra((s) => ({ ...s, [fid]: w }))} inpStyle={styles.inp} labStyle={styles.lab} />
            </div>

            <div style={{ ...styles.subCard, marginTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Positionen</div>
              <div style={styles.posGrid}>
                <input style={styles.inp} value={np.artikel} onChange={(e) => setNp({ ...np, artikel: e.target.value })} placeholder="Artikel" />
                <input style={styles.inp} inputMode="decimal" value={np.menge} onChange={(e) => setNp({ ...np, menge: e.target.value })} placeholder="Menge" />
                <input style={styles.inp} value={np.einheit} onChange={(e) => setNp({ ...np, einheit: e.target.value })} placeholder="Einheit" />
                <input style={styles.inp} inputMode="decimal" value={np.ek_preis} onChange={(e) => setNp({ ...np, ek_preis: e.target.value })} placeholder="EK netto/Einh." />
                <select style={styles.inp} value={np.mwst_satz} onChange={(e) => setNp({ ...np, mwst_satz: e.target.value })}><option value="19">19 %</option><option value="7">7 %</option></select>
                <button style={styles.miniGold} onClick={posHinzufuegen}>＋</button>
              </div>
              {posEntwurf.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {posEntwurf.map((p, i) => (
                    <div key={i} style={styles.posZeile}>
                      <span>{p.artikel} · {num(p.menge)} {p.einheit} × {eur(num(p.ek_preis))} = <b>{eur(num(p.menge) * num(p.ek_preis))}</b></span>
                      <button style={styles.miniX} onClick={() => posEntfernen(i)}>✕</button>
                    </div>
                  ))}
                  <div style={{ textAlign: 'right', marginTop: 6, color: C.gold, fontWeight: 700 }}>Summe netto: {eur(entwurfNetto)}</div>
                </div>
              )}
            </div>
            <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'bestellung' ? 0.6 : 1 }} disabled={busy === 'bestellung'} onClick={bestellungAnlegen}>＋ Bestellung anlegen</button>
          </div>
          {uid && <EigeneFelderManager modul={MODUL} ownerId={uid} onChange={laden_} />}

          {laden ? <p style={styles.hint}>Lädt …</p> : (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {bestellungen.length === 0 ? (
                <Leerzustand
                  icon="🛒"
                  titel="Noch keine Bestellungen"
                  text="Erfasse deine Einkäufe bei Lieferanten — so behältst du Kosten und offene Lieferungen im Blick."
                  schritte={["Lieferant anlegen", "Bestellung mit Positionen erfassen", "Wareneingang buchen — Bestand wächst automatisch"]}
                />
              ) : (
                <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>Bestell-Nr.</th><th style={styles.th}>Lieferant</th><th style={styles.th}>Datum</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Netto</th><th style={styles.th}>Status</th><th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th>
                  </tr></thead>
                  <tbody>
                    {bestellungen.map((b) => {
                      const ps = posByBest(b.id);
                      const sm = BESTELL_STATUS[b.status as keyof typeof BESTELL_STATUS] ?? BESTELL_STATUS.entwurf;
                      const offen = ps.reduce((s, p) => s + offeneMenge(p), 0);
                      return (
                        <Fragment key={b.id}>
                          <tr style={{ opacity: b.status === 'storniert' ? 0.55 : 1 }}>
                            <td style={styles.td}><b>{b.bestell_nr}</b><EigeneFelderAnzeige felder={felder} werte={werteMap[b.id]} /></td>
                            <td style={{ ...styles.td, color: C.textDim }}>{liefName(b.lieferant_id)}</td>
                            <td style={styles.td}>{fmtDatum(b.datum)}</td>
                            <td style={{ ...styles.td, textAlign: 'right' }}>{eur(bestellNetto(ps))}{offen > 0 ? <div style={{ color: C.warn, fontSize: 12 }}>{offen} offen</div> : ''}</td>
                            <td style={styles.td}><span style={{ ...styles.badge, color: FARBE[sm.farbe], borderColor: FARBE[sm.farbe] }}>{sm.label}</span></td>
                            <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {b.status !== 'storniert' && <button style={{ ...styles.mini, color: C.cyan, borderColor: `${C.cyan}55` }} onClick={() => weOeffnen(b)}>{selBest === b.id ? 'Schließen' : '🚚 Wareneingang'}</button>}
                              <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55` }} onClick={() => druckeBestellung(b)}>📄 Bestellung</button>
                              {(b.status === 'bestellt' || b.status === 'teilgeliefert' || b.status === 'entwurf') && <button style={styles.mini} disabled={busy === b.id} onClick={() => bestellungStatus(b, 'storniert')}>Stornieren</button>}
                            </td>
                          </tr>
                          {selBest === b.id && (
                            <tr>
                              <td style={{ ...styles.td, background: C.navy }} colSpan={6}>
                                <div style={{ fontWeight: 700, marginBottom: 6 }}>Wareneingang & Retoure</div>
                                {ps.map((p) => (
                                  <div key={p.id} style={styles.wePos}>
                                    <span style={{ minWidth: 160 }}>{p.artikel} <span style={{ color: C.textDim }}>({p.menge} {p.einheit})</span></span>
                                    <label style={styles.weLab}>erhalten<input style={styles.weInp} inputMode="decimal" value={weEdit[p.id]?.erhalten ?? ''} onChange={(e) => setWeEdit((w) => ({ ...w, [p.id]: { ...(w[p.id] ?? { erhalten: '', retoure: '', grund: '', artikel_id: '' }), erhalten: e.target.value } }))} /></label>
                                    <label style={styles.weLab}>Retoure<input style={styles.weInp} inputMode="decimal" value={weEdit[p.id]?.retoure ?? ''} onChange={(e) => setWeEdit((w) => ({ ...w, [p.id]: { ...(w[p.id] ?? { erhalten: '', retoure: '', grund: '', artikel_id: '' }), retoure: e.target.value } }))} /></label>
                                    <label style={{ ...styles.weLab, flex: 1 }}>Reklamationsgrund<input style={{ ...styles.weInp, width: '100%' }} value={weEdit[p.id]?.grund ?? ''} onChange={(e) => setWeEdit((w) => ({ ...w, [p.id]: { ...(w[p.id] ?? { erhalten: '', retoure: '', grund: '', artikel_id: '' }), grund: e.target.value } }))} placeholder="optional" /></label>
                                    <label style={styles.weLab}>Lager-Artikel (Zugang)
                                      <select style={{ ...styles.weInp, width: 200 }} value={weEdit[p.id]?.artikel_id ?? ''} onChange={(e) => setWeEdit((w) => ({ ...w, [p.id]: { ...(w[p.id] ?? { erhalten: '', retoure: '', grund: '', artikel_id: '' }), artikel_id: e.target.value } }))}>
                                        <option value="">— nicht ins Lager —</option>
                                        {artikel.map((a) => <option key={a.id} value={a.id}>{a.bezeichnung}{a.aktueller_bestand != null ? ` (Best. ${a.aktueller_bestand})` : ''}</option>)}
                                      </select>
                                    </label>
                                    {(p.lager_gebucht ?? 0) > 0 && <span style={{ color: C.green, fontSize: 12, alignSelf: 'center' }}>✓ {p.lager_gebucht} im Lager gebucht</span>}
                                  </div>
                                ))}
                                <button style={{ ...styles.primaer, marginTop: 8, opacity: busy === 'we' ? 0.6 : 1 }} disabled={busy === 'we'} onClick={() => wareneingangSpeichern(b)}>Wareneingang speichern</button>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------- LIEFERANTEN ---------- */}
      {tab === 'lieferanten' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Lieferant anlegen</div>
            <div style={styles.grid}>
              <label style={styles.lab}>Name<input style={styles.inp} value={nl.name} onChange={(e) => setNl({ ...nl, name: e.target.value })} /></label>
              <label style={styles.lab}>Kundennr. bei Lieferant<input style={styles.inp} value={nl.kundennummer} onChange={(e) => setNl({ ...nl, kundennummer: e.target.value })} /></label>
              <label style={styles.lab}>Ansprechpartner<input style={styles.inp} value={nl.ansprechpartner} onChange={(e) => setNl({ ...nl, ansprechpartner: e.target.value })} /></label>
              <label style={styles.lab}>E-Mail<input style={styles.inp} value={nl.email} onChange={(e) => setNl({ ...nl, email: e.target.value })} /></label>
              <label style={styles.lab}>Telefon<input style={styles.inp} value={nl.telefon} onChange={(e) => setNl({ ...nl, telefon: e.target.value })} /></label>
              <label style={styles.lab}>Zahlungsziel (Tage)<input style={styles.inp} inputMode="numeric" value={nl.zahlungsziel_tage} onChange={(e) => setNl({ ...nl, zahlungsziel_tage: e.target.value })} /></label>
              <label style={{ ...styles.lab, gridColumn: '1 / -1' }}>Notiz<input style={styles.inp} value={nl.notiz} onChange={(e) => setNl({ ...nl, notiz: e.target.value })} /></label>
            </div>
            <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'lieferant' ? 0.6 : 1 }} disabled={busy === 'lieferant'} onClick={lieferantAnlegen}>＋ Anlegen</button>
          </div>
          {laden ? <p style={styles.hint}>Lädt …</p> : (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {lieferanten.length === 0 ? <div style={{ padding: 20, color: C.textDim }}>Noch keine Lieferanten.</div> : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Name</th><th style={styles.th}>Ansprechpartner</th><th style={styles.th}>Kontakt</th><th style={{ ...styles.th, textAlign: 'right' }}>Zahlungsziel</th></tr></thead>
                  <tbody>
                    {lieferanten.map((l) => (
                      <tr key={l.id}>
                        <td style={styles.td}>{l.name}{l.kundennummer ? <span style={{ color: C.textDim }}> · Nr. {l.kundennummer}</span> : ''}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{l.ansprechpartner || '—'}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{[l.email, l.telefon].filter(Boolean).join(' · ') || '—'}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: C.textDim }}>{l.zahlungsziel_tage != null ? `${l.zahlungsziel_tage} Tage` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------- KALKULATION ---------- */}
      {tab === 'kalkulation' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Vorkalkulation — VK aus EK</div>
            <div style={styles.grid}>
              <label style={styles.lab}>EK netto (€)<input style={styles.inp} inputMode="decimal" value={vk.ek} onChange={(e) => setVk({ ...vk, ek: e.target.value })} /></label>
              <label style={styles.lab}>Gemeinkosten (%)<input style={styles.inp} inputMode="decimal" value={vk.gk} onChange={(e) => setVk({ ...vk, gk: e.target.value })} /></label>
              <label style={styles.lab}>Gewinn (%)<input style={styles.inp} inputMode="decimal" value={vk.gewinn} onChange={(e) => setVk({ ...vk, gewinn: e.target.value })} /></label>
            </div>
            {vkErg && (
              <div style={styles.ergBox}>
                <Zeile k="Selbstkosten" v={eur(vkErg.selbstkosten)} />
                <Zeile k="VK netto" v={eur(vkErg.vkNetto)} gold />
                <Zeile k="VK brutto (19 %)" v={eur(bruttoAusNetto(vkErg.vkNetto, 19).brutto)} />
                <Zeile k="Rohertrag" v={eur(vkErg.rohertrag)} />
                <Zeile k="Aufschlag (auf EK)" v={`${vkErg.aufschlagProz} %`} />
                <Zeile k="Handelsspanne (auf VK)" v={`${vkErg.handelsspanneProz} %`} />
              </div>
            )}
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Nachkalkulation — Marge aus EK & VK</div>
            <div style={styles.grid}>
              <label style={styles.lab}>EK netto (€)<input style={styles.inp} inputMode="decimal" value={nk.ek} onChange={(e) => setNk({ ...nk, ek: e.target.value })} /></label>
              <label style={styles.lab}>VK netto (€)<input style={styles.inp} inputMode="decimal" value={nk.vk} onChange={(e) => setNk({ ...nk, vk: e.target.value })} /></label>
              <label style={styles.lab}>Gemeinkosten (%)<input style={styles.inp} inputMode="decimal" value={nk.gk} onChange={(e) => setNk({ ...nk, gk: e.target.value })} /></label>
            </div>
            {nkErg && (
              <div style={styles.ergBox}>
                <Zeile k="Selbstkosten" v={eur(nkErg.selbstkosten)} />
                <Zeile k="Rohertrag (VK − EK)" v={eur(nkErg.rohertrag)} gold />
                <Zeile k="Aufschlag (auf EK)" v={`${nkErg.aufschlagProz} %`} />
                <Zeile k="Handelsspanne (auf VK)" v={`${nkErg.handelsspanneProz} %`} />
                <Zeile k="Deckungsbeitrag n. GK" v={eur(nkErg.vkNetto - nkErg.selbstkosten)} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (<div style={styles.kpi}><div style={{ ...styles.kWert, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div></div>);
}
function Zeile({ k, v, gold }: { k: string; v: string; gold?: boolean }) {
  return (<div style={styles.ergZeile}><span style={{ color: C.textDim }}>{k}</span><span style={{ fontWeight: 700, color: gold ? C.gold : C.text }}>{v}</span></div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 820, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '4px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 22, fontWeight: 800, lineHeight: 1.1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  tabs: { display: 'flex', gap: 8, margin: '4px 0 12px', flexWrap: 'wrap' },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  subCard: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 },
  posGrid: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.2fr 0.9fr auto', gap: 8, alignItems: 'center' },
  posZeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(143,163,190,0.08)', fontSize: 'clamp(13px,1.13vw,18px)' },
  wePos: { display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', padding: '8px 0', borderBottom: '1px solid rgba(143,163,190,0.08)' },
  weLab: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: C.textDim },
  weInp: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 15, fontFamily: 'inherit', width: 90, boxSizing: 'border-box' },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  ergBox: { marginTop: 12, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' },
  ergZeile: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', fontSize: 'clamp(13.5px,1.19vw,19px)' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 6, marginBottom: 4, whiteSpace: 'nowrap' },
  miniGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  miniX: { background: 'transparent', color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 8, padding: '4px 9px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 720 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 'clamp(11.5px, 1vw, 16px)', fontWeight: 700, whiteSpace: 'nowrap' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
