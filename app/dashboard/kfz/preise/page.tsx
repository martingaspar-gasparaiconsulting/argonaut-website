'use client';

// ============================================================
// ARGONAUT OS · Paket 275 · K12a Markt und Preis — Preise und Standzeit
// Preis-Cockpit über den ganzen Bestand, NUR aus eigenen Daten: Standtage,
// Untergrenze aus Einkauf + Kosten + Standkosten + Mindest-Rohertrag, Preis-Treppe
// des Betriebs, Aufrufe der eigenen Fahrzeugbörse, Anfragen, Inserats-Ampel.
// Keine KI-Schätzung, keine fremden Marktdaten (Vergleichspreise kommen in K12b).
// Preise ändern sich nur per Knopf; der Preisverlauf (Paket 259) protokolliert.
// Pfad: app/dashboard/kfz/preise/page.tsx — Unterpfad von /dashboard/kfz, erbt dessen Freigabe.
// ============================================================

import { useState, useEffect, useMemo, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseZahl } from '@/lib/zahlen';
import { nichtsGeschrieben, NICHT_GESPEICHERT } from '@/lib/speichernPruefen';
import { vorlageFuer, mitKunde, standtageAmpel, type KundenEinstellung } from '@/lib/branchenVorlage';
import { standtage as standtageVon, imBestand, euro } from '@/lib/kfzBestand';
import { kostenSummen, type Kosten } from '@/lib/kfzKalkulation';
import { inseratAmpel, type AkteFelder } from '@/lib/kfzAkte';
import {
  PREIS_MODUL, standardRegeln, regelnLesen, untergrenze, tageSeitPreis, vorschlag, aufrufeJe, anfragenJe, diagnose,
  standzeitVerteilung, uebernahmeListe, type PreisRegeln, type Vorschlag, type Diagnose, type Aufruf, type AnfrageMini,
} from '@/lib/kfzPreis';
import { marktLage, type Vergleich, type Lage } from '@/lib/kfzMarkt';
import Leerzustand from '../../_components/Leerzustand';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };
const FARBE: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad, dim: C.dim };
const MARKT_FARBE: Record<string, string> = { ...FARBE, info: C.info };

const SPALTEN = 'id, owner_user_id, interne_nr, status, marke, modell, variante, erstzulassung, km_stand, eingang_am, verkauft_am, ek_netto, vk_brutto, besteuerung, inseriert, kraftstoff, verbrauch_komb, verbrauch_einheit, co2_g_km, co2_klasse, vorschaden, inserat_titel, inserat_text, ausstattung';

type Fz = AkteFelder & {
  id: string; owner_user_id: string; interne_nr: string | null; variante: string | null;
  eingang_am: string | null; verkauft_am: string | null; ek_netto: number | null; besteuerung: string | null;
  erstzulassung: string | null; km_stand: number | null;
};
type Zeile = {
  f: Fz; tage: number | null; grenze: number | null; seit: number | null; aufrufe: number; anfragen: number;
  ampel: number; v: Vorschlag; d: Diagnose; markt: Lage;
};
type Filter = 'alle' | 'senken' | 'nachfrage' | 'grenze';

function heute(): string { return new Date().toISOString().slice(0, 10); }
function vorTagen(n: number): string { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }
function name(f: Fz): string { return [f.marke, f.modell, f.variante].filter(Boolean).join(' ') || 'Fahrzeug'; }

