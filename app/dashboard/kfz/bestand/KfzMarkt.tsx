'use client';

// ============================================================
// ARGONAUT OS · Paket 276 · K12b Marktvergleich in der Handelsakte (Reiter „Übersicht")
// Vergleichsangebote ähnlicher Fahrzeuge selbst erfassen (Preis, km, EZ, Quelle,
// Link, Datum) — daraus Marktmitte, Spanne und Rang des eigenen Preises.
// Keine fremden Marktdaten, kein Auslesen von Börsen, keine KI (lib/kfzMarkt.ts).
// Schreiben/Löschen mit Schreibrecht „kfz" (RLS Paket 276); ohne SQL Hinweis statt Absturz.
// ============================================================

import { useCallback, useEffect, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseZahl } from '@/lib/zahlen';
import { nichtsGeschrieben, NICHT_GESPEICHERT, NICHT_GELOESCHT } from '@/lib/speichernPruefen';
import { ezText, euro } from '@/lib/kfzBestand';
import { QUELLEN, MAX_TAGE, vergleichPruefen, marktLage, aktuell, alterTage, balkenPos, type Vergleich } from '@/lib/kfzMarkt';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.25)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };
const FARBE: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad, info: C.info, dim: C.dim };

type Zeile = Vergleich & { id: string };
const LEER = { preis: '', km: '', ez: '', quelle: 'mobile.de', link: '', notiz: '' };

function heute(): string { return new Date().toISOString().slice(0, 10); }

