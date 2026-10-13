'use client';

// ============================================================
// ARGONAUT OS · Paket 357 (13.10.2026) · A4d Fachpaket Tierhaltung
// Arzneimittel-Bestandsbuch für Höfe mit Nutztieren, aufbauend auf dem
// Tierbestand (tier_gruppe).
// Reiter: Überblick (gesperrte Erzeugnisse, Fristen) · Anwendungen (mit
// Wartezeiten, „frei ab" rechnet die Datenbank) · Erwerb · Antibiotika
// (Halbjahres-Übersicht, CSV) · Druck (Bestandsbuch je Zeitraum/Gruppe).
// Nur anhängen: Korrektur = Storno mit Grund (Geschäftsleitung) + neuer Eintrag.
// Logik: lib/tierArznei.ts (tests/tierArzneiP357).
// Datenbank: supabase-sql/p357-tier-arznei-bestandsbuch.sql (Modul „tierbestand").
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import Leerzustand from '../../_components/Leerzustand';
import { C, s, heute, Feld } from '../../bestattung/bestattungUi';
import { firmaLaden, zeige } from '../../bewachung/bewachungUi';
import { nichtsGeschrieben } from '@/lib/speichernPruefen';
import {
  EINHEITEN, WARTE_ARTEN, eingangPruefen, anwendungPruefen, sperrStand, fristen, kennzahlen, halbjahr, halbjahrText, mitteilungsFrist,
  antibiotikaHalbjahr, antibiotikaCsv, freiAb, bestandsbuchHtml, mengeText, datumDe, zeitDe, zahlDe, einheitName, aufbewahrenBis,
  type Eingang, type Anwendung, type EingangRoh, type AnwendungRoh,
} from '@/lib/tierArznei';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type Reiter = 'ueberblick' | 'anwendungen' | 'erwerb' | 'antibiotika' | 'druck';
type Gruppe = { id: string; tierart: string | null; bezeichnung: string; betriebsnummer: string | null; status: string | null };

const EINGANG_FELDER = 'id, datum, arzneimittel, zulassungs_nr, charge, menge, einheit, lieferant, beleg_nr, verfall, notiz, status, storno_grund, erfasst_am, erfasst_name';
const ANWENDUNG_FELDER = 'id, gruppe_id, gruppe_bezeichnung, tierart, tier_kennung, anzahl_tiere, arzneimittel, eingang_id, beleg_nr, menge, einheit, dosierung, datum_von, datum_bis, '
  + 'wartezeit_fleisch, wartezeit_milch, wartezeit_eier, frei_fleisch_ab, frei_milch_ab, frei_eier_ab, antibiotikum, tierarzt, anwender_name, notiz, status, storno_grund, erfasst_am, erfasst_name';
const TIERART: Record<string, string> = { rind: 'Rind', schwein: 'Schwein', schaf: 'Schaf', ziege: 'Ziege', pferd: 'Pferd', gefluegel: 'Geflügel', sonstige: 'Sonstige' };

const WAECHTER = /Zukunft|Tiergruppe|Erwerb|storniert|Storno|Geschäftsleitung|bleibt|erhalten|Betrieb/;
function fehlerText(msg: string | undefined, sonst: string): string {
  if (!msg) return sonst;
  if (/tier_arznei_anwendung_wartezeit/.test(msg)) return 'Bitte mindestens eine Wartezeit eintragen (Fleisch, Milch oder Eier).';
  if (/tier_arznei_anwendung_zeitraum/.test(msg)) return 'Der Behandlungszeitraum ist ungültig (Bis vor Von oder länger als ein Jahr).';
  return WAECHTER.test(msg) ? msg : sonst;
}
async function schreiben(q: PromiseLike<{ data: unknown; error: { message: string } | null }>, sonst: string): Promise<string | null> {
  const { data, error } = await q;
  if (error) return fehlerText(error.message, sonst);
  if (nichtsGeschrieben(data)) return sonst;
  return null;
}
const OHNE_RECHT = 'Nicht gespeichert — dafür ist das Schreibrecht „Tierbestand" nötig (und SQL Paket 357).';

