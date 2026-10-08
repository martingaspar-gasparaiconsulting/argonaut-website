'use client';

// ============================================================
// ARGONAUT OS · Paket 277 · K13 Brief-Tresor auf einen Blick
// Was ist gerade ausgegeben (und überfällig)? Bei welchen Fahrzeugen im Bestand
// liegt der Brief nicht im Haus? Welche Zulassungen laufen, welche Fahrzeuge
// stehen in der Aufbereitung? Bearbeitet wird in der Handelsakte
// (Reiter „Brief und Schlüssel").
// Pfad: app/dashboard/kfz/tresor/page.tsx — Unterpfad von /dashboard/kfz, erbt dessen Freigabe.
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { imBestand } from '@/lib/kfzBestand';
import { artName, statusName, ueberfaellig, briefLage, zulassungArt, zulassungFortschritt, unterlagenBereinigen, ZULASSUNG_STATUS, type TresorEintrag } from '@/lib/kfzTresor';
import { statusDef } from '../../_components/werkstattLogik';
import Leerzustand from '../../_components/Leerzustand';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };
const FARBE: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad, info: C.info, dim: C.dim };

type Fz = { id: string; interne_nr: string | null; marke: string | null; modell: string | null; status: string; kennzeichen: string | null };
type Eintrag = TresorEintrag & { id: string; bestand_id: string };
type Zul = { id: string; bestand_id: string; art: string; status: string; halter: string | null; termin: string | null; unterlagen: Record<string, boolean> };
type Auftrag = { id: string; kfz_bestand_id: string; nummer: string | null; titel: string; status: string; zugesagt_am: string | null };

function heute(): string { return new Date().toISOString().slice(0, 10); }
function de(iso: string | null | undefined): string { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return `${p[2]}.${p[1]}.${p[0]}`; }

