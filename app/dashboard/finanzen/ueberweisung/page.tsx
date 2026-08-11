'use client';

// ============================================================
// ARGONAUT OS · Finanzen · SEPA-Sammelüberweisung (pain.001)
// Empfänger (Gehälter/Lieferanten) mit IBAN + Betrag erfassen → gültige
// SEPA-Datei (pain.001.001.03) erzeugen und im Online-Banking hochladen.
// Pfad: app/dashboard/finanzen/ueberweisung/page.tsx
// ============================================================

import { useEffect, useMemo, useState, CSSProperties } from 'react';
import { bauePain001, ibanGueltig, type Ueberweisung } from '@/lib/sepaUeberweisung';

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  danger: '#E06666', warn: '#E0A24C', text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(255,255,255,0.08)',
};

type Zeile = { name: string; iban: string; betrag: string; zweck: string };
const LEERE_ZEILE: Zeile = { name: '', iban: '', betrag: '', zweck: '' };

function eur(n: number): string {
  try { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0); }
  catch { return `${(Number(n) || 0).toFixed(2)} €`; }
}
function num(s: string): number { const n = parseFloat((s || '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function morgenIso(): string { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
function monatJahr(): string { return new Date().toLocaleString('de-DE', { month: 'long', year: 'numeric' }); }

export default function UeberweisungSeite() {
  const [absName, setAbsName] = useState('');
  const [absIban, setAbsIban] = useState('');
  const [absBic, setAbsBic] = useState('');
  const [datum, setDatum] = useState(morgenIso());
  const [vorlage, setVorlage] = useState('');
  const [zeilen, setZeilen] = useState<Zeile[]>([{ ...LEERE_ZEILE }, { ...LEERE_ZEILE }]);
  const [meldung, setMeldung] = useState<string | null>(null);

  // Bequemlichkeit: Eingaben lokal merken (nur auf diesem Gerät).
  useEffect(() => {
    try {
      const roh = window.localStorage.getItem('sepa_ueberweisung');
      if (roh) { const j = JSON.parse(roh); if (j.absName) setAbsName(j.absName); if (j.absIban) setAbsIban(j.absIban); if (j.absBic) setAbsBic(j.absBic); if (Array.isArray(j.zeilen) && j.zeilen.length) setZeilen(j.zeilen); }
    } catch { /* egal */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem('sepa_ueberweisung', JSON.stringify({ absName, absIban, absBic, zeilen })); } catch { /* egal */ }
  }, [absName, absIban, absBic, zeilen]);

  function setZeile(i: number, patch: Partial<Zeile>) { setZeilen((z) => z.map((r, idx) => idx === i ? { ...r, ...patch } : r)); }
  function addZeile(zweck = '') { setZeilen((z) => [...z, { ...LEERE_ZEILE, zweck }]); }
  function delZeile(i: number) { setZeilen((z) => z.filter((_, idx) => idx !== i)); }
  function vorlageAnwenden() { if (!vorlage.trim()) return; setZeilen((z) => z.map((r) => r.zweck.trim() ? r : { ...r, zweck: vorlage })); }

  const gueltige: Ueberweisung[] = useMemo(() => zeilen
    .filter((r) => r.name.trim() && ibanGueltig(r.iban) && num(r.betrag) > 0)
    .map((r) => ({ name: r.name.trim(), iban: r.iban, betrag: num(r.betrag), verwendungszweck: r.zweck.trim() || 'Ueberweisung' })), [zeilen]);

  const summe = gueltige.reduce((s, p) => s + p.betrag, 0);
  const absOk = absName.trim().length > 0 && ibanGueltig(absIban);
  const bereit = absOk && gueltige.length > 0;

  function erzeugen() {
    setMeldung(null);
    if (!bereit) { setMeldung('Bitte Absender (Name + gültige IBAN) und mindestens einen gültigen Empfänger angeben.'); return; }
    const stamp = new Date();
    const msgId = `UEB-${stamp.getTime()}`;
    const creDtTm = stamp.toISOString().slice(0, 19);
    const xml = bauePain001({ name: absName.trim(), iban: absIban, bic: absBic.trim() || undefined }, gueltige, datum, msgId, creDtTm);
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `SEPA-Ueberweisung_${datum}.xml`; a.click();
    URL.revokeObjectURL(url);
    setMeldung(`SEPA-Datei mit ${gueltige.length} Überweisung(en) über ${eur(summe)} erzeugt. Jetzt im Online-Banking hochladen.`);
  }

  return (
    <div style={styles.page}>
      <div style={{ maxWidth: 1050, margin: '0 auto' }}>
        <a href="/dashboard/finanzen" style={{ color: C.cyan, textDecoration: 'none', fontSize: 14 }}>← Zurück zu Finanzen</a>
        <h1 style={styles.h1}>🏦 SEPA-Sammelüberweisung</h1>
        <p style={styles.sub}>Gehälter oder Lieferanten in einem Rutsch: Empfänger erfassen, gültige SEPA-Datei (pain.001) erzeugen und im Online-Banking hochladen. ARGONAUT erzeugt nur die Datei — die Freigabe machst du in deiner Bank.</p>

        {/* Absender */}
        <div style={styles.card}>
          <div style={styles.cardTitel}>Auftraggeber (dein Konto)</div>
          <div style={styles.grid}>
            <label style={styles.lab}>Name<input style={styles.inp} value={absName} onChange={(e) => setAbsName(e.target.value)} placeholder="Firma / Inhaber" /></label>
            <label style={styles.lab}>IBAN<input style={{ ...styles.inp, borderColor: absIban && !ibanGueltig(absIban) ? C.danger : C.border }} value={absIban} onChange={(e) => setAbsIban(e.target.value)} placeholder="DE.." /></label>
            <label style={styles.lab}>BIC (optional)<input style={styles.inp} value={absBic} onChange={(e) => setAbsBic(e.target.value)} placeholder="meist nicht nötig" /></label>
            <label style={styles.lab}>Ausführungsdatum<input type="date" style={styles.inp} value={datum} onChange={(e) => setDatum(e.target.value)} /></label>
          </div>
        </div>

        {/* Vorlage */}
        <div style={{ ...styles.card, marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: C.textDim, fontSize: 13 }}>Verwendungszweck-Vorlage:</span>
          <button style={styles.chip} onClick={() => setVorlage(`Gehalt ${monatJahr()}`)}>👔 Gehälter</button>
          <button style={styles.chip} onClick={() => setVorlage('Rechnung ')}>📦 Lieferanten</button>
          <input style={{ ...styles.inp, flex: 1, minWidth: 160 }} value={vorlage} onChange={(e) => setVorlage(e.target.value)} placeholder="z. B. Gehalt August 2026" />
          <button style={styles.ghost} onClick={vorlageAnwenden}>Auf leere Zeilen anwenden</button>
        </div>

        {/* Empfänger */}
        <div style={{ ...styles.card, marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
            <div style={styles.cardTitel}>Empfänger</div>
            <button style={styles.ghost} onClick={() => addZeile(vorlage)}>+ Empfänger</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={styles.zeileKopf}><span>Name</span><span>IBAN</span><span style={{ textAlign: 'right' }}>Betrag €</span><span>Verwendungszweck</span><span /></div>
            {zeilen.map((r, i) => {
              const ibanBad = !!r.iban.trim() && !ibanGueltig(r.iban);
              return (
                <div key={i} style={styles.zeile}>
                  <input style={styles.zinp} value={r.name} onChange={(e) => setZeile(i, { name: e.target.value })} placeholder="Empfänger" />
                  <input style={{ ...styles.zinp, borderColor: ibanBad ? C.danger : C.border }} value={r.iban} onChange={(e) => setZeile(i, { iban: e.target.value })} placeholder="DE.." />
                  <input style={{ ...styles.zinp, textAlign: 'right' }} value={r.betrag} onChange={(e) => setZeile(i, { betrag: e.target.value })} inputMode="decimal" placeholder="0,00" />
                  <input style={styles.zinp} value={r.zweck} onChange={(e) => setZeile(i, { zweck: e.target.value })} placeholder="Verwendungszweck" />
                  <button style={styles.del} onClick={() => delZeile(i)} title="Zeile entfernen">✕</button>
                </div>
              );
            })}
          </div>
          <div style={styles.summe}>
            <span style={{ color: C.textDim }}>{gueltige.length} gültige Empfänger</span>
            <span style={{ fontWeight: 800, fontSize: 18, color: C.gold }}>Summe: {eur(summe)}</span>
          </div>
        </div>

        {meldung && <div style={{ ...styles.info, borderColor: bereit ? C.green : C.danger, color: bereit ? C.green : C.danger }}>{meldung}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button style={{ ...styles.primaer, opacity: bereit ? 1 : 0.5, cursor: bereit ? 'pointer' : 'not-allowed' }} disabled={!bereit} onClick={erzeugen}>⬇ SEPA-Datei erzeugen (pain.001)</button>
        </div>
        <p style={{ color: C.textDim, fontSize: 12.5, marginTop: 12, lineHeight: 1.5 }}>
          Ungültige IBANs werden rot markiert und nicht in die Datei übernommen. Eingaben werden nur lokal auf diesem Gerät gemerkt (bequemes Wieder-Befüllen), nicht auf dem Server gespeichert.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { background: C.navy, minHeight: '100vh', padding: '28px 24px 64px', color: C.text, fontFamily: "'DM Sans', sans-serif" },
  h1: { fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(28px,2.5vw,40px)', fontWeight: 800, margin: '10px 0 0' },
  sub: { color: C.textDim, margin: '6px 0 20px', fontSize: 'clamp(14px,1.2vw,19px)', maxWidth: 840, lineHeight: 1.5 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18 },
  cardTitel: { fontWeight: 800, fontSize: 16 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 10 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  chip: { background: 'rgba(201,168,76,0.12)', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  zeileKopf: { display: 'grid', gridTemplateColumns: '1.3fr 1.6fr 0.8fr 1.6fr 32px', gap: 8, padding: '2px 2px 8px', color: C.textDim, fontSize: 12, fontWeight: 700, minWidth: 640 },
  zeile: { display: 'grid', gridTemplateColumns: '1.3fr 1.6fr 0.8fr 1.6fr 32px', gap: 8, padding: '4px 0', minWidth: 640, alignItems: 'center' },
  zinp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 10px', fontSize: 14, fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  del: { background: 'transparent', color: C.danger, border: `1px solid rgba(224,102,102,0.35)`, borderRadius: 8, width: 32, height: 34, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  summe: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, flexWrap: 'wrap', gap: 8 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '12px 22px', fontSize: 15, fontWeight: 800, fontFamily: 'inherit' },
  ghost: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 15px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  info: { border: '1px solid', borderRadius: 10, padding: '11px 14px', marginTop: 14, fontSize: 14, background: 'rgba(255,255,255,0.03)' },
};
