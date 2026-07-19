'use client';

// ============================================================
// ARGONAUT OS · Bündel 20 · DATEV & E-Rechnung (Dashboard)
// DATEV-Buchungsstapel-Export + USt-Voranmeldung-Vorschau (ELSTER-Vorbereitung).
// Die echte DATEV-Online-/ELSTER-Übermittlung ist als Brücke vorgesehen.
// Pfad: app/dashboard/datev/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function monatsStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
function heute() { return new Date().toISOString().slice(0, 10); }

export default function DatevPage() {
  const [von, setVon] = useState(monatsStart());
  const [bis, setBis] = useState(heute());
  const [laden, setLaden] = useState(false);
  const [summe, setSumme] = useState<{ anzahl: number; netto: number; mwst: number; brutto: number } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [datevKonfig, setDatevKonfig] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('betrieb_integrationen').select('config').eq('typ', 'datev').maybeSingle();
      const cfg = (data?.config || {}) as Record<string, string>;
      setDatevKonfig(!!(cfg.erloeskonto || cfg.berater_nr));
    })();
  }, []);

  const berechnen = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const { data, error } = await supabase.from('rechnungen')
        .select('netto_summe, mwst_summe, brutto_summe, zahlungsstatus')
        .neq('zahlungsstatus', 'storniert').gte('rechnungsdatum', von).lte('rechnungsdatum', bis);
      if (error) { setFehler('Daten konnten nicht geladen werden.'); return; }
      const liste = data || [];
      setSumme({
        anzahl: liste.length,
        netto: liste.reduce((s, r) => s + (Number(r.netto_summe) || 0), 0),
        mwst: liste.reduce((s, r) => s + (Number(r.mwst_summe) || 0), 0),
        brutto: liste.reduce((s, r) => s + (Number(r.brutto_summe) || 0), 0),
      });
    } finally { setLaden(false); }
  }, [von, bis]);

  useEffect(() => { berechnen(); }, [berechnen]);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>📊 DATEV & E-Rechnung</h1>
      <p style={styles.sub}>
        Exportieren Sie Ihre Ausgangsrechnungen als DATEV-Buchungsstapel für den Steuerberater und sehen Sie eine
        Vorschau Ihrer Umsatzsteuer-Zahllast. XRechnung/ZUGFeRD versenden Sie weiterhin direkt aus dem Rechnungsmodul.
      </p>

      <div style={styles.card}>
        <div style={styles.row}>
          <label style={styles.lab}>Von<input type="date" style={styles.inp} value={von} onChange={(e) => setVon(e.target.value)} /></label>
          <label style={styles.lab}>Bis<input type="date" style={styles.inp} value={bis} onChange={(e) => setBis(e.target.value)} /></label>
          <a href={`/api/datev-export?von=${von}&bis=${bis}`} target="_blank" rel="noreferrer" style={styles.exportBtn}>⬇ DATEV-Buchungsstapel (CSV)</a>
        </div>
        {!datevKonfig && (
          <div style={styles.hinweis}>
            💡 Tipp: Hinterlegen Sie unter <strong>🔌 Schnittstellen → DATEV</strong> Ihre Kontenrahmen- und
            Beraternummern. Ohne diese Angaben wird ein neutraler, importierbarer Stapel erzeugt.
          </div>
        )}
      </div>

      <h2 style={styles.h2}>USt-Voranmeldung · Vorschau</h2>
      <div style={styles.card}>
        {fehler ? <div style={styles.err}>{fehler}</div> : laden || !summe ? <p style={styles.dim}>Berechne …</p> : (
          <>
            <div style={styles.kacheln}>
              <div style={styles.kachel}><div style={styles.kLabel}>Rechnungen</div><div style={styles.kWert}>{summe.anzahl}</div></div>
              <div style={styles.kachel}><div style={styles.kLabel}>Netto-Umsatz</div><div style={styles.kWert}>{eur(summe.netto)}</div></div>
              <div style={styles.kachel}><div style={styles.kLabel}>Umsatzsteuer (Zahllast)</div><div style={{ ...styles.kWert, color: C.gold }}>{eur(summe.mwst)}</div></div>
              <div style={styles.kachel}><div style={styles.kLabel}>Brutto</div><div style={styles.kWert}>{eur(summe.brutto)}</div></div>
            </div>
            <div style={styles.disclaimer}>
              Dies ist eine <strong>Vorschau der Ausgangs-Umsatzsteuer</strong> für den gewählten Zeitraum — ohne
              Vorsteuer aus Eingangsrechnungen und ohne Sonderfälle. Sie ersetzt keine Steuerberatung. Die tatsächliche
              USt-Voranmeldung erfolgt über ELSTER; die automatische Übermittlung (mit Zertifikat) ist als Brücke vorgesehen.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 860, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  h2: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 19, fontWeight: 700, margin: '24px 0 10px' },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 680 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 },
  row: { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit' },
  exportBtn: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 800, textDecoration: 'none' },
  hinweis: { background: 'rgba(0,229,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.5 },
  kacheln: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 },
  kachel: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
  kLabel: { color: C.textDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' },
  kWert: { fontSize: 22, fontWeight: 800, marginTop: 4 },
  dim: { color: C.textDim, fontSize: 14 },
  disclaimer: { color: C.textDim, fontSize: 12.5, lineHeight: 1.6, background: 'rgba(143,163,190,0.06)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
};