export default function PreisePage() {
  const [fz, setFz] = useState<Fz[]>([]);
  const [kosten, setKosten] = useState<(Kosten & { bestand_id: string })[]>([]);
  const [preisAm, setPreisAm] = useState<Record<string, string[]>>({});
  const [aufrufe, setAufrufe] = useState<Aufruf[]>([]);
  const [anfragen, setAnfragen] = useState<AnfrageMini[]>([]);
  const [fotos, setFotos] = useState<Record<string, number>>({});
  const [vergleiche, setVergleiche] = useState<(Vergleich & { bestand_id: string })[]>([]);
  const [standkostenTag, setStandkostenTag] = useState(0);
  const [ampelGrenzen, setAmpelGrenzen] = useState({ gruenBis: 60, gelbBis: 90 });
  const [regeln, setRegeln] = useState<PreisRegeln>(standardRegeln());
  const [regelnRoh, setRegelnRoh] = useState<Record<string, unknown>>({});
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [zaehlerFehlt, setZaehlerFehlt] = useState(false);
  const [filter, setFilter] = useState<Filter>('alle');
  const [entwurf, setEntwurf] = useState<{ stufen: { ab: string; prozent: string }[]; abstand: string; mindest: string; viel: string } | null>(null);
  const [frageAlle, setFrageAlle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id ?? null;
    if (!uid) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    const b = typeof chef === 'string' && chef ? chef : uid;
    setBetrieb(b); setIstChef(b === uid);
    const ab = vorTagen(40);
    const [f, k, pr, au, an, me, e, p, mv] = await Promise.all([
      supabase.from('kfz_bestand').select(SPALTEN).not('status', 'in', '("verkauft","archiv")').limit(2000),
      supabase.from('kfz_bestand_kosten').select('bestand_id, art, betrag_netto, plan').limit(10000),
      supabase.from('kfz_bestand_preis').select('bestand_id, geaendert_am').order('geaendert_am', { ascending: false }).limit(10000),
      supabase.from('kfz_boerse_aufruf').select('bestand_id, tag, anzahl').gte('tag', ab).limit(20000),
      supabase.from('kfz_anfrage').select('bestand_id, erstellt_am').gte('erstellt_am', ab).limit(10000),
      supabase.from('kfz_bestand_medien').select('bestand_id').eq('art', 'foto').limit(20000),
      supabase.from('modul_einstellung').select('modul, einstellung').eq('owner_user_id', b).in('modul', ['kfz-bestand', PREIS_MODUL]),
      supabase.from('profiles').select('branche').eq('id', b).maybeSingle(),
      supabase.from('kfz_marktvergleich').select('bestand_id, preis, km, erstzulassung, erfasst_am').gte('erfasst_am', ab).limit(20000),
    ]);
    if (f.error) { setFehler('Der Fahrzeugbestand lässt sich nicht laden. Ist SQL Paket 259 ausgeführt und haben Sie das Recht „KFZ"?'); setLaden(false); return; }
    setFz((((f.data as unknown) as Fz[]) ?? []).filter((x) => imBestand(x.status)));
    setKosten(((k.data as unknown) as (Kosten & { bestand_id: string })[]) ?? []);
    const pm: Record<string, string[]> = {};
    for (const z of ((pr.data as unknown) as { bestand_id: string; geaendert_am: string }[]) ?? []) (pm[z.bestand_id] ??= []).push(z.geaendert_am);
    setPreisAm(pm);
    setZaehlerFehlt(!!au.error);
    setAufrufe(au.error ? [] : (((au.data as unknown) as Aufruf[]) ?? []));
    setAnfragen(an.error ? [] : (((an.data as unknown) as AnfrageMini[]) ?? []));
    const fm: Record<string, number> = {};
    for (const z of ((me.data as unknown) as { bestand_id: string }[]) ?? []) fm[z.bestand_id] = (fm[z.bestand_id] ?? 0) + 1;
    setFotos(fm);
    setVergleiche(mv.error ? [] : (((mv.data as unknown) as (Vergleich & { bestand_id: string })[]) ?? []).map((z) => ({ ...z, preis: z.preis === null ? null : Number(z.preis) })));
    const einst = ((e.data as unknown) as { modul: string; einstellung: Record<string, unknown> }[]) ?? [];
    const v = vorlageFuer('kfz-bestand', ((p.data as { branche?: string | null } | null)?.branche) ?? null);
    const vk = v ? mitKunde(v, (einst.find((x) => x.modul === 'kfz-bestand')?.einstellung as KundenEinstellung | undefined) ?? null) : null;
    setStandkostenTag(vk?.standkostenTag ?? 0);
    const ag = vk?.ampel ?? { gruenBis: 60, gelbBis: 90 };
    setAmpelGrenzen(ag);
    const roh = einst.find((x) => x.modul === PREIS_MODUL)?.einstellung ?? {};
    setRegelnRoh(roh);
    setRegeln(regelnLesen(roh, standardRegeln(ag)));
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const tag = heute();
  const zeilen: Zeile[] = useMemo(() => {
    const auf = aufrufeJe(aufrufe, tag);
    const anf = anfragenJe(anfragen, tag);
    const kostenJe: Record<string, Kosten[]> = {};
    for (const k of kosten) (kostenJe[k.bestand_id] ??= []).push(k);
    const mvJe: Record<string, Vergleich[]> = {};
    for (const v of vergleiche) (mvJe[v.bestand_id] ??= []).push(v);
    return fz.map((f) => {
      const tage = standtageVon(f, tag);
      const plan = kostenSummen(kostenJe[f.id] ?? []).plan;
      const grenze = untergrenze({ besteuerung: f.besteuerung, ek: f.ek_netto, kosten: plan, standkosten: (tage ?? 0) * standkostenTag, mindestRohertrag: regeln.mindestRohertrag });
      const seit = tageSeitPreis(preisAm[f.id] ?? [], tag);
      const ampel = inseratAmpel({ ...f, fotos: fotos[f.id] ?? 0 }).prozent;
      const a = auf[f.id] ?? 0, q = anf[f.id] ?? 0;
      return {
        f, tage, grenze, seit, aufrufe: a, anfragen: q, ampel,
        v: vorschlag({ vk: f.vk_brutto, standtage: tage, seitPreis: seit, untergrenze: grenze, regeln }),
        d: diagnose({ inseriert: !!f.inseriert, ampel, aufrufe: a, anfragen: q, standtage: tage, aufrufeViel: regeln.aufrufeViel }),
        markt: marktLage({ vk: f.vk_brutto, km: f.km_stand, erstzulassung: f.erstzulassung }, mvJe[f.id] ?? [], tag),
      };
    }).sort((x, y) => (y.tage ?? -1) - (x.tage ?? -1));
  }, [fz, kosten, preisAm, aufrufe, anfragen, fotos, vergleiche, standkostenTag, regeln, tag]);

  const gezeigt = zeilen.filter((z) => filter === 'alle' ? true
    : filter === 'senken' ? z.v.art === 'senken'
    : filter === 'grenze' ? z.v.art === 'grenze' || z.v.art === 'unter_grenze'
    : z.d.stufe === 'warn' || z.d.stufe === 'bad');
  const vert = useMemo(() => standzeitVerteilung(zeilen.map((z) => ({ standtage: z.tage, ek: z.f.ek_netto }))), [zeilen]);
  const maxVert = Math.max(1, ...vert.map((x) => x.anzahl));
  const mitTagen = zeilen.filter((z) => z.tage !== null);
  const schnitt = mitTagen.length ? Math.round(mitTagen.reduce((s, z) => s + (z.tage ?? 0), 0) / mitTagen.length) : null;
  const zuSenken = uebernahmeListe(zeilen.map((z) => ({ id: z.f.id, vk: z.f.vk_brutto, v: z.v })));
  const anzahl = (fl: Filter) => zeilen.filter((z) => fl === 'senken' ? z.v.art === 'senken' : fl === 'grenze' ? z.v.art === 'grenze' || z.v.art === 'unter_grenze' : fl === 'nachfrage' ? z.d.stufe === 'warn' || z.d.stufe === 'bad' : true).length;

  async function preisSetzen(liste: { id: string; neu: number }[]) {
    setBusy(true); setFehler(null); setOk(null);
    let gut = 0; const schlecht: string[] = [];
    try {
      for (const x of liste) {
        const { data, error } = await supabase.from('kfz_bestand').update({ vk_brutto: x.neu, aktualisiert_am: new Date().toISOString() }).eq('id', x.id).select('id');
        if (error || nichtsGeschrieben(data)) schlecht.push(x.id); else gut += 1;
      }
    } finally { setBusy(false); setFrageAlle(false); }
    if (schlecht.length) setFehler(gut ? `${gut} Preise geändert, ${schlecht.length} nicht. ${NICHT_GESPEICHERT}` : NICHT_GESPEICHERT);
    else setOk(liste.length === 1 ? 'Preis geändert — im Preisverlauf der Akte vermerkt.' : `${gut} Preise geändert — jeweils im Preisverlauf vermerkt.`);
    await lade();
  }

  function regelnBearbeiten() {
    setEntwurf({
      stufen: regeln.stufen.map((s) => ({ ab: String(s.ab), prozent: String(s.prozent).replace('.', ',') })),
      abstand: String(regeln.abstandTage), mindest: String(regeln.mindestRohertrag).replace('.', ','), viel: String(regeln.aufrufeViel),
    });
  }

  async function regelnSpeichern() {
    if (!entwurf || !betrieb) return;
    const stufen = entwurf.stufen.map((s) => ({ ab: leseZahl(s.ab), prozent: leseZahl(s.prozent) })).filter((s) => s.ab !== null || s.prozent !== null);
    const neu = { stufen, abstandTage: leseZahl(entwurf.abstand), mindestRohertrag: leseZahl(entwurf.mindest), aufrufeViel: leseZahl(entwurf.viel) };
    const gelesen = regelnLesen(neu, standardRegeln(ampelGrenzen));
    if (gelesen.stufen.length !== stufen.length) { setFehler('Jede Stufe braucht 1–999 Standtage und 0,5–20 %; jeder Tag nur einmal.'); return; }
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { data, error } = await supabase.from('modul_einstellung').upsert(
        { owner_user_id: betrieb, modul: PREIS_MODUL, einstellung: { ...regelnRoh, ...gelesen }, aktualisiert_am: new Date().toISOString() },
        { onConflict: 'owner_user_id,modul' },
      ).select('id');
      if (error || nichtsGeschrieben(data)) { setFehler('Speichern fehlgeschlagen — die Preis-Treppe stellt nur die Geschäftsleitung ein.'); return; }
      setEntwurf(null); setOk('Preis-Treppe gespeichert.'); await lade();
    } finally { setBusy(false); }
  }

  if (laden) return <div style={s.page}><p style={s.dim}>Lade Preise und Standzeiten …</p></div>;

  return (
    <div style={s.page}>
      <a href="/dashboard/kfz" style={s.zurueck}>← KFZ-Fachpaket</a>
      <h1 style={s.h1}>💶 Preise und Standzeit</h1>
      <p style={s.dim}>
        So geht&apos;s: Für jedes Fahrzeug im Bestand sehen Sie Standtage, die Untergrenze (Einkauf + Kosten + Standkosten + Mindest-Rohertrag),
        Aufrufe Ihrer Fahrzeugbörse und Anfragen der letzten 30 Tage. Der Preisvorschlag folgt nur Ihrer eigenen Preis-Treppe — ARGONAUT schätzt keine
        Marktpreise. Geändert wird erst, wenn Sie „Übernehmen" drücken; jede Änderung steht im Preisverlauf der Akte.
      </p>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok}>{ok}</div>}
      {zaehlerFehlt && <div style={s.hinweis}>Aufrufe der Fahrzeugbörse werden noch nicht gezählt (SQL Paket 275 fehlt). Alles andere funktioniert schon.</div>}

      {!zeilen.length ? (
        <Leerzustand icon="💶" titel="Noch keine Fahrzeuge im Bestand"
          text="Sobald Fahrzeuge im Bestand stehen, sehen Sie hier Standzeiten, Untergrenzen und Preisvorschläge nach Ihrer Preis-Treppe."
          aktionText="Zum Fahrzeugbestand" aktionHref="/dashboard/kfz/bestand" />
      ) : (<>
        <div style={s.kacheln}>
          <div style={s.kachel}><div style={s.dim}>Im Bestand</div><b style={s.zahl}>{zeilen.length}</b></div>
          <div style={s.kachel}><div style={s.dim}>Ø Standtage</div><b style={{ ...s.zahl, color: FARBE[standtageAmpel(schnitt, ampelGrenzen)] }}>{schnitt ?? '—'}</b></div>
          <div style={s.kachel}><div style={s.dim}>Senkung empfohlen</div><b style={{ ...s.zahl, color: zuSenken.length ? C.warn : C.ok }}>{zuSenken.length}</b></div>
          <div style={s.kachel}><div style={s.dim}>An der Untergrenze</div><b style={{ ...s.zahl, color: anzahl('grenze') ? C.bad : C.ok }}>{anzahl('grenze')}</b></div>
          <div style={s.kachel}><div style={s.dim}>Aufrufe 30 Tage</div><b style={s.zahl}>{zeilen.reduce((x, z) => x + z.aufrufe, 0).toLocaleString('de-DE')}</b></div>
          <div style={s.kachel}><div style={s.dim}>Anfragen 30 Tage</div><b style={s.zahl}>{zeilen.reduce((x, z) => x + z.anfragen, 0)}</b></div>
        </div>

        <div style={s.box}>
          <b style={{ color: C.gold }}>Standzeit-Verteilung</b>
          <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
            {vert.map((k, i) => (
              <div key={k.key} style={{ display: 'grid', gridTemplateColumns: '78px 1fr 120px', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <span style={s.dim}>{k.name}</span>
                <div style={{ background: 'rgba(143,163,190,0.10)', borderRadius: 6, height: 18, overflow: 'hidden' }}>
                  <div style={{ width: `${(k.anzahl / maxVert) * 100}%`, height: '100%', background: i < 2 ? C.ok : i === 2 ? C.warn : C.bad, opacity: 0.85 }} />
                </div>
                <span style={{ textAlign: 'right' }}><b>{k.anzahl}</b> <span style={s.dim}>· EK {euro(k.ek)}</span></span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0 8px' }}>
          {([['alle', 'Alle'], ['senken', 'Senkung empfohlen'], ['nachfrage', 'Nachfrage prüfen'], ['grenze', 'Untergrenze']] as const).map(([k, n]) => (
            <button key={k} style={filter === k ? s.reiterAn : s.reiterAus} onClick={() => setFilter(k)}>{n} ({anzahl(k)})</button>
          ))}
          <span style={{ flex: 1 }} />
          {zuSenken.length > 0 && (frageAlle ? (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>{zuSenken.length} Preise senken?</span>
              <button style={s.btnGold} disabled={busy} onClick={() => void preisSetzen(zuSenken)}>Ja, übernehmen</button>
              <button style={s.btnAus} onClick={() => setFrageAlle(false)}>Abbrechen</button>
            </span>
          ) : <button style={s.btnAus} onClick={() => setFrageAlle(true)}>Alle {zuSenken.length} Vorschläge übernehmen …</button>)}
        </div>

        {!gezeigt.length && <p style={s.dim}>In dieser Ansicht ist gerade kein Fahrzeug.</p>}
        <div style={{ display: 'grid', gap: 8 }}>
          {gezeigt.map((z) => (
            <div key={z.f.id} style={s.karte}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <a href={`/dashboard/kfz/bestand/${z.f.id}`} style={{ color: C.text, fontWeight: 700, textDecoration: 'none' }}>
                  <span style={{ color: C.gold }}>{z.f.interne_nr ?? ''}</span> {name(z.f)}
                </a>
                <span style={{ fontSize: 13, color: FARBE[standtageAmpel(z.tage, ampelGrenzen)] }}>{z.tage === null ? 'Zulauf' : `${z.tage} Standtage`}</span>
              </div>
              <div style={s.werte}>
                <span><span style={s.dim}>Preis</span> <b>{euro(z.f.vk_brutto)}</b></span>
                <span><span style={s.dim}>Untergrenze</span> <b>{z.grenze === null ? 'Einkauf fehlt' : euro(z.grenze)}</b></span>
                <span><span style={s.dim}>Letzte Änderung</span> {z.seit === null ? '—' : `vor ${z.seit} T.`}</span>
                <span><span style={s.dim}>Aufrufe</span> {z.f.inseriert ? z.aufrufe : '—'}</span>
                <span><span style={s.dim}>Anfragen</span> {z.anfragen}</span>
                <span><span style={s.dim}>Inserat</span> <b style={{ color: z.ampel >= 80 ? C.ok : z.ampel >= 55 ? C.warn : C.bad }}>{z.ampel} %</b></span>
              </div>
              <div style={{ fontSize: 13, color: FARBE[z.d.stufe], marginTop: 4 }}>{z.d.text}</div>
              <div style={{ fontSize: 13, color: MARKT_FARBE[z.markt.stufe], marginTop: 2 }}>Markt: {z.markt.basis === 'zu_wenig' ? `${z.markt.aktuell} aktuelle Vergleiche — in der Akte erfassen (ab 3 gibt es eine Aussage).` : z.markt.text}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
                <span style={{ fontSize: 13, color: z.v.art === 'senken' ? C.warn : z.v.art === 'grenze' || z.v.art === 'unter_grenze' ? C.bad : C.dim }}>
                  {z.v.art === 'senken' && z.v.neu !== null ? <>Vorschlag <b>{euro(z.v.neu)}</b> (−{String(z.v.prozent).replace('.', ',')} %) · </> : null}{z.v.grund}
                </span>
                {z.v.art === 'senken' && z.v.neu !== null && (
                  <button style={s.btnGold} disabled={busy} onClick={() => void preisSetzen([{ id: z.f.id, neu: z.v.neu as number }])}>Übernehmen</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </>)}

      <div style={{ ...s.box, marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <b style={{ color: C.gold }}>Ihre Preis-Treppe</b>
          {istChef && !entwurf && <button style={s.btnAus} onClick={regelnBearbeiten}>✎ Bearbeiten</button>}
        </div>
        {!entwurf ? (
          <div style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.6 }}>
            {regeln.stufen.length ? regeln.stufen.map((x) => <div key={x.ab}>ab <b>{x.ab}</b> Standtagen: um <b>{String(x.prozent).replace('.', ',')} %</b> senken</div>) : <div style={s.dim}>Keine Stufen — es gibt keine Senkungsvorschläge.</div>}
            <div style={s.dim}>Frühestens {regeln.abstandTage} Tage nach der letzten Preisänderung · Mindest-Rohertrag {euro(regeln.mindestRohertrag)} netto · „viel gesehen" ab {regeln.aufrufeViel} Aufrufen in 30 Tagen · Standkosten {euro(standkostenTag)} je Tag (Einstellung im Bestand).</div>
            {!istChef && <div style={s.dim}>Die Preis-Treppe stellt die Geschäftsleitung ein.</div>}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {entwurf.stufen.map((x, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 13.5 }}>
                ab <input style={{ ...s.input, width: 70 }} inputMode="numeric" value={x.ab} onChange={(e) => setEntwurf({ ...entwurf, stufen: entwurf.stufen.map((y, j) => j === i ? { ...y, ab: e.target.value } : y) })} /> Standtagen um
                <input style={{ ...s.input, width: 64 }} inputMode="decimal" value={x.prozent} onChange={(e) => setEntwurf({ ...entwurf, stufen: entwurf.stufen.map((y, j) => j === i ? { ...y, prozent: e.target.value } : y) })} /> % senken
                <button style={s.btnAus} onClick={() => setEntwurf({ ...entwurf, stufen: entwurf.stufen.filter((_, j) => j !== i) })}>Entfernen</button>
              </div>
            ))}
            {entwurf.stufen.length < 6 && <button style={{ ...s.btnAus, justifySelf: 'start' }} onClick={() => setEntwurf({ ...entwurf, stufen: [...entwurf.stufen, { ab: '', prozent: '' }] })}>+ Stufe</button>}
            <label style={s.feld}>Abstand zwischen zwei Senkungen (Tage)<input style={s.input} inputMode="numeric" value={entwurf.abstand} onChange={(e) => setEntwurf({ ...entwurf, abstand: e.target.value })} /></label>
            <label style={s.feld}>Mindest-Rohertrag je Fahrzeug (€ netto)<input style={s.input} inputMode="decimal" value={entwurf.mindest} onChange={(e) => setEntwurf({ ...entwurf, mindest: e.target.value })} /></label>
            <label style={s.feld}>„Viel gesehen" ab Aufrufen in 30 Tagen<input style={s.input} inputMode="numeric" value={entwurf.viel} onChange={(e) => setEntwurf({ ...entwurf, viel: e.target.value })} /></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={s.btnGold} disabled={busy} onClick={() => void regelnSpeichern()}>Speichern</button>
              <button style={s.btnAus} onClick={() => setEntwurf(null)}>Abbrechen</button>
            </div>
          </div>
        )}
      </div>
      <p style={{ ...s.dim, marginTop: 12 }}>Marktvergleich: Vergleichsangebote erfassen Sie in der Handelsakte (Übersicht). Gerechnet wird nur mit Ihren eigenen Einträgen der letzten 30 Tage — ARGONAUT liest keine Börsen aus und schätzt keine Marktpreise.</p>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, padding: '20px 16px 60px', fontFamily: 'DM Sans, system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' },
  zurueck: { color: C.dim, textDecoration: 'none', fontSize: 13.5 },
  h1: { fontSize: 24, margin: '8px 0 6px', color: C.text },
  dim: { color: C.dim, fontSize: 13.5, lineHeight: 1.55 },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, color: C.text, borderRadius: 10, padding: '10px 12px', margin: '10px 0', fontSize: 14 },
  ok: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.ok}`, color: C.text, borderRadius: 10, padding: '10px 12px', margin: '10px 0', fontSize: 14 },
  hinweis: { background: 'rgba(224,162,76,0.10)', border: `1px solid ${C.warn}`, color: C.text, borderRadius: 10, padding: '10px 12px', margin: '10px 0', fontSize: 13.5 },
  kacheln: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '14px 0' },
  kachel: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  zahl: { fontSize: 24, display: 'block', marginTop: 4 },
  box: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  werte: { display: 'flex', gap: '6px 16px', flexWrap: 'wrap', fontSize: 13.5, marginTop: 6 },
  reiterAn: { background: C.gold, color: C.navy, border: 'none', borderRadius: 999, padding: '6px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  reiterAus: { background: 'transparent', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 999, padding: '6px 12px', fontSize: 13, cursor: 'pointer' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  btnAus: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer' },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 14 },
  feld: { display: 'grid', gap: 4, fontSize: 13, color: C.dim, maxWidth: 340 },
};
