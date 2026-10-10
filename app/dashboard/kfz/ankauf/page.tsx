'use client';

// ============================================================
// ARGONAUT OS · Paket 263 · K4 Ankauf und Bewertung (Teil 1) — Übersicht
// Alle Ankaufsvorgänge: neu anlegen (Hof, Inzahlungnahme, Telefon), Status-
// Filter, Suche, Richtwerte für Schäden (nur Chef).
// Pfad: app/dashboard/kfz/ankauf/page.tsx — erbt die Freigabe von
// /dashboard/kfz (Modul „kfz"). Die Akte liegt unter ./[id].
// Paket 264 (K4 Teil 2): Karte „🌐 Online-Ankaufformular" (nur Chef) —
// ein-/ausschalten, geheime Kennung, Link für die eigene Webseite.
// Paket 305 (FM1): daraus wird die Fahrzeugmappe (MappeEinstellung.tsx).
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseZahl } from '@/lib/zahlen';
import { euro } from '@/lib/kfzBestand';
import MappeEinstellung from './MappeEinstellung';
import {
  ANKAUF_STATUS, QUELLEN, SCHADEN_ARTEN, RICHTWERTE_START, richtwerteMit, schadenBereinigen, schadenSumme,
  naechsteAnkaufNr, onlineEinstellung, neueKennung, type Richtwerte,
} from '@/lib/kfzAnkauf';

const MODUL = 'kfz-ankauf';
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = {
  navy: '#0A1628', navy2: '#0F2036', navy3: '#14294A', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8',
};
const FARBE: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad, info: C.info, gold: C.gold, dim: C.dim };

type Zeile = {
  id: string; nr: string | null; status: string; quelle: string; verkaeufer_name: string | null; verkaeufer_firma: string | null;
  marke: string | null; modell: string | null; kennzeichen: string | null; km_stand: number | null;
  ziel_vk: number | null; angebot: number | null; ankaufpreis: number | null; schaeden: unknown; erstellt_am: string;
};

function deDatum(iso: string | null | undefined): string { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }

