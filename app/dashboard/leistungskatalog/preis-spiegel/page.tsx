'use client';

// ============================================================
// ARGONAUT OS · Paket 331 (12.10.2026) · PS-1 Preis-Spiegel für Dienstleister
// Wo liegen meine Preise im Umfeld? Der Betrieb wählt Posten (eine Leistung aus
// dem Leistungskatalog oder einen freien Posten mit eigenem Bruttopreis, z. B.
// ein Gericht) und erfasst dazu Preise von Mitbewerbern SELBST — Aushang,
// Webseite, Speisekarte. Daraus: Marktmitte, Spanne, Position des eigenen Preises.
// Kein Auslesen fremder Seiten, keine KI-Schätzung, keine Personennamen.
// Rechnen: lib/preisSpiegel.ts (Tests: tests/preisSpiegelP331.test.mjs).
// Pfad: Unterpfad von /dashboard/leistungskatalog, erbt dessen Freigabe.
// ============================================================

import { useState, useEffect, useMemo, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseZahl } from '@/lib/zahlen';
import { nichtsGeschrieben, NICHT_GESPEICHERT } from '@/lib/speichernPruefen';
import {
  QUELLEN, MAX_TAGE, MIN_VERGLEICHE, postenPreis, postenPruefen, vergleichPruefen, spiegelLage, uebersicht, rang,
  bruttoVon, aktuell, balkenPos, type KatalogLite, type Posten, type Vergleich, type Lage, type EigenerPreis,
} from '@/lib/preisSpiegel';
import Leerzustand from '../../_components/Leerzustand';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };
const FARBE: Record<Lage['stufe'], string> = { ok: C.ok, warn: C.warn, info: C.info, dim: C.dim };

type VergleichZeile = Vergleich & { id: string; posten_id: string };
type Zeile = { p: Posten; k: KatalogLite | null; eigen: EigenerPreis | null; liste: VergleichZeile[]; lage: Lage };
type Filter = 'alle' | 'guenstig' | 'teuer' | 'offen';
type VEntwurf = { anbieter: string; preis: string; brutto: boolean; quelle: string; km: string; link: string; notiz: string; am: string };

function heute(): string {
  // Kalendertag in Deutschland, nicht UTC (kurz nach Mitternacht sonst „gestern")
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
}
const euro = (n: number | null | undefined) => n === null || n === undefined ? '—' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const datum = (iso: string) => { const [j, m, t] = String(iso).slice(0, 10).split('-'); return t ? `${t}.${m}.${j}` : iso; };
const leerVergleich = (): VEntwurf => ({ anbieter: '', preis: '', brutto: true, quelle: QUELLEN[0], km: '', link: '', notiz: '', am: heute() });

