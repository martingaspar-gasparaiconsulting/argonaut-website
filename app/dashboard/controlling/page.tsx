'use client';

// ============================================================
// ARGONAUT OS · Controlling · Kennzahlen-Formel-Engine
// Live-Rechner für die wichtigsten betriebswirtschaftlichen Kennzahlen —
// Ergebnis & Marge, Break-even, Liquidität, kalk. Stundensatz, EK-Quote.
// Reine Regel-Ebene (Formeln), keine KI, kein SQL. Mit Ampel + Klartext.
// Pfad: app/dashboard/controlling/page.tsx
// ============================================================

import { useState, useMemo, CSSProperties } from 'react';
import { ergebnis, breakEven, liquiditaet, stundensatz, ekQuote } from '@/lib/controlling';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

function num(s: string): number { const n = parseFloat((s || '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function eur(n: number | null | undefined) { return n == null ? '—' : (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function proz(n: number | null | undefined) { return n == null ? '—' : `${(Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`; }

type Ampel = { farbe: string; label: string };
// Höher = besser.
function ampel(wert: number | null, gut: number, mittel: number): Ampel {
  if (wert == null) return { farbe: C.textDim, label: '—' };
  if (wert >= gut) return { farbe: C.green, label: 'gut' };
  if (wert >= mittel) return { farbe: C.warn, label: 'solide' };
  return { farbe: C.danger, label: 'schwach' };
}

const LEER = {
  umsatz: '', wareneinsatz: '', personalkosten: '', sonstigeKosten: '',
  fixkosten: '', dbMarge: '',
  liquide: '', forderungen: '', vorraete: '', kurzVerb: '',
  jahreskosten: '', produktiveStunden: '', gewinn: '15',
  eigenkapital: '', bilanzsumme: '',
};

export default function ControllingPage() {
  const [f, setF] = useState({ ...LEER });
  function set<K extends keyof typeof LEER>(k: K, v: string) { setF((s) => ({ ...s, [k]: v })); }

  const erg = useMemo(() => ergebnis({ umsatz: num(f.umsatz), wareneinsatz: num(f.wareneinsatz), personalkosten: num(f.personalkosten), sonstigeKosten: num(f.sonstigeKosten) }), [f.umsatz, f.wareneinsatz, f.personalkosten, f.sonstigeKosten]);
  const be = useMemo(() => breakEven(num(f.fixkosten), num(f.dbMarge), num(f.umsatz)), [f.fixkosten, f.dbMarge, f.umsatz]);
  const liq = useMemo(() => liquiditaet({ liquide: num(f.liquide), forderungen: num(f.forderungen), vorraete: num(f.vorraete), kurzVerb: num(f.kurzVerb) }), [f.liquide, f.forderungen, f.vorraete, f.kurzVerb]);
  const ss = useMemo(() => stundensatz(num(f.jahreskosten), num(f.produktiveStunden), num(f.gewinn)), [f.jahreskosten, f.produktiveStunden, f.gewinn]);
  const ekq = useMemo(() => ekQuote(num(f.eigenkapital), num(f.bilanzsumme)), [f.eigenkapital, f.bilanzsumme]);

  const renditeAmpel = ampel(erg.umsatzrendite, 10, 3);
  const liq1A = ampel(liq.grad1, 20, 10);
  const liq2A = ampel(liq.grad2, 100, 80);
  const liq3A = ampel(liq.grad3, 120, 100);
  const ekA = ampel(ekq, 30, 15);
  const sicherA = ampel(be.sicherheitsabstand, 20, 5);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>📈 Controlling · Kennzahlen</h1>
      <p style={styles.sub}>Zahlen eintragen — ARGONAUT rechnet die wichtigsten betriebswirtschaftlichen Kennzahlen sofort aus und ordnet sie mit einer Ampel ein. Reine Formeln, keine KI-Kosten. Nichts wird gespeichert — ein Werkzeug zum Durchrechnen.</p>

      {/* 1 · Ergebnis & Marge */}
      <section style={styles.card}>
        <div style={styles.titel}>💶 Ergebnis &amp; Marge</div>
        <div style={styles.grid}>
          <Feld label="Umsatz (netto) €" v={f.umsatz} on={(v) => set('umsatz', v)} />
          <Feld label="Wareneinsatz / Material €" v={f.wareneinsatz} on={(v) => set('wareneinsatz', v)} />
          <Feld label="Personalkosten €" v={f.personalkosten} on={(v) => set('personalkosten', v)} />
          <Feld label="Sonstige Kosten €" v={f.sonstigeKosten} on={(v) => set('sonstigeKosten', v)} />
        </div>
        <div style={styles.ergGrid}>
          <Kennz label="Rohertrag" wert={eur(erg.rohertrag)} sub={proz(erg.rohertragsquote) + ' vom Umsatz'} />
          <Kennz label="Betriebsergebnis" wert={eur(erg.betriebsergebnis)} farbe={erg.betriebsergebnis >= 0 ? C.green : C.danger} />
          <Kennz label="Umsatzrendite" wert={proz(erg.umsatzrendite)} farbe={renditeAmpel.farbe} tag={renditeAmpel.label} />
          <Kennz label="Personalkostenquote" wert={proz(erg.personalkostenquote)} />
        </div>
      </section>

      {/* 2 · Break-even */}
      <section style={styles.card}>
        <div style={styles.titel}>🎯 Break-even (Gewinnschwelle)</div>
        <div style={styles.grid}>
          <Feld label="Fixkosten / Jahr €" v={f.fixkosten} on={(v) => set('fixkosten', v)} />
          <Feld label="Deckungsbeitrags-Marge %" v={f.dbMarge} on={(v) => set('dbMarge', v)} hint="= 100 % − variable Kostenquote" />
        </div>
        <div style={styles.ergGrid}>
          <Kennz label="Break-even-Umsatz" wert={eur(be.breakEvenUmsatz)} farbe={C.gold} sub="ab hier verdienst du Geld" />
          <Kennz label="Sicherheitsabstand" wert={proz(be.sicherheitsabstand)} farbe={sicherA.farbe} tag={be.sicherheitsabstand == null ? undefined : sicherA.label} sub={f.umsatz ? `bei ${eur(num(f.umsatz))} Umsatz` : 'Umsatz oben eintragen'} />
        </div>
      </section>

      {/* 3 · Liquidität */}
      <section style={styles.card}>
        <div style={styles.titel}>💧 Liquidität</div>
        <div style={styles.grid}>
          <Feld label="Liquide Mittel (Kasse/Bank) €" v={f.liquide} on={(v) => set('liquide', v)} />
          <Feld label="Kurzfr. Forderungen €" v={f.forderungen} on={(v) => set('forderungen', v)} />
          <Feld label="Vorräte / Bestand €" v={f.vorraete} on={(v) => set('vorraete', v)} />
          <Feld label="Kurzfr. Verbindlichkeiten €" v={f.kurzVerb} on={(v) => set('kurzVerb', v)} />
        </div>
        <div style={styles.ergGrid}>
          <Kennz label="1. Grades (bar)" wert={proz(liq.grad1)} farbe={liq1A.farbe} tag={liq1A.label} sub="Ziel ≥ 20 %" />
          <Kennz label="2. Grades (quick)" wert={proz(liq.grad2)} farbe={liq2A.farbe} tag={liq2A.label} sub="Ziel ≥ 100 %" />
          <Kennz label="3. Grades (current)" wert={proz(liq.grad3)} farbe={liq3A.farbe} tag={liq3A.label} sub="Ziel ≥ 120 %" />
        </div>
      </section>

      {/* 4 · Kalkulatorischer Stundensatz */}
      <section style={styles.card}>
        <div style={styles.titel}>🛠 Kalkulatorischer Stundensatz</div>
        <div style={styles.grid}>
          <Feld label="Gesamtkosten / Jahr € (ohne Material)" v={f.jahreskosten} on={(v) => set('jahreskosten', v)} />
          <Feld label="Produktive Stunden / Jahr" v={f.produktiveStunden} on={(v) => set('produktiveStunden', v)} hint="verrechenbare Stunden" />
          <Feld label="Gewinnaufschlag %" v={f.gewinn} on={(v) => set('gewinn', v)} />
        </div>
        <div style={styles.ergGrid}>
          <Kennz label="Kostendeckender Satz" wert={eur(ss.kostenSatz)} sub="deckt gerade die Kosten" />
          <Kennz label="Mindest-Stundensatz" wert={eur(ss.mitGewinn)} farbe={C.gold} sub={`inkl. ${num(f.gewinn) || 0} % Gewinn`} />
        </div>
      </section>

      {/* 5 · Eigenkapitalquote */}
      <section style={styles.card}>
        <div style={styles.titel}>🏦 Eigenkapitalquote</div>
        <div style={styles.grid}>
          <Feld label="Eigenkapital €" v={f.eigenkapital} on={(v) => set('eigenkapital', v)} />
          <Feld label="Bilanzsumme €" v={f.bilanzsumme} on={(v) => set('bilanzsumme', v)} />
        </div>
        <div style={styles.ergGrid}>
          <Kennz label="Eigenkapitalquote" wert={proz(ekq)} farbe={ekA.farbe} tag={ekA.label} sub="Ziel ≥ 30 %" />
        </div>
      </section>

      <p style={styles.disclaimer}>Alle Werte sind Orientierungsgrößen nach gängigen betriebswirtschaftlichen Formeln. Für Bilanz- und Steuerfragen bitte den Steuerberater hinzuziehen.</p>
    </div>
  );
}

function Feld({ label, v, on, hint }: { label: string; v: string; on: (v: string) => void; hint?: string }) {
  return (
    <label style={styles.lab}>
      {label}
      <input style={styles.inp} value={v} onChange={(e) => on(e.target.value)} inputMode="decimal" placeholder="0" />
      {hint && <span style={styles.hint}>{hint}</span>}
    </label>
  );
}

function Kennz({ label, wert, sub, farbe, tag }: { label: string; wert: string; sub?: string; farbe?: string; tag?: string }) {
  return (
    <div style={styles.kennz}>
      <div style={styles.kLabel}>{label}</div>
      <div style={{ ...styles.kWert, color: farbe || C.text }}>{wert}{tag ? <span style={{ ...styles.kTag, color: farbe || C.textDim, borderColor: (farbe || C.textDim) + '55' }}>{tag}</span> : null}</div>
      {sub && <div style={styles.kSub}>{sub}</div>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 820 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginTop: 16 },
  titel: { fontWeight: 800, fontSize: 17, marginBottom: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  hint: { color: C.textDim, fontSize: 11, marginTop: 1 },
  ergGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 },
  kennz: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
  kLabel: { color: C.textDim, fontSize: 12.5 },
  kWert: { fontSize: 22, fontWeight: 800, marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  kTag: { fontSize: 11, fontWeight: 700, border: '1px solid', borderRadius: 999, padding: '1px 8px', textTransform: 'uppercase', letterSpacing: '0.04em' },
  kSub: { color: C.textDim, fontSize: 12, marginTop: 4 },
  disclaimer: { color: C.textDim, fontSize: 12.5, marginTop: 18, lineHeight: 1.5 },
};
