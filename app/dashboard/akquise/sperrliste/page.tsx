'use client';

// ============================================================================
// ARGONAUT OS · Paket 362 (13.10.2026) · VK11 Anruf-Sperrliste und Einwilligungen
// Sperrliste: Nummern, die nicht mehr angerufen werden (Widerspruch, falsche
// Nummer, von Hand). Jeder im Team sperrt; entsperren nur die Geschäftsleitung
// mit Grund — die Zeile bleibt als Nachweis.
// Einwilligungen in Anrufe (§ 7a UWG): Quelle, Datum, wo der Nachweis liegt.
// Nur anhängen; Widerruf kann jeder eintragen und sperrt die Nummer sofort.
// Logik: lib/anrufErlaubnis.ts · SQL: supabase-sql/p362-anruf-erlaubnis.sql
// ============================================================================

import { useCallback, useEffect, useMemo, useState, CSSProperties } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { QUELLEN, nummerNorm, nummerText, einwilligungPruefen, sperrePruefen, GRUND_MIN } from '@/lib/anrufErlaubnis';
import { zeitDe, berlinTag } from '@/lib/anrufSitzung';
import { ladeVerkaufsteam, type TeamStand } from '@/lib/verkaufsteamLaden';
import { nichtsGeschrieben } from '@/lib/speichernPruefen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', green: '#4CAF7D', text: '#E8EDF4', dim: '#8FA3BE', rand: 'rgba(143,163,190,0.18)', rot: '#E06666' };
const SPERR_QUELLE: Record<string, string> = { widerspruch: 'Widerspruch', falsche_nummer: 'Falsche Nummer', manuell: 'Von Hand' };

type Sperre = { id: string; nummer: string; quelle: string; grund: string | null; gesperrt_am: string; erfasst_name: string | null; entsperrt_am: string | null; entsperrt_grund: string | null; entsperrt_name: string | null };
type Einw = { id: string; nummer: string; kontakt_id: string | null; quelle: string; erteilt_am: string; nachweis: string; widerrufen_am: string | null; widerruf_grund: string | null; erfasst_am: string; erfasst_name: string | null };
type Kontakt = { id: string; vorname: string | null; nachname: string | null; firma: string | null; telefon: string | null; mobil: string | null };

