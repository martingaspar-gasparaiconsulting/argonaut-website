'use client';

// ============================================================
// ARGONAUT OS · Paket 270 · K9 Probefahrten auf einen Blick
// Laufende und überfällige Fahrten, fälliger Nachfass, rote und Kurzzeitkennzeichen
// des Betriebs (nur die Geschäftsleitung legt sie an) und die Fahrtenliste je
// Kennzeichen als PDF. Bearbeitet wird in der Handelsakte (Reiter „Probefahrt").
// Pfad: app/dashboard/kfz/probefahrt/page.tsx — Unterpfad von /dashboard/kfz, erbt dessen Freigabe.
// ============================================================

import { useState, useEffect, useMemo, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { verkaufPdf } from '@/lib/kfzVerkaufPdf';
import type { Firmenkopf } from '@/lib/kfzVerkauf';
import {
  artLabel, ueberfaellig, nachfassFaellig, gefahren, kzGueltig, kzNorm, fahrtenliste, fahrtenlisteDokument, ERGEBNISSE,
  type Fahrt, type RotesKz, type FahrtZeile,
} from '@/lib/kfzProbefahrt';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };

type Zeile = Fahrt & { id: string; bestand_id: string; erstellt_am: string };
type Kz = RotesKz & { id: string; notiz: string | null };
type Fz = { id: string; interne_nr: string | null; marke: string | null; modell: string | null; fin: string | null };

function heute(): string { return new Date().toISOString().slice(0, 10); }
function de(iso: string | null): string { return iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }

export default function ProbefahrtenPage() {
  const [liste, setListe] = useState<Zeile[]>([]);
  const [fz, setFz] = useState<Record<string, Fz>>({});
  const [kz, setKz] = useState<Kz[]>([]);
  const [istChef, setIstChef] = useState(false);
  const [filter, setFilter] = useState<'laufend' | 'nachfass' | 'alle'>('laufend');
  const [neu, setNeu] = useState({ kennzeichen: '', art: 'rot', gueltig_bis: '' });
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    setIstChef(!!u?.user?.id && !(typeof chef === 'string' && chef && chef !== u.user.id));
    const { data, error } = await supabase.from('kfz_probefahrt').select('*').order('start_am', { ascending: false }).limit(2000);
    if (error) { setFehler('Fahrten lassen sich nicht laden. Ist SQL Paket 270 ausgeführt und haben Sie das Recht „KFZ"?'); setLaden(false); return; }
    const z = ((data as unknown) as Zeile[]) ?? [];
    setListe(z);
    const ids = [...new Set(z.map((x) => x.bestand_id))];
    if (ids.length) {
      const b = await supabase.from('kfz_bestand').select('id, interne_nr, marke, modell, fin').in('id', ids);
      const m: Record<string, Fz> = {};
      for (const r of ((b.data as unknown) as Fz[]) ?? []) m[r.id] = r;
      setFz(m);
    }
    const k = await supabase.from('kfz_rote_kennzeichen').select('id, kennzeichen, art, gueltig_bis, aktiv, notiz').order('kennzeichen');
    setKz(((k.data as unknown) as Kz[]) ?? []);
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const jetzt = new Date().toISOString();
  const tag = heute();
  const unterwegs = liste.filter((f) => f.status === 'unterwegs');
  const ueber = unterwegs.filter((f) => ueberfaellig(f, jetzt));
  const nachfass = liste.filter((f) => nachfassFaellig(f, tag));
  const gezeigt = useMemo(() => liste.filter((f) => filter === 'alle' ? true : filter === 'nachfass' ? nachfassFaellig(f, tag) : (f.status === 'unterwegs' || f.status === 'geplant')), [liste, filter, tag]);
  const fzText = (id: string) => { const f = fz[id]; return f ? `${f.interne_nr ?? ''} ${[f.marke, f.modell].filter(Boolean).join(' ')}`.trim() : '—'; };

  async function kzAnlegen() {
    setFehler(null); setOk(null);
    const k = kzNorm(neu.kennzeichen);
    if (k.length < 2) { setFehler('Kennzeichen eingeben.'); return; }
    if (neu.art === 'kurzzeit' && !neu.gueltig_bis) { setFehler('Kurzzeitkennzeichen brauchen ein Ablaufdatum.'); return; }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('kfz_rote_kennzeichen').insert({ owner_user_id: u?.user?.id, kennzeichen: k, art: neu.art, gueltig_bis: neu.gueltig_bis || null });
    if (error) { setFehler(/kfz_rote_kz_uq/.test(error.message) ? 'Dieses Kennzeichen ist schon hinterlegt.' : 'Speichern fehlgeschlagen — Kennzeichen legt nur die Geschäftsleitung an.'); return; }
    setNeu({ kennzeichen: '', art: 'rot', gueltig_bis: '' }); setOk(`Kennzeichen ${k} hinterlegt.`); await lade();
  }

  async function kzAktiv(k: Kz, aktiv: boolean) {
    setFehler(null); setOk(null);
    const { error } = await supabase.from('kfz_rote_kennzeichen').update({ aktiv }).eq('id', k.id);
    if (error) { setFehler('Ändern fehlgeschlagen.'); return; }
    await lade();
  }

  async function liste_pdf(k: Kz) {
    setFehler(null); setOk(null);
    let firma: Firmenkopf | null = null;
    try {
      const r = await fetch('/api/betrieb-firmendaten', { cache: 'no-store' });
      if (r.ok) { const x = ((await r.json()) as { firma?: Record<string, string | null> }).firma ?? {}; firma = { name: x.firma_name ?? null, strasse: x.firma_strasse ?? null, plz: x.firma_plz ?? null, ort: x.firma_ort ?? null, telefon: x.firma_telefon ?? null, email: x.firma_email ?? null }; }
    } catch { /* ohne Firmendaten */ }
    const zeilen: FahrtZeile[] = fahrtenliste(liste.map((f) => ({ ...f, fahrzeug: fzText(f.bestand_id), fin: fz[f.bestand_id]?.fin ?? null })), k.kennzeichen);
    verkaufPdf(fahrtenlisteDokument(k.kennzeichen, zeilen, firma, tag), `Fahrtenliste-${kzNorm(k.kennzeichen).replace(/[^A-Z0-9]+/g, '-')}.pdf`);
    setOk(`Fahrtenliste ${kzNorm(k.kennzeichen)}: ${zeilen.length} Fahrten.`);
  }

  return (
    <div style={s.page}>
      <a href="/dashboard/kfz" style={s.zurueck}>← KFZ-Fachpaket</a>
      <h1 style={s.h1}>🛣 Probefahrten</h1>
      <p style={s.dim}>Probefahrten, Vorführwagen, Ersatzwagen und Überführungen auf einen Blick. Angelegt und übergeben wird in der Handelsakte des Fahrzeugs (Reiter „Probefahrt").</p>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok}>{ok}</div>}
      <div style={s.kacheln}>
        <div style={s.kachel}><div style={s.dim}>Unterwegs</div><b style={s.zahl}>{unterwegs.length}</b></div>
        <div style={s.kachel}><div style={s.dim}>Überfällig</div><b style={{ ...s.zahl, color: ueber.length ? C.bad : C.ok }}>{ueber.length}</b></div>
        <div style={s.kachel}><div style={s.dim}>Nachfass fällig</div><b style={{ ...s.zahl, color: nachfass.length ? C.warn : C.ok }}>{nachfass.length}</b></div>
        <div style={s.kachel}><div style={s.dim}>Fahrten gesamt</div><b style={s.zahl}>{liste.filter((f) => f.status !== 'storniert').length}</b></div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
        {([['laufend', 'Geplant und unterwegs'], ['nachfass', 'Nachfass fällig'], ['alle', 'Alle']] as const).map(([k, n]) => <button key={k} style={filter === k ? s.reiterAn : s.reiterAus} onClick={() => setFilter(k)}>{n}</button>)}
      </div>
      {laden ? <p style={s.dim}>Lädt …</p> : gezeigt.length === 0 ? <p style={s.dim}>Keine Fahrten. Eine Fahrt legen Sie in der Handelsakte an: <a href="/dashboard/kfz/bestand" style={{ color: C.info }}>Fahrzeugbestand</a> → Fahrzeug → Reiter „Probefahrt".</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tab}>
            <thead><tr>{['Nr.', 'Art', 'Fahrzeug', 'Fahrer', 'Kennzeichen', 'Übergabe', 'Zurück bis / am', 'km', 'Stand'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>{gezeigt.map((f) => {
              const ue = ueberfaellig(f, jetzt);
              const stand = f.status === 'unterwegs' ? (ue ? 'überfällig' : 'unterwegs') : f.status === 'geplant' ? 'geplant' : f.status === 'storniert' ? 'storniert'
                : nachfassFaellig(f, tag) ? 'Nachfass fällig' : (ERGEBNISSE.find((x) => x.key === f.ergebnis)?.label ?? 'zurück');
              return (
                <tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => { window.location.href = `/dashboard/kfz/bestand/${f.bestand_id}?reiter=probefahrt`; }}>
                  <td style={s.td}>{f.nr ?? '—'}</td>
                  <td style={s.td}>{artLabel(f.art)}</td>
                  <td style={s.td}>{fzText(f.bestand_id)}</td>
                  <td style={s.td}>{f.fahrer_name ?? '—'}{f.fahrer_tel ? <div style={s.dim}>☎ {f.fahrer_tel}</div> : null}</td>
                  <td style={s.td}>{f.kennzeichen_art === 'eigen' ? (f.kennzeichen ?? '—') : `${kzNorm(f.kennzeichen)} (${f.kennzeichen_art === 'rot' ? 'rot' : 'Kurzzeit'})`}</td>
                  <td style={s.td}>{de(f.start_am)}</td>
                  <td style={s.td}>{f.status === 'zurueck' ? de(f.rueck_am) : de(f.ende_geplant)}</td>
                  <td style={s.tdR}>{gefahren(f) === null ? '' : (gefahren(f) as number).toLocaleString('de-DE')}</td>
                  <td style={{ ...s.td, color: ue ? C.bad : stand === 'Nachfass fällig' ? C.warn : stand === 'unterwegs' ? C.info : C.dim, fontWeight: 600 }}>{stand}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      <div style={{ ...s.karte, marginTop: 18 }}>
        <h2 style={s.h2}>Rote und Kurzzeitkennzeichen</h2>
        <p style={s.dim}>Rote Kennzeichen (06) dürfen nur für Prüf-, Probe- und Überführungsfahrten genutzt werden; jede Fahrt gehört ins Fahrzeugscheinheft. Die Fahrtenliste je Kennzeichen hilft beim Eintragen.</p>
        {kz.length === 0 ? <p style={s.dim}>Noch keine Kennzeichen hinterlegt.</p> : (
          <table style={{ ...s.tab, minWidth: 0, marginTop: 8 }}><tbody>
            {kz.map((k) => {
              const belegt = unterwegs.some((f) => f.kennzeichen_art !== 'eigen' && kzNorm(f.kennzeichen) === kzNorm(k.kennzeichen));
              const gueltig = kzGueltig(k, tag);
              return (
                <tr key={k.id}>
                  <td style={s.td}><b>{kzNorm(k.kennzeichen)}</b></td>
                  <td style={s.td}>{k.art === 'rot' ? 'rot (06)' : 'Kurzzeit'}</td>
                  <td style={s.td}>{k.gueltig_bis ? `bis ${k.gueltig_bis.split('-').reverse().join('.')}` : 'ohne Ablaufdatum'}</td>
                  <td style={{ ...s.td, color: !gueltig ? C.bad : belegt ? C.info : C.ok }}>{!k.aktiv ? 'stillgelegt' : !gueltig ? 'abgelaufen' : belegt ? 'unterwegs' : 'frei'}</td>
                  <td style={s.tdR}>
                    <button style={s.btnKlein} onClick={() => void liste_pdf(k)}>🖨 Fahrtenliste</button>{' '}
                    {istChef && <button style={s.btnKlein} onClick={() => void kzAktiv(k, !k.aktiv)}>{k.aktiv ? 'Stilllegen' : 'Wieder aktiv'}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody></table>
        )}
        {istChef && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginTop: 12 }}>
            <label style={s.lab}>Kennzeichen<input style={s.inp} value={neu.kennzeichen} placeholder="z. B. BB-06123" onChange={(x) => setNeu({ ...neu, kennzeichen: x.target.value })} /></label>
            <label style={s.lab}>Art<select style={s.inp} value={neu.art} onChange={(x) => setNeu({ ...neu, art: x.target.value })}><option value="rot">rotes Kennzeichen (06)</option><option value="kurzzeit">Kurzzeitkennzeichen</option></select></label>
            <label style={s.lab}>Gültig bis{neu.art === 'rot' ? ' (optional)' : ''}<input type="date" style={s.inp} value={neu.gueltig_bis} onChange={(x) => setNeu({ ...neu, gueltig_bis: x.target.value })} /></label>
            <button style={s.gold} onClick={() => void kzAnlegen()}>＋ Hinterlegen</button>
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1240, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  zurueck: { color: C.dim, fontSize: 13, textDecoration: 'none' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '8px 0 2px' },
  h2: { fontSize: 17, fontWeight: 800, margin: '0 0 4px' },
  dim: { color: C.dim, fontSize: 13 },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, borderRadius: 8, padding: '8px 12px', margin: '10px 0' },
  ok: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.ok}`, borderRadius: 8, padding: '8px 12px', margin: '10px 0' },
  kacheln: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12 },
  kachel: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 },
  zahl: { fontSize: 26, fontWeight: 800, color: C.gold },
  reiterAn: { background: C.navy2, border: `1px solid ${C.gold}`, color: C.gold, borderRadius: 999, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  reiterAus: { background: C.navy2, border: `1px solid ${C.border}`, color: C.dim, borderRadius: 999, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  tab: { width: '100%', borderCollapse: 'collapse', minWidth: 900 },
  th: { textAlign: 'left', padding: '8px', borderBottom: `1px solid ${C.border}`, color: C.dim, fontSize: 12, fontWeight: 700 },
  td: { padding: '8px', borderBottom: `1px solid ${C.border}`, fontSize: 13.5 },
  tdR: { padding: '8px', borderBottom: `1px solid ${C.border}`, fontSize: 13.5, textAlign: 'right', whiteSpace: 'nowrap' },
  btnKlein: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '4px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0 },
};
