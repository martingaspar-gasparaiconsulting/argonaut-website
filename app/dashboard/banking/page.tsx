'use client';

// ============================================================
// ARGONAUT OS · Banking-Abgleich (Punkt 11)
// Kontoumsätze (CSV-Export der Bank) gegen offene Rechnungen matchen und
// per Klick als bezahlt markieren. Funktioniert sofort ohne externen Partner.
// Die automatische Bankanbindung (finAPI) ist anschlussfertig vorbereitet,
// aber noch „in Aufbau". Pfad: app/dashboard/banking/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { parseUmsaetzeCsv, matchAlle, zaehleMatches, type MatchZeile, type OffeneRechnung } from '@/lib/bankAbgleich';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }

export default function BankingSeite() {
  const [uid, setUid] = useState<string | null>(null);
  const [offene, setOffene] = useState<OffeneRechnung[]>([]);
  const [csv, setCsv] = useState('');
  const [matches, setMatches] = useState<MatchZeile[] | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [erledigt, setErledigt] = useState<Set<string>>(new Set());
  // Bank-Verbindungen (Mehrbank, in Aufbau)
  const [verbindungen, setVerbindungen] = useState<Array<{ id: string; bank_name: string; verbunden: boolean }>>([]);
  const [verbAuf, setVerbAuf] = useState(false);
  const [bankName, setBankName] = useState('');
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const { data } = await supabase.from('rechnungen')
        .select('id, rechnungsnummer, brutto_summe, zahlungsstatus')
        .in('zahlungsstatus', ['offen', 'teilbezahlt'])
        .limit(2000);
      setOffene(((data as unknown as Array<Record<string, unknown>>) ?? []).map((r) => ({
        id: String(r.id), nummer: String(r.rechnungsnummer ?? ''), brutto: Number(r.brutto_summe) || 0,
      })));
      try {
        const rv = await fetch('/api/banking/verbindung'); const jv = await rv.json();
        if (jv?.ok) setVerbindungen(Array.isArray(jv.verbindungen) ? jv.verbindungen : []);
      } catch { /* egal */ }
    } catch (e) {
      setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      await laden_();
    })();
  }, [laden_]);

  function abgleichen() {
    setFehler(null); setOk(null); setErledigt(new Set());
    const tx = parseUmsaetzeCsv(csv);
    if (tx.length === 0) { setFehler('Keine Umsätze erkannt. Bitte den CSV-Export deiner Bank einfügen (mit Kopfzeile).'); setMatches(null); return; }
    setMatches(matchAlle(tx, offene));
  }

  async function dateiLesen(f: File) {
    const text = await f.text();
    setCsv(text);
  }

  async function alsBezahlt(m: MatchZeile) {
    if (!m.rechnungId) return;
    setBusy(m.rechnungId); setFehler(null);
    try {
      const { error } = await supabase.from('rechnungen').update({
        zahlungsstatus: 'bezahlt', bezahlt_am: new Date().toISOString().slice(0, 10),
        bezahlter_betrag: m.transaktion.betrag, updated_at: new Date().toISOString(),
      }).eq('id', m.rechnungId);
      if (error) throw error;
      setErledigt((s) => new Set(s).add(m.rechnungId as string));
      setOk(`Rechnung ${m.rechnungNummer || ''} als bezahlt markiert.`);
    } catch (e) { setFehler('Markieren fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function verbindungenLaden() {
    try { const rv = await fetch('/api/banking/verbindung'); const jv = await rv.json(); if (jv?.ok) setVerbindungen(Array.isArray(jv.verbindungen) ? jv.verbindungen : []); } catch { /* egal */ }
  }
  async function bankVerbinden() {
    if (!clientId.trim() || !secret.trim()) { setFehler('Bitte Client-ID und Secret eingeben.'); return; }
    setBusy('verb'); setFehler(null);
    try {
      const r = await fetch('/api/banking/verbindung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bank_name: bankName.trim(), client_id: clientId.trim(), secret: secret.trim() }) });
      const j = await r.json();
      if (!j?.ok) { setFehler(j?.error || 'Verbinden fehlgeschlagen.'); return; }
      setBankName(''); setClientId(''); setSecret(''); setVerbAuf(false);
      setOk('Bank-Zugang gespeichert. Der automatische Abruf wird gerade finalisiert.');
      await verbindungenLaden();
    } finally { setBusy(null); }
  }
  async function bankTrennen(id: string) {
    if (!window.confirm('Diesen Bank-Zugang wirklich entfernen?')) return;
    setBusy('verb'); setFehler(null);
    try {
      const r = await fetch(`/api/banking/verbindung?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j?.ok) { setFehler(j?.error || 'Trennen fehlgeschlagen.'); return; }
      await verbindungenLaden();
    } finally { setBusy(null); }
  }

  const kpi = useMemo(() => matches ? zaehleMatches(matches) : { sicher: 0, wahrscheinlich: 0, offen: 0 }, [matches]);

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Finanzen</div>
      <h1 style={styles.h1}>🏦 Banking-Abgleich</h1>
      <p style={styles.sub}>Lade den CSV-Export deiner Kontoumsätze hoch — ARGONAUT gleicht sie automatisch gegen deine offenen Rechnungen ab und du markierst Zahlungseingänge mit einem Klick.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      {/* Bankverbindungen (Mehrbank, in Aufbau) */}
      <div style={styles.verbBox}>
        <span style={styles.beta}>in Aufbau</span>
        <span style={{ color: C.textDim, fontSize: 13.5 }}>🔗 Automatische Bankanbindung (finAPI) — mehrere Banken hinterlegbar, der Auto-Abruf wird gerade finalisiert.</span>
        <span style={{ flex: 1 }} />
        <button style={styles.mini} onClick={() => setVerbAuf((v) => !v)}>{verbAuf ? 'Abbrechen' : '＋ Bank hinzufügen'}</button>
      </div>
      {verbindungen.length > 0 && (
        <div style={{ ...styles.card, marginBottom: 12, padding: '12px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {verbindungen.map((v) => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: C.green, fontWeight: 700 }}>🏦 {v.bank_name}</span>
                <span style={{ ...styles.badge, color: C.cyan, borderColor: C.cyan }}>hinterlegt · Abruf folgt</span>
                <span style={{ flex: 1 }} />
                <button style={styles.mini} disabled={busy === 'verb'} onClick={() => bankTrennen(v.id)}>Entfernen</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {verbAuf && (
        <div style={{ ...styles.card, marginBottom: 14 }}>
          <div style={styles.grid}>
            <label style={styles.lab}>Bank-Name<input style={styles.inp} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="z. B. Sparkasse, Volksbank, N26" /></label>
            <label style={styles.lab}>finAPI Client-ID<input style={styles.inp} value={clientId} onChange={(e) => setClientId(e.target.value)} /></label>
            <label style={styles.lab}>finAPI Secret<input style={styles.inp} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} /></label>
          </div>
          <button style={{ ...styles.primaer, marginTop: 10, opacity: busy === 'verb' ? 0.6 : 1 }} disabled={busy === 'verb'} onClick={bankVerbinden}>🔗 Bank speichern</button>
          <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 8 }}>Verschlüsselt gespeichert, nie im Browser sichtbar. Du kannst beliebig viele Banken hinterlegen. Bis der Auto-Abruf live ist, nutze den CSV-Import unten — der funktioniert sofort.</div>
        </div>
      )}

      {/* CSV-Import */}
      <div style={styles.card}>
        <div style={styles.cardTitel}>Kontoumsätze abgleichen</div>
        <p style={{ color: C.textDim, fontSize: 13.5, margin: '0 0 10px' }}>Exportiere deine Umsätze im Online-Banking als CSV und füge sie hier ein (oder lade die Datei). ARGONAUT erkennt Datum, Betrag und Verwendungszweck automatisch.</p>
        <textarea style={styles.area} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'Buchungstag;Name;Verwendungszweck;Betrag\n20.07.2026;Stadtwerke Böblingen;Rechnung RE-2026-0001;1926,00'} />
        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={styles.primaer} onClick={abgleichen}>🔍 Abgleichen</button>
          <label style={styles.dateiBtn}>📁 CSV-Datei
            <input type="file" accept=".csv,text/csv,text/plain" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void dateiLesen(f); e.target.value = ''; }} />
          </label>
          <span style={{ color: C.textDim, fontSize: 13 }}>{offene.length} offene Rechnung{offene.length === 1 ? '' : 'en'} im Abgleich</span>
        </div>
      </div>

      {matches && (
        <>
          <div style={styles.kpis}>
            <Kpi label="Sicher zugeordnet" value={String(kpi.sicher)} accent={C.green} />
            <Kpi label="Wahrscheinlich" value={String(kpi.wahrscheinlich)} accent={C.warn} />
            <Kpi label="Ohne Treffer" value={String(kpi.offen)} accent={C.textDim} />
          </div>
          <div style={{ ...styles.card, marginTop: 14, overflowX: 'auto' }}>
            <table style={styles.tab}>
              <thead><tr>
                <th style={styles.th}>Datum</th><th style={styles.th}>Verwendungszweck</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Betrag</th><th style={styles.th}>Rechnung</th><th style={styles.th}></th>
              </tr></thead>
              <tbody>
                {matches.map((m, i) => {
                  const done = m.rechnungId ? erledigt.has(m.rechnungId) : false;
                  return (
                    <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={styles.td}>{m.transaktion.datum || '—'}</td>
                      <td style={styles.td}>
                        <div>{m.transaktion.verwendungszweck || '—'}</div>
                        {m.transaktion.name && <div style={{ color: C.textDim, fontSize: 12 }}>{m.transaktion.name}</div>}
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700, color: C.green }}>{eur(m.transaktion.betrag)}</td>
                      <td style={styles.td}>
                        {m.rechnungNummer
                          ? <span><b>{m.rechnungNummer}</b> <span style={{ ...styles.badge, color: m.sicher ? C.green : C.warn, borderColor: m.sicher ? C.green : C.warn }}>{m.sicher ? 'sicher' : 'wahrscheinlich'}</span></span>
                          : <span style={{ color: C.textDim, fontSize: 12.5 }}>{m.grund}</span>}
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {m.rechnungId && (done
                          ? <span style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>✓ erledigt</span>
                          : <button style={styles.gruen} disabled={busy === m.rechnungId} onClick={() => alsBezahlt(m)}>✓ als bezahlt</button>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (<div style={styles.kpi}><div style={{ ...styles.kWert, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div></div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px', maxWidth: 1000, margin: '0 auto' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 820, lineHeight: 1.5 },
  verbBox: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 12 },
  beta: { background: 'rgba(0,229,255,0.12)', color: C.cyan, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 6 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 18px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  area: { width: '100%', minHeight: 120, background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 13.5, fontFamily: 'ui-monospace, monospace', boxSizing: 'border-box', resize: 'vertical' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 'clamp(13.5px, 1.2vw, 18px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  dateiBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  gruen: { background: 'transparent', color: C.green, border: `1px solid ${C.green}66`, borderRadius: 8, padding: '6px 11px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 24, fontWeight: 800, lineHeight: 1.1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  tab: { width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 640 },
  th: { textAlign: 'left', color: C.textDim, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 10px', fontWeight: 700 },
  td: { padding: '10px', verticalAlign: 'middle' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700 },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 14, background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
