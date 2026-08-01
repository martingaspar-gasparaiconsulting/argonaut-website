'use client';

// ============================================================
// ARGONAUT OS · Teil C · Singleton #2 · Live-Monitoring & Erträge (Energie)
// Anlagen (PV/BHKW/Wind/Speicher/WP) + Ablesungen → Soll/Ist, Verfügbarkeit,
// Eigenverbrauch, Erlös. Reine Formeln aus lib/ertraege (0 €, node-getestet).
// Pfad: app/dashboard/ertraege/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  ANLAGEN_TYPEN, typLabel, typEinheit, SOLL_SPEZIFISCH_STD,
  kennzahlAblesung, aggregat, zaehleErtraege,
  type AnlageLite, type AblesungLite,
} from '@/lib/ertraege';
import { augeErtraege } from '@/lib/auge';
import { ertraegePdf } from '@/lib/ertraegePdf';
import KiAuge from '../_components/KiAuge';
import { EigeneFelderManager, EigeneFelderInputs, EigeneFelderAnzeige, ladeFelder, ladeWerte, speichereWerte } from '../_components/EigeneFelder';
import type { EigenesFeld } from '@/lib/eigeneFelder';

const MODUL = 'ertrag_anlage';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Anlage = { id: string; bezeichnung: string; typ: string; standort: string | null; nennleistung_kwp: number; soll_spezifisch: number; verguetung_ct: number; strompreis_ct: number; status: string };
type Ablesung = { id: string; anlage_id: string; von: string | null; bis: string | null; ertrag_kwh: number; eigenverbrauch_kwh: number; einspeisung_kwh: number; verbrauch_kwh: number; ausfall_stunden: number };

function heuteLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function monatsErster() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function fmtDatum(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function pct(n: number) { return `${(Number(n) * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`; }
function kwh(n: number) { return `${(Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 0 })} kWh`; }
function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function sollFarbe(o: number) { return o >= 0.95 ? C.green : o >= 0.9 ? C.gold : C.danger; }

export default function ErtraegePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [aussteller, setAussteller] = useState('');
  const [tab, setTab] = useState<'ablesungen' | 'anlagen'>('ablesungen');
  const [anlagen, setAnlagen] = useState<Anlage[]>([]);
  const [ablesungen, setAblesungen] = useState<Ablesung[]>([]);
  const [filterAnlage, setFilterAnlage] = useState('');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [nAnl, setNAnl] = useState({ bezeichnung: '', typ: 'pv', standort: '', nennleistung_kwp: '', soll_spezifisch: String(SOLL_SPEZIFISCH_STD), verguetung_ct: '', strompreis_ct: '', status: 'aktiv' });
  const [nAbl, setNAbl] = useState({ anlage_id: '', von: monatsErster(), bis: heuteLokal(), ertrag_kwh: '', eigenverbrauch_kwh: '', einspeisung_kwh: '', verbrauch_kwh: '', ausfall_stunden: '' });
  const [felder, setFelder] = useState<EigenesFeld[]>([]);
  const [nAnlExtra, setNAnlExtra] = useState<Record<string, string>>({});
  const [werteMap, setWerteMap] = useState<Record<string, Record<string, string>>>({});

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [a, b] = await Promise.all([
        supabase.from('ertrag_anlage').select('*').order('bezeichnung', { ascending: true }),
        supabase.from('ertrag_ablesung').select('*').order('bis', { ascending: false }),
      ]);
      const aa = (a.data as Anlage[]) ?? [];
      setAnlagen(aa);
      setAblesungen((b.data as Ablesung[]) ?? []);
      setFelder(await ladeFelder(MODUL));
      setWerteMap(await ladeWerte(MODUL, aa.map((r) => r.id)));
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
      const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const firma = [meta.firmenname, meta.firma, meta.unternehmen, meta.name].find((x) => typeof x === 'string' && (x as string).trim());
      setAussteller(typeof firma === 'string' ? firma : '');
      await laden_();
    })();
  }, [laden_]);

  const anlageVon = useCallback((id: string) => anlagen.find((a) => a.id === id) || null, [anlagen]);
  const sichtbareAblesungen = useMemo(
    () => (filterAnlage ? ablesungen.filter((ab) => ab.anlage_id === filterAnlage) : ablesungen),
    [ablesungen, filterAnlage]
  );
  const kennzahlen = useMemo(
    () => zaehleErtraege(anlagen as (AnlageLite & { bezeichnung?: string })[], sichtbareAblesungen as AblesungLite[]),
    [anlagen, sichtbareAblesungen]
  );

  // Anlagen mit sichtbaren Ablesungen (für Karten)
  const anlagenMitDaten = useMemo(() => {
    const ids = new Set(sichtbareAblesungen.map((ab) => ab.anlage_id));
    return anlagen.filter((a) => ids.has(a.id));
  }, [anlagen, sichtbareAblesungen]);

  const vorschau = useMemo(() => {
    const a = anlageVon(nAbl.anlage_id);
    if (!a) return null;
    return kennzahlAblesung(a as AnlageLite, {
      von: nAbl.von, bis: nAbl.bis, ertrag_kwh: num(nAbl.ertrag_kwh),
      eigenverbrauch_kwh: num(nAbl.eigenverbrauch_kwh), einspeisung_kwh: num(nAbl.einspeisung_kwh),
      verbrauch_kwh: num(nAbl.verbrauch_kwh), ausfall_stunden: num(nAbl.ausfall_stunden),
    });
  }, [nAbl, anlageVon]);

  async function anlageAnlegen() {
    if (!uid || !nAnl.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setBusy('anl'); setFehler(null); setOk(null);
    try {
      const { data: neu, error } = await supabase.from('ertrag_anlage').insert({
        owner_user_id: uid, bezeichnung: nAnl.bezeichnung.trim(), typ: nAnl.typ, standort: nAnl.standort.trim() || null,
        nennleistung_kwp: num(nAnl.nennleistung_kwp), soll_spezifisch: num(nAnl.soll_spezifisch),
        verguetung_ct: num(nAnl.verguetung_ct), strompreis_ct: num(nAnl.strompreis_ct), status: nAnl.status,
      }).select('id').single();
      if (error) throw error;
      try { await speichereWerte(MODUL, (neu as { id: string }).id, uid, nAnlExtra); } catch { /* eigene Felder optional */ }
      setNAnl({ bezeichnung: '', typ: 'pv', standort: '', nennleistung_kwp: '', soll_spezifisch: String(SOLL_SPEZIFISCH_STD), verguetung_ct: '', strompreis_ct: '', status: 'aktiv' });
      setNAnlExtra({});
      setOk('Anlage angelegt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function ablesungAnlegen() {
    if (!uid || !nAbl.anlage_id) { setFehler('Bitte eine Anlage wählen.'); return; }
    if (!nAbl.von || !nAbl.bis) { setFehler('Bitte Zeitraum von/bis angeben.'); return; }
    if (num(nAbl.ertrag_kwh) <= 0) { setFehler('Bitte den Ertrag (kWh) angeben.'); return; }
    setBusy('abl'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('ertrag_ablesung').insert({
        owner_user_id: uid, anlage_id: nAbl.anlage_id, von: nAbl.von, bis: nAbl.bis,
        ertrag_kwh: num(nAbl.ertrag_kwh), eigenverbrauch_kwh: num(nAbl.eigenverbrauch_kwh),
        einspeisung_kwh: num(nAbl.einspeisung_kwh), verbrauch_kwh: num(nAbl.verbrauch_kwh), ausfall_stunden: num(nAbl.ausfall_stunden),
      });
      if (error) throw error;
      setNAbl((v) => ({ ...v, ertrag_kwh: '', eigenverbrauch_kwh: '', einspeisung_kwh: '', verbrauch_kwh: '', ausfall_stunden: '' }));
      setOk('Ablesung erfasst.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function loesche(tabelle: string, id: string) {
    setBusy(id); setFehler(null);
    try { await supabase.from(tabelle).delete().eq('id', id); await laden_(); }
    catch (err: unknown) { setFehler('Löschen fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  function druckePdf(a: Anlage) {
    const abs = ablesungen.filter((ab) => ab.anlage_id === a.id).slice().sort((x, y) => (x.von || '').localeCompare(y.von || ''));
    if (!abs.length) return;
    const agg = aggregat(abs.map((ab) => ({ a: a as AnlageLite, ab: ab as AblesungLite })));
    const von = abs.map((ab) => ab.von || '').filter(Boolean).sort()[0] || '';
    const bis = abs.map((ab) => ab.bis || '').filter(Boolean).sort().slice(-1)[0] || '';
    ertraegePdf({
      aussteller: aussteller || 'Mein Betrieb',
      anlage: a.bezeichnung,
      typ: typLabel(a.typ),
      leistung: a.nennleistung_kwp ? `${a.nennleistung_kwp} ${typEinheit(a.typ)}` : '',
      standort: a.standort || '',
      zeitraum: `${fmtDatum(von)} – ${fmtDatum(bis)}`,
      sollErreichung: pct(agg.sollErreichung),
      verfuegbarkeit: pct(agg.verfuegbarkeit),
      eigenverbrauch: pct(agg.eigenverbrauchsquote),
      erloes: eur(agg.erloes),
      ertragGesamt: kwh(agg.ertrag_kwh),
      zeilen: abs.map((ab) => {
        const k = kennzahlAblesung(a as AnlageLite, ab as AblesungLite);
        return { zeitraum: `${fmtDatum(ab.von)}–${fmtDatum(ab.bis)}`, ertrag: kwh(k.ertrag_kwh), spezifisch: `${k.spezifisch.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`, soll: kwh(k.soll_kwh), erreichung: pct(k.sollErreichung), verfuegbar: pct(k.verfuegbarkeit) };
      }),
    });
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Energie</div>
      <h1 style={styles.h1}>☀️ Erträge &amp; Monitoring</h1>
      <p style={styles.sub}>Anlagen (PV, BHKW, Wind, Speicher, Wärmepumpe) mit Nennleistung und Jahres-Sollertrag anlegen, Ablesungen erfassen — die Anlage rechnet Soll/Ist, spezifischen Ertrag, Verfügbarkeit, Eigenverbrauch und Erlös. Je Anlage ein Ertragsbericht als PDF.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      {/* KPIs */}
      <div style={styles.kpis}>
        <Kpi label="Soll-Erreichung" value={pct(kennzahlen.sollErreichung)} accent={sollFarbe(kennzahlen.sollErreichung)} />
        <Kpi label="Verfügbarkeit" value={pct(kennzahlen.verfuegbarkeit)} accent={C.cyan} />
        <Kpi label="Ertrag gesamt" value={kwh(kennzahlen.ertragKwh)} accent={C.text} />
        <Kpi label="Eigenverbrauch" value={pct(kennzahlen.eigenverbrauchsquote)} accent={C.cyan} />
        <Kpi label="Erlös gesamt" value={eur(kennzahlen.erloesGesamt)} accent={C.gold} />
        <Kpi label="Anlagen unter Soll" value={String(kennzahlen.schwacheAnlagen)} accent={kennzahlen.schwacheAnlagen ? C.danger : C.green} sub={kennzahlen.schwaechsteAnlage || undefined} />
      </div>
      {!laden && <div style={{ marginBottom: 14 }}><KiAuge modul="Erträge & Monitoring" regel={augeErtraege(kennzahlen)} /></div>}

      {/* Tabs */}
      <div style={styles.tabs}>
        <button style={tab === 'ablesungen' ? styles.tabAktiv : styles.tab} onClick={() => setTab('ablesungen')}>Ablesungen &amp; Erträge</button>
        <button style={tab === 'anlagen' ? styles.tabAktiv : styles.tab} onClick={() => setTab('anlagen')}>Anlagen</button>
      </div>

      {tab === 'anlagen' && (
        <div style={styles.card}>
          <div style={styles.cardTitel}>Anlage anlegen</div>
          <div style={styles.grid}>
            <label style={styles.lab}>Bezeichnung<input style={styles.inp} value={nAnl.bezeichnung} onChange={(e) => setNAnl({ ...nAnl, bezeichnung: e.target.value })} placeholder="z. B. PV Dach Süd" /></label>
            <label style={styles.lab}>Typ
              <select style={styles.inp} value={nAnl.typ} onChange={(e) => setNAnl({ ...nAnl, typ: e.target.value })}>
                {ANLAGEN_TYPEN.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>
            <label style={styles.lab}>Standort<input style={styles.inp} value={nAnl.standort} onChange={(e) => setNAnl({ ...nAnl, standort: e.target.value })} /></label>
            <label style={styles.lab}>Nennleistung ({typEinheit(nAnl.typ)})<input style={styles.inp} inputMode="decimal" value={nAnl.nennleistung_kwp} onChange={(e) => setNAnl({ ...nAnl, nennleistung_kwp: e.target.value })} placeholder="z. B. 10" /></label>
            <label style={styles.lab}>Jahres-Soll (kWh/{typEinheit(nAnl.typ)}·a)<input style={styles.inp} inputMode="decimal" value={nAnl.soll_spezifisch} onChange={(e) => setNAnl({ ...nAnl, soll_spezifisch: e.target.value })} /></label>
            <label style={styles.lab}>Einspeisevergütung (ct/kWh)<input style={styles.inp} inputMode="decimal" value={nAnl.verguetung_ct} onChange={(e) => setNAnl({ ...nAnl, verguetung_ct: e.target.value })} placeholder="z. B. 8,0" /></label>
            <label style={styles.lab}>Strompreis (ct/kWh)<input style={styles.inp} inputMode="decimal" value={nAnl.strompreis_ct} onChange={(e) => setNAnl({ ...nAnl, strompreis_ct: e.target.value })} placeholder="z. B. 35,0" /></label>
            <label style={styles.lab}>Status
              <select style={styles.inp} value={nAnl.status} onChange={(e) => setNAnl({ ...nAnl, status: e.target.value })}>
                <option value="aktiv">aktiv</option><option value="wartung">in Wartung</option><option value="stillgelegt">stillgelegt</option>
              </select>
            </label>
            <EigeneFelderInputs felder={felder} werte={nAnlExtra} setWert={(fid, w) => setNAnlExtra((s) => ({ ...s, [fid]: w }))} inpStyle={styles.inp} labStyle={styles.lab} />
          </div>
          {nAnl.typ === 'pv' && <div style={{ marginTop: 6, color: C.textDim, fontSize: 13 }}>Orientierung PV Deutschland: 800–1.200 kWh/kWp·a (Norden ~900, Süden ~1.100+).</div>}
          <button style={{ ...styles.primaer, marginTop: 10, opacity: busy === 'anl' ? 0.6 : 1 }} disabled={busy === 'anl'} onClick={anlageAnlegen}>＋ Anlage</button>

          {anlagen.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {anlagen.map((a) => (
                <div key={a.id} style={styles.zeile}>
                  <span style={{ minWidth: 0 }}>{a.bezeichnung} <span style={{ color: C.textDim }}>· {typLabel(a.typ)} · {a.nennleistung_kwp || 0} {typEinheit(a.typ)} · Soll {a.soll_spezifisch || 0} · {a.status}</span>
                    <EigeneFelderAnzeige felder={felder} werte={werteMap[a.id]} />
                  </span>
                  <button style={styles.miniX} disabled={busy === a.id} onClick={() => loesche('ertrag_anlage', a.id)}>✕</button>
                </div>
              ))}
            </div>
          )}
          {uid && <EigeneFelderManager modul={MODUL} ownerId={uid} onChange={laden_} />}
        </div>
      )}

      {tab === 'ablesungen' && (
        <>
          {/* Neue Ablesung */}
          <div style={styles.card}>
            <div style={styles.cardTitel}>Neue Ablesung</div>
            {anlagen.length === 0 ? (
              <div style={styles.hint}>Leg zuerst eine Anlage im Reiter „Anlagen" an.</div>
            ) : (
              <>
                <div style={styles.grid}>
                  <label style={styles.lab}>Anlage
                    <select style={styles.inp} value={nAbl.anlage_id} onChange={(e) => setNAbl({ ...nAbl, anlage_id: e.target.value })}>
                      <option value="">— wählen —</option>
                      {anlagen.map((a) => <option key={a.id} value={a.id}>{a.bezeichnung}</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Zeitraum von<input type="date" style={styles.inp} value={nAbl.von} onChange={(e) => setNAbl({ ...nAbl, von: e.target.value })} /></label>
                  <label style={styles.lab}>Zeitraum bis<input type="date" style={styles.inp} value={nAbl.bis} onChange={(e) => setNAbl({ ...nAbl, bis: e.target.value })} /></label>
                  <label style={styles.lab}>Ertrag (kWh)<input style={styles.inp} inputMode="decimal" value={nAbl.ertrag_kwh} onChange={(e) => setNAbl({ ...nAbl, ertrag_kwh: e.target.value })} /></label>
                  <label style={styles.lab}>Eigenverbrauch (kWh)<input style={styles.inp} inputMode="decimal" value={nAbl.eigenverbrauch_kwh} onChange={(e) => setNAbl({ ...nAbl, eigenverbrauch_kwh: e.target.value })} /></label>
                  <label style={styles.lab}>Einspeisung (kWh)<input style={styles.inp} inputMode="decimal" value={nAbl.einspeisung_kwh} onChange={(e) => setNAbl({ ...nAbl, einspeisung_kwh: e.target.value })} /></label>
                  <label style={styles.lab}>Gesamtverbrauch (kWh)<input style={styles.inp} inputMode="decimal" value={nAbl.verbrauch_kwh} onChange={(e) => setNAbl({ ...nAbl, verbrauch_kwh: e.target.value })} placeholder="optional (Autarkie)" /></label>
                  <label style={styles.lab}>Ausfall (Std.)<input style={styles.inp} inputMode="decimal" value={nAbl.ausfall_stunden} onChange={(e) => setNAbl({ ...nAbl, ausfall_stunden: e.target.value })} /></label>
                </div>
                {vorschau && (num(nAbl.ertrag_kwh) > 0) && (
                  <div style={styles.vorschau}>
                    Vorschau: spez. Ertrag <b>{vorschau.spezifisch.toLocaleString('de-DE', { maximumFractionDigits: 0 })}</b> · Soll-Erreichung <b style={{ color: sollFarbe(vorschau.sollErreichung) }}>{pct(vorschau.sollErreichung)}</b> · Verfügbarkeit <b>{pct(vorschau.verfuegbarkeit)}</b> · Erlös <b>{eur(vorschau.erloes)}</b>
                  </div>
                )}
                <button style={{ ...styles.primaer, marginTop: 10, opacity: busy === 'abl' ? 0.6 : 1 }} disabled={busy === 'abl'} onClick={ablesungAnlegen}>＋ Ablesung</button>
              </>
            )}
          </div>

          {/* Filter */}
          {anlagen.length > 0 && (
            <div style={{ margin: '14px 0 4px' }}>
              <label style={{ ...styles.lab, maxWidth: 320 }}>Filter Anlage
                <select style={styles.inp} value={filterAnlage} onChange={(e) => setFilterAnlage(e.target.value)}>
                  <option value="">Alle Anlagen</option>
                  {anlagen.map((a) => <option key={a.id} value={a.id}>{a.bezeichnung}</option>)}
                </select>
              </label>
            </div>
          )}

          {/* Anlagen-Karten mit Aggregat + Ablesungen */}
          {anlagenMitDaten.length === 0 ? (
            <div style={styles.hint}>Noch keine Ablesungen{filterAnlage ? ' für diese Anlage' : ''}.</div>
          ) : anlagenMitDaten.map((a) => {
            const abs = sichtbareAblesungen.filter((ab) => ab.anlage_id === a.id).slice().sort((x, y) => (y.von || '').localeCompare(x.von || ''));
            const agg = aggregat(abs.map((ab) => ({ a: a as AnlageLite, ab: ab as AblesungLite })));
            return (
              <div key={a.id} style={{ ...styles.card, marginTop: 14 }}>
                <div style={styles.buchKopf}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 'clamp(15px,1.3vw,20px)' }}>{a.bezeichnung} <span style={{ color: C.textDim, fontWeight: 400 }}>· {typLabel(a.typ)} · {a.nennleistung_kwp || 0} {typEinheit(a.typ)}</span></div>
                    {a.standort && <div style={{ color: C.textDim, fontSize: 13, marginTop: 2 }}>{a.standort}</div>}
                  </div>
                  <button style={{ ...styles.mini, color: C.cyan, borderColor: `${C.cyan}55` }} onClick={() => druckePdf(a)}>📄 Ertragsbericht</button>
                </div>

                <div style={styles.oeeRow}>
                  <OeeTile label="Soll-Erreichung" value={pct(agg.sollErreichung)} accent={sollFarbe(agg.sollErreichung)} gross />
                  <OeeTile label="Verfügbarkeit" value={pct(agg.verfuegbarkeit)} />
                  <OeeTile label="Eigenverbrauch" value={pct(agg.eigenverbrauchsquote)} />
                  <OeeTile label="Erlös" value={eur(agg.erloes)} />
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={styles.table}>
                    <thead><tr>
                      <th style={styles.th}>Zeitraum</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Ertrag</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>spez.</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Soll</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Erreicht</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Verfügb.</th>
                      <th style={styles.th}></th>
                    </tr></thead>
                    <tbody>
                      {abs.map((ab) => {
                        const k = kennzahlAblesung(a as AnlageLite, ab as AblesungLite);
                        return (
                          <tr key={ab.id}>
                            <td style={styles.td}>{fmtDatum(ab.von)}–{fmtDatum(ab.bis)}</td>
                            <td style={{ ...styles.td, textAlign: 'right' }}>{kwh(k.ertrag_kwh)}</td>
                            <td style={{ ...styles.td, textAlign: 'right', color: C.textDim }}>{k.spezifisch.toLocaleString('de-DE', { maximumFractionDigits: 0 })}</td>
                            <td style={{ ...styles.td, textAlign: 'right', color: C.textDim }}>{kwh(k.soll_kwh)}</td>
                            <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700, color: sollFarbe(k.sollErreichung) }}>{pct(k.sollErreichung)}</td>
                            <td style={{ ...styles.td, textAlign: 'right', color: C.textDim }}>{pct(k.verfuegbarkeit)}</td>
                            <td style={{ ...styles.td, textAlign: 'right' }}><button style={styles.miniX} disabled={busy === ab.id} onClick={() => loesche('ertrag_ablesung', ab.id)}>✕</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (<div style={styles.kpi}><div style={{ ...styles.kWert, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div>{sub ? <div style={styles.kSub}>{sub}</div> : null}</div>);
}
function OeeTile({ label, value, gross, accent }: { label: string; value: string; gross?: boolean; accent?: string }) {
  return (<div style={{ ...styles.oeeTile, ...(gross ? { background: 'rgba(201,168,76,0.10)' } : {}) }}><div style={{ fontSize: gross ? 21 : 18, fontWeight: 800, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div></div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 900, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '16px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 21, fontWeight: 800, lineHeight: 1.1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  kSub: { color: C.textDim, fontSize: 11, marginTop: 3 },
  tabs: { display: 'flex', gap: 8, margin: '4px 0 14px', flexWrap: 'wrap' },
  tab: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 'clamp(13px,1.1vw,17px)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAktiv: { background: C.gold, color: C.navy, border: `1px solid ${C.gold}`, borderRadius: 10, padding: '9px 16px', fontSize: 'clamp(13px,1.1vw,17px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  vorschau: { marginTop: 10, padding: '8px 12px', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 'clamp(13px,1.1vw,17px)' },
  buchKopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  oeeRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 },
  oeeTile: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 8px', textAlign: 'center' },
  zeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(143,163,190,0.08)', fontSize: 'clamp(13px,1.13vw,18px)' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  miniX: { background: 'transparent', color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 8, padding: '4px 9px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 640 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
