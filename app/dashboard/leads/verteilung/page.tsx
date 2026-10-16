'use client';

// ============================================================================
// ARGONAUT OS · Paket VK3 (16.10.2026) — Termin-Verteilung auf Closer.
// Die Geschäftsleitung legt fest: Modus (aus / reihum / nach freier Zeit),
// welche Terminarten Verkaufsgespräche sind (Online-Buchung ohne gewählten
// Mitarbeiter → freier Closer) und Regeln aus den Qualifizierungs-Antworten
// (z. B. Budget „über 20.000 €" → nur erfahrene Closer). Am Lead schlägt
// „⚡ Vorschlag" den Closer nach denselben Regeln vor.
// Logik: lib/terminVerteilung.ts · Server: lib/terminVerteilungServer.ts · SQL p409.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import Leerzustand from '../../_components/Leerzustand';
import { C, s } from '../../bestattung/bestattungUi';
import { nichtsGeschrieben } from '@/lib/speichernPruefen';
import { teamAufbauen, type FunktionRoh, type MitarbeiterRoh } from '@/lib/verkaufsteam';
import { MODI, istModus, regelnBereinigen, waehleCloser, belegung, letzteZuteilung, type Modus, type Regel, type Closer, type Termin } from '@/lib/terminVerteilung';
import { STANDARD_FRAGEN, fragenBereinigen, type Frage } from '@/lib/qualifizierung';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

type Art = { id: string; name: string | null; aktiv: boolean | null };