const LEER_ANW = (tag: string, gruppe = ''): AnwendungRoh => ({
  gruppe_id: gruppe, tier_kennung: '', anzahl_tiere: '1', arzneimittel: '', eingang_id: '', beleg_nr: '', menge: '', einheit: 'ml', dosierung: '',
  datum_von: tag, datum_bis: tag, wartezeit_fleisch: '', wartezeit_milch: '', wartezeit_eier: '', antibiotikum: false, tierarzt: '', anwender_name: '', notiz: '',
});
const LEER_EIN = (tag: string): EingangRoh => ({ datum: tag, arzneimittel: '', zulassungs_nr: '', charge: '', menge: '', einheit: 'ml', lieferant: '', beleg_nr: '', verfall: '', notiz: '' });

export default function TierArzneiPage() {
  const tag = heute();
  const [gruppen, setGruppen] = useState<Gruppe[]>([]);
  const [eingaenge, setEingaenge] = useState<Eingang[]>([]);
  const [anwendungen, setAnwendungen] = useState<Anwendung[]>([]);
  const [istChef, setIstChef] = useState(false);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [hinweise, setHinweise] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [reiter, setReiter] = useState<Reiter>('ueberblick');
  const [anw, setAnw] = useState<AnwendungRoh | null>(null);
  const [ein, setEin] = useState<EingangRoh | null>(null);
  const [filterGruppe, setFilterGruppe] = useState('');
  const hj0 = halbjahr(tag);
  const [hj, setHj] = useState<{ jahr: number; h: 1 | 2 }>(hj0.h === 1 ? { jahr: hj0.jahr - 1, h: 2 } : { jahr: hj0.jahr, h: 1 });
  const [von, setVon] = useState(`${tag.slice(0, 4)}-01-01`);
  const [bis, setBis] = useState(tag);
  const [druckGruppe, setDruckGruppe] = useState('');

  function melde(f: string | null, o: string | null = null) { setFehler(f); setOk(o); if (f || o) setHinweise([]); }

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const me = u?.user?.id ?? null;
    if (!me) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    const chefId = typeof chef === 'string' && chef ? chef : null;
    setIstChef(!chefId || chefId === me);
    // fünf Jahre Rückblick (Aufbewahrung), höchstens 5.000 je Liste
    const seit = `${Number(tag.slice(0, 4)) - 5}-01-01`;
    const [g, e, a] = await Promise.all([
      supabase.from('tier_gruppe').select('id, tierart, bezeichnung, betriebsnummer, status').order('bezeichnung', { ascending: true }).limit(2000),
      supabase.from('tier_arznei_eingang').select(EINGANG_FELDER).gte('datum', seit).order('datum', { ascending: false }).limit(5000),
      supabase.from('tier_arznei_anwendung').select(ANWENDUNG_FELDER).gte('datum_von', seit).order('datum_von', { ascending: false }).limit(5000),
    ]);
    setGruppen(g.error ? [] : (((g.data as unknown) as Gruppe[]) ?? []));
    if (e.error || a.error) { setSqlFehlt(true); setLaden(false); return; }
    setSqlFehlt(false);
    setEingaenge(((e.data as unknown) as Eingang[]) ?? []);
    setAnwendungen((((a.data as unknown) as Anwendung[]) ?? []).map((x) => ({ ...x, menge: Number(x.menge) })));
    setLaden(false);
  }, [tag]);
  useEffect(() => { void lade(); }, [lade]);

  async function anwendungSpeichern() {
    if (!anw) return;
    const g = gruppen.find((x) => x.id === anw.gruppe_id);
    const p = anwendungPruefen(anw, tag, g?.tierart ?? null);
    if (!p.ok) { setFehler(p.fehler.join(' ')); setOk(null); setHinweise(p.hinweise); return; }
    setBusy(true);
    try {
      const f = await schreiben(supabase.from('tier_arznei_anwendung').insert(p.werte).select('id'), OHNE_RECHT);
      if (f) { melde(f); return; }
      const sperr = WARTE_ARTEN.map((w) => {
        const f = freiAb(p.werte.datum_bis, p.werte[w.spalte]);
        return f ? `${w.name} frei ab ${datumDe(f)}` : '';
      }).filter(Boolean).join(' · ');
      setAnw(null);
      melde(null, `Anwendung eingetragen.${sperr ? ` ${sperr}.` : ''}`);
      setHinweise(p.hinweise);
      await lade();
    } finally { setBusy(false); }
  }

  async function eingangSpeichern() {
    if (!ein) return;
    const p = eingangPruefen(ein, tag);
    if (!p.ok) { setFehler(p.fehler.join(' ')); setOk(null); setHinweise(p.hinweise); return; }
    setBusy(true);
    try {
      const f = await schreiben(supabase.from('tier_arznei_eingang').insert(p.werte).select('id'), OHNE_RECHT);
      if (f) { melde(f); return; }
      setEin(null);
      melde(null, 'Erwerb eingetragen.');
      setHinweise(p.hinweise);
      await lade();
    } finally { setBusy(false); }
  }

  async function stornieren(tabelle: 'tier_arznei_anwendung' | 'tier_arznei_eingang', id: string) {
    const grund = window.prompt('Eintrag stornieren — bitte den Grund eintragen (z. B. „falsche Menge"). Danach den richtigen Eintrag neu anlegen:');
    if (grund === null) return;
    if (!grund.trim()) { melde('Ohne Grund wird nicht storniert.'); return; }
    setBusy(true);
    try {
      const f = await schreiben(supabase.from(tabelle).update({ status: 'storniert', storno_grund: grund.trim().slice(0, 300) }).eq('id', id).select('id'),
        'Nicht storniert — stornieren darf nur die Geschäftsleitung.');
      if (f) { melde(f); return; }
      melde(null, 'Storniert. Der Eintrag bleibt durchgestrichen im Bestandsbuch sichtbar.');
      await lade();
    } finally { setBusy(false); }
  }

  async function drucken() {
    if (bis < von) { melde('„Bis" liegt vor „Von".'); return; }
    const g = gruppen.find((x) => x.id === druckGruppe) ?? null;
    const firma = (await firmaLaden()) ?? { name: null, strasse: null, plz: null, ort: null, telefon: null, email: null };
    const html = bestandsbuchHtml({
      firma, von, bis, gruppe: g?.bezeichnung ?? null, betriebsnummer: g?.betriebsnummer ?? null,
      eingaenge, anwendungen: g ? anwendungen.filter((a) => a.gruppe_id === g.id) : anwendungen, gedrucktAm: new Date().toISOString(),
    });
    if (!zeige(html)) melde('Das Druckfenster wurde blockiert — bitte Pop-ups für ARGONAUT erlauben.');
  }

  function csv(zeilen: ReturnType<typeof antibiotikaHalbjahr>) {
    const url = URL.createObjectURL(new Blob([antibiotikaCsv(zeilen)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `antibiotika-${hj.jahr}-hj${hj.h}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  if (laden) return <div style={s.page}><p style={s.dim}>Lade Bestandsbuch …</p></div>;

  const sperren = sperrStand(anwendungen, tag);
  const fr = fristen(anwendungen, eingaenge, tag);
  const kz = kennzahlen(anwendungen, eingaenge, tag);
  const aktiveGruppen = gruppen.filter((g) => (g.status ?? 'aktiv') === 'aktiv');
  const anwListe = anwendungen.filter((a) => !filterGruppe || a.gruppe_id === filterGruppe);
  const abZeilen = antibiotikaHalbjahr(anwendungen, hj.jahr, hj.h);
  // die letzten sechs Halbjahre, das laufende zuerst
  const hjEindeutig: { jahr: number; h: 1 | 2 }[] = [];
  for (let i = 0, j = hj0.jahr, h: 1 | 2 = hj0.h; i < 6; i++) { hjEindeutig.push({ jahr: j, h }); if (h === 1) { j -= 1; h = 2; } else h = 1; }

  return (
    <div style={s.page}>
      <div style={{ marginBottom: 6 }}><Link href="/dashboard/tierbestand" style={{ color: C.dim, fontSize: 13 }}>← Tierbestand</Link></div>
      <h1 style={s.h1}>💊 Arzneimittel-Bestandsbuch</h1>
      <p style={s.dim}>
        So geht&apos;s: Tragen Sie unter „Erwerb" jedes Tierarzneimittel ein, das Sie vom Tierarzt oder aus der Apotheke bekommen, und unter „Anwendungen"
        jede Behandlung — Tiergruppe aus Ihrem Tierbestand, Kennzeichnung der Tiere, Mittel, Belegnummer, Menge und die Wartezeiten vom tierärztlichen
        Beleg. „Frei ab" rechnet ARGONAUT: letzter Behandlungstag plus Wartezeit. Im „Überblick" sehen Sie, welche Gruppe für Fleisch, Milch oder Eier
        gerade gesperrt ist. Einträge bleiben, wie sie sind; ist etwas falsch, storniert die Geschäftsleitung mit Grund und der richtige Eintrag wird neu
        angelegt. ARGONAUT übermittelt nichts an HIT oder die Antibiotika-Datenbank.
      </p>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok}>{ok}</div>}
      {hinweise.length > 0 && <div style={s.hinweis}>{hinweise.map((h) => <div key={h}>• {h}</div>)}</div>}
      {sqlFehlt && <div style={s.hinweis}>Das Bestandsbuch ist noch nicht eingerichtet (SQL Paket 357 fehlt) oder das Recht „Tierbestand" fehlt.</div>}

      {!sqlFehlt && (<>
        <div style={s.kacheln}>
          <div style={s.kachel}><div style={s.dim}>Gruppen mit Wartezeit</div><b style={{ ...s.zahl, color: kz.gesperrteGruppen ? C.warn : C.text }}>{kz.gesperrteGruppen}</b></div>
          <div style={s.kachel}><div style={s.dim}>Anwendungen {tag.slice(0, 4)}</div><b style={s.zahl}>{kz.anwendungenJahr}</b></div>
          <div style={s.kachel}><div style={s.dim}>davon Antibiotika</div><b style={s.zahl}>{kz.antibiotikaJahr}</b></div>
          <div style={s.kachel}><div style={s.dim}>Fristen</div><b style={{ ...s.zahl, color: fr.some((f) => f.dringend) ? C.bad : C.text }}>{kz.offeneFristen}</b></div>
        </div>

        {!aktiveGruppen.length && (
          <Leerzustand icon="🐄" titel="Noch keine Tiergruppe"
            text={'Anwendungen hängen an einer Tiergruppe aus Ihrem Tierbestand (z. B. „Milchkühe Stall 1" mit Registriernummer).'}
            schritte={['Im Tierbestand eine Gruppe anlegen', 'Hier unter „Erwerb" das Mittel vom Tierarzt eintragen', 'Unter „Anwendungen" die Behandlung mit Wartezeit eintragen']} />
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 12px' }}>
          <button style={reiter === 'ueberblick' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('ueberblick')}>🚦 Überblick</button>
          <button style={reiter === 'anwendungen' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('anwendungen')}>💉 Anwendungen</button>
          <button style={reiter === 'erwerb' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('erwerb')}>📦 Erwerb</button>
          <button style={reiter === 'antibiotika' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('antibiotika')}>🧫 Antibiotika</button>
          <button style={reiter === 'druck' ? s.reiterAn : s.reiterAus} onClick={() => setReiter('druck')}>🖨️ Bestandsbuch drucken</button>
        </div>

        {reiter === 'ueberblick' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={s.box}>
              <b style={{ color: C.gold }}>Gerade gesperrt (Wartezeit läuft)</b>
              {!sperren.length ? <p style={s.dim}>Keine laufende Wartezeit.</p> : (
                <table style={s.tabelle}><thead><tr><th style={s.th}>Tiergruppe</th><th style={s.th}>Erzeugnis</th><th style={s.th}>frei ab</th><th style={s.th}>noch</th><th style={s.th}>wegen</th></tr></thead>
                  <tbody>{sperren.map((x) => (
                    <tr key={`${x.gruppe_id}${x.art}`}><td style={s.td}>{x.gruppe}<div style={s.klein}>{TIERART[x.tierart ?? ''] ?? ''}</div></td>
                      <td style={s.td}>{WARTE_ARTEN.find((w) => w.key === x.art)?.name}</td>
                      <td style={{ ...s.td, color: C.warn, fontWeight: 700 }}>{datumDe(x.frei_ab)}</td>
                      <td style={s.td}>{x.rest_tage} {x.rest_tage === 1 ? 'Tag' : 'Tage'}</td><td style={s.td}>{x.mittel.join(', ')}</td></tr>
                  ))}</tbody></table>
              )}
              <p style={s.klein}>Vor Schlachtung, Milch- oder Eierabgabe hier nachsehen. Am Tag „frei ab" ist die Gruppe wieder frei.</p>
            </div>
            <div style={s.box}>
              <b style={{ color: C.gold }}>Fristen</b>
              {!fr.length ? <p style={s.dim}>Keine anstehenden Fristen.</p> : fr.map((f) => (
                <div key={`${f.art}${f.titel}`} style={{ padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                  <b style={{ color: f.dringend ? C.bad : C.text }}>{f.titel}</b><div style={s.klein}>{f.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {reiter === 'anwendungen' && (
          <div style={{ display: 'grid', gap: 12 }}>
            {!anw && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button style={s.btnGold} disabled={!aktiveGruppen.length} onClick={() => { setAnw(LEER_ANW(tag, filterGruppe)); melde(null); }}>+ Anwendung eintragen</button>
              <select style={{ ...s.input, width: 'auto' }} value={filterGruppe} onChange={(e) => setFilterGruppe(e.target.value)}>
                <option value="">alle Tiergruppen</option>
                {gruppen.map((g) => <option key={g.id} value={g.id}>{g.bezeichnung}</option>)}
              </select>
            </div>}
            {anw && (
              <div style={s.box}>
                <b style={{ color: C.gold }}>Neue Anwendung</b>
                <div style={{ ...s.raster, marginTop: 10 }}>
                  <label style={s.feld}>Tiergruppe *
                    <select style={s.input} value={anw.gruppe_id ?? ''} onChange={(e) => setAnw({ ...anw, gruppe_id: e.target.value })}>
                      <option value="">—</option>
                      {aktiveGruppen.map((g) => <option key={g.id} value={g.id}>{g.bezeichnung} ({TIERART[g.tierart ?? ''] ?? g.tierart})</option>)}
                    </select>
                  </label>
                  <Feld label="Anzahl Tiere *" w={String(anw.anzahl_tiere ?? '')} on={(x) => setAnw({ ...anw, anzahl_tiere: x })} max={7} />
                  <Feld label="Kennzeichnung (Ohrmarken o. Ä.)" w={anw.tier_kennung ?? ''} on={(x) => setAnw({ ...anw, tier_kennung: x })} max={1000} span />
                  <label style={s.feld}>Aus Erwerb (optional)
                    <select style={s.input} value={anw.eingang_id ?? ''} onChange={(e) => {
                      const q = eingaenge.find((x) => x.id === e.target.value);
                      setAnw({ ...anw, eingang_id: e.target.value, ...(q ? { arzneimittel: q.arzneimittel, einheit: q.einheit, beleg_nr: anw.beleg_nr || q.beleg_nr || '', tierarzt: anw.tierarzt || q.lieferant } : {}) });
                    }}>
                      <option value="">—</option>
                      {eingaenge.filter((x) => x.status === 'gueltig').slice(0, 300).map((x) => <option key={x.id} value={x.id}>{datumDe(x.datum)} · {x.arzneimittel}{x.charge ? ` · ${x.charge}` : ''}</option>)}
                    </select>
                  </label>
                  <Feld label="Arzneimittel *" w={anw.arzneimittel ?? ''} on={(x) => setAnw({ ...anw, arzneimittel: x })} max={200} />
                  <Feld label="Beleg-Nr. (Tierarzt)" w={anw.beleg_nr ?? ''} on={(x) => setAnw({ ...anw, beleg_nr: x })} max={40} />
                  <Feld label="Menge gesamt *" w={String(anw.menge ?? '')} on={(x) => setAnw({ ...anw, menge: x })} max={14} />
                  <label style={s.feld}>Einheit
                    <select style={s.input} value={anw.einheit} onChange={(e) => setAnw({ ...anw, einheit: e.target.value })}>{EINHEITEN.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select>
                  </label>
                  <Feld label="Dosierung (z. B. 10 ml je Tier)" w={anw.dosierung ?? ''} on={(x) => setAnw({ ...anw, dosierung: x })} max={200} />
                  <label style={s.feld}>Erster Behandlungstag *<input style={s.input} type="date" max={tag} value={anw.datum_von ?? ''} onChange={(e) => setAnw({ ...anw, datum_von: e.target.value, datum_bis: (anw.datum_bis ?? '') < e.target.value ? e.target.value : anw.datum_bis })} /></label>
                  <label style={s.feld}>Letzter Behandlungstag<input style={s.input} type="date" min={anw.datum_von} value={anw.datum_bis ?? ''} onChange={(e) => setAnw({ ...anw, datum_bis: e.target.value })} /></label>
                  {WARTE_ARTEN.map((w) => (
                    <Feld key={w.key} label={`Wartezeit ${w.name} (Tage)`} w={String(anw[w.spalte] ?? '')} on={(x) => setAnw({ ...anw, [w.spalte]: x })} max={3} />
                  ))}
                  <Feld label="Tierarztpraxis" w={anw.tierarzt ?? ''} on={(x) => setAnw({ ...anw, tierarzt: x })} max={300} />
                  <Feld label="Angewendet von *" w={anw.anwender_name ?? ''} on={(x) => setAnw({ ...anw, anwender_name: x })} max={200} />
                  <label style={{ ...s.feld, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={anw.antibiotikum === true} onChange={(e) => setAnw({ ...anw, antibiotikum: e.target.checked })} /> Antibiotikum
                  </label>
                  <Feld label="Notiz" w={anw.notiz ?? ''} on={(x) => setAnw({ ...anw, notiz: x })} max={500} span />
                </div>
                <p style={s.klein}>Wartezeiten vom tierärztlichen Beleg bzw. der Packungsbeilage übernehmen; nicht zutreffende Felder leer lassen, „0" wenn keine Wartezeit gilt.</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button style={s.btnGold} disabled={busy} onClick={() => void anwendungSpeichern()}>Eintragen</button>
                  <button style={s.btnAus} disabled={busy} onClick={() => { setAnw(null); melde(null); }}>Abbrechen</button>
                </div>
              </div>
            )}
            {!anwListe.length ? <p style={s.dim}>Noch keine Anwendung eingetragen.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={s.tabelle}><thead><tr><th style={s.th}>Behandlung</th><th style={s.th}>Tiergruppe</th><th style={s.th}>Mittel</th><th style={s.th}>Menge</th><th style={s.th}>frei ab</th><th style={s.th}>Erfasst</th><th style={s.th}></th></tr></thead>
                  <tbody>{anwListe.slice(0, 300).map((a) => (
                    <tr key={a.id} style={{ opacity: a.status === 'storniert' ? 0.55 : 1 }}>
                      <td style={s.td}>{datumDe(a.datum_von)}{a.datum_bis !== a.datum_von ? ` – ${datumDe(a.datum_bis)}` : ''}
                        {a.status === 'storniert' && <div style={{ color: C.bad, fontSize: 12 }}>storniert: {a.storno_grund}</div>}</td>
                      <td style={s.td}>{a.gruppe_bezeichnung}<div style={s.klein}>{zahlDe(a.anzahl_tiere)} Tier{a.anzahl_tiere === 1 ? '' : 'e'}{a.tier_kennung ? ` · ${a.tier_kennung}` : ''}</div></td>
                      <td style={s.td}>{a.arzneimittel}{a.antibiotikum ? <span style={{ ...s.pill, marginLeft: 6 }}>Antibiotikum</span> : null}<div style={s.klein}>{a.beleg_nr ? `Beleg ${a.beleg_nr}` : 'ohne Beleg-Nr.'}</div></td>
                      <td style={s.td}>{mengeText(a.menge, a.einheit)}{a.dosierung ? <div style={s.klein}>{a.dosierung}</div> : null}</td>
                      <td style={s.td}>{WARTE_ARTEN.map((w) => a[w.frei] ? <div key={w.key} style={{ color: a.status === 'gueltig' && (a[w.frei] as string) > tag ? C.warn : C.dim }}>{w.name}: {datumDe(a[w.frei] as string)}</div> : null)}</td>
                      <td style={s.td}>{a.anwender_name}<div style={s.klein}>erfasst {zeitDe(a.erfasst_am)} · {a.erfasst_name}</div></td>
                      <td style={s.td}>{istChef && a.status === 'gueltig' && <button style={s.mini} disabled={busy} onClick={() => void stornieren('tier_arznei_anwendung', a.id)}>stornieren</button>}</td>
                    </tr>
                  ))}</tbody></table>
              </div>
            )}
          </div>
        )}

        {reiter === 'erwerb' && (
          <div style={{ display: 'grid', gap: 12 }}>
            {!ein && <div><button style={s.btnGold} onClick={() => { setEin(LEER_EIN(tag)); melde(null); }}>+ Erwerb eintragen</button></div>}
            {ein && (
              <div style={s.box}>
                <b style={{ color: C.gold }}>Neuer Erwerb</b>
                <div style={{ ...s.raster, marginTop: 10 }}>
                  <label style={s.feld}>Datum *<input style={s.input} type="date" max={tag} value={ein.datum ?? ''} onChange={(e) => setEin({ ...ein, datum: e.target.value })} /></label>
                  <Feld label="Arzneimittel *" w={ein.arzneimittel ?? ''} on={(x) => setEin({ ...ein, arzneimittel: x })} max={200} />
                  <Feld label="Zulassungsnummer" w={ein.zulassungs_nr ?? ''} on={(x) => setEin({ ...ein, zulassungs_nr: x })} max={40} />
                  <Feld label="Charge" w={ein.charge ?? ''} on={(x) => setEin({ ...ein, charge: x })} max={40} />
                  <Feld label="Menge *" w={String(ein.menge ?? '')} on={(x) => setEin({ ...ein, menge: x })} max={14} />
                  <label style={s.feld}>Einheit
                    <select style={s.input} value={ein.einheit} onChange={(e) => setEin({ ...ein, einheit: e.target.value })}>{EINHEITEN.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select>
                  </label>
                  <Feld label="Bezogen von (Tierarzt/Apotheke) *" w={ein.lieferant ?? ''} on={(x) => setEin({ ...ein, lieferant: x })} max={300} />
                  <Feld label="Beleg-Nr." w={ein.beleg_nr ?? ''} on={(x) => setEin({ ...ein, beleg_nr: x })} max={40} />
                  <label style={s.feld}>Verfallsdatum<input style={s.input} type="date" value={ein.verfall ?? ''} onChange={(e) => setEin({ ...ein, verfall: e.target.value })} /></label>
                  <Feld label="Notiz" w={ein.notiz ?? ''} on={(x) => setEin({ ...ein, notiz: x })} max={500} span />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button style={s.btnGold} disabled={busy} onClick={() => void eingangSpeichern()}>Eintragen</button>
                  <button style={s.btnAus} disabled={busy} onClick={() => { setEin(null); melde(null); }}>Abbrechen</button>
                </div>
              </div>
            )}
            {!eingaenge.length ? <p style={s.dim}>Noch kein Erwerb eingetragen.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={s.tabelle}><thead><tr><th style={s.th}>Datum</th><th style={s.th}>Arzneimittel</th><th style={s.th}>Menge</th><th style={s.th}>Bezogen von</th><th style={s.th}>Verfall</th><th style={s.th}>Erfasst</th><th style={s.th}></th></tr></thead>
                  <tbody>{eingaenge.slice(0, 300).map((e) => (
                    <tr key={e.id} style={{ opacity: e.status === 'storniert' ? 0.55 : 1 }}>
                      <td style={s.td}>{datumDe(e.datum)}<div style={s.klein}>aufbewahren bis {datumDe(aufbewahrenBis(e.datum))}</div>{e.status === 'storniert' && <div style={{ color: C.bad, fontSize: 12 }}>storniert: {e.storno_grund}</div>}</td>
                      <td style={s.td}>{e.arzneimittel}<div style={s.klein}>{[e.zulassungs_nr && `Zul.-Nr. ${e.zulassungs_nr}`, e.charge && `Charge ${e.charge}`].filter(Boolean).join(' · ')}</div></td>
                      <td style={s.td}>{mengeText(e.menge, e.einheit)}</td>
                      <td style={s.td}>{e.lieferant}<div style={s.klein}>{e.beleg_nr ? `Beleg ${e.beleg_nr}` : ''}</div></td>
                      <td style={{ ...s.td, color: e.verfall && e.verfall < tag ? C.bad : C.text }}>{datumDe(e.verfall)}</td>
                      <td style={s.td}><div style={s.klein}>{zeitDe(e.erfasst_am)} · {e.erfasst_name}</div></td>
                      <td style={s.td}>{istChef && e.status === 'gueltig' && <button style={s.mini} disabled={busy} onClick={() => void stornieren('tier_arznei_eingang', e.id)}>stornieren</button>}</td>
                    </tr>
                  ))}</tbody></table>
              </div>
            )}
          </div>
        )}

        {reiter === 'antibiotika' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <p style={s.klein}>
              Übersicht der als „Antibiotikum" markierten Anwendungen je Halbjahr — als Hilfe für die halbjährliche Mitteilung, falls Ihr Betrieb nach Nutzungsart
              und Bestandsgröße mitteilungspflichtig ist. Frist: {datumDe(mitteilungsFrist(hj.jahr, hj.h))}. Die Mitteilung selbst machen Sie in der HIT-Antibiotika-Datenbank.
              Behandlungen über die Halbjahresgrenze werden nach Tagen aufgeteilt.
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {hjEindeutig.map((x) => <button key={`${x.jahr}${x.h}`} style={x.jahr === hj.jahr && x.h === hj.h ? s.reiterAn : s.reiterAus} onClick={() => setHj(x)}>{halbjahrText(x.jahr, x.h)}</button>)}
            </div>
            {!abZeilen.length ? <p style={s.dim}>Keine Antibiotika-Anwendung im {halbjahrText(hj.jahr, hj.h)}.</p> : (<>
              <div style={{ overflowX: 'auto' }}>
                <table style={s.tabelle}><thead><tr><th style={s.th}>Tiergruppe</th><th style={s.th}>Arzneimittel</th><th style={s.th}>Anwendungen</th><th style={s.th}>Tiere</th><th style={s.th}>Behandlungstage</th><th style={s.th}>Menge</th></tr></thead>
                  <tbody>{abZeilen.map((z) => (
                    <tr key={`${z.gruppe}${z.arzneimittel}${z.einheit}`}><td style={s.td}>{z.gruppe}<div style={s.klein}>{TIERART[z.tierart] ?? z.tierart}</div></td><td style={s.td}>{z.arzneimittel}</td>
                      <td style={s.td}>{z.anwendungen}</td><td style={s.td}>{zahlDe(z.tiere)}</td><td style={s.td}>{z.behandlungstage}</td><td style={s.td}>{zahlDe(z.menge)} {einheitName(z.einheit)}</td></tr>
                  ))}</tbody></table>
              </div>
              <div><button style={s.btnAus} onClick={() => csv(abZeilen)}>⬇ CSV herunterladen</button></div>
            </>)}
          </div>
        )}

        {reiter === 'druck' && (
          <div style={s.box}>
            <b style={{ color: C.gold }}>Bestandsbuch drucken</b>
            <div style={{ ...s.raster, marginTop: 10 }}>
              <label style={s.feld}>Von<input style={s.input} type="date" value={von} onChange={(e) => setVon(e.target.value)} /></label>
              <label style={s.feld}>Bis<input style={s.input} type="date" value={bis} onChange={(e) => setBis(e.target.value)} /></label>
              <label style={s.feld}>Tiergruppe
                <select style={s.input} value={druckGruppe} onChange={(e) => setDruckGruppe(e.target.value)}>
                  <option value="">alle (mit Erwerb)</option>
                  {gruppen.map((g) => <option key={g.id} value={g.id}>{g.bezeichnung}</option>)}
                </select>
              </label>
            </div>
            <p style={s.klein}>Stornierte Einträge erscheinen durchgestrichen mit Grund. Belege und Bestandsbuch mindestens fünf Jahre aufbewahren.</p>
            <button style={s.btnGold} onClick={() => void drucken()}>🖨️ Druckansicht öffnen</button>
          </div>
        )}
      </>)}
    </div>
  );
}
