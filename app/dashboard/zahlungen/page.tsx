'use client';

// ============================================================
// ARGONAUT OS · Zahlungen · Ein- & Ausgänge
// EIN Blick auf alles Geld: was kam rein (Kundenzahlungen) und was ging raus
// (Belege/Lieferantenrechnungen + laufende Verträge/Abos).
//   · Eingänge: erhaltene Rechnungen + vom Kunden gemeldete (1-Klick bestätigen)
//   · Ausgänge: Belege als bezahlt markieren + monatliche Abo-Summe
// Verzahnung vorhandener Daten. Später füttert das Banktool genau diese Ansicht.
// SQL: supabase-sql/verzahnung-zahlung-melden.sql
// Pfad: app/dashboard/zahlungen/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Leerzustand from '../_components/Leerzustand';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Rechnung = { id: string; rechnungsnummer: string | null; titel: string | null; empfaenger_name: string | null; brutto_summe: number | null; zahlungsstatus: string | null; bezahlt_am: string | null; zahlung_gemeldet_am: string | null };
type Beleg = { id: string; lieferant: string | null; belegnummer: string | null; belegdatum: string | null; brutto: number | null; kategorie: string | null; bezahlt_am: string | null };
type Vertrag = { id: string; bezeichnung: string; kategorie: string | null; kosten_betrag: number | null; kosten_intervall: string | null; status: string | null };