export default function VerteilungPage() {
  const [istChef, setIstChef] = useState(false);
  const [closer, setCloser] = useState<Closer[]>([]);
  const [arten, setArten] = useState<Art[]>([]);
  const [fragen, setFragen] = useState<Frage[]>([...STANDARD_FRAGEN]);
  const [modus, setModus] = useState<Modus>('aus');
  const [artIds, setArtIds] = useState<string[]>([]);
  const [regeln, setRegeln] = useState<Regel[]>([]);
  const [neu, setNeu] = useState<Regel>({ frage: '', wert: '', an: [] });
  const [termine, setTermine] = useState<Termin[]>([]);
  const [zuletzt, setZuletzt] = useState<Map<string, string>>(new Map());
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const me = u?.user?.id ?? null;
    if (!me) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    const chefId = typeof chef === 'string' && chef ? chef : me;
    setIstChef(chefId === me);
    const jetzt = new Date(); const bis = new Date(jetzt.getTime() + 14 * 86400000);
    const [v, m, f, a, b, t, ue] = await Promise.all([
      supabase.from('vk_verteilung').select('modus, termin_art_ids, regeln').maybeSingle(),
      supabase.from('mitarbeiter').select('id, auth_user_id, vorname, nachname, status').eq('owner_user_id', chefId).limit(2000),
      supabase.from('vk_funktion').select('user_id, funktion, frei, aktiv').limit(2000),
      supabase.from('termin_arten').select('id, name, aktiv').order('name').limit(200),
      supabase.from('vk_bogen').select('fragen').eq('aktiv', true).limit(200),
      supabase.from('termine').select('mitarbeiter_id, beginn_am, ende_am, status').gte('ende_am', jetzt.toISOString()).lte('beginn_am', bis.toISOString()).limit(5000),
      supabase.from('vk_uebergabe').select('an_user_id, erstellt_am').gte('erstellt_am', new Date(jetzt.getTime() - 90 * 86400000).toISOString()).limit(5000),
    ]);
    if (v.error && /vk_verteilung/.test(v.error.message)) { setSqlFehlt(true); setLaden(false); return; }
    const ma = ((m.data as (MitarbeiterRoh & { id: string })[] | null) ?? []);
    const team = teamAufbauen(chefId, ma, ((f.data as FunktionRoh[] | null) ?? []));
    const maId = new Map(ma.filter((x) => x.auth_user_id).map((x) => [x.auth_user_id as string, x.id]));
    const cl = team.filter((p) => p.aktiv && p.funktion === 'closer').map((p) => ({ user_id: p.user_id, name: p.name, mitarbeiter_id: maId.get(p.user_id) ?? null }));
    setCloser(cl);
    setArten(((a.data as Art[] | null) ?? []));
    const eigene = ((b.data as { fragen: unknown }[] | null) ?? []).flatMap((x) => fragenBereinigen(x.fragen));
    const alle = [...STANDARD_FRAGEN, ...eigene].filter((q, i, arr) => (q.typ === 'auswahl' || q.typ === 'janein') && arr.findIndex((y) => y.key === q.key) === i);
    setFragen(alle);
    const cfg = v.data as { modus?: string; termin_art_ids?: string[]; regeln?: unknown } | null;
    setModus(cfg && istModus(cfg.modus) ? cfg.modus : 'aus');
    setArtIds(cfg?.termin_art_ids ?? []);
    setRegeln(regelnBereinigen(cfg?.regeln, cl.map((c) => c.user_id)));
    setTermine((t.data as Termin[] | null) ?? []);
    setZuletzt(letzteZuteilung(((ue.data as { an_user_id: string; erstellt_am: string }[] | null) ?? []).map((x) => ({ user_id: x.an_user_id, am: x.erstellt_am }))));
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const minuten = useMemo(() => belegung(termine, new Date(), new Date(Date.now() + 14 * 86400000)), [termine]);
  const dran = useMemo(() => waehleCloser({ modus: modus === 'aus' ? 'reihum' : modus, closer, zuletzt, minuten }), [modus, closer, zuletzt, minuten]);
  const frageNeu = fragen.find((q) => q.key === neu.frage);
  const werte = frageNeu ? (frageNeu.typ === 'janein' ? ['ja', 'nein'] : frageNeu.optionen ?? []) : [];
  const name = (id: string) => closer.find((c) => c.user_id === id)?.name ?? 'Ehemalig';

  async function speichern() {
    setOk(null); setFehler(null);
    if (modus !== 'aus' && closer.length === 0) { setFehler('Ohne Closer im Verkaufsteam kann nichts verteilt werden.'); return; }
    setBusy(true);
    try {
      const zeile = { modus, termin_art_ids: artIds, regeln: regelnBereinigen(regeln, closer.map((c) => c.user_id)), aktualisiert_am: new Date().toISOString() };
      const { data: da } = await supabase.from('vk_verteilung').select('id').maybeSingle();
      const res = da
        ? await supabase.from('vk_verteilung').update(zeile).eq('id', (da as { id: string }).id).select('id')
        : await supabase.from('vk_verteilung').insert(zeile).select('id');
      if (res.error || nichtsGeschrieben(res.data)) { setFehler('Nicht gespeichert — die Verteilung legt nur die Geschäftsleitung fest.'); return; }
      setOk(modus === 'aus' ? 'Gespeichert. Die automatische Verteilung ist aus.' : 'Gespeichert. Neue Online-Buchungen der gewählten Terminarten gehen ab jetzt an einen freien Closer.');
    } finally { setBusy(false); }
  }

  function regelDazu() {
    if (!neu.frage || !neu.wert || neu.an.length === 0) { setFehler('Für eine Regel bitte Frage, Antwort und mindestens einen Closer wählen.'); return; }
    setFehler(null); setRegeln([...regeln, neu]); setNeu({ frage: '', wert: '', an: [] });
  }

  return (
    <div style={s.page}>
      <div style={{ marginBottom: 6 }}><Link href="/dashboard/leads/team" style={{ color: C.dim, fontSize: 13 }}>← Verkaufsteam</Link></div>
      <h1 style={s.h1}>🔀 Termin-Verteilung</h1>
      <p style={s.dim}>
        So geht&apos;s: Wählen Sie, wie Verkaufsgespräche auf Ihre Closer verteilt werden. Online gebuchte Termine der markierten Terminarten
        gehen automatisch an einen Closer, der zu dieser Zeit frei ist; er bekommt eine Glocke. Am Lead schlägt „⚡ Vorschlag" bei der Übergabe
        denselben Closer vor. Regeln aus der Qualifizierung haben Vorrang — ist dort niemand frei, gilt wieder das ganze Team.
      </p>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok}>{ok}</div>}
      {sqlFehlt && <div style={s.hinweis}>Noch nicht eingerichtet (SQL von Paket VK3 fehlt).</div>}

      {!sqlFehlt && !laden && (<>
        {closer.length === 0 ? (
          <Leerzustand icon="🔀" titel="Noch keine Closer"
            text="Verteilt wird nur an Personen mit der Funktion „Closer“ im Verkaufsteam."
            schritte={['Unter Verkaufsteam die Funktion „Closer“ vergeben', 'Hier den Modus wählen', 'Terminarten für Verkaufsgespräche markieren']}
            aktionText="Zum Verkaufsteam" aktionHref="/dashboard/leads/team" />
        ) : (
          <div style={s.box}>
            <b>Closer im Team</b>
            <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
              {closer.map((c) => (
                <div key={c.user_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14, borderBottom: `1px solid ${C.border}`, padding: '4px 0' }}>
                  <span>{c.name}{dran?.user_id === c.user_id ? <b style={{ color: C.gold }}> · als Nächstes dran</b> : null}</span>
                  <span style={{ color: c.mitarbeiter_id ? C.dim : C.warn }}>{c.mitarbeiter_id ? `${Math.round((minuten.get(c.mitarbeiter_id) ?? 0) / 6) / 10} Std. in 14 Tagen` : 'ohne Personal-Eintrag: bekommt keine Termine'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ ...s.box, marginTop: 12 }}>
          <b>1 · Modus</b>
          <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
            {MODI.map((m) => (
              <label key={m.key} style={{ fontSize: 14 }}>
                <input type="radio" name="modus" disabled={!istChef} checked={modus === m.key} onChange={() => setModus(m.key)} /> <b>{m.name}</b> — {m.text}
              </label>
            ))}
          </div>
        </div>

        <div style={{ ...s.box, marginTop: 12 }}>
          <b>2 · Terminarten für Verkaufsgespräche (Online-Buchung)</b>
          {arten.length === 0 ? <p style={s.klein}>Noch keine Terminarten angelegt (Termine → Terminarten).</p> : (
            <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
              {arten.map((a) => (
                <label key={a.id} style={{ fontSize: 14, opacity: a.aktiv === false ? 0.55 : 1 }}>
                  <input type="checkbox" disabled={!istChef} checked={artIds.includes(a.id)} onChange={(e) => setArtIds(e.target.checked ? [...artIds, a.id] : artIds.filter((x) => x !== a.id))} /> {a.name || 'Ohne Namen'}
                </label>
              ))}
            </div>
          )}
          <p style={s.klein}>Wählt der Kunde beim Buchen selbst einen Mitarbeiter, bleibt es bei seiner Wahl.</p>
        </div>

        <div style={{ ...s.box, marginTop: 12 }}>
          <b>3 · Regeln aus der Qualifizierung (für „⚡ Vorschlag“ am Lead)</b>
          {regeln.length === 0 ? <p style={s.klein}>Keine Regeln — alle Closer kommen in Frage.</p> : regeln.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14, borderBottom: `1px solid ${C.border}`, padding: '5px 0' }}>
              <span>Wenn „{fragen.find((q) => q.key === r.frage)?.frage ?? r.frage}“ = <b>{r.wert}</b> → {r.an.map(name).join(', ')}</span>
              {istChef && <button style={s.mini} onClick={() => setRegeln(regeln.filter((_, j) => j !== i))}>entfernen</button>}
            </div>
          ))}
          {istChef && closer.length > 0 && (
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                <select style={s.input} value={neu.frage} onChange={(e) => setNeu({ ...neu, frage: e.target.value, wert: '' })}>
                  <option value="">— Frage —</option>
                  {fragen.map((q) => <option key={q.key} value={q.key}>{q.frage}</option>)}
                </select>
                <select style={s.input} value={neu.wert} onChange={(e) => setNeu({ ...neu, wert: e.target.value })} disabled={!frageNeu}>
                  <option value="">— Antwort —</option>
                  {werte.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 14 }}>
                {closer.map((c) => (
                  <label key={c.user_id}><input type="checkbox" checked={neu.an.includes(c.user_id)} onChange={(e) => setNeu({ ...neu, an: e.target.checked ? [...neu.an, c.user_id] : neu.an.filter((x) => x !== c.user_id) })} /> {c.name}</label>
                ))}
              </div>
              <div><button style={s.mini} onClick={regelDazu}>+ Regel</button></div>
            </div>
          )}
        </div>

        {istChef ? <button style={{ ...s.btnGold, marginTop: 14 }} disabled={busy} onClick={() => void speichern()}>Verteilung speichern</button>
          : <p style={s.klein}>Die Verteilung legt die Geschäftsleitung fest.</p>}
      </>)}
    </div>
  );
}
