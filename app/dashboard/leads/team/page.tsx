'use client';

// ============================================================
// ARGONAUT OS · Paket 358 (13.10.2026) · VK1 Verkaufsteam, Teil 1
// Funktion je Person (Setter / Closer / Teamleitung), „frei" (nur eigene
// Leads, keine Deals) und Übersicht, wer wie viele Leads betreut.
// Funktionen setzt nur die Geschäftsleitung; das Team sieht die Übersicht.
// Logik: lib/verkaufsteam.ts (tests/verkaufsteamP358).
// Datenbank: supabase-sql/p358-verkaufsteam-zustaendige.sql.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import Leerzustand from '../../_components/Leerzustand';
import { C, s } from '../../bestattung/bestattungUi';
import { nichtsGeschrieben } from '@/lib/speichernPruefen';
import { gruendeZaehlen, passtQuote } from '@/lib/qualifizierung';
import {
  FUNKTIONEN, teamAufbauen, uebersicht, funktionWerte, funktionName,
  type Person, type MitarbeiterRoh, type FunktionRoh, type LeadKurz,
} from '@/lib/verkaufsteam';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type Entwurf = Record<string, { funktion: string; frei: boolean; aktiv: boolean }>;

export default function VerkaufsteamPage() {
  const [team, setTeam] = useState<Person[]>([]);
  const [leads, setLeads] = useState<LeadKurz[]>([]);
  const [ich, setIch] = useState<string | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [frei, setFrei] = useState(false);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState<Entwurf>({});
  // Paket VK2: Qualifizierung und Übergaben der letzten 90 Tage
  const [qualis, setQualis] = useState<{ ergebnis: string; grund: string | null }[] | null>(null);
  const [uebergaben, setUebergaben] = useState<{ an_user_id: string }[]>([]);

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const me = u?.user?.id ?? null;
    if (!me) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    const chefId = typeof chef === 'string' && chef ? chef : me;
    setIch(me); setIstChef(chefId === me);
    const [m, f, fr, l] = await Promise.all([
      supabase.from('mitarbeiter').select('auth_user_id, vorname, nachname, status').eq('owner_user_id', chefId).limit(2000),
      supabase.from('vk_funktion').select('user_id, funktion, frei, aktiv').limit(2000),
      supabase.rpc('p358_frei'),
      supabase.from('leads').select('id, setter_user_id, closer_user_id, status, stufe').limit(5000),
    ]);
    if (f.error) { setSqlFehlt(true); setLaden(false); return; }
    setSqlFehlt(false);
    const t = teamAufbauen(chefId, m.error ? [] : ((m.data as unknown) as MitarbeiterRoh[]) ?? [], ((f.data as unknown) as FunktionRoh[]) ?? []);
    setTeam(t);
    setFrei(!fr.error && fr.data === true);
    setLeads(l.error ? [] : ((l.data as unknown) as LeadKurz[]) ?? []);
    setEntwurf(Object.fromEntries(t.map((p) => [p.user_id, { funktion: p.funktion ?? '', frei: p.frei, aktiv: p.aktiv }])));
    const seit = new Date(Date.now() - 90 * 86400000).toISOString();
    const [q, ue] = await Promise.all([
      supabase.from('lead_qualifizierung').select('ergebnis, grund').gte('aktualisiert_am', seit).limit(5000),
      supabase.from('vk_uebergabe').select('an_user_id').gte('erstellt_am', seit).limit(5000),
    ]);
    setQualis(q.error ? null : ((q.data as { ergebnis: string; grund: string | null }[]) ?? []));
    setUebergaben(ue.error ? [] : ((ue.data as { an_user_id: string }[]) ?? []));
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  async function speichern(p: Person) {
    const e = entwurf[p.user_id];
    if (!e) return;
    setBusy(p.user_id); setFehler(null); setOk(null);
    try {
      const w = funktionWerte(p, e.funktion || null, e.frei, e.aktiv);
      const { data, error } = await supabase.from('vk_funktion').upsert({ ...w, owner_user_id: ich }, { onConflict: 'owner_user_id,user_id' }).select('id');
      if (error) { setFehler(/gehört nicht|Geschäftsleitung/.test(error.message) ? error.message : 'Nicht gespeichert — Funktionen setzt nur die Geschäftsleitung (und SQL Paket 358).'); return; }
      if (nichtsGeschrieben(data)) { setFehler('Nicht gespeichert — Funktionen setzt nur die Geschäftsleitung.'); return; }
      setOk(`${p.name}: ${funktionName(w.funktion)}${w.frei ? ', frei (nur eigene Leads, keine Deals)' : ''} gespeichert.`);
      await lade();
    } finally { setBusy(null); }
  }

  if (laden) return <div style={s.page}><p style={s.dim}>Lade Verkaufsteam …</p></div>;

  const ueb = uebersicht(team, leads);
  const meine = ueb.zeilen.find((z) => z.person.user_id === ich);

  return (
    <div style={s.page}>
      <div style={{ marginBottom: 6 }}><Link href="/dashboard/leads" style={{ color: C.dim, fontSize: 13 }}>← Leads</Link></div>
      <h1 style={s.h1}>👥 Verkaufsteam</h1>
      <p style={s.dim}>
        So geht&apos;s: Die Geschäftsleitung legt hier fest, wer im Verkauf Setter (ruft an, qualifiziert, bucht Termine), Closer (führt das
        Verkaufsgespräch) oder Teamleitung ist. Am Lead tragen Sie dann Setter und Closer ein — oder jemand klickt „Ich übernehme". In der
        Lead-Liste filtert „Meine" auf die eigenen Leads. Wer als „frei" markiert ist (z. B. ein freier Setter), sieht nur Leads, für die er
        zuständig ist, keine Deals, keine Preise im Angebotsentwurf und kann Zuständige nicht ändern.
      </p>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok}>{ok}</div>}
      {sqlFehlt && <div style={s.hinweis}>Das Verkaufsteam ist noch nicht eingerichtet (SQL Paket 358 fehlt).</div>}

      {!sqlFehlt && (<>
        <div style={s.kacheln}>
          <div style={s.kachel}><div style={s.dim}>Im Team</div><b style={s.zahl}>{team.filter((p) => p.aktiv).length}</b></div>
          <div style={s.kachel}><div style={s.dim}>Leads ohne Zuständige</div><b style={{ ...s.zahl, color: ueb.ohneOffen ? C.warn : C.text }}>{ueb.ohne}</b><span style={s.klein}>davon offen: {ueb.ohneOffen}</span></div>
          {meine && <div style={s.kachel}><div style={s.dim}>Meine Leads</div><b style={s.zahl}>{meine.setter + meine.closer}</b><span style={s.klein}>offen: {meine.offen}</span></div>}
        </div>

        {team.length <= 1 && (
          <Leerzustand icon="👥" titel="Noch kein Team"
            text="Im Verkaufsteam erscheinen alle Mitarbeiter mit eigener Anmeldung."
            schritte={['Unter Personal einen Mitarbeiter anlegen und einladen', 'Hier seine Funktion festlegen (Setter, Closer, Teamleitung)', 'Am Lead Setter und Closer eintragen']} />
        )}

        {frei && <div style={s.hinweis}>Sie sind als freier Setter eingetragen: Sie sehen nur Ihre eigenen Leads und keine Deals.</div>}

        <div style={{ overflowX: 'auto' }}>
          <table style={s.tabelle}>
            <thead><tr>
              <th style={s.th}>Person</th><th style={s.th}>Funktion</th><th style={s.th}>frei</th><th style={s.th}>aktiv</th>
              <th style={s.th}>als Setter</th><th style={s.th}>als Closer</th><th style={s.th}>offen</th><th style={s.th}></th>
            </tr></thead>
            <tbody>{ueb.zeilen.map((z) => {
              const p = z.person; const e = entwurf[p.user_id] ?? { funktion: '', frei: false, aktiv: true };
              const anders = e.funktion !== (p.funktion ?? '') || e.frei !== p.frei || e.aktiv !== p.aktiv;
              return (
                <tr key={p.user_id} style={{ opacity: p.aktiv ? 1 : 0.55 }}>
                  <td style={s.td}>{p.name}{p.user_id === ich ? <span style={s.klein}> (Sie)</span> : null}</td>
                  <td style={s.td}>{istChef ? (
                    <select style={{ ...s.input, width: 'auto' }} value={e.funktion} onChange={(ev) => setEntwurf({ ...entwurf, [p.user_id]: { ...e, funktion: ev.target.value } })}>
                      <option value="">—</option>
                      {FUNKTIONEN.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
                    </select>
                  ) : funktionName(p.funktion)}</td>
                  <td style={s.td}>{p.chef ? '—' : istChef
                    ? <input type="checkbox" checked={e.frei} onChange={(ev) => setEntwurf({ ...entwurf, [p.user_id]: { ...e, frei: ev.target.checked } })} aria-label="frei" />
                    : (p.frei ? 'ja' : 'nein')}</td>
                  <td style={s.td}>{p.chef ? '—' : istChef
                    ? <input type="checkbox" checked={e.aktiv} onChange={(ev) => setEntwurf({ ...entwurf, [p.user_id]: { ...e, aktiv: ev.target.checked } })} aria-label="aktiv" />
                    : (p.aktiv ? 'ja' : 'nein')}</td>
                  <td style={s.td}>{z.setter}</td><td style={s.td}>{z.closer}</td><td style={s.td}>{z.offen}</td>
                  <td style={s.td}>{istChef && anders && <button style={s.mini} disabled={busy === p.user_id} onClick={() => void speichern(p)}>speichern</button>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        {/* Paket VK2: Qualifizierung und Übergaben (90 Tage) */}
        {qualis && (() => {
          const qq = passtQuote(qualis);
          const gr = gruendeZaehlen(qualis);
          const jeCloser = new Map<string, number>();
          for (const u of uebergaben) jeCloser.set(u.an_user_id, (jeCloser.get(u.an_user_id) ?? 0) + 1);
          const maxG = Math.max(1, ...gr.map((g) => g.anzahl));
          return (
            <div style={{ ...s.box, marginTop: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <b>🎯 Qualifizierung (90 Tage)</b>
                <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {istChef && <Link href="/dashboard/leads/boegen" style={{ color: C.gold, fontSize: 13.5 }}>📋 Qualifizierungsbögen verwalten</Link>}
                  <Link href="/dashboard/leads/verteilung" style={{ color: C.gold, fontSize: 13.5 }}>🔀 Termin-Verteilung</Link>
                </span>
              </div>
              <div style={s.kacheln}>
                <div style={s.kachel}><div style={s.dim}>Passt</div><b style={{ ...s.zahl, color: C.ok }}>{qq.passt}</b></div>
                <div style={s.kachel}><div style={s.dim}>Passt nicht</div><b style={{ ...s.zahl, color: C.bad }}>{qq.passtNicht}</b></div>
                <div style={s.kachel}><div style={s.dim}>Quote passt</div><b style={s.zahl}>{qq.quote === null ? '–' : `${qq.quote} %`}</b><span style={s.klein}>noch offen: {qq.offen}</span></div>
              </div>
              {qualis.length === 0 ? (
                <p style={s.klein}>Noch keine Qualifizierung erfasst. Am Lead unter „🎯 Qualifizierung" den Bogen ausfüllen und „Passt" oder „Passt nicht" wählen.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 8 }}>
                  <div>
                    <div style={s.h3}>Warum es nicht passt</div>
                    {gr.length === 0 ? <span style={s.klein}>Noch kein „Passt nicht".</span> : gr.map((g) => (
                      <div key={g.key} style={{ position: 'relative', margin: '4px 0' }}>
                        <div style={{ position: 'absolute', inset: 0, width: `${(g.anzahl / maxG) * 100}%`, background: C.bad, opacity: 0.15, borderRadius: 6 }} />
                        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '5px 8px', fontSize: 14 }}><span>{g.text}</span><b>{g.anzahl}</b></div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={s.h3}>Übergaben je Closer</div>
                    {jeCloser.size === 0 ? <span style={s.klein}>Noch keine Übergabe.</span> : [...jeCloser.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => (
                      <div key={id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', fontSize: 14, borderBottom: `1px solid ${C.border}` }}>
                        <span>{team.find((p) => p.user_id === id)?.name ?? 'Ehemalig'}</span><b>{n}</b>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        <p style={s.klein}>
          {FUNKTIONEN.map((f) => `${f.name}: ${f.text}`).join(' · ')}. „frei" passt für freie Mitarbeiter ohne Einblick in Umsätze; die
          Geschäftsleitung kann nicht „frei" sein. Wer „inaktiv" ist, erscheint nicht mehr in der Auswahl am Lead.
        </p>
      </>)}
    </div>
  );
}