export default function AnkaufPage() {
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [liste, setListe] = useState<Zeile[]>([]);
  const [richtwerte, setRichtwerte] = useState<Richtwerte>(richtwerteMit(null));
  const [filter, setFilter] = useState<string>('aktiv');
  const [q, setQ] = useState('');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [neu, setNeu] = useState<{ offen: boolean; quelle: string; verkaeufer_art: string; verkaeufer_name: string; marke: string; modell: string; kennzeichen: string }>(
    { offen: false, quelle: 'hof', verkaeufer_art: 'privat', verkaeufer_name: '', marke: '', modell: '', kennzeichen: '' });
  const [rwOffen, setRwOffen] = useState(false);
  const [rwEntwurf, setRwEntwurf] = useState<Record<string, string[]>>({});
  const [rwRoh, setRwRoh] = useState<Record<string, unknown>>({});
  const [onOffen, setOnOffen] = useState(false);

  const lade = useCallback(async (b: string) => {
    const [a, e] = await Promise.all([
      supabase.from('kfz_ankauf').select('id, nr, status, quelle, verkaeufer_name, verkaeufer_firma, marke, modell, kennzeichen, km_stand, ziel_vk, angebot, ankaufpreis, schaeden, erstellt_am').eq('owner_user_id', b).order('erstellt_am', { ascending: false }),
      supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', b).eq('modul', MODUL).maybeSingle(),
    ]);
    if (a.error) { setFehler('Die Ankäufe lassen sich nicht laden. Fehlt SQL Paket 263 oder das Recht „KFZ"?'); return; }
    setListe(((a.data as unknown) as Zeile[]) ?? []);
    const einst = ((e.data as { einstellung?: Record<string, unknown> } | null)?.einstellung) ?? {};
    setRwRoh(einst);
    setRichtwerte(richtwerteMit(einst.richtwerte));
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      const { data: chef } = await supabase.rpc('mein_chef_id');
      const b = typeof chef === 'string' && chef ? chef : id;
      setBetrieb(b); setIstChef(b === id);
      await lade(b);
      setLaden(false);
    })();
  }, [lade]);

  const gefiltert = useMemo(() => {
    const s = q.trim().toLowerCase();
    return liste.filter((z) => (filter === 'alle' ? true : filter === 'aktiv' ? z.status === 'offen' || z.status === 'angeboten' : z.status === filter))
      .filter((z) => !s || [z.nr, z.marke, z.modell, z.kennzeichen, z.verkaeufer_name, z.verkaeufer_firma].map((x) => String(x ?? '').toLowerCase()).join(' ').includes(s));
  }, [liste, filter, q]);

  async function anlegen() {
    if (!betrieb) return;
    if (!neu.marke.trim() && !neu.verkaeufer_name.trim()) { setFehler('Bitte mindestens Marke oder Verkäufer eintragen.'); return; }
    setBusy(true); setFehler(null);
    try {
      const nr = naechsteAnkaufNr(liste.map((z) => z.nr));
      const { data, error } = await supabase.from('kfz_ankauf').insert({
        owner_user_id: betrieb, nr, quelle: neu.quelle, verkaeufer_art: neu.verkaeufer_art,
        verkaeufer_name: neu.verkaeufer_name.trim() || null, marke: neu.marke.trim() || null, modell: neu.modell.trim() || null,
        kennzeichen: neu.kennzeichen.trim().toUpperCase() || null,
      }).select('id').single();
      if (error || !data) { setFehler('Anlegen fehlgeschlagen. Haben Sie das Schreibrecht für „KFZ" und ist SQL Paket 263 ausgeführt?'); return; }
      window.location.href = `/dashboard/kfz/ankauf/${(data as { id: string }).id}`;
    } finally { setBusy(false); }
  }

  function rwOeffnen() {
    const e: Record<string, string[]> = {};
    for (const a of SCHADEN_ARTEN) e[a.key] = (richtwerte[a.key] ?? [0, 0, 0]).map((n) => String(n).replace('.', ','));
    setRwEntwurf(e); setRwOffen(true);
  }

  async function rwSpeichern() {
    if (!betrieb || !istChef) return;
    const rw: Record<string, (number | null)[]> = {};
    for (const [k, v] of Object.entries(rwEntwurf)) rw[k] = v.map((x) => { const n = leseZahl(x); return n === null || n < 0 ? null : n; });
    setBusy(true); setFehler(null);
    try {
      const { error } = await supabase.from('modul_einstellung').upsert({ owner_user_id: betrieb, modul: MODUL, einstellung: { ...rwRoh, richtwerte: rw }, aktualisiert_am: new Date().toISOString() }, { onConflict: 'owner_user_id,modul' });
      if (error) { setFehler('Richtwerte ließen sich nicht speichern.'); return; }
      setRwOffen(false); await lade(betrieb);
    } finally { setBusy(false); }
  }

  async function onlineSetzen(aktiv: boolean) {
    if (!betrieb || !istChef) return;
    let kennung = onlineEinstellung(rwRoh).kennung;
    if (!kennung) {
      const b = new Uint8Array(16); crypto.getRandomValues(b);
      kennung = neueKennung(Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''));
    }
    if (!kennung) { setFehler('Kennung konnte nicht erzeugt werden.'); return; }
    setBusy(true); setFehler(null);
    try {
      const { error } = await supabase.from('modul_einstellung').upsert({ owner_user_id: betrieb, modul: MODUL, einstellung: { ...rwRoh, online: { aktiv, kennung } }, aktualisiert_am: new Date().toISOString() }, { onConflict: 'owner_user_id,modul' });
      if (error) { setFehler('Das Online-Formular ließ sich nicht umschalten.'); return; }
      await lade(betrieb);
    } finally { setBusy(false); }
  }

  if (laden) return <div style={s.page}><p style={s.dim}>Lädt …</p></div>;
  const online = onlineEinstellung(rwRoh);

  const zahl = (k: string) => liste.filter((z) => z.status === k).length;
  const neuOnline = liste.filter((z) => z.quelle === 'online' && z.status === 'offen').length;

  return (
    <div style={s.page}>
      <a href="/dashboard/kfz" style={s.zurueck}>← KFZ-Fachpaket</a>
      <div style={s.kopf}>
        <div>
          <h1 style={s.h1}>🔑 Ankauf und Bewertung</h1>
          <div style={s.dim}>Fahrzeuge prüfen, Schäden am Foto festhalten, Höchstpreis berechnen und mit einem Klick in den Bestand übernehmen.</div>
        </div>
        <div style={s.knopfReihe}>
          <a href="/dashboard/kfz/bestand" style={{ ...s.btn, textDecoration: 'none' }}>🚘 Zum Bestand</a>
          {istChef && <button style={s.btn} onClick={() => setOnOffen(!onOffen)}>🌐 Fahrzeugmappe{online.aktiv ? ' (an)' : ''}</button>}
          {istChef && <button style={s.btn} onClick={rwOeffnen}>⚙ Richtwerte für Schäden</button>}
          <button style={s.gold} onClick={() => setNeu({ ...neu, offen: !neu.offen })}>＋ Neuer Ankauf</button>
        </div>
      </div>

      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {neuOnline > 0 && <div style={s.hinweis}>🌐 {neuOnline} {neuOnline === 1 ? 'Fahrzeug wurde' : 'Fahrzeuge wurden'} über die Fahrzeugmappe angeboten und {neuOnline === 1 ? 'wartet' : 'warten'} auf Ihre Bewertung.</div>}

      {neu.offen && (
        <div style={s.karte}>
          <h3 style={s.h3}>Neuer Ankauf</h3>
          <div style={s.feldRaster}>
            <label style={s.lab}>Woher<select style={s.inp} value={neu.quelle} onChange={(e) => setNeu({ ...neu, quelle: e.target.value })}>{QUELLEN.filter((x) => x.key !== 'online').map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
            <label style={s.lab}>Verkäufer ist<select style={s.inp} value={neu.verkaeufer_art} onChange={(e) => setNeu({ ...neu, verkaeufer_art: e.target.value })}>
              <option value="privat">Privatperson</option><option value="gewerblich_25a">Händler (differenzbesteuert)</option><option value="gewerblich">Unternehmen mit Umsatzsteuer</option></select></label>
            <label style={s.lab}>Name Verkäufer<input style={s.inp} value={neu.verkaeufer_name} onChange={(e) => setNeu({ ...neu, verkaeufer_name: e.target.value })} /></label>
            <label style={s.lab}>Marke<input style={s.inp} value={neu.marke} onChange={(e) => setNeu({ ...neu, marke: e.target.value })} /></label>
            <label style={s.lab}>Modell<input style={s.inp} value={neu.modell} onChange={(e) => setNeu({ ...neu, modell: e.target.value })} /></label>
            <label style={s.lab}>Kennzeichen<input style={s.inp} value={neu.kennzeichen} onChange={(e) => setNeu({ ...neu, kennzeichen: e.target.value })} /></label>
          </div>
          <div style={{ ...s.dim, marginTop: 8 }}>Alles Weitere (Prüfprotokoll, Schäden, Bewertung) erfassen Sie danach in der Ankaufsakte.</div>
          <button style={{ ...s.gold, marginTop: 10, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void anlegen()}>💾 Anlegen und öffnen</button>
        </div>
      )}

      {onOffen && istChef && betrieb && (
        <MappeEinstellung betrieb={betrieb} aktiv={online.aktiv} kennung={online.kennung} busy={busy} onSetzen={(an) => void onlineSetzen(an)} />
      )}

      {rwOffen && istChef && (
        <div style={s.karte}>
          <h3 style={s.h3}>Richtwerte für Schäden (netto, €)</h3>
          <div style={{ ...s.dim, marginBottom: 10 }}>Diese Werte setzt ARGONAUT ein, wenn am Schaden kein eigener Betrag steht. Es sind Startwerte — bitte auf die Preise Ihres Betriebs bzw. Ihrer Partner einstellen.</div>
          <table style={s.tab}><thead><tr><th style={s.th}>Schadensart</th><th style={s.thR}>leicht</th><th style={s.thR}>mittel</th><th style={s.thR}>stark</th></tr></thead>
            <tbody>{SCHADEN_ARTEN.map((a) => (
              <tr key={a.key}><td style={s.td}>{a.name}</td>{[0, 1, 2].map((i) => (
                <td key={i} style={s.tdR}><input style={{ ...s.inp, width: 90, textAlign: 'right' }} inputMode="decimal" aria-label={`${a.name} Stufe ${i + 1}`} value={rwEntwurf[a.key]?.[i] ?? ''}
                  onChange={(e) => setRwEntwurf({ ...rwEntwurf, [a.key]: (rwEntwurf[a.key] ?? ['', '', '']).map((x, j) => (j === i ? e.target.value : x)) })} /></td>
              ))}</tr>
            ))}</tbody></table>
          <div style={{ ...s.knopfReihe, marginTop: 10 }}>
            <button style={{ ...s.gold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void rwSpeichern()}>💾 Richtwerte speichern</button>
            <button style={s.btn} onClick={() => { const e: Record<string, string[]> = {}; for (const [k, v] of Object.entries(RICHTWERTE_START)) e[k] = v.map(String); setRwEntwurf(e); }}>Startwerte einsetzen</button>
            <button style={s.btn} onClick={() => setRwOffen(false)}>Schließen</button>
          </div>
        </div>
      )}

      <div style={s.filterReihe}>
        {[['aktiv', `Offen (${zahl('offen') + zahl('angeboten')})`], ...ANKAUF_STATUS.map((x) => [x.key, `${x.label} (${zahl(x.key)})`]), ['alle', `Alle (${liste.length})`]].map(([k, n]) => (
          <button key={k} style={filter === k ? s.chipAn : s.chip} onClick={() => setFilter(k)}>{n}</button>
        ))}
        <input style={{ ...s.inp, minWidth: 220 }} placeholder="Suche: Marke, Kennzeichen, Verkäufer, A-0001" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Suche" />
      </div>

      {gefiltert.length === 0 ? (
        <div style={{ ...s.karte, ...s.dim }}>{liste.length ? 'Keine Treffer für diese Auswahl.' : 'Noch keine Ankäufe. Legen Sie über „＋ Neuer Ankauf" den ersten an.'}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.tab}>
            <thead><tr><th style={s.th}>Nr.</th><th style={s.th}>Fahrzeug</th><th style={s.th}>Verkäufer</th><th style={s.th}>Status</th><th style={s.thR}>Schäden</th><th style={s.thR}>Angebot</th><th style={s.thR}>Ankauf</th><th style={s.th}>Angelegt</th></tr></thead>
            <tbody>{gefiltert.map((z) => {
              const st = ANKAUF_STATUS.find((x) => x.key === z.status);
              const sch = schadenBereinigen(z.schaeden);
              return (
                <tr key={z.id} style={{ cursor: 'pointer' }} onClick={() => { window.location.href = `/dashboard/kfz/ankauf/${z.id}`; }}>
                  <td style={s.td}><a href={`/dashboard/kfz/ankauf/${z.id}`} style={{ color: C.gold, textDecoration: 'none', fontWeight: 700 }}>{z.nr ?? '—'}</a></td>
                  <td style={s.td}>{[z.marke, z.modell].filter(Boolean).join(' ') || '—'}<div style={s.klein}>{z.kennzeichen ?? ''}{z.km_stand !== null ? ` · ${z.km_stand.toLocaleString('de-DE')} km` : ''}</div></td>
                  <td style={s.td}>{z.verkaeufer_firma || z.verkaeufer_name || '—'}<div style={s.klein}>{QUELLEN.find((x) => x.key === z.quelle)?.label ?? ''}</div></td>
                  <td style={s.td}><span style={{ ...s.pill, color: FARBE[st?.farbe ?? 'dim'] }}>{st?.label ?? z.status}</span></td>
                  <td style={s.tdR}>{sch.length ? `${sch.length} · ${euro(schadenSumme(sch, richtwerte))}` : '—'}</td>
                  <td style={s.tdR}>{euro(z.angebot)}</td>
                  <td style={s.tdR}>{euro(z.ankaufpreis)}</td>
                  <td style={s.td}>{deDatum(z.erstellt_am)}</td>
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
  kopf: { display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', margin: '8px 0 12px' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '8px 0 4px' },
  h3: { margin: '0 0 10px', fontSize: 15, fontWeight: 800 },
  dim: { color: C.dim, fontSize: 13 },
  klein: { color: C.dim, fontSize: 12 },
  knopfReihe: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  filterReihe: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '14px 0' },
  pill: { display: 'inline-block', border: '1px solid currentColor', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  btn: { background: C.navy2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 14, display: 'inline-block' },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' },
  hinweis: { background: 'rgba(95,168,232,0.08)', border: '1px solid rgba(95,168,232,0.35)', borderRadius: 10, padding: '8px 12px', fontSize: 13.5, margin: '6px 0' },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, borderRadius: 8, padding: '8px 12px', margin: '10px 0' },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, margin: '10px 0', minWidth: 0 },
  feldRaster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0 },
  chip: { border: `1px solid ${C.border}`, background: 'transparent', color: C.dim, borderRadius: 999, padding: '5px 12px', fontSize: 12.5, cursor: 'pointer' },
  chipAn: { border: `1px solid ${C.gold}`, background: 'rgba(201,168,76,0.14)', color: C.gold, borderRadius: 999, padding: '5px 12px', fontSize: 12.5, cursor: 'pointer' },
  tab: { width: '100%', borderCollapse: 'collapse', background: C.navy2, borderRadius: 12 },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${C.border}`, fontSize: 11.5, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' },
  thR: { textAlign: 'right', padding: '8px 10px', borderBottom: `1px solid ${C.border}`, fontSize: 11.5, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' },
  td: { padding: '8px 10px', borderBottom: `1px solid ${C.border}`, fontSize: 13.5, verticalAlign: 'top' },
  tdR: { padding: '8px 10px', borderBottom: `1px solid ${C.border}`, fontSize: 13.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' },
};