function eur(n: number | null | undefined) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function dtag(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function heute() { return new Date().toISOString().slice(0, 10); }
function monatlich(betrag: number, intervall: string | null): number {
  const b = Number(betrag) || 0;
  switch (intervall) { case 'monatlich': return b; case 'quartalsweise': return b / 3; case 'jaehrlich': return b / 12; default: return 0; }
}

export default function ZahlungenPage() {
  const [tab, setTab] = useState<'ein' | 'aus'>('ein');
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([]);
  const [belege, setBelege] = useState<Beleg[]>([]);
  const [vertraege, setVertraege] = useState<Vertrag[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    const versuch = async (fn: () => Promise<void>) => { try { await fn(); } catch { /* Tabelle evtl. fehlt */ } };
    await versuch(async () => {
      const { data } = await supabase.from('rechnungen').select('id, rechnungsnummer, titel, empfaenger_name, brutto_summe, zahlungsstatus, bezahlt_am, zahlung_gemeldet_am').neq('zahlungsstatus', 'storniert').order('rechnungsdatum', { ascending: false }).limit(500);
      setRechnungen((data as Rechnung[]) ?? []);
    });
    await versuch(async () => {
      const { data } = await supabase.from('eingangsbelege').select('id, lieferant, belegnummer, belegdatum, brutto, kategorie, bezahlt_am').order('belegdatum', { ascending: false }).limit(500);
      setBelege((data as Beleg[]) ?? []);
    });
    await versuch(async () => {
      const { data } = await supabase.from('vertraege').select('id, bezeichnung, kategorie, kosten_betrag, kosten_intervall, status').limit(500);
      setVertraege((data as Vertrag[]) ?? []);
    });
    setLaden(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      await laden_();
    })();
  }, [laden_]);

  async function eingangBestaetigen(r: Rechnung) {
    setBusy(r.id);
    try {
      await supabase.from('rechnungen').update({ zahlungsstatus: 'bezahlt', bezahlt_am: heute(), bezahlter_betrag: Number(r.brutto_summe) || 0 }).eq('id', r.id);
      await laden_();
    } catch { setFehler('Bestätigen fehlgeschlagen.'); }
    finally { setBusy(null); }
  }
  async function belegBezahlt(b: Beleg, an: boolean) {
    setBusy(b.id);
    try {
      await supabase.from('eingangsbelege').update({ bezahlt_am: an ? heute() : null }).eq('id', b.id);
      await laden_();
    } catch { setFehler('Speichern fehlgeschlagen.'); }
    finally { setBusy(null); }
  }

  const gemeldet = useMemo(() => rechnungen.filter((r) => r.zahlung_gemeldet_am && !r.bezahlt_am), [rechnungen]);
  const erhalten = useMemo(() => rechnungen.filter((r) => r.bezahlt_am).sort((a, b) => (b.bezahlt_am || '').localeCompare(a.bezahlt_am || '')), [rechnungen]);
  const offeneBelege = useMemo(() => belege.filter((b) => !b.bezahlt_am), [belege]);
  const bezahlteBelege = useMemo(() => belege.filter((b) => b.bezahlt_am).sort((a, b) => (b.bezahlt_am || '').localeCompare(a.bezahlt_am || '')), [belege]);
  const abos = useMemo(() => vertraege.filter((v) => (v.status || 'aktiv') === 'aktiv' && monatlich(v.kosten_betrag || 0, v.kosten_intervall) > 0).sort((a, b) => monatlich(b.kosten_betrag || 0, b.kosten_intervall) - monatlich(a.kosten_betrag || 0, a.kosten_intervall)), [vertraege]);

  const kEin = { erhalten: erhalten.reduce((s, r) => s + (Number(r.brutto_summe) || 0), 0), zuBestaetigen: gemeldet.length };
  const kAus = { bezahlt: bezahlteBelege.reduce((s, b) => s + (Number(b.brutto) || 0), 0), offen: offeneBelege.reduce((s, b) => s + (Number(b.brutto) || 0), 0), abosMonat: abos.reduce((s, v) => s + monatlich(v.kosten_betrag || 0, v.kosten_intervall), 0) };

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>💸 Zahlungen · Ein- & Ausgänge</h1>
      <p style={styles.sub}>Alles Geld auf einen Blick: was reinkam (Kundenzahlungen) und was rausging (Belege &amp; laufende Abos). Vom Kunden gemeldete Zahlungen bestätigst du mit einem Klick — später übernimmt das die Bankanbindung automatisch.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'ein' ? styles.tabAktiv : {}) }} onClick={() => setTab('ein')}>⬇ Eingänge{kEin.zuBestaetigen > 0 ? <span style={styles.dot}>{kEin.zuBestaetigen}</span> : null}</button>
        <button style={{ ...styles.tab, ...(tab === 'aus' ? styles.tabAktiv : {}) }} onClick={() => setTab('aus')}>⬆ Ausgänge</button>
      </div>

      {laden ? <p style={styles.dim}>Lädt …</p> : tab === 'ein' ? (
        <>
          <div style={styles.kpis}>
            <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.green }}>{eur(kEin.erhalten)}</div><div style={styles.kLabel}>erhalten (bezahlt)</div></div>
            <div style={{ ...styles.kpi, borderColor: kEin.zuBestaetigen ? `${C.gold}66` : C.border }}><div style={{ ...styles.kWert, color: kEin.zuBestaetigen ? C.gold : C.text }}>{kEin.zuBestaetigen}</div><div style={styles.kLabel}>vom Kunden gemeldet</div></div>
          </div>

          <section style={styles.card}>
            <div style={styles.titel}>💬 Vom Kunden gemeldet — bitte bestätigen</div>
            {gemeldet.length === 0 ? <p style={styles.dim}>Keine offenen Meldungen. Sobald ein Kunde im Portal „Ich habe bezahlt" klickt, erscheint die Rechnung hier.</p> : (
              <div style={{ marginTop: 8 }}>
                {gemeldet.map((r) => (
                  <div key={r.id} style={styles.zeile}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{r.rechnungsnummer || '—'}</b>{r.empfaenger_name ? <span style={{ color: C.textDim }}> · {r.empfaenger_name}</span> : null}
                      <br /><span style={{ color: C.textDim, fontSize: 13 }}>gemeldet am {dtag(r.zahlung_gemeldet_am)}</span>
                    </span>
                    <b style={{ whiteSpace: 'nowrap' }}>{eur(r.brutto_summe)}</b>
                    <button style={styles.btnGruen} disabled={busy === r.id} onClick={() => eingangBestaetigen(r)}>{busy === r.id ? '…' : '✓ Als bezahlt bestätigen'}</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={styles.card}>
            <div style={styles.titel}>✅ Erhaltene Zahlungen</div>
            {erhalten.length === 0 ? <Leerzustand icon="✅" titel="Noch keine Zahlungseingänge" text="Sobald Kundenrechnungen bezahlt sind, erscheinen sie hier." schritte={["Rechnung im Modul „Rechnungen“ stellen", "Zahlung erfassen oder vom Kunden bestätigen lassen", "Eingang taucht automatisch hier auf"]} /> : (
              <div style={{ marginTop: 8 }}>
                {erhalten.slice(0, 100).map((r) => (
                  <div key={r.id} style={styles.zeileMini}>
                    <span style={{ flex: 1, minWidth: 0 }}><b>{r.rechnungsnummer || '—'}</b>{r.empfaenger_name ? <span style={{ color: C.textDim }}> · {r.empfaenger_name}</span> : null}</span>
                    <span style={{ color: C.textDim, fontSize: 13, whiteSpace: 'nowrap' }}>{dtag(r.bezahlt_am)}</span>
                    <b style={{ color: C.green, whiteSpace: 'nowrap' }}>{eur(r.brutto_summe)}</b>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <div style={styles.kpis}>
            <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.warn }}>{eur(kAus.offen)}</div><div style={styles.kLabel}>Belege offen</div></div>
            <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.textDim }}>{eur(kAus.bezahlt)}</div><div style={styles.kLabel}>Belege bezahlt</div></div>
            <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.gold }}>{eur(kAus.abosMonat)}</div><div style={styles.kLabel}>laufende Abos / Monat</div></div>
          </div>

          <section style={styles.card}>
            <div style={styles.titel}>🧾 Belege / Eingangsrechnungen</div>
            {belege.length === 0 ? <p style={styles.dim}>Keine Belege. Lade sie in der Beleg-Inbox hoch.</p> : (
              <div style={{ marginTop: 8 }}>
                {[...offeneBelege, ...bezahlteBelege].slice(0, 200).map((b) => (
                  <div key={b.id} style={styles.zeile}>
                    <input type="checkbox" checked={!!b.bezahlt_am} disabled={busy === b.id} onChange={(e) => belegBezahlt(b, e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{b.lieferant || 'Beleg'}</b>{b.kategorie ? <span style={{ color: C.textDim }}> · {b.kategorie}</span> : null}
                      <br /><span style={{ color: C.textDim, fontSize: 13 }}>{dtag(b.belegdatum)}{b.bezahlt_am ? ` · bezahlt ${dtag(b.bezahlt_am)}` : ''}</span>
                    </span>
                    <b style={{ whiteSpace: 'nowrap', color: b.bezahlt_am ? C.textDim : C.text }}>{eur(b.brutto)}</b>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={styles.card}>
            <div style={styles.titel}>🔁 Laufende Verträge & Abos</div>
            {abos.length === 0 ? <p style={styles.dim}>Keine laufenden Kosten erfasst. Trage sie unter „Verträge" ein.</p> : (
              <div style={{ marginTop: 8 }}>
                {abos.map((v) => (
                  <div key={v.id} style={styles.zeileMini}>
                    <span style={{ flex: 1, minWidth: 0 }}><b>{v.bezeichnung}</b>{v.kategorie ? <span style={{ color: C.textDim }}> · {v.kategorie}</span> : null}</span>
                    <span style={{ color: C.textDim, fontSize: 13, whiteSpace: 'nowrap' }}>{eur(v.kosten_betrag)} / {v.kosten_intervall}</span>
                    <b style={{ whiteSpace: 'nowrap' }}>{eur(monatlich(v.kosten_betrag || 0, v.kosten_intervall))}<span style={{ color: C.textDim, fontWeight: 400, fontSize: 12 }}> /Mon.</span></b>
                  </div>
                ))}
                <div style={{ ...styles.zeileMini, borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 10 }}>
                  <span style={{ flex: 1, fontWeight: 700 }}>Summe laufende Abos</span>
                  <b style={{ color: C.gold }}>{eur(kAus.abosMonat)} <span style={{ color: C.textDim, fontWeight: 400, fontSize: 12 }}>/Mon.</span></b>
                </div>
              </div>
            )}
          </section>
        </>
      )}
      <p style={styles.disclaimer}>Überblick aus deinen erfassten Daten. „Bestätigen" bzw. das Häkchen setzen den Zahlungsstatus manuell — sobald die Bankanbindung aktiv ist, gleicht sie Ein- und Ausgänge automatisch mit dem Konto ab.</p>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 940, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 840 },
  tabs: { display: 'flex', gap: 8, marginTop: 18 },
  tab: { background: C.navy2, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 18px', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 },
  tabAktiv: { background: C.gold, color: C.navy, borderColor: C.gold },
  dot: { background: C.danger, color: '#fff', borderRadius: 999, padding: '1px 8px', fontSize: 12, fontWeight: 800 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '16px 0' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px', textAlign: 'center' },
  kWert: { fontSize: 21, fontWeight: 800, lineHeight: 1.1 },
  kLabel: { color: C.textDim, fontSize: 12, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 20px', marginTop: 14 },
  titel: { fontWeight: 800, fontSize: 16 },
  zeile: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '11px 0', borderTop: '1px solid rgba(143,163,190,0.08)' },
  zeileMini: { display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(143,163,190,0.06)', fontSize: 14 },
  btnGruen: { background: 'transparent', color: C.green, border: `1px solid ${C.green}66`, borderRadius: 9, padding: '8px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  disclaimer: { color: C.textDim, fontSize: 12.5, marginTop: 18, lineHeight: 1.5 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
