'use client';

// ============================================================
// ARGONAUT OS · Paket 280 · K14 Chef-Blick Fahrzeughandel
// Zahlen der Geschäftsleitung: Kacheln mit Vorjahr (laufender Monat/Quartal/Jahr),
// 12 Monate gegen Vorjahr, Ertrag je Marke und je Preisklasse, Zulauf und
// gebundener Einkauf, Verkäufer-Rangliste (abschaltbar, Standard AUS) und ein
// Summen-Wächter, der jede Teilsumme gegen die Gesamtsumme prüft.
// Gerechnet mit der Nachkalkulation aus K5 (lib/kfzKalkulation) — Ist-Kosten
// inklusive übernommener Partner-Rechnungen. Keine KI, 0 €.
// Paket 288 (RF1b): Rangliste nur mit gültiger Rechts-Freigabe „Auswertungen je Mitarbeiter“.
// NUR Chef (rechte.ts nurChef + Prüfung hier). Logik: lib/kfzChefBlick.ts (getestet).
// Pfad: app/dashboard/kfz/chef/page.tsx
// ============================================================

import { useState, useEffect, useMemo, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { nichtsGeschrieben, NICHT_GESPEICHERT } from '@/lib/speichernPruefen';
import { vorlageFuer, mitKunde, type KundenEinstellung } from '@/lib/branchenVorlage';
import type { Kosten } from '@/lib/kfzKalkulation';
import {
  CHEF_MODUL, ZEITRAUM_ARTEN, zeitraum, verkaufsZeilen, filterZeitraum, kennzahlen, veraenderung, gruppen, rangliste,
  ranglisteAn, monatsReihe, zulaufLage, summenWaechter,
  type ZeitraumArt, type ChefFz, type ChefKalk, type ChefVerkauf, type Kennzahlen, type Gruppe,
} from '@/lib/kfzChefBlick';
import Leerzustand from '../../_components/Leerzustand';
import { useRechtsFreigabe, FreigabeHinweis } from '../../_components/RechtsFreigabe';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666' };

function heute(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function euro(n: number | null | undefined, cent = false): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('de-DE', { minimumFractionDigits: cent ? 2 : 0, maximumFractionDigits: cent ? 2 : 0 }) + ' €';
}
function prozent(n: number | null): string {
  if (n === null) return '—';
  return (n > 0 ? '+' : '') + n.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';
}

/** Alle Zeilen einer Tabelle in 1.000er-Schritten (Supabase liefert höchstens 1.000 je Abfrage). */
async function alle<T>(tabelle: string, spalten: string, schluessel: string): Promise<{ daten: T[]; fehler: boolean }> {
  const aus: T[] = [];
  for (let ab = 0; ab < 50000; ab += 1000) {
    // nach einem eindeutigen Schlüssel sortiert, sonst kann beim Blättern eine Zeile doppelt kommen oder fehlen
    const { data, error } = await supabase.from(tabelle).select(spalten).order(schluessel, { ascending: true }).range(ab, ab + 999);
    if (error) return { daten: aus, fehler: true };
    const d = ((data as unknown) as T[]) ?? [];
    aus.push(...d);
    if (d.length < 1000) break;
  }
  return { daten: aus, fehler: false };
}

export default function KfzChefBlick() {
  const [darf, setDarf] = useState<boolean | null>(null);
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [fz, setFz] = useState<ChefFz[]>([]);
  const [kalk, setKalk] = useState<ChefKalk[]>([]);
  const [verk, setVerk] = useState<ChefVerkauf[]>([]);
  const [kosten, setKosten] = useState<(Kosten & { bestand_id: string })[]>([]);
  const [standkostenTag, setStandkostenTag] = useState(0);
  const [gk, setGk] = useState(0);
  const [langstehAb, setLangstehAb] = useState(90);
  const [chefEinst, setChefEinst] = useState<Record<string, unknown>>({});
  const [art, setArt] = useState<ZeitraumArt>('jahr');
  const [gruppeNach, setGruppeNach] = useState<'marke' | 'preisklasse'>('marke');
  const freigabe = useRechtsFreigabe('leistungsauswertung');
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id ?? null;
    if (!uid) { setDarf(false); setLaden(false); return; }
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    const b = typeof chef === 'string' && chef ? chef : uid;
    if (b !== uid) { setDarf(false); setLaden(false); return; }
    setDarf(true); setBetrieb(b);
    const [f, k, v, ko, e, p] = await Promise.all([
      alle<ChefFz>('kfz_bestand', 'id, interne_nr, marke, modell, status, eingang_am, verkauft_am, ek_netto, vk_brutto, besteuerung', 'id'),
      alle<ChefKalk>('kfz_bestand_kalk', 'bestand_id, vk_erzielt, verkaeufer, prov_v_art, prov_v_wert, prov_h_art, prov_h_wert', 'bestand_id'),
      alle<ChefVerkauf>('kfz_verkauf', 'id, bestand_id, status, preis_brutto', 'id'),
      alle<Kosten & { bestand_id: string }>('kfz_bestand_kosten', 'id, bestand_id, art, betrag_netto, plan', 'id'),
      supabase.from('modul_einstellung').select('modul, einstellung').eq('owner_user_id', b).in('modul', ['kfz-bestand', 'kfz-kalk', CHEF_MODUL]),
      supabase.from('profiles').select('branche').eq('id', b).maybeSingle(),
    ]);
    if (f.fehler) { setFehler('Der Fahrzeugbestand lässt sich nicht laden. Ist SQL Paket 259 ausgeführt?'); setLaden(false); return; }
    const zahlen = <T extends Record<string, unknown>>(l: T[], felder: string[]) => l.map((x) => {
      const y: Record<string, unknown> = { ...x };
      for (const s of felder) y[s] = y[s] === null || y[s] === undefined ? null : Number(y[s]);
      return y as T;
    });
    setFz(zahlen(f.daten as unknown as Record<string, unknown>[], ['ek_netto', 'vk_brutto']) as unknown as ChefFz[]);
    setKalk(zahlen(k.daten as unknown as Record<string, unknown>[], ['vk_erzielt', 'prov_v_wert', 'prov_h_wert']) as unknown as ChefKalk[]);
    setVerk(zahlen(v.daten as unknown as Record<string, unknown>[], ['preis_brutto']) as unknown as ChefVerkauf[]);
    setKosten(zahlen(ko.daten as unknown as Record<string, unknown>[], ['betrag_netto']) as unknown as (Kosten & { bestand_id: string })[]);
    const einst = ((e.data as unknown) as { modul: string; einstellung: Record<string, unknown> }[]) ?? [];
    const vorlage = vorlageFuer('kfz-bestand', ((p.data as { branche?: string | null } | null)?.branche) ?? null);
    const vk = vorlage ? mitKunde(vorlage, (einst.find((x) => x.modul === 'kfz-bestand')?.einstellung as KundenEinstellung | undefined) ?? null) : null;
    setStandkostenTag(vk?.standkostenTag ?? 0);
    setLangstehAb(vk?.ampel?.gelbBis ?? 90);
    const g = Number((einst.find((x) => x.modul === 'kfz-kalk')?.einstellung as { gemeinkostenProzent?: unknown } | undefined)?.gemeinkostenProzent);
    setGk(Number.isFinite(g) && g >= 0 && g <= 100 ? g : 0);
    setChefEinst(einst.find((x) => x.modul === CHEF_MODUL)?.einstellung ?? {});
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const tag = heute();
  const zr = useMemo(() => zeitraum(art, tag), [art, tag]);
  const zrJahr = useMemo(() => zeitraum('jahr', tag), [tag]);
  const zeilen = useMemo(() => verkaufsZeilen({ fahrzeuge: fz, kalk, verkaeufe: verk, kosten, einst: { standkostenTag, gemeinkostenProzent: gk } }), [fz, kalk, verk, kosten, standkostenTag, gk]);
  const jetzt = useMemo(() => filterZeitraum(zeilen, zr.von, zr.bis), [zeilen, zr]);
  const vj = useMemo(() => filterZeitraum(zeilen, zr.vjVon, zr.vjBis), [zeilen, zr]);
  const kz = useMemo(() => kennzahlen(jetzt), [jetzt]);
  const kv = useMemo(() => kennzahlen(vj), [vj]);
  const kJahr = useMemo(() => kennzahlen(filterZeitraum(zeilen, zrJahr.von, zrJahr.bis)), [zeilen, zrJahr]);
  const marken = useMemo(() => gruppen(jetzt, 'marke'), [jetzt]);
  const klassen = useMemo(() => gruppen(jetzt, 'preisklasse'), [jetzt]);
  const rang = useMemo(() => rangliste(jetzt), [jetzt]);
  const monate = useMemo(() => monatsReihe(zeilen, tag), [zeilen, tag]);
  const zul = useMemo(() => zulaufLage(fz, tag, langstehAb, zr), [fz, tag, langstehAb, zr]);
  const waechter = useMemo(() => summenWaechter({
    gesamt: kz, marken, klassen, verkaeufer: rang, monate, jahr: kJahr, zeilen: jetzt, fahrzeuge: fz, verkaeufe: verk,
  }), [kz, marken, klassen, rang, monate, kJahr, jetzt, fz, verk]);
  const rangAn = ranglisteAn(chefEinst);
  // Paket 288: angezeigt wird nur mit gültiger Freigabe — läuft sie ab, ist die Rangliste wieder weg.
  const rangSichtbar = rangAn && freigabe.aktiv;
  const maxMonat = Math.max(1, ...monate.map((m) => Math.max(Math.abs(m.rohertrag), Math.abs(m.vjRohertrag))));

  async function ranglisteSchalten(an: boolean) {
    if (!betrieb) return;
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { data, error } = await supabase.from('modul_einstellung').upsert(
        { owner_user_id: betrieb, modul: CHEF_MODUL, einstellung: { ...chefEinst, rangliste: an }, aktualisiert_am: new Date().toISOString() },
        { onConflict: 'owner_user_id,modul' },
      ).select('id');
      if (error || nichtsGeschrieben(data)) { setFehler(NICHT_GESPEICHERT); return; }
      setOk(an ? 'Verkäufer-Rangliste eingeschaltet.' : 'Verkäufer-Rangliste ausgeschaltet.');
      await lade();
    } finally { setBusy(false); }
  }

  if (laden) return <div style={s.page}><p style={s.dim}>Lade die Zahlen Ihres Fahrzeughandels …</p></div>;
  if (!darf) return (
    <div style={s.page}>
      <a href="/dashboard/kfz" style={s.zurueck}>← KFZ-Fachpaket</a>
      <h1 style={s.h1}>📈 Chef-Blick Fahrzeughandel</h1>
      <p style={s.dim}>Diese Seite sieht nur die Geschäftsleitung.</p>
    </div>
  );

  const kachel = (titel: string, wert: string, jetztW: number | null, vjW: number | null, vjText: string, farbe?: string) => {
    const d = veraenderung(jetztW, vjW);
    return (
      <div style={s.kachel}>
        <div style={s.dim}>{titel}</div>
        <b style={{ ...s.zahl, color: farbe ?? C.text }}>{wert}</b>
        <div style={{ fontSize: 12.5, color: C.dim, marginTop: 2 }}>
          Vorjahr {vjText}{d !== null && <> · <b style={{ color: d >= 0 ? C.ok : C.bad }}>{prozent(d)}</b></>}
        </div>
      </div>
    );
  };

  const gruppeTabelle = (liste: (Gruppe & { platz?: number | null })[], kopf: string, mitPlatz = false) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={s.tab}>
        <thead><tr>
          {mitPlatz && <th style={s.th}>#</th>}
          <th style={{ ...s.th, textAlign: 'left' }}>{kopf}</th><th style={s.th}>Verkäufe</th><th style={s.th}>Erlös netto</th>
          <th style={s.th}>Rohertrag</th><th style={s.th}>Ø je Fahrzeug</th><th style={s.th}>Ø Standtage</th><th style={s.th}>Marge</th>
        </tr></thead>
        <tbody>
          {liste.map((g) => (
            <tr key={g.key}>
              {mitPlatz && <td style={s.td}>{g.platz ?? '—'}</td>}
              <td style={{ ...s.td, textAlign: 'left', fontWeight: 600 }}>{g.name}</td>
              <td style={s.td}>{g.anzahl}{g.eingerechnet < g.anzahl && <span style={s.dim}> ({g.eingerechnet})</span>}</td>
              <td style={s.td}>{euro(g.erloesNetto)}</td>
              <td style={{ ...s.td, color: g.rohertrag < 0 ? C.bad : C.text }}>{euro(g.rohertrag)}</td>
              <td style={s.td}>{euro(g.rohertragSchnitt)}</td>
              <td style={s.td}>{g.standtageSchnitt ?? '—'}</td>
              <td style={s.td}>{g.margeProzent === null ? '—' : `${g.margeProzent.toLocaleString('de-DE')} %`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const vjZahl = (k: Kennzahlen, f: (k: Kennzahlen) => number | null, geld = true) => {
    const w = f(k);
    return w === null ? '—' : geld ? euro(w) : String(w);
  };

  return (
    <div style={s.page}>
      <a href="/dashboard/kfz" style={s.zurueck}>← KFZ-Fachpaket</a>
      <h1 style={s.h1}>📈 Chef-Blick Fahrzeughandel</h1>
      <p style={s.dim}>
        So geht&apos;s: Hier stehen die Zahlen Ihres Fahrzeughandels — Verkäufe, Erlös, Rohertrag und Deckungsbeitrag gegen den gleichen Zeitraum im
        Vorjahr, aufgeteilt nach Marke und Preisklasse, dazu Zulauf und gebundener Einkauf. Gerechnet wird mit der Nachkalkulation jeder Handelsakte
        (erzielter Preis, Einkauf, Ist-Kosten inklusive übernommener Partner-Rechnungen, Standkosten, Gemeinkosten, Provisionen). Der Summen-Wächter
        unten prüft, dass jede Aufteilung genau die Gesamtsumme ergibt.
      </p>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok}>{ok}</div>}

      {!fz.length ? (
        <Leerzustand icon="📈" titel="Noch keine Fahrzeuge im Handel"
          text="Sobald Fahrzeuge im Bestand stehen und verkauft werden, sehen Sie hier Ertrag, Vorjahresvergleich und Zulauf."
          aktionText="Zum Fahrzeugbestand" aktionHref="/dashboard/kfz/bestand" />
      ) : (<>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0 4px' }}>
          {ZEITRAUM_ARTEN.map((z) => (
            <button key={z.key} style={art === z.key ? s.reiterAn : s.reiterAus} onClick={() => setArt(z.key)}>{z.name}</button>
          ))}
        </div>
        <div style={s.dim}>{zr.label} · verglichen mit {zr.vjLabel}</div>

        <div style={s.kacheln}>
          {kachel('Verkäufe', String(kz.anzahl), kz.anzahl, kv.anzahl, String(kv.anzahl))}
          {kachel('Erlös netto', euro(kz.erloesNetto), kz.erloesNetto, kv.erloesNetto, vjZahl(kv, (k) => k.erloesNetto))}
          {kachel('Rohertrag', euro(kz.rohertrag), kz.rohertrag, kv.rohertrag, vjZahl(kv, (k) => k.rohertrag), kz.rohertrag < 0 ? C.bad : C.gold)}
          {kachel('Ø Rohertrag je Fahrzeug', euro(kz.rohertragSchnitt), kz.rohertragSchnitt, kv.rohertragSchnitt, vjZahl(kv, (k) => k.rohertragSchnitt))}
          {kachel('Deckungsbeitrag', euro(kz.deckungsbeitrag), kz.deckungsbeitrag, kv.deckungsbeitrag, vjZahl(kv, (k) => k.deckungsbeitrag), kz.deckungsbeitrag < 0 ? C.bad : C.text)}
          {kachel('Ø Standtage bis Verkauf', kz.standtageSchnitt === null ? '—' : String(kz.standtageSchnitt), kv.standtageSchnitt === null || kz.standtageSchnitt === null ? null : -kz.standtageSchnitt, kv.standtageSchnitt === null ? null : -kv.standtageSchnitt, vjZahl(kv, (k) => k.standtageSchnitt, false))}
        </div>
        {kz.eingerechnet < kz.anzahl && <div style={s.dim}>Im Ertrag eingerechnet: {kz.eingerechnet} von {kz.anzahl} Verkäufen (Gründe im Summen-Wächter unten).</div>}

        <div style={s.box}>
          <b style={{ color: C.gold }}>Rohertrag je Monat {zrJahr.von.slice(0, 4)}</b>
          <span style={{ ...s.dim, marginLeft: 8 }}>gold = dieses Jahr · grau = Vorjahr</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 6, alignItems: 'end', height: 150, marginTop: 12 }}>
            {monate.map((m) => (
              <div key={m.monat} title={`${m.name}: ${m.anzahl} Verkäufe, Rohertrag ${euro(m.rohertrag)} · Vorjahr ${m.vjAnzahl} Verkäufe, ${euro(m.vjRohertrag)}`}
                style={{ display: 'flex', gap: 2, alignItems: 'end', height: '100%', opacity: m.zukunft ? 0.35 : 1 }}>
                <div style={{ flex: 1, background: 'rgba(143,163,190,0.45)', borderRadius: '4px 4px 0 0', height: `${Math.max(1, (Math.max(0, m.vjRohertrag) / maxMonat) * 100)}%` }} />
                <div style={{ flex: 1, background: m.rohertrag < 0 ? C.bad : C.gold, borderRadius: '4px 4px 0 0', height: `${Math.max(1, (Math.abs(m.rohertrag) / maxMonat) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 6, marginTop: 4 }}>
            {monate.map((m) => <div key={m.monat} style={{ fontSize: 11.5, color: C.dim, textAlign: 'center' }}>{m.name}<br /><b style={{ color: C.text }}>{m.zukunft ? '' : m.anzahl}</b></div>)}
          </div>
        </div>

        <div style={s.box}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <b style={{ color: C.gold }}>Ertrag je {gruppeNach === 'marke' ? 'Marke' : 'Preisklasse'}</b>
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <button style={gruppeNach === 'marke' ? s.reiterAn : s.reiterAus} onClick={() => setGruppeNach('marke')}>Marke</button>
              <button style={gruppeNach === 'preisklasse' ? s.reiterAn : s.reiterAus} onClick={() => setGruppeNach('preisklasse')}>Preisklasse</button>
            </span>
          </div>
          {!jetzt.length ? <p style={s.dim}>In diesem Zeitraum wurde noch kein Fahrzeug verkauft.</p>
            : gruppeTabelle(gruppeNach === 'marke' ? marken : klassen, gruppeNach === 'marke' ? 'Marke' : 'Preisklasse (Verkaufspreis brutto)')}
          <div style={{ ...s.dim, fontSize: 12.5, marginTop: 6 }}>Zahl in Klammern: davon mit vollständiger Kalkulation im Ertrag.</div>
        </div>

        <div style={s.box}>
          <b style={{ color: C.gold }}>Zulauf und Bestand</b>
          <div style={s.kacheln}>
            <div style={s.kachel}><div style={s.dim}>Im Zulauf</div><b style={s.zahl}>{zul.zulaufAnzahl}</b><div style={{ fontSize: 12.5, color: C.dim }}>EK {euro(zul.zulaufEk)} · geplant {euro(zul.zulaufVk)}</div></div>
            <div style={s.kachel}><div style={s.dim}>Im Bestand</div><b style={s.zahl}>{zul.bestandAnzahl}</b><div style={{ fontSize: 12.5, color: C.dim }}>Ø {zul.standtageSchnitt ?? '—'} Standtage</div></div>
            <div style={s.kachel}><div style={s.dim}>Gebundener Einkauf</div><b style={s.zahl}>{euro(zul.bestandEk)}</b>{zul.ohneEk > 0 && <div style={{ fontSize: 12.5, color: C.warn }}>{zul.ohneEk} ohne Einkaufspreis</div>}</div>
            <div style={s.kachel}><div style={s.dim}>Langsteher (über {langstehAb} Tage)</div><b style={{ ...s.zahl, color: zul.langsteher ? C.bad : C.ok }}>{zul.langsteher}</b></div>
            {kachel('Hereingenommen', String(zul.hereinJetzt), zul.hereinJetzt, zul.hereinVj, String(zul.hereinVj))}
          </div>
          <a href="/dashboard/kfz/preise" style={s.link}>→ Preise und Standzeit</a>
        </div>

        <div style={s.box}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <b style={{ color: C.gold }}>Verkäufer-Rangliste</b>
            {rangAn
              ? <button style={s.btnAus} disabled={busy} onClick={() => void ranglisteSchalten(false)}>Ausschalten</button>
              : freigabe.aktiv && <button style={s.btnAus} disabled={busy} onClick={() => void ranglisteSchalten(true)}>Einschalten</button>}
          </div>
          <FreigabeHinweis lage={freigabe} />
          {!rangSichtbar ? <p style={s.dim}>{rangAn ? 'Eingeschaltet, aber ausgeblendet, solange die Freigabe fehlt.' : 'Ausgeschaltet.'} Die Summen-Prüfung läuft trotzdem mit.</p>
            : !jetzt.length ? <p style={s.dim}>In diesem Zeitraum wurde noch kein Fahrzeug verkauft.</p>
            : gruppeTabelle(rang, 'Verkäufer (laut Kalkulation der Akte)', true)}
        </div>

        <div style={{ ...s.box, borderColor: waechter.ok ? C.ok : C.bad }}>
          <b style={{ color: waechter.ok ? C.ok : C.bad }}>{waechter.ok ? '✓ Summen-Wächter: alle Summen stimmen' : '✗ Summen-Wächter: eine Summe stimmt nicht'}</b>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
            {waechter.pruefungen.map((p) => <li key={p.text} style={{ color: p.ok ? C.text : C.bad }}>{p.ok ? '✓' : '✗'} {p.text}</li>)}
          </ul>
          {!waechter.ok && <p style={{ ...s.dim, color: C.bad }}>Bitte melden Sie das dem ARGONAUT-Support — die Zahlen dieser Seite sind dann nicht verlässlich.</p>}
          {waechter.hinweise.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6, color: C.warn }}>
              {waechter.hinweise.map((h) => <li key={h}>{h}</li>)}
            </ul>
          )}
        </div>

        {jetzt.length > 0 && (
          <div style={s.box}>
            <b style={{ color: C.gold }}>Verkäufe im Zeitraum</b>
            <div style={{ overflowX: 'auto' }}>
              <table style={s.tab}>
                <thead><tr><th style={{ ...s.th, textAlign: 'left' }}>Fahrzeug</th><th style={s.th}>Verkauft</th><th style={s.th}>Preis</th><th style={s.th}>Rohertrag</th><th style={s.th}>Standtage</th></tr></thead>
                <tbody>
                  {jetzt.map((z) => (
                    <tr key={z.id}>
                      <td style={{ ...s.td, textAlign: 'left' }}><a href={`/dashboard/kfz/bestand/${z.id}?reiter=kalk`} style={{ color: C.text, textDecoration: 'none' }}><span style={{ color: C.gold }}>{z.nr ?? ''}</span> {z.name}</a></td>
                      <td style={s.td}>{z.verkauftAm.slice(8, 10)}.{z.verkauftAm.slice(5, 7)}.{z.verkauftAm.slice(0, 4)}</td>
                      <td style={s.td}>{euro(z.vk)}{z.vkQuelle === 'liste' && <span style={{ color: C.warn }} title="Listenpreis — kein erzielter Preis erfasst"> *</span>}</td>
                      <td style={{ ...s.td, color: z.k.rohertrag !== null && z.k.rohertrag < 0 ? C.bad : C.text }}>{z.k.vollstaendig ? euro(z.k.rohertrag) : <span style={{ color: C.warn }}>fehlt: {z.k.fehlt.join(', ')}</span>}</td>
                      <td style={s.td}>{z.standtage ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p style={{ ...s.dim, marginTop: 12 }}>Eigene Auswertungen (z. B. Bestand nach Status) bauen Sie im <a href="/dashboard/reports" style={s.link}>Report-Baukasten</a> mit der Quelle „Fahrzeughandel“.</p>
      </>)}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, padding: '20px 16px 60px', fontFamily: 'DM Sans, system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' },
  zurueck: { color: C.dim, textDecoration: 'none', fontSize: 13.5 },
  h1: { fontSize: 24, margin: '8px 0 6px', color: C.text },
  dim: { color: C.dim, fontSize: 13.5, lineHeight: 1.55 },
  link: { color: C.gold, textDecoration: 'none', fontSize: 13.5 },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, color: C.text, borderRadius: 10, padding: '10px 12px', margin: '10px 0', fontSize: 14 },
  ok: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.ok}`, color: C.text, borderRadius: 10, padding: '10px 12px', margin: '10px 0', fontSize: 14 },
  hinweis: { background: 'rgba(224,162,76,0.10)', border: `1px solid ${C.warn}`, color: C.text, borderRadius: 10, padding: '10px 12px', margin: '10px 0', fontSize: 13.5, lineHeight: 1.55 },
  kacheln: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, margin: '14px 0' },
  kachel: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  zahl: { fontSize: 22, display: 'block', marginTop: 2 },
  box: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginTop: 14 },
  tab: { width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 13.5 },
  th: { textAlign: 'right', color: C.dim, fontWeight: 600, padding: '6px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { textAlign: 'right', padding: '6px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  reiterAn: { background: C.gold, color: C.navy, border: `1px solid ${C.gold}`, borderRadius: 999, padding: '6px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13.5 },
  reiterAus: { background: 'transparent', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 999, padding: '6px 12px', cursor: 'pointer', fontSize: 13.5 },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 700, cursor: 'pointer' },
  btnAus: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 14px', cursor: 'pointer' },
};
