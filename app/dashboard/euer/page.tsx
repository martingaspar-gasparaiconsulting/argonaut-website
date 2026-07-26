'use client';

// ============================================================
// ARGONAUT OS · EÜR · Einnahmen-Überschuss-Rechnung (§ 4 Abs. 3 EStG)
// Zieht Einnahmen aus Rechnungen und Ausgaben aus Belegen, Reisekosten und
// der AfA für ein Jahr zusammen -> Gewinn/Verlust + USt-Übersicht. Verzahnung
// vorhandener Daten, keine KI, kein neues SQL. Regel-Ebene.
// Pfad: app/dashboard/euer/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { afaPlan } from '@/lib/afa';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

function eur(n: number | null | undefined) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function num(s: string): number { const n = parseFloat((s || '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function imJahr(iso: string | null | undefined, jahr: number): boolean { return !!iso && iso.slice(0, 4) === String(jahr); }

type Aggregat = {
  einnahmenNetto: number; vereinnahmteUst: number; einnahmenAnzahl: number;
  belegeNetto: number; vorsteuer: number; belegeAnzahl: number; nachKategorie: { kategorie: string; netto: number }[];
  reisekosten: number; reisenAnzahl: number;
  afa: number; afaAnzahl: number;
};

const LEER_AGG: Aggregat = { einnahmenNetto: 0, vereinnahmteUst: 0, einnahmenAnzahl: 0, belegeNetto: 0, vorsteuer: 0, belegeAnzahl: 0, nachKategorie: [], reisekosten: 0, reisenAnzahl: 0, afa: 0, afaAnzahl: 0 };

export default function EuerPage() {
  const jetzt = new Date().getFullYear();
  const [jahr, setJahr] = useState(jetzt);
  const [basis, setBasis] = useState<'zahlung' | 'rechnung'>('zahlung');
  const [agg, setAgg] = useState<Aggregat>(LEER_AGG);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [sonstEin, setSonstEin] = useState('');
  const [sonstAus, setSonstAus] = useState('');

  const laden_ = useCallback(async (j: number, b: 'zahlung' | 'rechnung') => {
    setLaden(true); setFehler(null);
    const a: Aggregat = { ...LEER_AGG, nachKategorie: [] };
    const versuch = async (fn: () => Promise<void>) => { try { await fn(); } catch { /* Tabelle evtl. nicht vorhanden */ } };

    // Einnahmen aus Rechnungen (Zufluss = bezahlt_am, alternativ Rechnungsdatum)
    await versuch(async () => {
      const { data } = await supabase.from('rechnungen').select('netto_summe, mwst_summe, brutto_summe, bezahlt_am, rechnungsdatum, zahlungsstatus, kleinunternehmer');
      (data as Record<string, unknown>[] || []).forEach((r) => {
        const datum = b === 'zahlung' ? (r.bezahlt_am as string) : (r.rechnungsdatum as string);
        if (b === 'zahlung' && !r.bezahlt_am) return;   // Zufluss: nur tatsächlich bezahlte
        if (!imJahr(datum, j)) return;
        const netto = Number(r.netto_summe) || 0;
        const ust = r.kleinunternehmer ? 0 : (Number(r.mwst_summe) || 0);
        // Falls netto fehlt, aus brutto ableiten
        const einnahme = netto || ((Number(r.brutto_summe) || 0) - ust);
        a.einnahmenNetto += einnahme; a.vereinnahmteUst += ust; a.einnahmenAnzahl += 1;
      });
    });

    // Ausgaben aus Eingangsbelegen (Belegdatum im Jahr)
    const katMap: Record<string, number> = {};
    await versuch(async () => {
      const { data } = await supabase.from('eingangsbelege').select('netto, ust_betrag, brutto, kategorie, belegdatum');
      (data as Record<string, unknown>[] || []).forEach((be) => {
        if (!imJahr(be.belegdatum as string, j)) return;
        const netto = Number(be.netto) || ((Number(be.brutto) || 0) - (Number(be.ust_betrag) || 0));
        a.belegeNetto += netto; a.vorsteuer += Number(be.ust_betrag) || 0; a.belegeAnzahl += 1;
        const k = (be.kategorie as string)?.trim() || 'Ohne Kategorie';
        katMap[k] = (katMap[k] || 0) + netto;
      });
    });
    a.nachKategorie = Object.entries(katMap).map(([kategorie, netto]) => ({ kategorie, netto })).sort((x, y) => y.netto - x.netto);

    // Reisekosten (Abreise im Jahr)
    await versuch(async () => {
      const { data } = await supabase.from('reisekosten').select('gesamt, abreise');
      (data as Record<string, unknown>[] || []).forEach((r) => {
        if (!imJahr(r.abreise as string, j)) return;
        a.reisekosten += Number(r.gesamt) || 0; a.reisenAnzahl += 1;
      });
    });

    // AfA aus Anlagegütern (Jahres-AfA fürs gewählte Jahr)
    await versuch(async () => {
      const { data } = await supabase.from('anlagegueter').select('anschaffungskosten, nutzungsdauer_jahre, anschaffungsdatum');
      (data as Record<string, unknown>[] || []).forEach((an) => {
        const p = afaPlan(Number(an.anschaffungskosten) || 0, Number(an.nutzungsdauer_jahre) || 1, (an.anschaffungsdatum as string) || null, j);
        if (p.afaStichjahr > 0) { a.afa += p.afaStichjahr; a.afaAnzahl += 1; }
      });
    });

    setAgg(a); setLaden(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      await laden_(jahr, basis);
    })();
  }, [laden_, jahr, basis]);

  const s = useMemo(() => {
    const einnahmen = agg.einnahmenNetto + num(sonstEin);
    const ausgaben = agg.belegeNetto + agg.reisekosten + agg.afa + num(sonstAus);
    const gewinn = einnahmen - ausgaben;
    const ustZahllast = agg.vereinnahmteUst - agg.vorsteuer;
    return { einnahmen, ausgaben, gewinn, ustZahllast };
  }, [agg, sonstEin, sonstAus]);

  function csvExport() {
    const rows: string[][] = [
      ['EÜR ' + jahr, ''],
      ['Basis', basis === 'zahlung' ? 'Zufluss (bezahlt)' : 'Rechnungsdatum'],
      ['', ''],
      ['EINNAHMEN', ''],
      ['Einnahmen aus Rechnungen (netto)', String(agg.einnahmenNetto)],
      ['Sonstige Einnahmen', String(num(sonstEin))],
      ['Summe Einnahmen', String(s.einnahmen)],
      ['', ''],
      ['AUSGABEN', ''],
      ...agg.nachKategorie.map((k) => ['Belege · ' + k.kategorie, String(k.netto)]),
      ['Reisekosten', String(agg.reisekosten)],
      ['Abschreibungen (AfA)', String(agg.afa)],
      ['Sonstige Ausgaben', String(num(sonstAus))],
      ['Summe Ausgaben', String(s.ausgaben)],
      ['', ''],
      ['GEWINN / VERLUST', String(s.gewinn)],
      ['', ''],
      ['Umsatzsteuer-Übersicht', ''],
      ['Vereinnahmte USt', String(agg.vereinnahmteUst)],
      ['Gezahlte Vorsteuer', String(agg.vorsteuer)],
      ['USt-Zahllast (+) / Erstattung (-)', String(s.ustZahllast)],
    ];
    const csv = rows.map((r) => r.map((x) => String(x).replace(/;/g, ',').replace('.', ',')).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const el = document.createElement('a');
    el.href = url; el.download = `EUER_${jahr}.csv`; document.body.appendChild(el); el.click(); el.remove(); URL.revokeObjectURL(url);
  }

  const jahre = [jetzt + 1, jetzt, jetzt - 1, jetzt - 2, jetzt - 3];

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>📗 EÜR · Einnahmen-Überschuss-Rechnung</h1>
      <p style={styles.sub}>ARGONAUT stellt deine Gewinnermittlung nach § 4 Abs. 3 EStG zusammen — Einnahmen aus Rechnungen, Ausgaben aus Belegen, Reisekosten und Abschreibungen, alles für ein Jahr. Reine Verzahnung deiner Daten, keine KI.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.leiste}>
        <div style={styles.feldGrp}>
          <span style={styles.lLabel}>Jahr</span>
          <select style={styles.sel} value={jahr} onChange={(e) => setJahr(parseInt(e.target.value, 10))}>
            {jahre.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>
        <div style={styles.feldGrp}>
          <span style={styles.lLabel}>Basis</span>
          <div style={styles.toggle}>
            <button style={{ ...styles.tBtn, ...(basis === 'zahlung' ? styles.tAktiv : {}) }} onClick={() => setBasis('zahlung')}>Zufluss (bezahlt)</button>
            <button style={{ ...styles.tBtn, ...(basis === 'rechnung' ? styles.tAktiv : {}) }} onClick={() => setBasis('rechnung')}>Rechnungsdatum</button>
          </div>
        </div>
        <button style={styles.ghost} onClick={csvExport} disabled={laden}>⬇ CSV-Export</button>
      </div>

      {laden ? <p style={styles.dim}>Sammle die Zahlen für {jahr} …</p> : (
        <>
          <div style={styles.kpis}>
            <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.green }}>{eur(s.einnahmen)}</div><div style={styles.kLabel}>Einnahmen</div></div>
            <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.warn }}>{eur(s.ausgaben)}</div><div style={styles.kLabel}>Ausgaben</div></div>
            <div style={{ ...styles.kpi, borderColor: s.gewinn >= 0 ? `${C.green}66` : `${C.danger}66` }}>
              <div style={{ ...styles.kWert, color: s.gewinn >= 0 ? C.gold : C.danger }}>{eur(s.gewinn)}</div>
              <div style={styles.kLabel}>{s.gewinn >= 0 ? 'Gewinn' : 'Verlust'} {jahr}</div>
            </div>
          </div>

          {/* Einnahmen */}
          <section style={styles.card}>
            <div style={styles.titel}>➕ Einnahmen</div>
            <Zeile label={`Aus Rechnungen (netto) · ${agg.einnahmenAnzahl}`} wert={eur(agg.einnahmenNetto)} />
            <div style={styles.zeileEdit}>
              <span>Sonstige Einnahmen (manuell)</span>
              <input style={styles.miniInp} value={sonstEin} onChange={(e) => setSonstEin(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </div>
            <Zeile label="Summe Einnahmen" wert={eur(s.einnahmen)} fett />
          </section>

          {/* Ausgaben */}
          <section style={styles.card}>
            <div style={styles.titel}>➖ Ausgaben</div>
            {agg.nachKategorie.length === 0 && <p style={styles.dim}>Keine Belege in {jahr}.</p>}
            {agg.nachKategorie.map((k) => <Zeile key={k.kategorie} label={`Belege · ${k.kategorie}`} wert={eur(k.netto)} />)}
            <Zeile label={`Reisekosten · ${agg.reisenAnzahl}`} wert={eur(agg.reisekosten)} />
            <Zeile label={`Abschreibungen (AfA) · ${agg.afaAnzahl} Anlage(n)`} wert={eur(agg.afa)} />
            <div style={styles.zeileEdit}>
              <span>Sonstige Ausgaben (manuell)</span>
              <input style={styles.miniInp} value={sonstAus} onChange={(e) => setSonstAus(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </div>
            <Zeile label="Summe Ausgaben" wert={eur(s.ausgaben)} fett />
          </section>

          {/* Ergebnis */}
          <section style={{ ...styles.card, borderColor: s.gewinn >= 0 ? `${C.green}44` : `${C.danger}44` }}>
            <div style={styles.zeileErgebnis}>
              <span>{s.gewinn >= 0 ? 'Gewinn' : 'Verlust'} {jahr} (Gewinnermittlung § 4 Abs. 3 EStG)</span>
              <b style={{ color: s.gewinn >= 0 ? C.gold : C.danger, fontSize: 22 }}>{eur(s.gewinn)}</b>
            </div>
          </section>

          {/* USt-Übersicht */}
          <section style={styles.card}>
            <div style={styles.titel}>🧾 Umsatzsteuer-Übersicht</div>
            <Zeile label="Vereinnahmte Umsatzsteuer (aus Rechnungen)" wert={eur(agg.vereinnahmteUst)} />
            <Zeile label="Gezahlte Vorsteuer (aus Belegen)" wert={eur(agg.vorsteuer)} />
            <Zeile label={s.ustZahllast >= 0 ? 'USt-Zahllast ans Finanzamt' : 'USt-Erstattung vom Finanzamt'} wert={eur(Math.abs(s.ustZahllast))} fett farbe={s.ustZahllast >= 0 ? C.warn : C.green} />
          </section>

          <p style={styles.disclaimer}>Automatische Zusammenstellung aus deinen erfassten Daten — als Vorbereitung und Überblick. Die verbindliche EÜR und die Umsatzsteuer-Voranmeldung erstellt bzw. prüft dein Steuerberater. Basis „Zufluss": nur tatsächlich bezahlte Rechnungen zählen (§ 11 EStG).</p>
        </>
      )}
    </div>
  );
}

function Zeile({ label, wert, fett, farbe }: { label: string; wert: string; fett?: boolean; farbe?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: fett ? `1px solid ${C.border}` : '1px solid rgba(143,163,190,0.06)', marginTop: fett ? 4 : 0 }}>
      <span style={{ color: fett ? C.text : C.textDim, fontSize: 14, fontWeight: fett ? 700 : 400 }}>{label}</span>
      <b style={{ color: farbe || C.text, fontSize: fett ? 16 : 14, fontWeight: fett ? 800 : 600 }}>{wert}</b>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 860, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 820 },
  leiste: { display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 16 },
  feldGrp: { display: 'flex', flexDirection: 'column', gap: 5 },
  lLabel: { color: C.textDim, fontSize: 12 },
  sel: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 15, fontFamily: 'inherit' },
  toggle: { display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 9, overflow: 'hidden' },
  tBtn: { background: 'transparent', color: C.textDim, border: 'none', padding: '9px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tAktiv: { background: C.gold, color: C.navy },
  ghost: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '16px 0' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px', textAlign: 'center' },
  kWert: { fontSize: 21, fontWeight: 800, lineHeight: 1.1 },
  kLabel: { color: C.textDim, fontSize: 12, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 20px', marginTop: 14 },
  titel: { fontWeight: 800, fontSize: 16, marginBottom: 6 },
  zeileEdit: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(143,163,190,0.06)', color: C.textDim, fontSize: 14 },
  miniInp: { width: 120, background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 14, fontFamily: 'inherit', textAlign: 'right' },
  zeileErgebnis: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontWeight: 800, fontSize: 15 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  disclaimer: { color: C.textDim, fontSize: 12.5, marginTop: 18, lineHeight: 1.5 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