export default function KfzMarkt({ fz }: { fz: { id: string; owner_user_id: string; vk_brutto: number | null; km_stand: number | null; erstzulassung: string | null } }) {
  const [liste, setListe] = useState<Zeile[]>([]);
  const [f, setF] = useState(LEER);
  const [offen, setOffen] = useState(false);
  const [fehlt, setFehlt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [loeschFrage, setLoeschFrage] = useState<string | null>(null);

  const lade = useCallback(async () => {
    const { data, error } = await supabase.from('kfz_marktvergleich').select('id, preis, km, erstzulassung, quelle, link, notiz, erfasst_am')
      .eq('bestand_id', fz.id).order('erfasst_am', { ascending: false }).limit(200);
    setFehlt(!!error);
    setListe(error ? [] : (((data as unknown) as Zeile[]) ?? []).map((z) => ({ ...z, preis: z.preis === null ? null : Number(z.preis) })));
  }, [fz.id]);
  useEffect(() => { void lade(); }, [lade]);

  const tag = heute();
  const lage = marktLage({ vk: fz.vk_brutto, km: fz.km_stand, erstzulassung: fz.erstzulassung }, liste, tag);

  async function speichern() {
    setMeldung(null);
    const p = vergleichPruefen({ preis: leseZahl(f.preis), km: f.km.trim() ? leseZahl(f.km) : null, ez: f.ez, quelle: f.quelle, link: f.link, notiz: f.notiz }, tag);
    if (!p.ok) { setMeldung({ ok: false, text: p.fehler }); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.from('kfz_marktvergleich').insert({ ...p.felder, owner_user_id: fz.owner_user_id, bestand_id: fz.id }).select('id');
      if (error || nichtsGeschrieben(data)) { setMeldung({ ok: false, text: error ? 'Speichern fehlgeschlagen. Haben Sie das Schreibrecht für „KFZ" und ist SQL Paket 276 ausgeführt?' : NICHT_GESPEICHERT }); return; }
      setF({ ...LEER, quelle: f.quelle }); setMeldung({ ok: true, text: 'Vergleich erfasst.' }); await lade();
    } finally { setBusy(false); }
  }

  async function loeschen(id: string) {
    setBusy(true); setMeldung(null);
    try {
      const { data, error } = await supabase.from('kfz_marktvergleich').delete().eq('id', id).select('id');
      if (error || nichtsGeschrieben(data)) { setMeldung({ ok: false, text: NICHT_GELOESCHT }); return; }
      setLoeschFrage(null); await lade();
    } finally { setBusy(false); }
  }

  const posEigen = balkenPos(fz.vk_brutto, lage.min, lage.max);
  const posMitte = balkenPos(lage.median, lage.min, lage.max);

  return (
    <div style={k.karte}>
      <h3 style={k.h3}>Marktvergleich</h3>
      <div style={k.dim}>Erfassen Sie Angebote ähnlicher Fahrzeuge (z. B. aus den Börsen) — nur Preis, km, Erstzulassung und Quelle, keine Namen. Gerechnet wird mit Einträgen der letzten {MAX_TAGE} Tage; ab 3 passenden gibt es eine Aussage.</div>
      {fehlt && <div style={{ ...k.dim, color: C.warn, marginTop: 6 }}>Marktvergleich ist noch nicht eingerichtet (SQL Paket 276 fehlt).</div>}

      <div style={{ marginTop: 10, fontSize: 13.5, color: FARBE[lage.stufe] }}>{lage.text}</div>
      {lage.kmText && <div style={{ ...k.dim, marginTop: 4 }}>{lage.kmText}</div>}
      {lage.median !== null && lage.min !== null && lage.max !== null && (
        <div style={{ marginTop: 10 }}>
          <div style={k.balken} aria-label="Preisspanne der Vergleiche">
            {lage.q1 !== null && lage.q3 !== null && (
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${balkenPos(lage.q1, lage.min, lage.max)}%`, width: `${Math.max(1, (balkenPos(lage.q3, lage.min, lage.max) ?? 0) - (balkenPos(lage.q1, lage.min, lage.max) ?? 0))}%`, background: 'rgba(143,163,190,0.28)', borderRadius: 6 }} />
            )}
            {posMitte !== null && <div title="Marktmitte" style={{ position: 'absolute', top: -3, bottom: -3, left: `calc(${posMitte}% - 1px)`, width: 2, background: C.dim }} />}
            {posEigen !== null && fz.vk_brutto !== null && <div title="Ihr Preis" style={{ position: 'absolute', top: -5, left: `calc(${posEigen}% - 7px)`, width: 14, height: 22, borderRadius: 4, background: FARBE[lage.stufe] }} />}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', ...k.dim, marginTop: 4 }}>
            <span>{euro(lage.min)}</span><span>Mitte {euro(lage.median)}</span><span>{euro(lage.max)}</span>
          </div>
        </div>
      )}

      {liste.length > 0 && (
        <div style={{ display: 'grid', gap: 4, marginTop: 12 }}>
          {liste.map((v) => {
            const alt = !aktuell(v, tag);
            return (
              <div key={v.id} style={{ ...k.zeile, opacity: alt ? 0.5 : 1 }}>
                <span><b>{euro(v.preis)}</b> · {v.km !== null ? `${v.km.toLocaleString('de-DE')} km` : '— km'} · EZ {ezText(v.erstzulassung)}</span>
                <span style={k.dim}>
                  {v.link ? <a href={v.link} target="_blank" rel="noopener noreferrer nofollow" style={k.link}>{v.quelle} ↗</a> : v.quelle} · vor {alterTage(v.erfasst_am, tag)} T.{alt ? ' (veraltet)' : ''}
                  {loeschFrage === v.id
                    ? <> · <button style={k.mini} disabled={busy} onClick={() => void loeschen(v.id)}>Ja, löschen</button> <button style={k.mini} onClick={() => setLoeschFrage(null)}>Nein</button></>
                    : <> · <button style={k.mini} onClick={() => setLoeschFrage(v.id)} aria-label="Vergleich löschen">🗑</button></>}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!offen ? (
        <button style={k.gold} onClick={() => setOffen(true)}>＋ Vergleich erfassen</button>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            <label style={k.lab}>Preis (€)<input style={k.inp} inputMode="decimal" value={f.preis} onChange={(e) => setF({ ...f, preis: e.target.value })} /></label>
            <label style={k.lab}>km<input style={k.inp} inputMode="numeric" value={f.km} onChange={(e) => setF({ ...f, km: e.target.value })} /></label>
            <label style={k.lab}>EZ (MM/JJJJ)<input style={k.inp} value={f.ez} placeholder="03/2021" onChange={(e) => setF({ ...f, ez: e.target.value })} /></label>
            <label style={k.lab}>Quelle<select style={k.inp} value={f.quelle} onChange={(e) => setF({ ...f, quelle: e.target.value })}>{QUELLEN.map((q) => <option key={q} value={q}>{q}</option>)}</select></label>
          </div>
          <label style={k.lab}>Link zum Angebot (optional)<input style={k.inp} value={f.link} placeholder="https://…" onChange={(e) => setF({ ...f, link: e.target.value })} /></label>
          <label style={k.lab}>Notiz (optional, z. B. Ausstattung)<input style={k.inp} value={f.notiz} maxLength={200} onChange={(e) => setF({ ...f, notiz: e.target.value })} /></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...k.gold, marginTop: 0, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void speichern()}>💾 Speichern</button>
            <button style={k.aus} onClick={() => { setOffen(false); setMeldung(null); }}>Schließen</button>
          </div>
        </div>
      )}
      {meldung && <div style={{ ...k.dim, color: meldung.ok ? C.ok : C.bad, marginTop: 6 }} role={meldung.ok ? 'status' : 'alert'}>{meldung.text}</div>}
    </div>
  );
}

const k: Record<string, CSSProperties> = {
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, minWidth: 0 },
  h3: { margin: '0 0 6px', fontSize: 15, fontWeight: 800 },
  dim: { color: C.dim, fontSize: 12.5 },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim, minWidth: 0 },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', marginTop: 10 },
  aus: { background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 14px', cursor: 'pointer' },
  mini: { background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '1px 6px', fontSize: 12, cursor: 'pointer' },
  zeile: { display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13, borderBottom: `1px solid ${C.border}`, padding: '5px 0' },
  link: { color: C.gold, textDecoration: 'none', fontWeight: 700 },
  balken: { position: 'relative', height: 12, borderRadius: 6, background: 'rgba(143,163,190,0.12)', margin: '6px 7px 0' },
};
