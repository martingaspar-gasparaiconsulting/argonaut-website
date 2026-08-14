'use client';

// ============================================================
// ARGONAUT OS · B-IV Teil 2 · Betriebskostenabrechnung
// Abrechnung → Einheiten (Mieter) + Kostenarten (BetrKV-Katalog) → Anteil je
// Einheit nach Verteilerschlüssel; Heizkosten-Split nach HeizkostenV (50–70 %
// Verbrauch, Rest Fläche). Reine Formeln aus lib/betriebskosten (0 €, getestet).
// Pfad: app/dashboard/betriebskosten/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  BETRKV_KATALOG, HEIZ_VERBRAUCH_STD, heizAnteilGueltig,
  abrechnungFuerEinheit, verteilteSumme, gesamtKosten, zaehleBk,
  type Verteiler, type EinheitLite, type KostenartLite,
} from '@/lib/betriebskosten';
import { augeBk } from '@/lib/auge';
import { betriebskostenPdf } from '@/lib/betriebskostenPdf';
import KiAuge from '../_components/KiAuge';
import { EigeneFelderManager, EigeneFelderInputs, EigeneFelderAnzeige, ladeFelder, ladeWerte, speichereWerte } from '../_components/EigeneFelder';
import { NurVoll } from '../_components/Ansicht';
import type { EigenesFeld } from '@/lib/eigeneFelder';

const MODUL = 'bk_kostenart';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Abrechnung = { id: string; bezeichnung: string; zeitraum_von: string | null; zeitraum_bis: string | null; status: string };
type Einheit = { id: string; abrechnung_id: string; bezeichnung: string; mieter_name: string | null; wohnflaeche: number; personen: number; verbrauch: number; vorauszahlung: number };
type Kostenart = { id: string; abrechnung_id: string; bezeichnung: string; betrag_gesamt: number; verteiler: Verteiler; betrkv_nr: number | null; ist_heizkosten: boolean; verbrauch_anteil_prozent: number | null };

function heuteLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function eur(n: number | null) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function fmtDatum(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
const VERT_LABEL: Record<string, string> = { wohnflaeche: 'Fläche', personen: 'Personen', einheiten: 'Einheiten', verbrauch: 'Verbrauch' };

export default function BetriebskostenPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [aussteller, setAussteller] = useState('');
  const [abrechnungen, setAbrechnungen] = useState<Abrechnung[]>([]);
  const [einheiten, setEinheiten] = useState<Einheit[]>([]);
  const [kostenarten, setKostenarten] = useState<Kostenart[]>([]);
  const [selAbr, setSelAbr] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [felder, setFelder] = useState<EigenesFeld[]>([]);
  const [nKostExtra, setNKostExtra] = useState<Record<string, string>>({});
  const [werteMap, setWerteMap] = useState<Record<string, Record<string, string>>>({});

  const [nAbr, setNAbr] = useState({ bezeichnung: '', zeitraum_von: `${new Date().getFullYear() - 1}-01-01`, zeitraum_bis: `${new Date().getFullYear() - 1}-12-31` });
  const [nEinheit, setNEinheit] = useState({ bezeichnung: '', mieter_name: '', wohnflaeche: '', personen: '', verbrauch: '', vorauszahlung: '' });
  const [nKost, setNKost] = useState({ katalog: '17', betrag: '', verbrauch_anteil: String(HEIZ_VERBRAUCH_STD) });

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [a, e, k] = await Promise.all([
        supabase.from('bk_abrechnung').select('*').order('zeitraum_bis', { ascending: false }),
        supabase.from('bk_einheit').select('*').order('bezeichnung', { ascending: true }),
        supabase.from('bk_kostenart').select('*').order('betrkv_nr', { ascending: true }),
      ]);
      const abr = (a.data as Abrechnung[]) ?? [];
      setAbrechnungen(abr);
      setEinheiten((e.data as Einheit[]) ?? []);
      const kk = (k.data as Kostenart[]) ?? [];
      setKostenarten(kk);
      setFelder(await ladeFelder(MODUL));
      setWerteMap(await ladeWerte(MODUL, kk.map((r) => r.id)));
      setSelAbr((cur) => cur ?? (abr[0]?.id ?? null));
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

  const abr = abrechnungen.find((a) => a.id === selAbr) || null;
  const abrEinheiten = useMemo(() => einheiten.filter((e) => e.abrechnung_id === selAbr), [einheiten, selAbr]);
  const abrKosten = useMemo(() => kostenarten.filter((k) => k.abrechnung_id === selAbr), [kostenarten, selAbr]);
  const kennzahlen = useMemo(() => zaehleBk(abrEinheiten as EinheitLite[], abrKosten as KostenartLite[]), [abrEinheiten, abrKosten]);
  const kontrolle = useMemo(() => ({ verteilt: verteilteSumme(abrKosten as KostenartLite[], abrEinheiten as EinheitLite[]), gesamt: gesamtKosten(abrKosten as KostenartLite[]) }), [abrKosten, abrEinheiten]);

  async function abrechnungAnlegen() {
    if (!uid || !nAbr.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setBusy('abr'); setFehler(null); setOk(null);
    try {
      const { data, error } = await supabase.from('bk_abrechnung').insert({
        owner_user_id: uid, bezeichnung: nAbr.bezeichnung.trim(), zeitraum_von: nAbr.zeitraum_von || null, zeitraum_bis: nAbr.zeitraum_bis || null, status: 'entwurf',
      }).select('id').single();
      if (error) throw error;
      setNAbr({ bezeichnung: '', zeitraum_von: `${new Date().getFullYear() - 1}-01-01`, zeitraum_bis: `${new Date().getFullYear() - 1}-12-31` });
      setSelAbr((data as { id: string }).id); setOk('Abrechnung angelegt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function einheitAnlegen() {
    if (!uid || !selAbr || !nEinheit.bezeichnung.trim()) { setFehler('Bitte Abrechnung wählen und Bezeichnung angeben.'); return; }
    setBusy('einheit'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('bk_einheit').insert({
        owner_user_id: uid, abrechnung_id: selAbr, bezeichnung: nEinheit.bezeichnung.trim(), mieter_name: nEinheit.mieter_name.trim() || null,
        wohnflaeche: num(nEinheit.wohnflaeche), personen: Math.round(num(nEinheit.personen)), verbrauch: num(nEinheit.verbrauch), vorauszahlung: num(nEinheit.vorauszahlung),
      });
      if (error) throw error;
      setNEinheit({ bezeichnung: '', mieter_name: '', wohnflaeche: '', personen: '', verbrauch: '', vorauszahlung: '' });
      setOk('Einheit angelegt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function kostenartAnlegen() {
    if (!uid || !selAbr) { setFehler('Bitte zuerst eine Abrechnung wählen.'); return; }
    const kat = BETRKV_KATALOG.find((x) => String(x.nr) === nKost.katalog);
    if (!kat) { setFehler('Bitte eine Kostenart wählen.'); return; }
    if (num(nKost.betrag) <= 0) { setFehler('Bitte einen Gesamtbetrag angeben.'); return; }
    setBusy('kost'); setFehler(null); setOk(null);
    try {
      const { data: neu, error } = await supabase.from('bk_kostenart').insert({
        owner_user_id: uid, abrechnung_id: selAbr, bezeichnung: kat.bezeichnung, betrag_gesamt: num(nKost.betrag),
        verteiler: kat.verteiler, betrkv_nr: kat.nr, ist_heizkosten: Boolean(kat.heiz),
        verbrauch_anteil_prozent: kat.heiz ? Math.round(num(nKost.verbrauch_anteil)) : null,
      }).select('id').single();
      if (error) throw error;
      try { await speichereWerte(MODUL, (neu as { id: string }).id, uid, nKostExtra); } catch { /* eigene Felder optional */ }
      setNKost({ katalog: '17', betrag: '', verbrauch_anteil: String(HEIZ_VERBRAUCH_STD) }); setNKostExtra({});
      setOk('Kostenart hinzugefügt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function loesche(tabelle: string, id: string) {
    setBusy(id); setFehler(null);
    try { await supabase.from(tabelle).delete().eq('id', id); await laden_(); }
    catch (err: unknown) { setFehler('Löschen fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  function druckePdf(e: Einheit) {
    if (!abr) return;
    const a = abrechnungFuerEinheit(e as EinheitLite, abrKosten as KostenartLite[], abrEinheiten as EinheitLite[]);
    betriebskostenPdf({
      aussteller: aussteller || 'Mein Betrieb',
      objekt: abr.bezeichnung,
      zeitraum: `${fmtDatum(abr.zeitraum_von)} – ${fmtDatum(abr.zeitraum_bis)}`,
      einheit: e.bezeichnung,
      mieter: e.mieter_name || '',
      wohnflaeche: e.wohnflaeche ? `${e.wohnflaeche} m²` : '',
      positionen: abrKosten.map((k) => ({
        bezeichnung: k.bezeichnung,
        gesamt: eur(k.betrag_gesamt),
        schluessel: k.ist_heizkosten ? `Verbrauch/Fläche (${k.verbrauch_anteil_prozent ?? HEIZ_VERBRAUCH_STD}%)` : VERT_LABEL[k.verteiler] ?? k.verteiler,
        anteil: eur(a.positionen.find((p) => p.bezeichnung === k.bezeichnung)?.anteil ?? 0),
      })),
      summe: eur(a.summeKosten),
      vorauszahlung: eur(a.vorauszahlung),
      saldo: eur(a.saldo),
      nachzahlung: a.saldo >= 0,
    });
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Immobilien</div>
      <h1 style={styles.h1}>🧾 Betriebskostenabrechnung</h1>
      <p style={styles.sub}>Nebenkosten nach §2 BetrKV auf die Mieter umlegen — Verteilerschlüssel Wohnfläche, Personen, Einheiten oder Verbrauch, Heizkosten nach HeizkostenV (50–70 % Verbrauch). Saldo je Einheit und Abrechnungs-PDF.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      {/* Abrechnung wählen / anlegen */}
      <div style={styles.card}>
        <div style={styles.cardTitel}>Abrechnung</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ ...styles.lab, minWidth: 220 }}>Vorhandene Abrechnung
            <select style={styles.inp} value={selAbr ?? ''} onChange={(e) => setSelAbr(e.target.value || null)}>
              <option value="">— wählen —</option>
              {abrechnungen.map((a) => <option key={a.id} value={a.id}>{a.bezeichnung} ({fmtDatum(a.zeitraum_von)}–{fmtDatum(a.zeitraum_bis)})</option>)}
            </select>
          </label>
        </div>
        <div style={{ ...styles.subCard, marginTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Neue Abrechnung</div>
          <div style={styles.grid}>
            <label style={styles.lab}>Objekt/Bezeichnung<input style={styles.inp} value={nAbr.bezeichnung} onChange={(e) => setNAbr({ ...nAbr, bezeichnung: e.target.value })} placeholder="z. B. Haus Musterstr. 1 · 2025" /></label>
            <label style={styles.lab}>Zeitraum von<input type="date" style={styles.inp} value={nAbr.zeitraum_von} onChange={(e) => setNAbr({ ...nAbr, zeitraum_von: e.target.value })} /></label>
            <label style={styles.lab}>Zeitraum bis<input type="date" style={styles.inp} value={nAbr.zeitraum_bis} onChange={(e) => setNAbr({ ...nAbr, zeitraum_bis: e.target.value })} /></label>
          </div>
          <button style={{ ...styles.primaer, marginTop: 10, opacity: busy === 'abr' ? 0.6 : 1 }} disabled={busy === 'abr'} onClick={abrechnungAnlegen}>＋ Abrechnung anlegen</button>
        </div>
      </div>

      {abr && (
        <>
          <div style={styles.kpis}>
            <Kpi label="Einheiten" value={String(kennzahlen.einheiten)} accent={C.text} />
            <Kpi label="Kosten gesamt" value={eur(kennzahlen.kostenGesamt)} accent={C.gold} />
            <Kpi label="Vorauszahlungen" value={eur(kennzahlen.vorauszahlungGesamt)} accent={C.cyan} />
            <Kpi label="Saldo gesamt" value={eur(kennzahlen.saldoGesamt)} accent={kennzahlen.saldoGesamt >= 0 ? C.green : C.warn} />
            <Kpi label="Heiz-Lücken" value={String(kennzahlen.heizLuecken)} accent={kennzahlen.heizLuecken ? C.danger : C.green} />
          </div>
          {!laden && <div style={{ marginBottom: 14 }}><KiAuge modul="Betriebskosten" regel={augeBk(kennzahlen)} /></div>}

          {/* Einheiten */}
          <div style={styles.card}>
            <div style={styles.cardTitel}>Einheiten / Mieter</div>
            <div style={styles.grid}>
              <label style={styles.lab}>Einheit<input style={styles.inp} value={nEinheit.bezeichnung} onChange={(e) => setNEinheit({ ...nEinheit, bezeichnung: e.target.value })} placeholder="z. B. Whg. EG links" /></label>
              <label style={styles.lab}>Mieter<input style={styles.inp} value={nEinheit.mieter_name} onChange={(e) => setNEinheit({ ...nEinheit, mieter_name: e.target.value })} /></label>
              <label style={styles.lab}>Wohnfläche (m²)<input style={styles.inp} inputMode="decimal" value={nEinheit.wohnflaeche} onChange={(e) => setNEinheit({ ...nEinheit, wohnflaeche: e.target.value })} /></label>
              <label style={styles.lab}>Personen<input style={styles.inp} inputMode="numeric" value={nEinheit.personen} onChange={(e) => setNEinheit({ ...nEinheit, personen: e.target.value })} /></label>
              <label style={styles.lab}>Verbrauch (Heizung)<input style={styles.inp} inputMode="decimal" value={nEinheit.verbrauch} onChange={(e) => setNEinheit({ ...nEinheit, verbrauch: e.target.value })} placeholder="Einheiten/kWh" /></label>
              <label style={styles.lab}>Vorauszahlung (€)<input style={styles.inp} inputMode="decimal" value={nEinheit.vorauszahlung} onChange={(e) => setNEinheit({ ...nEinheit, vorauszahlung: e.target.value })} /></label>
            </div>
            <button style={{ ...styles.primaer, marginTop: 10, opacity: busy === 'einheit' ? 0.6 : 1 }} disabled={busy === 'einheit'} onClick={einheitAnlegen}>＋ Einheit</button>
            {abrEinheiten.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {abrEinheiten.map((e) => (
                  <div key={e.id} style={styles.zeile}>
                    <span>{e.bezeichnung}{e.mieter_name ? ` · ${e.mieter_name}` : ''} <span style={{ color: C.textDim }}>· {e.wohnflaeche} m² · {e.personen} Pers. · VZ {eur(e.vorauszahlung)}</span></span>
                    <button style={styles.miniX} disabled={busy === e.id} onClick={() => loesche('bk_einheit', e.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Kostenarten */}
          <div style={{ ...styles.card, marginTop: 16 }}>
            <div style={styles.cardTitel}>Kostenarten (§2 BetrKV)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
              <label style={styles.lab}>Kostenart
                <select style={styles.inp} value={nKost.katalog} onChange={(e) => setNKost({ ...nKost, katalog: e.target.value })}>
                  {BETRKV_KATALOG.map((k) => <option key={k.nr} value={k.nr}>{k.nr}. {k.bezeichnung}</option>)}
                </select>
              </label>
              <label style={styles.lab}>Gesamtbetrag (€)<input style={styles.inp} inputMode="decimal" value={nKost.betrag} onChange={(e) => setNKost({ ...nKost, betrag: e.target.value })} /></label>
              {BETRKV_KATALOG.find((x) => String(x.nr) === nKost.katalog)?.heiz ? (
                <label style={styles.lab}>Verbrauch %<input style={styles.inp} inputMode="numeric" value={nKost.verbrauch_anteil} onChange={(e) => setNKost({ ...nKost, verbrauch_anteil: e.target.value })} /></label>
              ) : <div style={{ alignSelf: 'end', color: C.textDim, fontSize: 13, paddingBottom: 10 }}>Schlüssel: {VERT_LABEL[BETRKV_KATALOG.find((x) => String(x.nr) === nKost.katalog)?.verteiler ?? 'wohnflaeche']}</div>}
              <button style={{ ...styles.primaer, opacity: busy === 'kost' ? 0.6 : 1 }} disabled={busy === 'kost'} onClick={kostenartAnlegen}>＋</button>
            </div>
            {felder.length > 0 && (
              <NurVoll>
                <div style={styles.grid}>
                  <EigeneFelderInputs felder={felder} werte={nKostExtra} setWert={(fid, w) => setNKostExtra((s) => ({ ...s, [fid]: w }))} inpStyle={styles.inp} labStyle={styles.lab} />
                </div>
              </NurVoll>
            )}
            {BETRKV_KATALOG.find((x) => String(x.nr) === nKost.katalog)?.heiz && !heizAnteilGueltig(num(nKost.verbrauch_anteil)) && (
              <div style={{ marginTop: 6, color: C.warn, fontSize: 13 }}>⚠ HeizkostenV: Verbrauchsanteil muss zwischen 50 % und 70 % liegen.</div>
            )}
            {abrKosten.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {abrKosten.map((k) => (
                  <div key={k.id} style={styles.zeile}>
                    <div style={{ minWidth: 0 }}>
                      <span>{k.betrkv_nr}. {k.bezeichnung} <span style={{ color: C.textDim }}>· {eur(k.betrag_gesamt)} · {k.ist_heizkosten ? `Verbr./Fläche ${k.verbrauch_anteil_prozent ?? HEIZ_VERBRAUCH_STD}%` : VERT_LABEL[k.verteiler]}</span></span>
                      <EigeneFelderAnzeige felder={felder} werte={werteMap[k.id]} />
                    </div>
                    <button style={styles.miniX} disabled={busy === k.id} onClick={() => loesche('bk_kostenart', k.id)}>✕</button>
                  </div>
                ))}
                <div style={{ textAlign: 'right', marginTop: 6, color: C.gold, fontWeight: 700 }}>Gesamtkosten: {eur(kontrolle.gesamt)}
                  {Math.abs(kontrolle.verteilt - kontrolle.gesamt) > 0.05 && abrEinheiten.length === 0 ? <span style={{ color: C.textDim, fontWeight: 400 }}> (Einheiten anlegen zum Verteilen)</span> : ''}
                </div>
              </div>
            )}
          </div>

          {uid && <EigeneFelderManager modul={MODUL} ownerId={uid} onChange={laden_} />}

          {/* Ergebnis */}
          {abrEinheiten.length > 0 && abrKosten.length > 0 && (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead><tr>
                  <th style={styles.th}>Einheit / Mieter</th><th style={{ ...styles.th, textAlign: 'right' }}>Kostenanteil</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Vorauszahlung</th><th style={{ ...styles.th, textAlign: 'right' }}>Saldo</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>PDF</th>
                </tr></thead>
                <tbody>
                  {abrEinheiten.map((e) => {
                    const a = abrechnungFuerEinheit(e as EinheitLite, abrKosten as KostenartLite[], abrEinheiten as EinheitLite[]);
                    return (
                      <tr key={e.id}>
                        <td style={styles.td}>{e.bezeichnung}{e.mieter_name ? <span style={{ color: C.textDim }}> · {e.mieter_name}</span> : ''}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{eur(a.summeKosten)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: C.textDim }}>{eur(a.vorauszahlung)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700, color: a.saldo >= 0 ? C.warn : C.green }}>{a.saldo >= 0 ? `Nachzahlung ${eur(a.saldo)}` : `Guthaben ${eur(-a.saldo)}`}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}><button style={{ ...styles.mini, color: C.cyan, borderColor: `${C.cyan}55` }} onClick={() => druckePdf(e)}>📄 Abrechnung</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '16px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 21, fontWeight: 800, lineHeight: 1.1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  subCard: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  zeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(143,163,190,0.08)', fontSize: 'clamp(13px,1.13vw,18px)' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  miniX: { background: 'transparent', color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 8, padding: '4px 9px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 640 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