export default function TresorPage() {
  const [fz, setFz] = useState<Record<string, Fz>>({});
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [zul, setZul] = useState<Zul[]>([]);
  const [auftraege, setAuftraege] = useState<Auftrag[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const lade = useCallback(async () => {
    const [b, t, z, a] = await Promise.all([
      supabase.from('kfz_bestand').select('id, interne_nr, marke, modell, status, kennzeichen').limit(3000),
      supabase.from('kfz_tresor').select('id, bestand_id, art, bezeichnung, anzahl, ort, status, ausgegeben_an, ausgegeben_am, zurueck_bis').limit(10000),
      supabase.from('kfz_zulassung').select('id, bestand_id, art, status, halter, termin, unterlagen').in('status', ['offen', 'beim_amt']).limit(2000),
      supabase.from('werkstatt_auftraege').select('id, kfz_bestand_id, nummer, titel, status, zugesagt_am').not('kfz_bestand_id', 'is', null).eq('archiviert', false).limit(2000),
    ]);
    if (b.error) { setFehler('Der Fahrzeugbestand lässt sich nicht laden. Haben Sie das Recht „KFZ"?'); setLaden(false); return; }
    if (t.error) setFehler('Der Brief-Tresor ist noch nicht eingerichtet (SQL Paket 277 fehlt).');
    const m: Record<string, Fz> = {};
    for (const r of ((b.data as unknown) as Fz[]) ?? []) m[r.id] = r;
    setFz(m);
    setEintraege(t.error ? [] : (((t.data as unknown) as Eintrag[]) ?? []));
    setZul(z.error ? [] : (((z.data as unknown) as Zul[]) ?? []));
    setAuftraege(a.error ? [] : (((a.data as unknown) as Auftrag[]) ?? []));
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const tag = heute();
  const name = (id: string) => { const f = fz[id]; return f ? `${f.interne_nr ?? ''} ${[f.marke, f.modell].filter(Boolean).join(' ')}`.trim() : '—'; };
  const ausgegeben = eintraege.filter((e) => e.status === 'ausgegeben').sort((x, y) => String(x.zurueck_bis ?? '9').localeCompare(String(y.zurueck_bis ?? '9')));
  const ueber = ausgegeben.filter((e) => ueberfaellig(e, tag));
  const briefProbleme = useMemo(() => Object.values(fz).filter((f) => imBestand(f.status) && f.status !== 'zulauf').map((f) => ({ f, lage: briefLage(f.status, eintraege.filter((e) => e.bestand_id === f.id)) })).filter((x) => x.lage.stufe !== 'ok'), [fz, eintraege]);
  const offeneAuf = auftraege.filter((a) => a.status !== 'fertig' && a.status !== 'abgeholt');

  if (laden) return <div style={s.page}><p style={s.dim}>Lade Brief-Tresor …</p></div>;

  return (
    <div style={s.page}>
      <a href="/dashboard/kfz" style={s.zurueck}>← KFZ-Fachpaket</a>
      <h1 style={s.h1}>🔐 Brief-Tresor, Zulassung und Aufbereitung</h1>
      <p style={s.dim}>So geht&apos;s: Hier sehen Sie, was gerade ausgegeben ist, bei welchen Fahrzeugen im Bestand der Brief nicht im Haus liegt, welche Zulassungen laufen und was in der Aufbereitung steht. Erfasst und geändert wird in der Handelsakte, Reiter „Brief und Schlüssel".</p>
      {fehler && <div style={s.hinweis}>{fehler}</div>}

      {!Object.keys(fz).length ? (
        <Leerzustand icon="🔐" titel="Noch keine Fahrzeuge im Bestand" text="Sobald Fahrzeuge im Bestand stehen, erfassen Sie Brief und Schlüssel in der Handelsakte — hier sehen Sie dann alles auf einen Blick." aktionText="Zum Fahrzeugbestand" aktionHref="/dashboard/kfz/bestand" />
      ) : (<>
        <div style={s.kacheln}>
          <div style={s.kachel}><div style={s.dim}>Ausgegeben</div><b style={s.zahl}>{ausgegeben.length}</b></div>
          <div style={s.kachel}><div style={s.dim}>Überfällig</div><b style={{ ...s.zahl, color: ueber.length ? C.bad : C.ok }}>{ueber.length}</b></div>
          <div style={s.kachel}><div style={s.dim}>Brief nicht im Haus</div><b style={{ ...s.zahl, color: briefProbleme.length ? C.warn : C.ok }}>{briefProbleme.length}</b></div>
          <div style={s.kachel}><div style={s.dim}>Laufende Zulassungen</div><b style={s.zahl}>{zul.length}</b></div>
          <div style={s.kachel}><div style={s.dim}>In Aufbereitung</div><b style={s.zahl}>{offeneAuf.length}</b></div>
        </div>

        <h2 style={s.h2}>Ausgegeben</h2>
        {!ausgegeben.length ? <p style={s.dim}>Nichts ausgegeben — alles im Haus.</p> : ausgegeben.map((e) => (
          <a key={e.id} href={`/dashboard/kfz/bestand/${e.bestand_id}?reiter=tresor`} style={s.zeile}>
            <span><b>{artName(e.art, true)}</b> · {name(e.bestand_id)}</span>
            <span style={{ color: ueberfaellig(e, tag) ? C.bad : C.warn, fontSize: 13 }}>an {e.ausgegeben_an} seit {de(e.ausgegeben_am)}{e.zurueck_bis ? ` · zurück bis ${de(e.zurueck_bis)}` : ''}{ueberfaellig(e, tag) ? ' — überfällig' : ''}</span>
          </a>
        ))}

        <h2 style={s.h2}>Brief nicht im Haus</h2>
        {!briefProbleme.length ? <p style={s.dim}>Bei allen Fahrzeugen im Bestand liegt der Brief im Haus oder bei der Bank.</p> : briefProbleme.map(({ f, lage }) => (
          <a key={f.id} href={`/dashboard/kfz/bestand/${f.id}?reiter=tresor`} style={s.zeile}>
            <span><b>{name(f.id)}</b></span><span style={{ color: FARBE[lage.stufe], fontSize: 13 }}>{lage.text}</span>
          </a>
        ))}

        <h2 style={s.h2}>Laufende Zulassungen</h2>
        {!zul.length ? <p style={s.dim}>Keine laufenden Zulassungsaufträge.</p> : zul.map((z) => {
          const f = zulassungFortschritt(z.art, unterlagenBereinigen(z.art, z.unterlagen));
          return (
            <a key={z.id} href={`/dashboard/kfz/bestand/${z.bestand_id}?reiter=tresor`} style={s.zeile}>
              <span><b>{zulassungArt(z.art)?.name ?? z.art}</b> · {name(z.bestand_id)}{z.halter ? ` · ${z.halter}` : ''}</span>
              <span style={{ color: f.vollstaendig ? C.ok : C.warn, fontSize: 13 }}>{ZULASSUNG_STATUS.find((x) => x.key === z.status)?.name} · Unterlagen {f.erledigt}/{f.gesamt}{z.termin ? ` · Termin ${de(z.termin)}` : ''}</span>
            </a>
          );
        })}

        <h2 style={s.h2}>Aufbereitung</h2>
        {!auftraege.length ? <p style={s.dim}>Keine internen Werkstattaufträge.</p> : auftraege.map((a) => {
          const sd = statusDef(a.status);
          const spaet = !!a.zugesagt_am && a.zugesagt_am < tag && a.status !== 'fertig' && a.status !== 'abgeholt';
          return (
            <a key={a.id} href={`/dashboard/kfz/bestand/${a.kfz_bestand_id}?reiter=tresor`} style={s.zeile}>
              <span><b>{a.nummer ? `${a.nummer} · ` : ''}{name(a.kfz_bestand_id)}</b></span>
              <span style={{ color: spaet ? C.bad : sd.farbe, fontSize: 13 }}>{sd.label}{a.zugesagt_am ? ` · fertig bis ${de(a.zugesagt_am)}` : ''}{spaet ? ' — verspätet' : ''}</span>
            </a>
          );
        })}
        <p style={{ ...s.dim, marginTop: 14 }}>Status der Unterlagen: {statusName('im_haus')}, {statusName('ausgegeben')}, {statusName('bei_zulassung')}, {statusName('bei_bank')}, {statusName('fehlt')}, {statusName('beim_kaeufer')}.</p>
      </>)}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, padding: '20px 16px 60px', fontFamily: 'DM Sans, system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' },
  zurueck: { color: C.dim, textDecoration: 'none', fontSize: 13.5 },
  h1: { fontSize: 24, margin: '8px 0 6px', color: C.text },
  h2: { fontSize: 16, margin: '20px 0 8px', color: C.gold },
  dim: { color: C.dim, fontSize: 13.5, lineHeight: 1.55 },
  hinweis: { background: 'rgba(224,162,76,0.10)', border: `1px solid ${C.warn}`, color: C.text, borderRadius: 10, padding: '10px 12px', margin: '10px 0', fontSize: 13.5 },
  kacheln: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '14px 0' },
  kachel: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  zahl: { fontSize: 24, display: 'block', marginTop: 4 },
  zeile: { display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', marginBottom: 6, color: C.text, textDecoration: 'none', fontSize: 14 },
};
