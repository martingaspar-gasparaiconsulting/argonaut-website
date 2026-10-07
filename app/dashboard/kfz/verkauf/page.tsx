'use client';

// ============================================================
// ARGONAUT OS · Paket 266 · K6 Verkäufe auf einen Blick
// Alle Verkaufsvorgänge des Betriebs: Status, Käufer, offener Betrag,
// abgelaufene Reservierungen, offene GwG-Identifizierung, fehlende Unterschriften.
// Bearbeitet wird in der Handelsakte (Reiter „Verkauf").
// Pfad: app/dashboard/kfz/verkauf/page.tsx — Unterpfad von /dashboard/kfz, erbt dessen Freigabe.
// ============================================================

import { useState, useEffect, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { VERKAUF_STATUS, betraege, gwgNoetig, statusLabel, geld, type Verkauf } from '@/lib/kfzVerkauf';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };
const FARBE: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad, info: C.info, gold: C.gold, dim: C.dim };

type Zeile = Verkauf & { id: string; bestand_id: string; erstellt_am: string };
type Fz = { id: string; interne_nr: string | null; marke: string | null; modell: string | null };

function heute(): string { return new Date().toISOString().slice(0, 10); }
function de(iso: string | null): string { return iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—'; }

export default function VerkaeufePage() {
  const [liste, setListe] = useState<Zeile[]>([]);
  const [fz, setFz] = useState<Record<string, Fz>>({});
  const [filter, setFilter] = useState<string>('laufend');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.from('kfz_verkauf').select('*').order('erstellt_am', { ascending: false }).limit(1000);
      if (error) { setFehler('Verkäufe lassen sich nicht laden. Ist SQL Paket 266 ausgeführt und haben Sie das Recht „KFZ"?'); setLaden(false); return; }
      const z = ((data as unknown) as Zeile[]) ?? [];
      setListe(z);
      const ids = [...new Set(z.map((x) => x.bestand_id))];
      if (ids.length) {
        const b = await supabase.from('kfz_bestand').select('id, interne_nr, marke, modell').in('id', ids);
        const m: Record<string, Fz> = {};
        for (const r of ((b.data as unknown) as Fz[]) ?? []) m[r.id] = r;
        setFz(m);
      }
      setLaden(false);
    })();
  }, []);

  const tag = heute();
  const gezeigt = useMemo(() => liste.filter((v) => filter === 'alle' ? true : filter === 'laufend' ? ['angebot', 'reserviert', 'vertrag'].includes(v.status) : v.status === filter), [liste, filter]);
  const zahl = (k: string) => liste.filter((v) => v.status === k).length;
  const abgelaufen = liste.filter((v) => v.status === 'reserviert' && v.reserviert_bis && v.reserviert_bis < tag).length;
  const gwgOffen = liste.filter((v) => v.status !== 'storniert' && gwgNoetig(v) && !v.gwg_erledigt).length;
  const offenSumme = liste.filter((v) => v.status === 'vertrag').reduce((s, v) => s + Math.max(0, betraege(v).rest), 0);

  return (
    <div style={s.page}>
      <a href="/dashboard/kfz" style={s.zurueck}>← KFZ-Fachpaket</a>
      <h1 style={s.h1}>🤝 Verkäufe</h1>
      <p style={s.dim}>Alle Verkaufsvorgänge auf einen Blick. Angelegt und bearbeitet wird in der Handelsakte des Fahrzeugs (Reiter „Verkauf").</p>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      <div style={s.kacheln}>
        <div style={s.kachel}><div style={s.dim}>Angebote</div><b style={s.zahl}>{zahl('angebot')}</b></div>
        <div style={s.kachel}><div style={s.dim}>Reserviert</div><b style={s.zahl}>{zahl('reserviert')}</b>{abgelaufen > 0 && <div style={{ color: C.warn, fontSize: 12.5 }}>{abgelaufen} abgelaufen</div>}</div>
        <div style={s.kachel}><div style={s.dim}>Kaufvertrag, nicht übergeben</div><b style={s.zahl}>{zahl('vertrag')}</b>{offenSumme > 0 && <div style={{ color: C.warn, fontSize: 12.5 }}>{geld(offenSumme)} offen</div>}</div>
        <div style={s.kachel}><div style={s.dim}>GwG offen</div><b style={{ ...s.zahl, color: gwgOffen ? C.bad : C.ok }}>{gwgOffen}</b></div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
        {[['laufend', 'Laufend'], ...VERKAUF_STATUS.map((x) => [x.key, x.label]), ['alle', 'Alle']].map(([k, n]) => <button key={k} style={filter === k ? s.reiterAn : s.reiterAus} onClick={() => setFilter(k)}>{n}</button>)}
      </div>
      {laden ? <p style={s.dim}>Lädt …</p> : gezeigt.length === 0 ? <p style={s.dim}>Keine Vorgänge. Einen Verkauf legen Sie in der Handelsakte an: <a href="/dashboard/kfz/bestand" style={{ color: C.info }}>Fahrzeugbestand</a> → Fahrzeug → Reiter „Verkauf".</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tab}>
            <thead><tr>{['Nr.', 'Fahrzeug', 'Käufer', 'Status', 'Preis', 'Noch offen', 'Hinweis'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>{gezeigt.map((v) => {
              const f = fz[v.bestand_id];
              const b = betraege(v);
              const st = VERKAUF_STATUS.find((x) => x.key === v.status);
              const hinweis = [
                v.status === 'reserviert' && v.reserviert_bis && v.reserviert_bis < tag ? `Reservierung abgelaufen (${de(v.reserviert_bis)})` : null,
                v.status !== 'storniert' && gwgNoetig(v) && !v.gwg_erledigt ? 'GwG-Identifizierung offen' : null,
              ].filter(Boolean).join(' · ');
              return (
                <tr key={v.id} style={{ cursor: 'pointer' }} onClick={() => { window.location.href = `/dashboard/kfz/bestand/${v.bestand_id}`; }}>
                  <td style={s.td}>{v.nr ?? '—'}</td>
                  <td style={s.td}>{f ? `${f.interne_nr ?? ''} ${[f.marke, f.modell].filter(Boolean).join(' ')}`.trim() : '—'}</td>
                  <td style={s.td}>{v.kaeufer_firma || v.kaeufer_name || '—'}</td>
                  <td style={s.td}><span style={{ color: FARBE[st?.farbe ?? 'dim'] }}>{statusLabel(v.status)}</span></td>
                  <td style={s.tdR}>{geld(b.gesamt)}</td>
                  <td style={s.tdR}>{v.status === 'storniert' ? '—' : geld(Math.max(0, b.rest))}</td>
                  <td style={{ ...s.td, color: hinweis ? C.warn : C.dim }}>{hinweis || '—'}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1240, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  zurueck: { color: C.dim, fontSize: 13, textDecoration: 'none' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '8px 0 2px' },
  dim: { color: C.dim, fontSize: 13 },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, borderRadius: 8, padding: '8px 12px', margin: '10px 0' },
  kacheln: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12 },
  kachel: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 },
  zahl: { fontSize: 26, fontWeight: 800, color: C.gold },
  reiterAn: { background: C.navy2, border: `1px solid ${C.gold}`, color: C.gold, borderRadius: 999, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  reiterAus: { background: C.navy2, border: `1px solid ${C.border}`, color: C.dim, borderRadius: 999, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  tab: { width: '100%', borderCollapse: 'collapse', minWidth: 760 },
  th: { textAlign: 'left', padding: '8px', borderBottom: `1px solid ${C.border}`, color: C.dim, fontSize: 12, fontWeight: 700 },
  td: { padding: '8px', borderBottom: `1px solid ${C.border}`, fontSize: 13.5 },
  tdR: { padding: '8px', borderBottom: `1px solid ${C.border}`, fontSize: 13.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
};