export default function SperrlisteSeite() {
  const [stand, setStand] = useState<TeamStand | null>(null);
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [sperren, setSperren] = useState<Sperre[]>([]);
  const [einw, setEinw] = useState<Einw[]>([]);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [bereit, setBereit] = useState(true);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reiter, setReiter] = useState<'sperre' | 'einwilligung'>('sperre');
  const [alteZeigen, setAlteZeigen] = useState(false);
  const [sp, setSp] = useState({ nummer: '', quelle: 'widerspruch', grund: '' });
  const [ew, setEw] = useState({ kontakt: '', nummer: '', quelle: 'schriftlich', erteilt_am: berlinTag(new Date().toISOString()), nachweis: '' });
  const [entGrund, setEntGrund] = useState<Record<string, string>>({});
  const [widGrund, setWidGrund] = useState<Record<string, string>>({});
  const [suche, setSuche] = useState('');

  const laden = useCallback(async () => {
    const [a, b, k] = await Promise.all([
      supabase.from('telefon_sperre').select('id, nummer, quelle, grund, gesperrt_am, erfasst_name, entsperrt_am, entsperrt_grund, entsperrt_name').order('gesperrt_am', { ascending: false }).limit(5000),
      supabase.from('telefon_einwilligung').select('id, nummer, kontakt_id, quelle, erteilt_am, nachweis, widerrufen_am, widerruf_grund, erfasst_am, erfasst_name').order('erfasst_am', { ascending: false }).limit(5000),
      supabase.from('kontakte').select('id, vorname, nachname, firma, telefon, mobil').order('nachname').limit(2000),
    ]);
    setBereit(!a.error && !b.error);
    setSperren(a.error ? [] : ((a.data as Sperre[]) ?? []));
    setEinw(b.error ? [] : ((b.data as Einw[]) ?? []));
    setKontakte(k.error ? [] : ((k.data as Kontakt[]) ?? []));
  }, []);

  useEffect(() => {
    (async () => {
      const st = await ladeVerkaufsteam(supabase);
      setStand(st);
      setBetrieb(st.chefId ?? st.ich);
      await laden();
    })();
  }, [laden]);

  const kName = useCallback((id: string | null) => {
    const k = kontakte.find((x) => x.id === id);
    return k ? ([k.vorname, k.nachname].filter(Boolean).join(' ') || k.firma || 'Kontakt') : null;
  }, [kontakte]);
  const aktiv = useMemo(() => sperren.filter((s) => !s.entsperrt_am), [sperren]);
  const alt = useMemo(() => sperren.filter((s) => s.entsperrt_am), [sperren]);
  const treffer = (n: string) => !suche.trim() || n.includes(nummerNorm(suche) ?? suche.replace(/\D/g, ''));

  async function sperrenSpeichern() {
    const f = sperrePruefen(sp.nummer);
    if (f.length || !betrieb) { setMeldung({ ok: false, text: f.join(' ') }); return; }
    setBusy(true); setMeldung(null);
    try {
      const { error } = await supabase.from('telefon_sperre').insert({ owner_user_id: betrieb, nummer: nummerNorm(sp.nummer), quelle: sp.quelle, grund: sp.grund.trim() || null });
      if (error) { setMeldung({ ok: false, text: 'Nicht gesperrt — fehlt SQL Paket 362? ' + error.message }); return; }
      setSp({ nummer: '', quelle: 'widerspruch', grund: '' });
      setMeldung({ ok: true, text: 'Nummer gesperrt. Sie erscheint in keiner Anruf-Liste mehr.' });
      await laden();
    } finally { setBusy(false); }
  }

  async function entsperren(s: Sperre) {
    const g = (entGrund[s.id] ?? '').trim();
    if (g.length < GRUND_MIN) { setMeldung({ ok: false, text: `Bitte einen Grund angeben (mindestens ${GRUND_MIN} Zeichen), z. B. neue schriftliche Einwilligung.` }); return; }
    setBusy(true); setMeldung(null);
    try {
      const { data, error } = await supabase.from('telefon_sperre').update({ entsperrt_am: new Date().toISOString(), entsperrt_grund: g }).eq('id', s.id).select('id');
      if (error) { setMeldung({ ok: false, text: error.message }); return; }
      if (nichtsGeschrieben(data)) { setMeldung({ ok: false, text: 'Entsperren kann nur die Geschäftsleitung.' }); return; }
      setMeldung({ ok: true, text: 'Sperre aufgehoben. Der Nachweis bleibt gespeichert.' });
      await laden();
    } finally { setBusy(false); }
  }

  async function einwSpeichern() {
    const f = einwilligungPruefen(ew, berlinTag(new Date().toISOString()));
    if (f.length || !betrieb) { setMeldung({ ok: false, text: f.join(' ') }); return; }
    setBusy(true); setMeldung(null);
    try {
      const { error } = await supabase.from('telefon_einwilligung').insert({
        owner_user_id: betrieb, kontakt_id: ew.kontakt || null, nummer: nummerNorm(ew.nummer), quelle: ew.quelle, erteilt_am: ew.erteilt_am, nachweis: ew.nachweis.trim(),
      });
      if (error) { setMeldung({ ok: false, text: /Zukunft|Nachweis|check/.test(error.message) ? error.message : 'Nicht gespeichert — fehlt SQL Paket 362? ' + error.message }); return; }
      setEw({ kontakt: '', nummer: '', quelle: 'schriftlich', erteilt_am: berlinTag(new Date().toISOString()), nachweis: '' });
      setMeldung({ ok: true, text: 'Einwilligung gespeichert. Sie bleibt als Nachweis aufbewahrt.' });
      await laden();
    } finally { setBusy(false); }
  }

  async function widerrufen(e: Einw) {
    if (!window.confirm('Widerruf eintragen? Die Nummer wird sofort gesperrt.')) return;
    setBusy(true); setMeldung(null);
    try {
      const { data, error } = await supabase.from('telefon_einwilligung').update({ widerrufen_am: new Date().toISOString(), widerruf_grund: (widGrund[e.id] ?? '').trim() || null }).eq('id', e.id).select('id');
      if (error) { setMeldung({ ok: false, text: error.message }); return; }
      if (nichtsGeschrieben(data)) { setMeldung({ ok: false, text: 'Nicht gespeichert — fehlendes Recht.' }); return; }
      setMeldung({ ok: true, text: 'Widerruf eingetragen, Nummer gesperrt.' });
      await laden();
    } finally { setBusy(false); }
  }

  function kontaktWahl(id: string) {
    const k = kontakte.find((x) => x.id === id);
    setEw((alt) => ({ ...alt, kontakt: id, nummer: alt.nummer || k?.telefon || k?.mobil || '' }));
  }

  return (
    <div style={st.seite}>
      <div style={st.eyebrow}>ARGONAUT OS · Vertrieb</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={st.h1}>🚫 Anruf-Sperrliste & Einwilligungen</h1>
        <Link href="/dashboard/akquise/sitzung" style={st.knopfLink}>← Anruf-Sitzung</Link>
      </div>
      <p style={st.sub}>
        Werbeanrufe bei Verbrauchern sind nur mit vorheriger ausdrücklicher Einwilligung erlaubt – auch bei Bestandskunden. Bei Firmen genügt ein mutmaßliches Interesse.
        Einwilligungen werden hier mit Nachweis aufbewahrt. Wer nicht mehr angerufen werden möchte, kommt auf die Sperrliste – sie gilt für den ganzen Betrieb und jede Anruf-Liste.
      </p>
      {!bereit && <div style={st.err}>Diese Seite braucht SQL Paket 362. Bitte zuerst einspielen.</div>}
      {meldung && <div style={{ ...st.err, color: meldung.ok ? C.green : C.rot, borderColor: (meldung.ok ? C.green : C.rot) + '55', background: 'transparent' }}>{meldung.text}</div>}

      <div style={{ display: 'flex', gap: 8, margin: '6px 0 14px', flexWrap: 'wrap' }}>
        <button style={{ ...st.reiter, ...(reiter === 'sperre' ? st.reiterAn : {}) }} onClick={() => setReiter('sperre')}>🚫 Sperrliste ({aktiv.length})</button>
        <button style={{ ...st.reiter, ...(reiter === 'einwilligung' ? st.reiterAn : {}) }} onClick={() => setReiter('einwilligung')}>✅ Einwilligungen ({einw.filter((e) => !e.widerrufen_am).length})</button>
        <input style={{ ...st.inp, maxWidth: 220 }} placeholder="Nummer suchen" value={suche} onChange={(e) => setSuche(e.target.value)} />
      </div>

      {reiter === 'sperre' && (
        <>
          <div style={st.karte}>
            <div style={st.titel}>Nummer sperren</div>
            <div style={st.reihe}>
              <input style={st.inp} placeholder="Telefonnummer mit Vorwahl" value={sp.nummer} onChange={(e) => setSp({ ...sp, nummer: e.target.value })} />
              <select style={st.inp} value={sp.quelle} onChange={(e) => setSp({ ...sp, quelle: e.target.value })}>
                <option value="widerspruch">Widerspruch</option><option value="falsche_nummer">Falsche Nummer</option><option value="manuell">Von Hand</option>
              </select>
              <input style={{ ...st.inp, flex: 2 }} placeholder="Grund (optional)" maxLength={500} value={sp.grund} onChange={(e) => setSp({ ...sp, grund: e.target.value })} />
              <button style={st.primaer} disabled={busy} onClick={() => void sperrenSpeichern()}>Sperren</button>
            </div>
          </div>
          <div style={st.karte}>
            {aktiv.filter((s) => treffer(s.nummer)).length === 0 ? <div style={st.dim}>Keine gesperrten Nummern.</div> : aktiv.filter((s) => treffer(s.nummer)).map((s) => (
              <div key={s.id} style={st.zeile}>
                <b style={{ minWidth: 170 }}>{nummerText(s.nummer)}</b>
                <span style={{ color: C.rot }}>{SPERR_QUELLE[s.quelle] ?? s.quelle}</span>
                <span style={st.dim}>{zeitDe(s.gesperrt_am)} · {s.erfasst_name ?? '—'}</span>
                {s.grund && <span style={{ fontSize: 13.5, flexBasis: '100%' }}>„{s.grund}"</span>}
                {stand?.istChef && (
                  <span style={{ display: 'flex', gap: 6, flexBasis: '100%' }}>
                    <input style={{ ...st.inp, flex: 1 }} placeholder="Grund fürs Entsperren, z. B. neue schriftliche Einwilligung" value={entGrund[s.id] ?? ''} onChange={(e) => setEntGrund({ ...entGrund, [s.id]: e.target.value })} />
                    <button style={st.knopf} disabled={busy} onClick={() => void entsperren(s)}>Entsperren</button>
                  </span>
                )}
              </div>
            ))}
          </div>
          {alt.length > 0 && (
            <div style={st.karte}>
              <button style={st.knopf} onClick={() => setAlteZeigen(!alteZeigen)}>{alteZeigen ? 'Aufgehobene ausblenden' : `Aufgehobene Sperren zeigen (${alt.length})`}</button>
              {alteZeigen && alt.filter((s) => treffer(s.nummer)).map((s) => (
                <div key={s.id} style={st.zeile}>
                  <span style={{ minWidth: 170, textDecoration: 'line-through' }}>{nummerText(s.nummer)}</span>
                  <span style={st.dim}>gesperrt {zeitDe(s.gesperrt_am)} · aufgehoben {zeitDe(s.entsperrt_am)} von {s.entsperrt_name ?? '—'}</span>
                  <span style={{ fontSize: 13.5, flexBasis: '100%' }}>Grund: „{s.entsperrt_grund}"</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {reiter === 'einwilligung' && (
        <>
          <div style={st.karte}>
            <div style={st.titel}>Einwilligung in Anrufe erfassen</div>
            <div style={st.reihe}>
              <select style={{ ...st.inp, flex: 2 }} value={ew.kontakt} onChange={(e) => kontaktWahl(e.target.value)}>
                <option value="">— Kontakt (optional) —</option>
                {kontakte.map((k) => <option key={k.id} value={k.id}>{[k.vorname, k.nachname].filter(Boolean).join(' ') || k.firma || 'Kontakt'}{k.firma && (k.vorname || k.nachname) ? ` · ${k.firma}` : ''}</option>)}
              </select>
              <input style={st.inp} placeholder="Telefonnummer mit Vorwahl" value={ew.nummer} onChange={(e) => setEw({ ...ew, nummer: e.target.value })} />
              <select style={st.inp} value={ew.quelle} onChange={(e) => setEw({ ...ew, quelle: e.target.value })}>
                {QUELLEN.map((q) => <option key={q.key} value={q.key}>{q.name}</option>)}
              </select>
              <label style={{ ...st.dim, display: 'grid', gap: 2 }}>Erteilt am<input type="date" style={st.inp} value={ew.erteilt_am} onChange={(e) => setEw({ ...ew, erteilt_am: e.target.value })} /></label>
            </div>
            <input style={{ ...st.inp, width: '100%', marginTop: 8 }} maxLength={1000} placeholder="Wo liegt der Nachweis? z. B. Formular unterschrieben am Messestand, Ordner Messe 2026" value={ew.nachweis} onChange={(e) => setEw({ ...ew, nachweis: e.target.value })} />
            <button style={{ ...st.primaer, marginTop: 10 }} disabled={busy} onClick={() => void einwSpeichern()}>Einwilligung speichern</button>
            {ew.quelle === 'muendlich' && <p style={{ ...st.dim, marginTop: 8 }}>Mündliche Einwilligungen sind im Streitfall schwer nachzuweisen. Besser schriftlich oder per E-Mail bestätigen lassen.</p>}
          </div>
          <div style={st.karte}>
            {einw.filter((e) => treffer(e.nummer)).length === 0 ? <div style={st.dim}>Noch keine Einwilligungen erfasst.</div> : einw.filter((e) => treffer(e.nummer)).map((e) => (
              <div key={e.id} style={{ ...st.zeile, opacity: e.widerrufen_am ? 0.6 : 1 }}>
                <b style={{ minWidth: 170, textDecoration: e.widerrufen_am ? 'line-through' : 'none' }}>{nummerText(e.nummer)}</b>
                {kName(e.kontakt_id) && <span>{kName(e.kontakt_id)}</span>}
                <span style={{ color: e.widerrufen_am ? C.rot : C.green }}>{e.widerrufen_am ? `widerrufen ${zeitDe(e.widerrufen_am)}` : 'gültig'}</span>
                <span style={st.dim}>{QUELLEN.find((q) => q.key === e.quelle)?.name ?? e.quelle} · erteilt {e.erteilt_am.split('-').reverse().join('.')} · erfasst {zeitDe(e.erfasst_am)} von {e.erfasst_name ?? '—'}</span>
                <span style={{ fontSize: 13.5, flexBasis: '100%' }}>Nachweis: „{e.nachweis}"{e.widerruf_grund ? ` · Widerruf: „${e.widerruf_grund}"` : ''}</span>
                {!e.widerrufen_am && (
                  <span style={{ display: 'flex', gap: 6, flexBasis: '100%' }}>
                    <input style={{ ...st.inp, flex: 1 }} placeholder="Widerruf: wie und wann (optional)" value={widGrund[e.id] ?? ''} onChange={(ev) => setWidGrund({ ...widGrund, [e.id]: ev.target.value })} />
                    <button style={{ ...st.knopf, color: C.rot }} disabled={busy} onClick={() => void widerrufen(e)}>Widerruf eintragen</button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  seite: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 22px 64px', maxWidth: 1100, margin: '0 auto' },
  eyebrow: { fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontSize: 'clamp(24px, 2.3vw, 34px)', fontWeight: 800, margin: 0 },
  sub: { color: C.dim, margin: '8px 0 14px', fontSize: 15, maxWidth: 860, lineHeight: 1.5 },
  err: { color: C.rot, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 12px', margin: '4px 0 12px' },
  karte: { background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 16, padding: 18, marginBottom: 12 },
  titel: { fontWeight: 800, fontSize: 16, marginBottom: 10 },
  reihe: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.rand}`, borderRadius: 9, padding: '8px 10px', fontSize: 14.5, fontFamily: 'inherit', boxSizing: 'border-box', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  knopf: { background: 'transparent', color: C.text, border: `1px solid ${C.rand}`, borderRadius: 10, padding: '7px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  knopfLink: { color: C.gold, border: `1px solid ${C.gold}66`, borderRadius: 10, padding: '8px 14px', fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap', alignSelf: 'flex-start' },
  reiter: { background: 'transparent', color: C.dim, border: `1px solid ${C.rand}`, borderRadius: 999, padding: '7px 14px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  reiterAn: { color: C.navy, background: C.gold, borderColor: C.gold, fontWeight: 800 },
  zeile: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderTop: `1px solid ${C.rand}`, padding: '8px 0' },
  dim: { color: C.dim, fontSize: 13 },
};
