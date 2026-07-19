'use client';

// ============================================================
// ARGONAUT OS · Welle 4 · Command Center · KI-Verbrauch
// Zeigt die echten KI-Kosten (aus ki_nutzung) — je Kunde und je Funktion.
// Daten kommen admin-geschützt aus /api/admin/verbrauch.
// Pfad: app/admin/verbrauch/page.tsx
// ============================================================

import { useState, useEffect, CSSProperties } from 'react';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666',
};

type KundeZeile = { name: string; anzahl: number; tokRein: number; tokRaus: number; kostenUsd: number };
type RouteZeile = { route: string; anzahl: number; kostenUsd: number };
type SpeicherZeile = { name: string; bytes: number; dateien: number; limitBytes: number; prozent: number; voll: boolean };
type Speicher = { ok: boolean; totalBytes: number; limitGbDefault: number; proKunde: SpeicherZeile[] };
type Daten = {
  monat: { kostenUsd: number; calls: number; proKunde: KundeZeile[]; proRoute: RouteZeile[] };
  gesamt: { kostenUsd: number; calls: number };
  speicher?: Speicher;
  error?: string; detail?: string;
};

const EUR_KURS = 0.92; // grobe USD→EUR-Schätzung
function usd(n: number) { return '$' + (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function eur(n: number) { return ((Number(n) || 0) * EUR_KURS).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function tok(n: number) { return (Number(n) || 0).toLocaleString('de-DE'); }
function groesse(bytes: number) {
  const b = Number(bytes) || 0;
  if (b >= 1024 ** 3) return (b / 1024 ** 3).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' GB';
  if (b >= 1024 ** 2) return (b / 1024 ** 2).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MB';
  if (b >= 1024) return (b / 1024).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' KB';
  return b + ' B';
}

export default function VerbrauchPage() {
  const [daten, setDaten] = useState<Daten | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/verbrauch');
        if (res.status === 401 || res.status === 403) { setFehler('Kein Zugriff — nur für Admins.'); setLaden(false); return; }
        const j = (await res.json()) as Daten;
        if (j.error) { setFehler(j.error + (j.detail ? ` (${j.detail})` : '')); setLaden(false); return; }
        setDaten(j);
      } catch {
        setFehler('Verbrauchsdaten konnten nicht geladen werden.');
      } finally { setLaden(false); }
    })();
  }, []);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>⚡ KI-Verbrauch &amp; Kosten</h1>
      <p style={styles.sub}>Echte Kosten aus jedem KI-Aufruf (Tokens × Modellpreis). Quelle: <code>ki_nutzung</code>. Preise in USD, EUR ist eine grobe Schätzung.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {laden ? <p style={styles.dim}>Lädt …</p> : daten && (
        <>
          <div style={styles.kpis}>
            <div style={styles.kpi}><div style={styles.kLabel}>KI-Kosten diesen Monat</div><div style={{ ...styles.kWert, color: C.gold }}>{usd(daten.monat.kostenUsd)}</div><div style={styles.kSub}>≈ {eur(daten.monat.kostenUsd)}</div></div>
            <div style={styles.kpi}><div style={styles.kLabel}>Aufrufe diesen Monat</div><div style={{ ...styles.kWert, color: C.cyan }}>{daten.monat.calls.toLocaleString('de-DE')}</div></div>
            <div style={styles.kpi}><div style={styles.kLabel}>KI-Kosten gesamt</div><div style={{ ...styles.kWert, color: C.green }}>{usd(daten.gesamt.kostenUsd)}</div><div style={styles.kSub}>≈ {eur(daten.gesamt.kostenUsd)} · {daten.gesamt.calls.toLocaleString('de-DE')} Aufrufe</div></div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitel}>Kosten je Kunde (dieser Monat)</div>
            {daten.monat.proKunde.length === 0 ? <p style={styles.dim}>Noch keine KI-Aufrufe in diesem Monat erfasst.</p> : (
              <table style={styles.table}>
                <thead><tr><th style={styles.th}>Kunde</th><th style={styles.thR}>Aufrufe</th><th style={styles.thR}>Tokens (rein/raus)</th><th style={styles.thR}>Kosten</th></tr></thead>
                <tbody>
                  {daten.monat.proKunde.map((k, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{k.name}</td>
                      <td style={styles.tdR}>{k.anzahl.toLocaleString('de-DE')}</td>
                      <td style={styles.tdR}>{tok(k.tokRein)} / {tok(k.tokRaus)}</td>
                      <td style={{ ...styles.tdR, fontWeight: 700, color: C.gold }}>{usd(k.kostenUsd)}<span style={styles.eurMini}> ≈ {eur(k.kostenUsd)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ ...styles.card, marginTop: 16 }}>
            <div style={styles.cardTitel}>Kosten je Funktion (dieser Monat)</div>
            {daten.monat.proRoute.length === 0 ? <p style={styles.dim}>Noch keine Daten.</p> : (
              <table style={styles.table}>
                <thead><tr><th style={styles.th}>Funktion / Route</th><th style={styles.thR}>Aufrufe</th><th style={styles.thR}>Kosten</th></tr></thead>
                <tbody>
                  {daten.monat.proRoute.map((r, i) => (
                    <tr key={i}>
                      <td style={styles.td}><code>{r.route}</code></td>
                      <td style={styles.tdR}>{r.anzahl.toLocaleString('de-DE')}</td>
                      <td style={{ ...styles.tdR, fontWeight: 700, color: C.gold }}>{usd(r.kostenUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ ...styles.card, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <div style={styles.cardTitel}>Speicher je Kunde</div>
              {daten.speicher?.ok && <div style={{ color: C.textDim, fontSize: 13 }}>Gesamt belegt: <b style={{ color: C.text }}>{groesse(daten.speicher.totalBytes)}</b> · Standard-Limit {daten.speicher.limitGbDefault} GB/Kunde</div>}
            </div>
            {!daten.speicher?.ok ? <p style={styles.dim}>Speicher-Auswertung nicht verfügbar (SQL <code>welle4-speicher-verbrauch.sql</code> eingespielt?).</p>
              : daten.speicher.proKunde.length === 0 ? <p style={styles.dim}>Noch keine Dateien in den Buckets.</p> : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Kunde</th><th style={styles.thR}>Dateien</th><th style={styles.thR}>Belegt</th><th style={{ ...styles.th, width: '34%' }}>Auslastung</th></tr></thead>
                  <tbody>
                    {daten.speicher.proKunde.map((s, i) => (
                      <tr key={i}>
                        <td style={styles.td}>{s.name}{s.voll && <span style={styles.upg}>⬆ Upgrade</span>}</td>
                        <td style={styles.tdR}>{s.dateien.toLocaleString('de-DE')}</td>
                        <td style={styles.tdR}>{groesse(s.bytes)} <span style={styles.eurMini}>/ {groesse(s.limitBytes)}</span></td>
                        <td style={styles.td}>
                          <div style={styles.balken}><div style={{ ...styles.balkenFill, width: `${Math.min(100, s.prozent)}%`, background: s.voll ? C.danger : (s.prozent >= 50 ? C.gold : C.green) }} /></div>
                          <span style={{ color: C.textDim, fontSize: 12 }}>{s.prozent}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>

          <div style={styles.info}>
            Hinweis: „KI unbegrenzt" für den Kunden bleibt bestehen — dieses Panel ist deine <b style={{ color: C.text }}>interne Marge- &amp; Ressourcen-Kontrolle</b>.
            Du siehst sofort, welcher Kunde KI-Kosten treibt oder ans Speicher-Limit stößt, und kannst gezielt gegensteuern (Regel statt KI, Modellwahl, Rate-Limit, Upgrade-Angebot).
            Das Standard-Speicherlimit ({daten.speicher?.limitGbDefault ?? 25} GB) ist zentral in der Route anpassbar bzw. später je Paket ableitbar.
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '24px 20px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', minHeight: '100vh', background: C.navy },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 28, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 14.5, lineHeight: 1.5, margin: '8px 0 18px', maxWidth: 820 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  kLabel: { color: C.textDim, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  kWert: { fontSize: 30, fontWeight: 800, lineHeight: 1.1, marginTop: 6 },
  kSub: { color: C.textDim, fontSize: 12.5, marginTop: 4 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 16, marginBottom: 10 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${C.border}` },
  thR: { textAlign: 'right', padding: '8px 10px', fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${C.border}` },
  td: { padding: '10px', borderBottom: '1px solid rgba(143,163,190,0.08)' },
  tdR: { padding: '10px', borderBottom: '1px solid rgba(143,163,190,0.08)', textAlign: 'right' },
  eurMini: { color: C.textDim, fontWeight: 400, fontSize: 12 },
  upg: { marginLeft: 8, color: C.danger, border: `1px solid ${C.danger}`, borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700 },
  balken: { height: 8, background: 'rgba(143,163,190,0.15)', borderRadius: 999, overflow: 'hidden', marginBottom: 4 },
  balkenFill: { height: '100%', borderRadius: 999 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 6 },
  info: { marginTop: 18, background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.22)', borderRadius: 12, padding: '13px 16px', color: C.textDim, fontSize: 12.5, lineHeight: 1.55 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 14 },
};