export default function PreisSpiegelPage() {
  const [katalog, setKatalog] = useState<(KatalogLite & { aktiv?: boolean | null; kategorie?: string | null })[]>([]);
  const [posten, setPosten] = useState<Posten[]>([]);
  const [vergleiche, setVergleiche] = useState<VergleichZeile[]>([]);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('alle');
  const [neuOffen, setNeuOffen] = useState(false);
  const [neu, setNeu] = useState<{ art: 'katalog' | 'frei'; leistung: string; bez: string; preis: string; mwst: string }>({ art: 'katalog', leistung: '', bez: '', preis: '', mwst: '19' });
  const [offen, setOffen] = useState<string | null>(null);        // aufgeklappter Posten
  const [ventwurf, setVentwurf] = useState<VEntwurf>(leerVergleich());
  const [loeschFrage, setLoeschFrage] = useState<string | null>(null);
  const [ausblendFrage, setAusblendFrage] = useState<string | null>(null);

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user?.id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
    const [k, p, v] = await Promise.all([
      supabase.from('leistungskatalog').select('id, bezeichnung, kategorie, aktiv, erfassungsart, standard_wert, aw_minuten, stundensatz_netto, festpreis_netto, einheit, einheitspreis_netto, mwst_satz').order('bezeichnung').limit(5000),
      supabase.from('preis_spiegel_posten').select('id, bezeichnung, leistung_id, eigener_preis, mwst_satz, aktiv').eq('aktiv', true).order('bezeichnung').limit(2000),
      supabase.from('preis_spiegel_vergleich').select('id, posten_id, anbieter, preis, ist_brutto, quelle, entfernung_km, link, notiz, erfasst_am').order('erfasst_am', { ascending: false }).limit(20000),
    ]);
    const num = (x: unknown) => x === null || x === undefined ? null : Number(x);
    setKatalog((((k.data as unknown) as (KatalogLite & { aktiv?: boolean | null })[]) ?? []).map((z) => ({
      ...z, standard_wert: num(z.standard_wert), aw_minuten: num(z.aw_minuten), stundensatz_netto: num(z.stundensatz_netto),
      festpreis_netto: num(z.festpreis_netto), einheitspreis_netto: num(z.einheitspreis_netto), mwst_satz: num(z.mwst_satz),
    })));
    if (p.error || v.error) { setSqlFehlt(true); setPosten([]); setVergleiche([]); setLaden(false); return; }
    setSqlFehlt(false);
    setPosten((((p.data as unknown) as Posten[]) ?? []).map((z) => ({ ...z, eigener_preis: num(z.eigener_preis), mwst_satz: num(z.mwst_satz) })));
    setVergleiche((((v.data as unknown) as VergleichZeile[]) ?? []).map((z) => ({ ...z, preis: num(z.preis), entfernung_km: num(z.entfernung_km) })));
    setLaden(false);
  }, []);
  useEffect(() => { void lade(); }, [lade]);

  const tag = heute();
  const zeilen: Zeile[] = useMemo(() => {
    const kJe = new Map(katalog.map((k) => [k.id, k]));
    const vJe: Record<string, VergleichZeile[]> = {};
    for (const v of vergleiche) (vJe[v.posten_id] ??= []).push(v);
    return posten.map((p) => {
      const k = p.leistung_id ? kJe.get(p.leistung_id) ?? null : null;
      const eigen = postenPreis(p, k);
      const liste = vJe[p.id] ?? [];
      return { p, k, eigen, liste, lage: spiegelLage(eigen, liste, tag) };
    }).sort((a, b) => rang(a.lage) - rang(b.lage) || a.p.bezeichnung.localeCompare(b.p.bezeichnung, 'de'));
  }, [katalog, posten, vergleiche, tag]);

  const ueb = uebersicht(zeilen.map((z) => z.lage));
  const passt = (z: Zeile, f: Filter) => f === 'alle' ? true : f === 'guenstig' ? z.lage.stufe === 'info' : f === 'teuer' ? z.lage.stufe === 'warn' : z.lage.basis === 'zu_wenig';
  const gezeigt = zeilen.filter((z) => passt(z, filter));
  const schonDrin = new Set(posten.map((p) => p.leistung_id).filter(Boolean));
  const waehlbar = katalog.filter((k) => k.aktiv !== false && !schonDrin.has(k.id));
  const bekannteAnbieter = useMemo(() => [...new Set(vergleiche.map((v) => v.anbieter))].sort((a, b) => a.localeCompare(b, 'de')).slice(0, 200), [vergleiche]);

  function melde(f: string | null, o: string | null = null) { setFehler(f); setOk(o); }

  async function postenAnlegen() {
    const k = neu.art === 'katalog' ? katalog.find((x) => x.id === neu.leistung) : null;
    if (neu.art === 'katalog' && !k) { melde('Bitte eine Leistung aus Ihrem Katalog wählen.'); return; }
    const r = postenPruefen({
      bezeichnung: k ? String(k.bezeichnung ?? '') : neu.bez,
      leistung_id: k ? k.id : null,
      eigener_preis: neu.art === 'frei' ? leseZahl(neu.preis) : null,
      mwst_satz: k ? (k.mwst_satz ?? 19) : leseZahl(neu.mwst),
    });
    if (!r.ok) { melde(r.fehler); return; }
    setBusy(true); melde(null);
    try {
      const { data, error } = await supabase.from('preis_spiegel_posten').insert(r.felder).select('id');
      if (error || nichtsGeschrieben(data)) { melde(error?.message?.includes('gehört nicht') ? 'Die Leistung gehört nicht zu Ihrem Betrieb.' : NICHT_GESPEICHERT); return; }
      setNeu({ art: neu.art, leistung: '', bez: '', preis: '', mwst: '19' }); setNeuOffen(false);
      const id = (data as { id: string }[])[0]?.id ?? null;
      setOffen(id); setVentwurf(leerVergleich());
      melde(null, 'Posten angelegt — erfassen Sie jetzt die Preise von mindestens drei Mitbewerbern.');
      await lade();
    } finally { setBusy(false); }
  }

  async function vergleichSpeichern(postenId: string) {
    if (ventwurf.km.trim() && leseZahl(ventwurf.km) === null) { melde('Die Entfernung bitte als Zahl eintragen, z. B. 2,5.'); return; }
    const r = vergleichPruefen({
      anbieter: ventwurf.anbieter, preis: leseZahl(ventwurf.preis), ist_brutto: ventwurf.brutto, quelle: ventwurf.quelle,
      entfernung_km: ventwurf.km.trim() ? leseZahl(ventwurf.km) : null, link: ventwurf.link, notiz: ventwurf.notiz, am: ventwurf.am,
    }, tag);
    if (!r.ok) { melde(r.fehler); return; }
    setBusy(true); melde(null);
    try {
      const { data, error } = await supabase.from('preis_spiegel_vergleich').insert({ ...r.felder, posten_id: postenId }).select('id');
      if (error || nichtsGeschrieben(data)) { melde(NICHT_GESPEICHERT); return; }
      setVentwurf({ ...leerVergleich(), quelle: ventwurf.quelle, am: ventwurf.am, brutto: ventwurf.brutto });
      melde(null, 'Mitbewerber-Preis erfasst.');
      await lade();
    } finally { setBusy(false); }
  }

  async function vergleichLoeschen(id: string) {
    setBusy(true); melde(null);
    try {
      const { data, error } = await supabase.from('preis_spiegel_vergleich').delete().eq('id', id).select('id');
      if (error || nichtsGeschrieben(data)) { melde('Löschen fehlgeschlagen — dafür brauchen Sie das Schreibrecht „Leistungskatalog".'); return; }
      setLoeschFrage(null); melde(null, 'Eintrag gelöscht.'); await lade();
    } finally { setBusy(false); }
  }

  async function postenAusblenden(id: string) {
    setBusy(true); melde(null);
    try {
      const { data, error } = await supabase.from('preis_spiegel_posten').update({ aktiv: false }).eq('id', id).select('id');
      if (error || nichtsGeschrieben(data)) { melde('Ausblenden fehlgeschlagen — dafür brauchen Sie das Schreibrecht „Leistungskatalog".'); return; }
      setAusblendFrage(null); setOffen(null); melde(null, 'Posten ausgeblendet. Die erfassten Preise bleiben gespeichert.'); await lade();
    } finally { setBusy(false); }
  }

  if (laden) return <div style={s.page}><p style={s.dim}>Lade Preis-Spiegel …</p></div>;

  return (
    <div style={s.page}>
      <a href="/dashboard/leistungskatalog" style={s.zurueck}>← Leistungskatalog</a>
      <h1 style={s.h1}>📊 Preis-Spiegel</h1>
      <p style={s.dim}>
        So geht&apos;s: Wählen Sie Leistungen aus Ihrem Katalog (oder legen Sie einen freien Posten wie ein Gericht an) und tragen Sie die Preise
        von Mitbewerbern aus Ihrem Umfeld ein — vom Aushang, der Webseite oder der Speisekarte. Ab {MIN_VERGLEICHE} Mitbewerbern sehen Sie die Marktmitte,
        die Spanne und wo Ihr Preis liegt. Verglichen wird brutto, so wie Ihre Kunden zahlen. ARGONAUT liest keine fremden Seiten aus und schätzt keine Preise.
      </p>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok}>{ok}</div>}
      {sqlFehlt && <div style={s.hinweis}>Der Preis-Spiegel ist noch nicht eingerichtet (SQL Paket 331 fehlt) oder Ihnen fehlt das Recht „Leistungskatalog".</div>}

      {!sqlFehlt && (<>
        <div style={s.kacheln}>
          <div style={s.kachel}><div style={s.dim}>Posten</div><b style={s.zahl}>{ueb.posten}</b></div>
          <div style={s.kachel}><div style={s.dim}>Mit Aussage</div><b style={s.zahl}>{ueb.mitAussage}</b></div>
          <div style={s.kachel}><div style={s.dim}>Untere / mittlere / obere Preisklasse</div><b style={s.zahl}>{ueb.unten} / {ueb.mitte} / {ueb.oben}</b></div>
          <div style={s.kachel}><div style={s.dim}>Ø Abstand zur Mitte</div><b style={{ ...s.zahl, color: ueb.mittlereAbweichung === null ? C.dim : ueb.mittlereAbweichung < -10 ? C.info : ueb.mittlereAbweichung > 15 ? C.warn : C.ok }}>{ueb.mittlereAbweichung === null ? '—' : `${ueb.mittlereAbweichung > 0 ? '+' : ''}${ueb.mittlereAbweichung.toLocaleString('de-DE')} %`}</b></div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 10px', alignItems: 'center' }}>
          {([['alle', 'Alle'], ['guenstig', 'Deutlich günstiger'], ['teuer', 'Deutlich teurer'], ['offen', 'Zu wenige Vergleiche']] as const).map(([f, n]) => (
            <button key={f} style={filter === f ? s.reiterAn : s.reiterAus} onClick={() => setFilter(f)}>{n} ({zeilen.filter((z) => passt(z, f)).length})</button>
          ))}
          <span style={{ flex: 1 }} />
          {!neuOffen && <button style={s.btnGold} onClick={() => { setNeuOffen(true); melde(null); }}>+ Posten vergleichen</button>}
        </div>

        {neuOffen && (
          <div style={{ ...s.box, marginBottom: 12 }}>
            <b style={{ color: C.gold }}>Neuer Posten</b>
            <div style={{ display: 'flex', gap: 6, margin: '10px 0' }}>
              <button style={neu.art === 'katalog' ? s.reiterAn : s.reiterAus} onClick={() => setNeu({ ...neu, art: 'katalog' })}>Aus dem Leistungskatalog</button>
              <button style={neu.art === 'frei' ? s.reiterAn : s.reiterAus} onClick={() => setNeu({ ...neu, art: 'frei' })}>Freier Posten (z. B. Gericht)</button>
            </div>
            {neu.art === 'katalog' ? (
              waehlbar.length ? (
                <label style={s.feld}>Leistung
                  <select style={s.input} value={neu.leistung} onChange={(e) => setNeu({ ...neu, leistung: e.target.value })}>
                    <option value="">— bitte wählen —</option>
                    {waehlbar.map((k) => { const pr = postenPreis({ id: '', bezeichnung: '', leistung_id: k.id, eigener_preis: null, mwst_satz: null }, k); return (
                      <option key={k.id} value={k.id}>{k.bezeichnung}{pr ? ` · ${euro(pr.brutto)} ${pr.je}` : ' · ohne Preis'}</option>
                    ); })}
                  </select>
                </label>
              ) : <p style={s.dim}>Alle Leistungen Ihres Katalogs sind schon im Preis-Spiegel — oder der Katalog ist leer. <a href="/dashboard/leistungskatalog" style={{ color: C.gold }}>Zum Leistungskatalog</a></p>
            ) : (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ ...s.feld, minWidth: 240 }}>Bezeichnung<input style={s.input} value={neu.bez} maxLength={120} placeholder="z. B. Schnitzel Wiener Art" onChange={(e) => setNeu({ ...neu, bez: e.target.value })} /></label>
                <label style={{ ...s.feld, width: 150 }}>Ihr Preis (brutto, €)<input style={s.input} inputMode="decimal" value={neu.preis} onChange={(e) => setNeu({ ...neu, preis: e.target.value })} /></label>
                <label style={{ ...s.feld, width: 110 }}>MwSt (%)<input style={s.input} inputMode="decimal" value={neu.mwst} onChange={(e) => setNeu({ ...neu, mwst: e.target.value })} /></label>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={s.btnGold} disabled={busy} onClick={() => void postenAnlegen()}>Anlegen</button>
              <button style={s.btnAus} onClick={() => setNeuOffen(false)}>Abbrechen</button>
            </div>
          </div>
        )}

        {!zeilen.length && !neuOffen && (
          <Leerzustand icon="📊" titel="Noch keine Posten im Preis-Spiegel"
            text="Wählen Sie Ihre wichtigsten Leistungen — zum Beispiel Herrenhaarschnitt, Stundensatz Geselle oder Ihr meistverkauftes Gericht — und vergleichen Sie sie mit Ihrem Umfeld." />
        )}
        {zeilen.length > 0 && !gezeigt.length && <p style={s.dim}>In dieser Ansicht ist gerade kein Posten.</p>}

        <div style={{ display: 'grid', gap: 8 }}>
          {gezeigt.map((z) => {
            const auf = offen === z.p.id;
            const l = z.lage;
            const posE = balkenPos(l.eigen, l.min, l.max), posM = balkenPos(l.median, l.min, l.max);
            return (
              <div key={z.p.id} style={s.karte}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <button style={s.titelKnopf} onClick={() => { setOffen(auf ? null : z.p.id); setVentwurf(leerVergleich()); setLoeschFrage(null); setAusblendFrage(null); }}>
                    {auf ? '▾' : '▸'} {z.p.bezeichnung}
                  </button>
                  <span style={{ fontSize: 13.5 }}>
                    <span style={s.dim}>Ihr Preis</span> <b>{z.eigen ? euro(z.eigen.brutto) : '—'}</b> <span style={s.dim}>{z.eigen ? z.eigen.je : z.p.leistung_id ? (z.k ? 'im Katalog ohne Preis' : 'Leistung nicht mehr im Katalog') : 'kein Preis eingetragen'}</span>
                  </span>
                </div>
                <div style={s.werte}>
                  <span><span style={s.dim}>Mitbewerber</span> <b>{l.anbieter}</b></span>
                  <span><span style={s.dim}>Mitte</span> <b>{euro(l.median)}</b></span>
                  <span><span style={s.dim}>Spanne</span> {l.min === null ? '—' : `${euro(l.min)} – ${euro(l.max)}`}</span>
                  {l.veraltet > 0 && <span style={s.dim}>{l.veraltet} älter als {MAX_TAGE} Tage (zählen nicht)</span>}
                </div>
                {l.basis === 'ok' && posM !== null && (
                  <div style={s.balken} aria-hidden>
                    <div style={{ ...s.strich, left: `${posM}%`, background: C.dim }} title="Marktmitte" />
                    {posE !== null && <div style={{ ...s.punkt, left: `${posE}%`, background: FARBE[l.stufe] }} title="Ihr Preis" />}
                  </div>
                )}
                <div style={{ fontSize: 13.5, color: FARBE[l.stufe], marginTop: 6 }}>{l.text}</div>

                {auf && (
                  <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                    {z.liste.length > 0 && (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={s.tabelle}>
                          <thead><tr><th style={s.th}>Mitbewerber</th><th style={s.th}>Preis</th><th style={s.th}>Brutto</th><th style={s.th}>Quelle</th><th style={s.th}>Entfernung</th><th style={s.th}>Erfasst</th><th style={s.th} /></tr></thead>
                          <tbody>
                            {z.liste.map((v) => {
                              const alt = !aktuell(v, tag);
                              return (
                                <tr key={v.id} style={{ opacity: alt ? 0.5 : 1 }}>
                                  <td style={s.td}>{v.anbieter}{v.notiz ? <div style={s.klein}>{v.notiz}</div> : null}</td>
                                  <td style={s.td}>{euro(v.preis)} <span style={s.klein}>{v.ist_brutto === false ? 'netto' : 'brutto'}</span></td>
                                  <td style={s.td}>{euro(bruttoVon(v, z.eigen?.mwst ?? z.p.mwst_satz ?? 19))}</td>
                                  <td style={s.td}>{v.link ? <a href={v.link} target="_blank" rel="noopener noreferrer nofollow" style={{ color: C.gold }}>{v.quelle}</a> : v.quelle}</td>
                                  <td style={s.td}>{v.entfernung_km === null || v.entfernung_km === undefined ? '—' : `${v.entfernung_km.toLocaleString('de-DE')} km`}</td>
                                  <td style={s.td}>{datum(v.erfasst_am)}{alt ? <div style={s.klein}>veraltet</div> : null}</td>
                                  <td style={s.td}>
                                    {loeschFrage === v.id ? (
                                      <span style={{ display: 'inline-flex', gap: 4 }}>
                                        <button style={s.btnRot} disabled={busy} onClick={() => void vergleichLoeschen(v.id)}>Ja, löschen</button>
                                        <button style={s.btnAus} onClick={() => setLoeschFrage(null)}>Nein</button>
                                      </span>
                                    ) : <button style={s.btnAus} onClick={() => setLoeschFrage(v.id)} title="Fehleingabe löschen">✕</button>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div style={{ ...s.box, marginTop: 10 }}>
                      <b style={{ color: C.gold, fontSize: 14 }}>Mitbewerber-Preis erfassen</b>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                        <label style={{ ...s.feld, minWidth: 200 }}>Mitbewerber
                          <input style={s.input} list={`anbieter-${z.p.id}`} maxLength={40} value={ventwurf.anbieter} placeholder="z. B. Mitbewerber A, Salon Innenstadt" onChange={(e) => setVentwurf({ ...ventwurf, anbieter: e.target.value })} />
                          <datalist id={`anbieter-${z.p.id}`}>{bekannteAnbieter.map((a) => <option key={a} value={a} />)}</datalist>
                        </label>
                        <label style={{ ...s.feld, width: 130 }}>Preis (€)<input style={s.input} inputMode="decimal" value={ventwurf.preis} onChange={(e) => setVentwurf({ ...ventwurf, preis: e.target.value })} /></label>
                        <label style={{ ...s.feld, width: 120 }}>Angabe
                          <select style={s.input} value={ventwurf.brutto ? 'b' : 'n'} onChange={(e) => setVentwurf({ ...ventwurf, brutto: e.target.value === 'b' })}>
                            <option value="b">brutto</option><option value="n">netto</option>
                          </select>
                        </label>
                        <label style={{ ...s.feld, width: 210 }}>Quelle
                          <select style={s.input} value={ventwurf.quelle} onChange={(e) => setVentwurf({ ...ventwurf, quelle: e.target.value })}>
                            {QUELLEN.map((q) => <option key={q} value={q}>{q}</option>)}
                          </select>
                        </label>
                        <label style={{ ...s.feld, width: 120 }}>Entfernung (km)<input style={s.input} inputMode="decimal" value={ventwurf.km} onChange={(e) => setVentwurf({ ...ventwurf, km: e.target.value })} /></label>
                        <label style={{ ...s.feld, width: 160 }}>Gesehen am<input style={s.input} type="date" max={tag} value={ventwurf.am} onChange={(e) => setVentwurf({ ...ventwurf, am: e.target.value })} /></label>
                        <label style={{ ...s.feld, minWidth: 220, flex: 1 }}>Link (optional, https://)<input style={s.input} value={ventwurf.link} maxLength={500} onChange={(e) => setVentwurf({ ...ventwurf, link: e.target.value })} /></label>
                        <label style={{ ...s.feld, minWidth: 220, flex: 1 }}>Notiz (optional)<input style={s.input} value={ventwurf.notiz} maxLength={200} placeholder="z. B. inkl. Waschen und Föhnen" onChange={(e) => setVentwurf({ ...ventwurf, notiz: e.target.value })} /></label>
                      </div>
                      <p style={{ ...s.klein, marginTop: 6 }}>Bitte keine Personennamen, Telefonnummern oder E-Mail-Adressen — eine Kennung wie „Mitbewerber A" oder „Salon Innenstadt" genügt. Erfassen Sie nur, was öffentlich aushängt oder angeboten wird, und achten Sie auf dieselbe Leistung ({z.eigen?.je ?? 'gleicher Umfang'}).</p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <button style={s.btnGold} disabled={busy} onClick={() => void vergleichSpeichern(z.p.id)}>Speichern</button>
                        <span style={{ flex: 1 }} />
                        {ausblendFrage === z.p.id ? (
                          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                            Posten ausblenden?
                            <button style={s.btnRot} disabled={busy} onClick={() => void postenAusblenden(z.p.id)}>Ja, ausblenden</button>
                            <button style={s.btnAus} onClick={() => setAusblendFrage(null)}>Nein</button>
                          </span>
                        ) : <button style={s.btnAus} onClick={() => setAusblendFrage(z.p.id)}>Posten ausblenden</button>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>)}

      <p style={{ ...s.dim, marginTop: 16 }}>
        Gezählt wird je Mitbewerber nur der neueste Eintrag der letzten {MAX_TAGE} Tage. Netto erfasste Preise werden mit dem Steuersatz Ihres Postens
        umgerechnet. Die Farbe ist ein Hinweis, keine Bewertung: Gelb heißt deutlich über der Mitte (zeigen Sie, was Ihre Leistung besonders macht),
        Blau deutlich darunter (möglicherweise verschenkter Ertrag). Ihre eigenen Preise ändern Sie im Leistungskatalog.
      </p>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, padding: '20px 16px 60px', fontFamily: 'DM Sans, system-ui, sans-serif', maxWidth: 1100, margin: '0 auto' },
  zurueck: { color: C.dim, textDecoration: 'none', fontSize: 13.5 },
  h1: { fontSize: 24, margin: '8px 0 6px', color: C.text },
  dim: { color: C.dim, fontSize: 13.5, lineHeight: 1.55 },
  klein: { color: C.dim, fontSize: 12, lineHeight: 1.45 },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, color: C.text, borderRadius: 10, padding: '10px 12px', margin: '10px 0', fontSize: 14 },
  ok: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.ok}`, color: C.text, borderRadius: 10, padding: '10px 12px', margin: '10px 0', fontSize: 14 },
  hinweis: { background: 'rgba(224,162,76,0.10)', border: `1px solid ${C.warn}`, color: C.text, borderRadius: 10, padding: '10px 12px', margin: '10px 0', fontSize: 13.5 },
  kacheln: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, margin: '14px 0' },
  kachel: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  zahl: { fontSize: 22, display: 'block', marginTop: 4 },
  box: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  titelKnopf: { background: 'none', border: 'none', color: C.text, fontWeight: 700, fontSize: 15, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'inherit' },
  werte: { display: 'flex', gap: '6px 16px', flexWrap: 'wrap', fontSize: 13.5, marginTop: 6 },
  balken: { position: 'relative', height: 10, background: 'rgba(143,163,190,0.15)', borderRadius: 999, marginTop: 10, maxWidth: 520 },
  strich: { position: 'absolute', top: -3, width: 2, height: 16, transform: 'translateX(-1px)' },
  punkt: { position: 'absolute', top: -3, width: 16, height: 16, borderRadius: 999, transform: 'translateX(-8px)', border: `2px solid ${C.navy}` },
  tabelle: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th: { textAlign: 'left', color: C.dim, fontWeight: 600, padding: '6px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' },
  reiterAn: { background: C.gold, color: C.navy, border: 'none', borderRadius: 999, padding: '6px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  reiterAus: { background: 'transparent', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 999, padding: '6px 12px', fontSize: 13, cursor: 'pointer' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  btnAus: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer' },
  btnRot: { background: C.bad, color: C.navy, border: 'none', borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 14, fontFamily: 'inherit' },
  feld: { display: 'grid', gap: 4, fontSize: 13, color: C.dim },
};
