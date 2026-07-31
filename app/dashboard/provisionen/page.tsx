'use client';

// ============================================================
// ARGONAUT OS · Vertrieb · Provisionsverwaltung
// Verkaufsprovisionen aus GEWONNENEN Deals: Satz + Empfänger je Deal
// pflegen, Betrag automatisch rechnen, offen/ausgezahlt trennen und
// je Empfänger zusammenfassen. Logik aus lib/provision (0 €, node-getestet).
// Tabelle: crm_deal (Provisions-Spalten). Pfad: app/dashboard/provisionen/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import KiAuge from '../_components/KiAuge';
import Leerzustand from '../_components/Leerzustand';
import { augeProvisionen } from '@/lib/auge';
import { provisionBetrag, proEmpfaenger, provisionSummen, empfaengerName, formatEuro } from '@/lib/provision';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Deal = {
  id: string; titel: string; firma: string | null; wert_netto: number | null; stufe: string;
  provision_prozent: number | null; provision_empfaenger: string | null;
  provision_ausgezahlt: boolean | null; provision_ausgezahlt_am: string | null;
};

function eur(n: unknown) { return formatEuro(n); }
function heuteISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d: string | null) { return d ? d.split('-').reverse().join('.') : ''; }

export default function ProvisionenSeite() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // lokale Eingabewerte je Deal (Satz/Empfänger), bevor gespeichert wird
  const [entwurf, setEntwurf] = useState<Record<string, { prozent: string; empfaenger: string }>>({});

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const { data, error } = await supabase
        .from('crm_deal')
        .select('id, titel, firma, wert_netto, stufe, provision_prozent, provision_empfaenger, provision_ausgezahlt, provision_ausgezahlt_am')
        .eq('stufe', 'gewonnen')
        .order('erstellt_am', { ascending: false });
      if (error) throw error;
      const ds = (data as Deal[]) ?? [];
      setDeals(ds);
      const e: Record<string, { prozent: string; empfaenger: string }> = {};
      ds.forEach((d) => { e[d.id] = { prozent: d.provision_prozent != null ? String(d.provision_prozent) : '', empfaenger: d.provision_empfaenger ?? '' }; });
      setEntwurf(e);
    } catch (err) {
      setFehler('Laden fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user?.id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      await laden_();
    })();
  }, [laden_]);

  const summen = useMemo(() => provisionSummen(deals), [deals]);
  const gruppen = useMemo(() => proEmpfaenger(deals), [deals]);

  function setEntwurfFeld(id: string, feld: 'prozent' | 'empfaenger', wert: string) {
    setEntwurf((e) => ({ ...e, [id]: { ...(e[id] ?? { prozent: '', empfaenger: '' }), [feld]: wert } }));
  }

  async function speichern(d: Deal) {
    const e = entwurf[d.id] ?? { prozent: '', empfaenger: '' };
    const prozent = e.prozent.trim() === '' ? null : parseFloat(e.prozent.replace(',', '.')) || 0;
    setBusy(d.id); setFehler(null);
    try {
      const { error } = await supabase.from('crm_deal')
        .update({ provision_prozent: prozent, provision_empfaenger: e.empfaenger.trim() || null })
        .eq('id', d.id);
      if (error) throw error;
      await laden_();
    } catch (err) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function ausgezahltSetzen(d: Deal, wert: boolean) {
    setBusy(d.id); setFehler(null);
    try {
      const { error } = await supabase.from('crm_deal')
        .update({ provision_ausgezahlt: wert, provision_ausgezahlt_am: wert ? heuteISO() : null })
        .eq('id', d.id);
      if (error) throw error;
      await laden_();
    } catch (err) { setFehler('Aktualisieren fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  const augeRegel = augeProvisionen({
    offen: summen.offen, ausgezahlt: summen.ausgezahlt, gesamt: summen.gesamt,
    anzahlDeals: summen.anzahlDeals, anzahlEmpfaenger: summen.anzahlEmpfaenger,
  });

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Vertrieb</div>
      <div style={styles.kopf}>
        <div>
          <h1 style={styles.h1}>💰 Provisionen</h1>
          <p style={styles.sub}>Für jeden gewonnenen Deal legst du einen Provisionssatz und einen Empfänger fest — ARGONAUT rechnet den Betrag und trennt offen von ausgezahlt.</p>
        </div>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.kpis}>
        <Kpi label="Provision gesamt" value={eur(summen.gesamt)} accent={C.gold} />
        <Kpi label="Offen" value={eur(summen.offen)} accent={C.warn} sub={`${summen.anzahlDeals} Deals`} />
        <Kpi label="Ausgezahlt" value={eur(summen.ausgezahlt)} accent={C.green} />
        <Kpi label="Empfänger" value={String(summen.anzahlEmpfaenger)} accent={C.text} />
      </div>

      {!laden && <div style={{ marginBottom: 14 }}><KiAuge modul="Provisionen" regel={augeRegel} /></div>}

      {laden ? (
        <div style={styles.hint}>Lädt …</div>
      ) : deals.length === 0 ? (
        <Leerzustand icon="💰" titel="Noch keine gewonnenen Deals"
          text={'Sobald du in der Deal-Pipeline einen Deal auf „Gewonnen" setzt, erscheint er hier zur Provisionsabrechnung.'}
          schritte={['Deal in der Pipeline auf „Gewonnen" ziehen', 'Hier Satz (%) und Empfänger eintragen', 'Nach Zahlung „ausgezahlt" markieren']}
          aktionText="Zur Deal-Pipeline" aktionHref="/dashboard/pipeline" />
      ) : (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Gewonnene Deals</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.tab}>
                <thead>
                  <tr>
                    <th style={styles.th}>Deal</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Wert netto</th>
                    <th style={{ ...styles.th, width: 90 }}>Satz %</th>
                    <th style={styles.th}>Empfänger</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Provision</th>
                    <th style={{ ...styles.th, textAlign: 'center' }}>Status</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((d) => {
                    const e = entwurf[d.id] ?? { prozent: '', empfaenger: '' };
                    const betrag = provisionBetrag({ ...d, provision_prozent: e.prozent === '' ? null : e.prozent, provision_empfaenger: e.empfaenger });
                    const geaendert = (e.prozent || '') !== (d.provision_prozent != null ? String(d.provision_prozent) : '') || (e.empfaenger || '') !== (d.provision_empfaenger ?? '');
                    return (
                      <tr key={d.id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={styles.td}>
                          <div style={{ fontWeight: 700 }}>{d.titel}</div>
                          {d.firma && <div style={{ color: C.textDim, fontSize: 12 }}>{d.firma}</div>}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', color: C.gold, fontWeight: 700 }}>{eur(d.wert_netto)}</td>
                        <td style={styles.td}>
                          <input style={styles.inpMini} inputMode="decimal" value={e.prozent} disabled={busy === d.id}
                            onChange={(ev) => setEntwurfFeld(d.id, 'prozent', ev.target.value)} placeholder="0" />
                        </td>
                        <td style={styles.td}>
                          <input style={styles.inp} value={e.empfaenger} disabled={busy === d.id}
                            onChange={(ev) => setEntwurfFeld(d.id, 'empfaenger', ev.target.value)} placeholder="z. B. Verkäufer-Name" />
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 800 }}>{eur(betrag)}</td>
                        <td style={{ ...styles.td, textAlign: 'center' }}>
                          {d.provision_ausgezahlt
                            ? <span style={{ color: C.green, fontWeight: 700, fontSize: 12.5 }}>✓ ausgezahlt{d.provision_ausgezahlt_am ? ` · ${fmtDate(d.provision_ausgezahlt_am)}` : ''}</span>
                            : <span style={{ color: C.warn, fontWeight: 700, fontSize: 12.5 }}>offen</span>}
                        </td>
                        <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                          {geaendert
                            ? <button style={styles.btnGold} disabled={busy === d.id} onClick={() => speichern(d)}>Speichern</button>
                            : d.provision_ausgezahlt
                              ? <button style={styles.btnGhost} disabled={busy === d.id} onClick={() => ausgezahltSetzen(d, false)}>Rückgängig</button>
                              : <button style={styles.btnGreen} disabled={busy === d.id || provisionBetrag(d) <= 0} onClick={() => ausgezahltSetzen(d, true)}>Als ausgezahlt</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {gruppen.length > 0 && (
            <div style={{ ...styles.card, marginTop: 16 }}>
              <div style={styles.cardTitel}>Nach Empfänger</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.tab}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Empfänger</th>
                      <th style={{ ...styles.th, textAlign: 'center' }}>Deals</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Offen</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Ausgezahlt</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Gesamt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gruppen.map((g) => (
                      <tr key={g.empfaenger} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ ...styles.td, fontWeight: 700 }}>{g.empfaenger}</td>
                        <td style={{ ...styles.td, textAlign: 'center' }}>{g.anzahl}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: C.warn }}>{eur(g.offen)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: C.green }}>{eur(g.ausgezahlt)}</td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 800 }}>{eur(g.gesamt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (<div style={styles.kpi}><div style={{ ...styles.kWert, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div>{sub ? <div style={styles.kSub}>{sub}</div> : null}</div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  kopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 820, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, margin: '10px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 22, fontWeight: 800, lineHeight: 1.1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  kSub: { color: C.textDim, fontSize: 11, marginTop: 3 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  tab: { width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 720 },
  th: { textAlign: 'left', color: C.textDim, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 10px', fontWeight: 700 },
  td: { padding: '10px', verticalAlign: 'middle' },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 14, fontFamily: 'inherit', width: '100%', minWidth: 120, boxSizing: 'border-box' },
  inpMini: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 14, fontFamily: 'inherit', width: 70, boxSizing: 'border-box' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 8, padding: '7px 13px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  btnGreen: { background: 'transparent', color: C.green, border: `1px solid ${C.green}66`, borderRadius: 8, padding: '7px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
